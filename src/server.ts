import mongoose from "mongoose";
import http from "http";
import fs from "fs";
import path from "path";
import { connectDB } from "./config/connectDB";
import { ensureEmailDefaults } from "./services/emailService";
import { verifyConnection as verifyMailConnection } from "./services/mailClient";
import { initializeFirebaseAdmin, isFirebaseConfigured } from "./services/firebaseAdmin";
import { initBackupScheduler } from "./services/backupService";
import app from "./app";

// -----------------------------------------
// PORT CONFIGURATION
// -----------------------------------------
const PORT = process.env.PORT || 5000;

// -----------------------------------------
// DEV LOCK FILE (prevents duplicate local runs)
// -----------------------------------------
const IS_DEV = process.env.NODE_ENV !== "production";
const LOCK_FILE = path.join(__dirname, "..", ".dev-server.lock");

function checkDevLock(): boolean {
  // Only apply lock in development
  if (!IS_DEV) return true;

  if (fs.existsSync(LOCK_FILE)) {
    let lockInfo = "";
    try {
      lockInfo = fs.readFileSync(LOCK_FILE, "utf-8");
    } catch {}
    console.error("");
    console.error("✗ Backend is already running in another terminal/process.");
    console.error(`  Lock file exists: ${LOCK_FILE}`);
    if (lockInfo) console.error(`  Started: ${lockInfo}`);
    console.error("");
    console.error("  To fix:");
    console.error("  1. Stop the other backend process (Ctrl+C in that terminal)");
    console.error("  2. Or delete the lock file manually if the process crashed:");
    console.error(`     del "${LOCK_FILE}"`);
    console.error("");
    return false;
  }
  return true;
}

function createDevLock(): void {
  if (!IS_DEV) return;
  try {
    const info = `PID: ${process.pid}, Time: ${new Date().toISOString()}`;
    fs.writeFileSync(LOCK_FILE, info, "utf-8");
  } catch (err) {
    console.warn("⚠ Could not create dev lock file:", err);
  }
}

function removeDevLock(): void {
  if (!IS_DEV) return;
  try {
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE);
    }
  } catch {
    // Ignore errors during cleanup
  }
}

// -----------------------------------------
// BOOTSTRAP FUNCTIONS (async initialization)
// -----------------------------------------
async function bootstrap(): Promise<void> {
  // [DEBUG] Check if Mailgun env vars are loaded
  console.log(`[ENV DEBUG] MAILGUN_API_KEY: ${process.env.MAILGUN_API_KEY ? "LOADED" : "MISSING"}`);
  console.log(`[ENV DEBUG] MAILGUN_DOMAIN: ${process.env.MAILGUN_DOMAIN ? "LOADED" : "MISSING"}`);
  console.log(`[ENV DEBUG] MAIL_FROM: ${process.env.MAIL_FROM ? "LOADED" : "MISSING"}`);

  // 1. Connect to MongoDB
  await connectDB();
  console.log("✓ Database connected");

  // 2. Sync indexes in background (non-blocking for faster startup)
  if (process.env.SYNC_INDEXES !== "false") {
    mongoose.syncIndexes()
      .then(() => console.log("✓ Database indexes synced"))
      .catch((err) => console.warn("⚠ Index sync warning:", err.message));
  }

  // 3. Ensure email templates exist
  try {
    await ensureEmailDefaults();
    console.log("✓ Email templates initialized");
  } catch (err) {
    console.error("⚠ Failed to ensure email templates:", err);
  }

  // 4. Verify Mailgun connection
  try {
    await verifyMailConnection();
    console.log("✓ Mail service (Mailgun) connected");
  } catch (err) {
    console.warn("⚠ Mail service verification failed - emails may not work:", err);
  }

  // 5. Initialize Firebase Admin SDK (optional)
  if (isFirebaseConfigured()) {
    try {
      initializeFirebaseAdmin();
      console.log("✓ Firebase Admin initialized");
    } catch (err) {
      console.warn("⚠ Firebase Admin initialization skipped:", err);
    }
  }

  // 6. Initialize backup scheduler (runs daily)
  if (process.env.DISABLE_BACKUP_SCHEDULER !== "true") {
    try {
      initBackupScheduler();
      console.log("✓ Backup scheduler initialized");
    } catch (err) {
      console.warn("⚠ Backup scheduler initialization skipped:", err);
    }
  }
}

// -----------------------------------------
// SERVER INSTANCE (global for graceful shutdown)
// -----------------------------------------
let server: http.Server | null = null;

// -----------------------------------------
// GRACEFUL SHUTDOWN
// -----------------------------------------
function setupGracefulShutdown(): void {
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received - shutting down gracefully...`);
    
    // Remove dev lock file first
    removeDevLock();
    
    if (server) {
      server.close(() => {
        console.log("✓ HTTP server closed");
        mongoose.connection.close(false).then(() => {
          console.log("✓ MongoDB connection closed");
          process.exit(0);
        });
      });
    } else {
      process.exit(0);
    }
    
    // Force exit after 10 seconds
    setTimeout(() => {
      console.error("✗ Forced shutdown after timeout");
      process.exit(1);
    }, 10000);
  };
  
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  
  // Also clean up on uncaught exceptions and unhandled rejections
  process.on("uncaughtException", (err) => {
    console.error("Uncaught Exception:", err);
    removeDevLock();
    process.exit(1);
  });
  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled Rejection:", reason);
    removeDevLock();
    process.exit(1);
  });
}

// -----------------------------------------
// START SERVER - BIND PORT FIRST, THEN INITIALIZE
// -----------------------------------------
// This approach prevents race conditions with PM2:
// 1. Bind to port immediately (fail fast if port is in use)
// 2. Then do async initialization (MongoDB, Mailgun, etc.)
// 3. No auto-kill logic - let PM2 handle restarts cleanly
async function startServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    // Create HTTP server from Express app
    server = http.createServer(app);
    
    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        console.error("");
        console.error("✗ Unable to start backend server");
        console.error(`  Port ${PORT} is already in use (EADDRINUSE).`);
        console.error(`  Another process is already listening on port ${PORT}.`);
        console.error("  Stop the other process/service, then restart this backend.");
        process.exitCode = 1;
        setImmediate(() => process.exit(1));
        return;
      }
      reject(err);
    });
    
    server.on("listening", () => {
      console.log(`✓ Server listening on port ${PORT}`);
      console.log(`✓ Environment: ${process.env.NODE_ENV || "development"}`);
      resolve();
    });
    
    // Bind to port immediately - fail fast if port is in use
    server.listen(PORT);
  });
}

// -----------------------------------------
// MAIN ENTRY POINT
// -----------------------------------------
// This guard ensures server.listen() is called EXACTLY ONCE
// - When run directly (node server.js or ts-node server.ts): starts server
// - When imported by api/index.ts for Vercel: does NOT start server
if (require.main === module) {
  // DEV ONLY: Check if another instance is already running
  if (!checkDevLock()) {
    process.exit(1);
  }
  
  // Setup shutdown handlers first
  setupGracefulShutdown();
  
  // DEV ONLY: Create lock file to prevent duplicate runs
  createDevLock();
  
  // IMPORTANT: Bind to port FIRST, then initialize services
  // This prevents race conditions where multiple instances start initializing
  // while waiting for port to be freed
  startServer()
    .then(() => {
      console.log("✓ Port bound successfully, initializing services...");
      return bootstrap();
    })
    .then(() => {
      console.log("✓ All services initialized");
      console.log("✓ Server ready to accept requests");
      
      // Signal PM2 that the app is ready (if using wait_ready)
      if (process.send) {
        process.send("ready");
      }
    })
    .catch((err) => {
      console.error("✗ Failed to start server:", err.message || err);
      removeDevLock();
      process.exit(1);
    });
}

// Export app for Vercel serverless (api/index.ts imports this)
export default app;
