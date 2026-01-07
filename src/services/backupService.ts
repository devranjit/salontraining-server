/**
 * Backup Service
 * 
 * Automated system backup service that creates daily backups of:
 * - MongoDB database dump
 * - Backend files
 * - Frontend build files
 * 
 * Backups are stored on the server filesystem (not in database).
 * Retention: 15 days, auto-cleanup of older backups.
 */

import { exec, spawn } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import cron from "node-cron";

const execAsync = promisify(exec);
const fsPromises = fs.promises;

// Configuration
const BACKUP_BASE_DIR = process.env.BACKUP_DIR || path.resolve(__dirname, "../../../backups");
const RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS || "15", 10);
const BACKUP_TIME = process.env.BACKUP_TIME || "03:00"; // Default 3 AM

// Paths to backup
const BACKEND_DIR = path.resolve(__dirname, "../../");
const FRONTEND_DIR = path.resolve(__dirname, "../../../salontraining-frontend");

// Backup log file (filesystem-based, not database)
const BACKUP_LOG_FILE = path.join(BACKUP_BASE_DIR, "backup.log");

// Track last backup date to prevent multiple runs per day
let lastBackupDate: string | null = null;

interface BackupInfo {
  date: string;
  timestamp: string;
  backupDir: string;
  database: { success: boolean; error?: string };
  backend: { success: boolean; error?: string };
  frontend: { success: boolean; error?: string };
  totalSizeMB?: number;
  durationMs?: number;
}

interface BackupListItem {
  name: string;
  date: string;
  path: string;
  sizeMB: number;
  info?: BackupInfo;
}

/**
 * Log backup events to filesystem
 */
async function logBackupEvent(message: string, level: "INFO" | "ERROR" | "WARN" = "INFO"): Promise<void> {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${level}] ${message}\n`;
  
  try {
    await fsPromises.mkdir(BACKUP_BASE_DIR, { recursive: true });
    await fsPromises.appendFile(BACKUP_LOG_FILE, logEntry);
  } catch (err) {
    console.error("[Backup] Failed to write log:", err);
  }
  
  // Also log to console
  console.log(`[Backup] ${logEntry.trim()}`);
}

/**
 * Get today's date string (YYYY-MM-DD)
 */
function getTodayDateString(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * Check if backup already ran today
 */
function hasBackupRunToday(): boolean {
  const today = getTodayDateString();
  return lastBackupDate === today;
}

/**
 * Mark backup as run for today
 */
function markBackupRun(): void {
  lastBackupDate = getTodayDateString();
}

/**
 * Get directory size in MB
 */
async function getDirectorySizeMB(dirPath: string): Promise<number> {
  try {
    let totalSize = 0;
    const files = await fsPromises.readdir(dirPath, { withFileTypes: true });
    
    for (const file of files) {
      const filePath = path.join(dirPath, file.name);
      if (file.isDirectory()) {
        totalSize += await getDirectorySizeMB(filePath);
      } else {
        const stats = await fsPromises.stat(filePath);
        totalSize += stats.size;
      }
    }
    
    return Math.round((totalSize / (1024 * 1024)) * 100) / 100;
  } catch {
    return 0;
  }
}

/**
 * Copy directory recursively (non-blocking)
 */
async function copyDirectory(src: string, dest: string, excludePatterns: string[] = []): Promise<void> {
  await fsPromises.mkdir(dest, { recursive: true });
  
  const entries = await fsPromises.readdir(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    // Check exclude patterns
    if (excludePatterns.some(pattern => entry.name.match(new RegExp(pattern)))) {
      continue;
    }
    
    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath, excludePatterns);
    } else {
      await fsPromises.copyFile(srcPath, destPath);
    }
  }
}

/**
 * Backup MongoDB database using mongodump
 */
async function backupDatabase(backupDir: string): Promise<{ success: boolean; error?: string }> {
  const dbBackupDir = path.join(backupDir, "database");
  
  try {
    await fsPromises.mkdir(dbBackupDir, { recursive: true });
    
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      return { success: false, error: "MONGO_URI not configured" };
    }
    
    // Use mongodump command
    const mongodumpCmd = `mongodump --uri="${mongoUri}" --out="${dbBackupDir}" --quiet`;
    
    await execAsync(mongodumpCmd, { timeout: 300000 }); // 5 min timeout
    
    await logBackupEvent(`Database backup completed: ${dbBackupDir}`);
    return { success: true };
  } catch (err: any) {
    const errorMsg = err.message || "Unknown database backup error";
    await logBackupEvent(`Database backup failed: ${errorMsg}`, "ERROR");
    
    // Create a fallback JSON export if mongodump fails
    try {
      await createFallbackDatabaseBackup(dbBackupDir);
      await logBackupEvent("Created fallback JSON database backup");
      return { success: true, error: "Used fallback method (mongodump unavailable)" };
    } catch (fallbackErr: any) {
      return { success: false, error: `${errorMsg} (fallback also failed: ${fallbackErr.message})` };
    }
  }
}

/**
 * Fallback database backup - exports collections as JSON
 * Used when mongodump is not available
 */
async function createFallbackDatabaseBackup(dbBackupDir: string): Promise<void> {
  const mongoose = await import("mongoose");
  
  // Get all collection names
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error("Database not connected");
  }
  
  const collections = await db.listCollections().toArray();
  
  for (const collectionInfo of collections) {
    const collectionName = collectionInfo.name;
    const collection = db.collection(collectionName);
    const documents = await collection.find({}).toArray();
    
    const outputPath = path.join(dbBackupDir, `${collectionName}.json`);
    await fsPromises.writeFile(outputPath, JSON.stringify(documents, null, 2));
  }
}

/**
 * Backup backend files
 */
async function backupBackend(backupDir: string): Promise<{ success: boolean; error?: string }> {
  const backendBackupDir = path.join(backupDir, "backend");
  
  try {
    await fsPromises.mkdir(backendBackupDir, { recursive: true });
    
    // Exclude node_modules, .git, dist, uploads (large files), tmp
    const excludePatterns = [
      "^node_modules$",
      "^\\.git$",
      "^dist$",
      "^uploads$",
      "^tmp$",
      "^\\.env.*",
      "^backups$",
    ];
    
    await copyDirectory(BACKEND_DIR, backendBackupDir, excludePatterns);
    
    await logBackupEvent(`Backend backup completed: ${backendBackupDir}`);
    return { success: true };
  } catch (err: any) {
    const errorMsg = err.message || "Unknown backend backup error";
    await logBackupEvent(`Backend backup failed: ${errorMsg}`, "ERROR");
    return { success: false, error: errorMsg };
  }
}

/**
 * Backup frontend build files
 */
async function backupFrontend(backupDir: string): Promise<{ success: boolean; error?: string }> {
  const frontendBackupDir = path.join(backupDir, "frontend");
  
  try {
    await fsPromises.mkdir(frontendBackupDir, { recursive: true });
    
    // Check if frontend dist exists
    const frontendDistDir = path.join(FRONTEND_DIR, "dist");
    const frontendBuildDir = path.join(FRONTEND_DIR, "build");
    
    let sourceBuildDir: string | null = null;
    
    if (fs.existsSync(frontendDistDir)) {
      sourceBuildDir = frontendDistDir;
    } else if (fs.existsSync(frontendBuildDir)) {
      sourceBuildDir = frontendBuildDir;
    }
    
    if (sourceBuildDir) {
      // Copy build files
      await copyDirectory(sourceBuildDir, path.join(frontendBackupDir, "dist"), []);
    }
    
    // Also backup essential frontend source files (excluding node_modules)
    const excludePatterns = [
      "^node_modules$",
      "^\\.git$",
      "^dist$",
      "^build$",
      "^\\.env.*",
    ];
    
    await copyDirectory(FRONTEND_DIR, frontendBackupDir, excludePatterns);
    
    await logBackupEvent(`Frontend backup completed: ${frontendBackupDir}`);
    return { success: true };
  } catch (err: any) {
    const errorMsg = err.message || "Unknown frontend backup error";
    await logBackupEvent(`Frontend backup failed: ${errorMsg}`, "ERROR");
    return { success: false, error: errorMsg };
  }
}

/**
 * Create a full backup
 */
export async function createBackup(force: boolean = false): Promise<BackupInfo> {
  const startTime = Date.now();
  const today = getTodayDateString();
  const timestamp = new Date().toISOString();
  
  // Prevent duplicate runs (unless forced)
  if (!force && hasBackupRunToday()) {
    await logBackupEvent(`Backup already ran today (${today}). Skipping.`, "WARN");
    throw new Error(`Backup already ran today (${today}). Use force=true to override.`);
  }
  
  const backupDirName = `backup-${today}`;
  const backupDir = path.join(BACKUP_BASE_DIR, backupDirName);
  
  await logBackupEvent(`Starting backup: ${backupDirName}`);
  
  // Ensure backup directory exists
  await fsPromises.mkdir(backupDir, { recursive: true });
  
  // Run backups in parallel (non-blocking)
  const [dbResult, backendResult, frontendResult] = await Promise.all([
    backupDatabase(backupDir),
    backupBackend(backupDir),
    backupFrontend(backupDir),
  ]);
  
  const durationMs = Date.now() - startTime;
  const totalSizeMB = await getDirectorySizeMB(backupDir);
  
  // Create backup info file
  const backupInfo: BackupInfo = {
    date: today,
    timestamp,
    backupDir,
    database: dbResult,
    backend: backendResult,
    frontend: frontendResult,
    totalSizeMB,
    durationMs,
  };
  
  await fsPromises.writeFile(
    path.join(backupDir, "backup-info.json"),
    JSON.stringify(backupInfo, null, 2)
  );
  
  // Mark backup as complete for today
  markBackupRun();
  
  // Run retention cleanup
  await cleanupOldBackups();
  
  const status = dbResult.success && backendResult.success && frontendResult.success
    ? "SUCCESS"
    : "PARTIAL";
  
  await logBackupEvent(
    `Backup ${status}: ${backupDirName} (${totalSizeMB}MB, ${durationMs}ms)`
  );
  
  return backupInfo;
}

/**
 * Clean up backups older than retention period
 */
export async function cleanupOldBackups(): Promise<{ deleted: string[]; errors: string[] }> {
  const deleted: string[] = [];
  const errors: string[] = [];
  
  try {
    const entries = await fsPromises.readdir(BACKUP_BASE_DIR, { withFileTypes: true });
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
    
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith("backup-")) {
        continue;
      }
      
      // Extract date from backup-YYYY-MM-DD format
      const dateMatch = entry.name.match(/^backup-(\d{4}-\d{2}-\d{2})$/);
      if (!dateMatch) continue;
      
      const backupDate = new Date(dateMatch[1]);
      
      if (backupDate < cutoffDate) {
        const backupPath = path.join(BACKUP_BASE_DIR, entry.name);
        try {
          await fsPromises.rm(backupPath, { recursive: true, force: true });
          deleted.push(entry.name);
          await logBackupEvent(`Deleted old backup: ${entry.name}`);
        } catch (err: any) {
          errors.push(`${entry.name}: ${err.message}`);
          await logBackupEvent(`Failed to delete backup ${entry.name}: ${err.message}`, "ERROR");
        }
      }
    }
  } catch (err: any) {
    await logBackupEvent(`Cleanup failed: ${err.message}`, "ERROR");
    errors.push(err.message);
  }
  
  return { deleted, errors };
}

/**
 * List all available backups
 */
export async function listBackups(): Promise<BackupListItem[]> {
  const backups: BackupListItem[] = [];
  
  try {
    await fsPromises.mkdir(BACKUP_BASE_DIR, { recursive: true });
    const entries = await fsPromises.readdir(BACKUP_BASE_DIR, { withFileTypes: true });
    
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith("backup-")) {
        continue;
      }
      
      const backupPath = path.join(BACKUP_BASE_DIR, entry.name);
      const infoPath = path.join(backupPath, "backup-info.json");
      
      let info: BackupInfo | undefined;
      try {
        const infoContent = await fsPromises.readFile(infoPath, "utf-8");
        info = JSON.parse(infoContent);
      } catch {
        // Info file may not exist for old or corrupted backups
      }
      
      const sizeMB = await getDirectorySizeMB(backupPath);
      const dateMatch = entry.name.match(/^backup-(\d{4}-\d{2}-\d{2})$/);
      
      backups.push({
        name: entry.name,
        date: dateMatch ? dateMatch[1] : "unknown",
        path: backupPath,
        sizeMB,
        info,
      });
    }
    
    // Sort by date descending (newest first)
    backups.sort((a, b) => b.date.localeCompare(a.date));
  } catch (err: any) {
    await logBackupEvent(`Failed to list backups: ${err.message}`, "ERROR");
  }
  
  return backups;
}

/**
 * Delete a specific backup
 */
export async function deleteBackup(backupName: string): Promise<{ success: boolean; error?: string }> {
  if (!backupName.match(/^backup-\d{4}-\d{2}-\d{2}$/)) {
    return { success: false, error: "Invalid backup name format" };
  }
  
  const backupPath = path.join(BACKUP_BASE_DIR, backupName);
  
  try {
    const exists = await fsPromises.access(backupPath).then(() => true).catch(() => false);
    if (!exists) {
      return { success: false, error: "Backup not found" };
    }
    
    await fsPromises.rm(backupPath, { recursive: true, force: true });
    await logBackupEvent(`Manually deleted backup: ${backupName}`);
    
    return { success: true };
  } catch (err: any) {
    await logBackupEvent(`Failed to delete backup ${backupName}: ${err.message}`, "ERROR");
    return { success: false, error: err.message };
  }
}

/**
 * Get backup status
 */
export async function getBackupStatus(): Promise<{
  lastBackupDate: string | null;
  nextScheduledTime: string;
  retentionDays: number;
  backupDir: string;
  totalBackups: number;
  totalSizeMB: number;
}> {
  const backups = await listBackups();
  const totalSizeMB = backups.reduce((sum, b) => sum + b.sizeMB, 0);
  
  return {
    lastBackupDate: backups.length > 0 ? backups[0].date : null,
    nextScheduledTime: BACKUP_TIME,
    retentionDays: RETENTION_DAYS,
    backupDir: BACKUP_BASE_DIR,
    totalBackups: backups.length,
    totalSizeMB: Math.round(totalSizeMB * 100) / 100,
  };
}

/**
 * Read backup log
 */
export async function getBackupLog(lines: number = 100): Promise<string[]> {
  try {
    const content = await fsPromises.readFile(BACKUP_LOG_FILE, "utf-8");
    const allLines = content.split("\n").filter(Boolean);
    return allLines.slice(-lines);
  } catch {
    return [];
  }
}

/**
 * Initialize and start backup scheduler
 */
export function initBackupScheduler(): void {
  const [hours, minutes] = BACKUP_TIME.split(":").map(Number);
  
  // Validate time format
  if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    console.error("[Backup] Invalid BACKUP_TIME format. Using default 03:00");
    return initBackupSchedulerWithTime(3, 0);
  }
  
  initBackupSchedulerWithTime(hours, minutes);
}

function initBackupSchedulerWithTime(hours: number, minutes: number): void {
  // Cron format: minute hour * * * (every day at specified time)
  const cronExpression = `${minutes} ${hours} * * *`;
  
  console.log(`[Backup] Scheduler initialized: ${cronExpression} (${hours}:${minutes.toString().padStart(2, "0")} daily)`);
  console.log(`[Backup] Backup directory: ${BACKUP_BASE_DIR}`);
  console.log(`[Backup] Retention: ${RETENTION_DAYS} days`);
  
  cron.schedule(cronExpression, async () => {
    console.log("[Backup] Scheduled backup starting...");
    
    try {
      await createBackup();
    } catch (err: any) {
      console.error("[Backup] Scheduled backup failed:", err.message);
      // Don't throw - backup failure must not break the site
    }
  });
}

// Check on startup if we need to restore last backup date from filesystem
(async function checkLastBackupOnStartup() {
  try {
    const backups = await listBackups();
    if (backups.length > 0 && backups[0].date === getTodayDateString()) {
      lastBackupDate = backups[0].date;
      console.log(`[Backup] Found existing backup for today: ${lastBackupDate}`);
    }
  } catch {
    // Ignore errors on startup check
  }
})();






