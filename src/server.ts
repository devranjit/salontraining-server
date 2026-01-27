import mongoose from "mongoose";
import http from "http";
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
        console.error(`✗ Port ${PORT} is already in use.`);
        console.error("  → Stop other processes using this port, or use a different port.");
        console.error("  → Run: sudo fuser -k 5000/tcp && pm2 restart salontraining-backend");
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
  // Setup shutdown handlers first
  setupGracefulShutdown();
  
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
      process.exit(1);
    });
}

// Export app for Vercel serverless (api/index.ts imports this)
export default app;
