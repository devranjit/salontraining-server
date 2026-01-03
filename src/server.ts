import { connectDB } from "./config/connectDB";
import { ensureEmailDefaults } from "./services/emailService";
import { initializeFirebaseAdmin, isFirebaseConfigured } from "./services/firebaseAdmin";
import app from "./app";

// -----------------------------------------
// PORT CONFIGURATION
// -----------------------------------------
const PORT = process.env.PORT || 5000;

// -----------------------------------------
// BOOTSTRAP FUNCTIONS
// -----------------------------------------
async function bootstrap(): Promise<void> {
  // 1. Connect to MongoDB
  await connectDB();
  console.log("✓ Database connected");

  // 2. Ensure email templates exist
  try {
    await ensureEmailDefaults();
    console.log("✓ Email templates initialized");
  } catch (err) {
    console.error("⚠ Failed to ensure email templates:", err);
    // Non-fatal: continue server startup
  }

  // 3. Initialize Firebase Admin SDK (optional)
  if (isFirebaseConfigured()) {
    try {
      initializeFirebaseAdmin();
      console.log("✓ Firebase Admin initialized");
    } catch (err) {
      console.warn("⚠ Firebase Admin initialization skipped:", err);
    }
  }
}

// -----------------------------------------
// START SERVER - ONLY WHEN RUN DIRECTLY
// -----------------------------------------
// This guard ensures server.listen() is called EXACTLY ONCE
// - When run directly (node server.js or ts-node server.ts): starts server
// - When imported by api/index.ts for Vercel: does NOT start server
if (require.main === module) {
  bootstrap()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`✓ Server listening on port ${PORT}`);
        console.log(`✓ Environment: ${process.env.NODE_ENV || "development"}`);
        console.log("✓ Server starts only once");
      });
    })
    .catch((err) => {
      console.error("✗ Failed to start server:", err);
      process.exit(1);
    });
}

// Export app for Vercel serverless (api/index.ts imports this)
export default app;
