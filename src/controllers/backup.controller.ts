/**
 * Backup Controller
 * 
 * Admin-only endpoints for backup management.
 * Manual operations: list, create, delete, status.
 * Restore is MANUAL (filesystem-based) - no API endpoint.
 */

import { Request, Response } from "express";
import {
  createBackup,
  listBackups,
  deleteBackup,
  getBackupStatus,
  getBackupLog,
  cleanupOldBackups,
} from "../services/backupService";

type AuthRequest = Request & { user?: any };

/**
 * GET /api/admin/backups
 * List all available backups
 */
export const adminListBackups = async (req: AuthRequest, res: Response) => {
  try {
    const backups = await listBackups();
    
    return res.json({
      success: true,
      backups,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to list backups",
    });
  }
};

/**
 * GET /api/admin/backups/status
 * Get backup system status
 */
export const adminBackupStatus = async (req: AuthRequest, res: Response) => {
  try {
    const status = await getBackupStatus();
    
    return res.json({
      success: true,
      ...status,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to get backup status",
    });
  }
};

/**
 * POST /api/admin/backups/create
 * Manually trigger a backup
 */
export const adminCreateBackup = async (req: AuthRequest, res: Response) => {
  try {
    const { force } = req.body;
    
    const backupInfo = await createBackup(force === true);
    
    return res.json({
      success: true,
      message: "Backup created successfully",
      backup: backupInfo,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to create backup",
    });
  }
};

/**
 * DELETE /api/admin/backups/:name
 * Delete a specific backup permanently
 */
export const adminDeleteBackup = async (req: AuthRequest, res: Response) => {
  try {
    const { name } = req.params;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Backup name is required",
      });
    }
    
    const result = await deleteBackup(name);
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error || "Failed to delete backup",
      });
    }
    
    return res.json({
      success: true,
      message: `Backup ${name} deleted successfully`,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete backup",
    });
  }
};

/**
 * GET /api/admin/backups/log
 * Get recent backup log entries
 */
export const adminBackupLog = async (req: AuthRequest, res: Response) => {
  try {
    const lines = parseInt(req.query.lines as string) || 100;
    const logEntries = await getBackupLog(lines);
    
    return res.json({
      success: true,
      log: logEntries,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to get backup log",
    });
  }
};

/**
 * POST /api/admin/backups/cleanup
 * Manually trigger cleanup of old backups
 */
export const adminCleanupBackups = async (req: AuthRequest, res: Response) => {
  try {
    const result = await cleanupOldBackups();
    
    return res.json({
      success: true,
      message: `Cleanup complete. Deleted ${result.deleted.length} backup(s).`,
      deleted: result.deleted,
      errors: result.errors,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to cleanup backups",
    });
  }
};

