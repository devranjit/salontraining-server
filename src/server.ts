import mongoose from "mongoose";
import { exec } from "child_process";
import { promisify } from "util";
import { connectDB } from "./config/connectDB";
import { ensureEmailDefaults } from "./services/emailService";
import { verifyConnection as verifyMailConnection } from "./services/mailClient";
import { initializeFirebaseAdmin, isFirebaseConfigured } from "./services/firebaseAdmin";
import { initBackupScheduler } from "./services/backupService";
import app from "./app";

const execAsync = promisify(exec);

// -----------------------------------------
// PORT CONFIGURATION
// -----------------------------------------
const PORT = process.env.PORT || 5000;

// -----------------------------------------
// PORT CLEANUP UTILITY (Windows)
// -----------------------------------------
async function killProcessOnPort(port: number | string): Promise<boolean> {
  const portNum = typeof port === "string" ? parseInt(port, 10) : port;
  
  try {
    // Windows: Find and kill process using the port
    const { stdout } = await execAsync(
      `netstat -ano | findstr :${portNum} | findstr LISTENING`
    );
    
    const lines = stdout.trim().split("\n");
    const pids = new Set<string>();
    
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== "0" && !isNaN(parseInt(pid, 10))) {
        pids.add(pid);
      }
    }
    
    if (pids.size === 0) {
      return false;
    }
    
    for (const pid of pids) {
      try {
        await execAsync(`taskkill /F /PID ${pid}`);
        console.log(`✓ Killed existing process (PID: ${pid}) on port ${portNum}`);
      } catch {
        // Process might have already terminated
      }
    }
    
    // Wait a moment for port to be released
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return true;
  } catch {
    // No process found on port or command failed
    return false;
  }
}

// -----------------------------------------
// BOOTSTRAP FUNCTIONS
// -----------------------------------------
async function bootstrap(): Promise<void> {
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
    // Non-fatal: continue server startup
  }

  // 4. Verify SMTP/Mailgun connection
  try {
    await verifyMailConnection();
    console.log("✓ Mail service (Mailgun) connected");
  } catch (err) {
    console.warn("⚠ Mail service verification failed - emails may not work:", err);
    // Non-fatal: continue server startup
  }

  // 6. Initialize Firebase Admin SDK (optional)
  if (isFirebaseConfigured()) {
    try {
      initializeFirebaseAdmin();
      console.log("✓ Firebase Admin initialized");
    } catch (err) {
      console.warn("⚠ Firebase Admin initialization skipped:", err);
    }
  }

  // 7. Initialize backup scheduler (runs daily)
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
// START SERVER WITH PORT CONFLICT HANDLING
// -----------------------------------------
async function startServer(retryAfterKill = true): Promise<void> {
  return new Promise((resolve, reject) => {
    const server = app.listen(PORT);
    
    server.on("listening", () => {
      console.log(`✓ Server listening on port ${PORT}`);
      console.log(`✓ Environment: ${process.env.NODE_ENV || "development"}`);
      console.log("✓ Server starts only once");
      
      // Graceful shutdown handling
      const shutdown = async (signal: string) => {
        console.log(`\n${signal} received - shutting down gracefully...`);
        server.close(() => {
          console.log("✓ HTTP server closed");
          mongoose.connection.close(false).then(() => {
            console.log("✓ MongoDB connection closed");
            process.exit(0);
          });
        });
        
        // Force exit after 10 seconds
        setTimeout(() => {
          console.error("✗ Forced shutdown after timeout");
          process.exit(1);
        }, 10000);
      };
      
      process.on("SIGTERM", () => shutdown("SIGTERM"));
      process.on("SIGINT", () => shutdown("SIGINT"));
      
      resolve();
    });
    
    server.on("error", async (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE" && retryAfterKill) {
        console.warn(`⚠ Port ${PORT} is already in use - attempting to free it...`);
        
        const killed = await killProcessOnPort(PORT);
        if (killed) {
          console.log("✓ Port freed - retrying server start...");
          try {
            await startServer(false); // Retry once without kill attempt
            resolve();
          } catch (retryErr) {
            reject(retryErr);
          }
        } else {
          reject(new Error(`Port ${PORT} is in use and could not be freed. Please close the other application or use a different port.`));
        }
      } else {
        reject(err);
      }
    });
  });
}

// -----------------------------------------
// START SERVER - ONLY WHEN RUN DIRECTLY
// -----------------------------------------
// This guard ensures server.listen() is called EXACTLY ONCE
// - When run directly (node server.js or ts-node server.ts): starts server
// - When imported by api/index.ts for Vercel: does NOT start server
if (require.main === module) {
  bootstrap()
    .then(() => startServer())
    .catch((err) => {
      console.error("✗ Failed to start server:", err.message || err);
      process.exit(1);
    });
}

// Export app for Vercel serverless (api/index.ts imports this)
export default app;
