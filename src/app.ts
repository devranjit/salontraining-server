import dotenv from "dotenv";
dotenv.config();

import express, { Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";

// ROUTES
import authRoutes from "./routes/auth.routes";
import adminRoutes from "./routes/adminRoutes";
import trainerRoutes from "./routes/trainer.routes";
import categoryRoutes from "./routes/category.routes";
import uploadRoutes from "./routes/upload.routes";
import productRoutes from "./routes/product.routes";
import orderRoutes from "./routes/order.routes";
import shippingRoutes from "./routes/shipping.routes";
import eventRoutes from "./routes/event.routes";
import blogRoutes from "./routes/blog.routes";
import jobRoutes from "./routes/job.routes";
import educationRoutes from "./routes/education.routes";
import memberVideoRoutes from "./routes/memberVideo.routes";
import maintenanceRoutes from "./routes/maintenance.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import emailAdminRoutes from "./routes/emailAdmin.routes";
import recycleBinRoutes from "./routes/recycleBin.routes";
import analyticsRoutes from "./routes/analytics.routes";
import membershipRoutes from "./routes/membership.routes";
import reviewRoutes from "./routes/review.routes";
import couponRoutes from "./routes/coupon.routes";
import storeCheckoutRoutes from "./routes/storeCheckout.routes";
import systemLogRoutes from "./routes/systemLog.routes";
import formSubmissionRoutes from "./routes/formSubmission.routes";
import proVerificationRoutes from "./routes/proVerification.routes";
import seekingEmploymentRoutes from "./routes/seekingEmployment.routes";
import notificationRoutes from "./routes/notification.routes";
import userRoutes from "./routes/user.routes";
import "./lib/cloudinary";

// -----------------------------------------
// EXPRESS APP
// -----------------------------------------
const app = express();

app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      // Store raw body for Stripe webhook signature verification
      if (
        req.originalUrl?.startsWith("/api/memberships/stripe/webhook") ||
        req.originalUrl?.startsWith("/api/store-checkout/webhook")
      ) {
        req.rawBody = buf;
      }
    },
  })
);
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// -----------------------------------------
// RATE LIMITING
// -----------------------------------------
// Global rate limit: 100 requests per 15 minutes per IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requests per window
  message: { success: false, message: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limit for public auth endpoints (login, register, password reset)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per window for auth
  message: { success: false, message: "Too many authentication attempts, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

// Apply global limiter
app.use(globalLimiter);

// -----------------------------------------
// CORS CONFIG
// -----------------------------------------
const allowedOrigins = [
  // Local Development
  "http://localhost:5173",
  "http://localhost:3000",
  "http://salontraining.local:5173",
  
  // Production Domains
  "https://placefindy.com",
  "https://www.placefindy.com",
  "https://salontraining.com",
  "https://www.salontraining.com",
];

// Handle preflight OPTIONS requests explicitly
app.options("*", cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  maxAge: 86400, // Cache preflight for 24 hours
}));

// Vercel deployment patterns - restrict to specific project subdomains only
// Set ALLOWED_VERCEL_PROJECTS env var to comma-separated list of project names
// e.g., "salontraining,salontraining-frontend" to allow salontraining-*.vercel.app
const ALLOWED_VERCEL_PROJECTS = (process.env.ALLOWED_VERCEL_PROJECTS || "salontraining,salon-frontend")
  .split(",")
  .map(p => p.trim().toLowerCase())
  .filter(Boolean);

const isAllowedVercelDeployment = (origin: string): boolean => {
  // Extract subdomain from origin like "https://salontraining-abc123.vercel.app"
  const match = origin.match(/^https?:\/\/([^.]+)\.vercel\.app$/i);
  if (!match) return false;
  
  const subdomain = match[1].toLowerCase();
  
  // Check if subdomain starts with any of the allowed project names
  return ALLOWED_VERCEL_PROJECTS.some(project => 
    subdomain === project || subdomain.startsWith(`${project}-`)
  );
};

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, Postman)
      if (!origin) return callback(null, true);
      
      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      
      // Allow specific Vercel preview deployments only (not all *.vercel.app)
      if (isAllowedVercelDeployment(origin)) {
        return callback(null, true);
      }
      
      // Log blocked origins for debugging
      console.log("CORS blocked origin:", origin);
      return callback(new Error("Not allowed by CORS"), false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);


// -----------------------------------------
// API ROUTES
// -----------------------------------------
app.use("/api/upload", uploadRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/trainers", trainerRoutes);
app.use("/api/products", productRoutes);
app.use("/api/shipping", shippingRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/blogs", blogRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/education", educationRoutes);
app.use("/api/member-videos", memberVideoRoutes);
app.use("/api/memberships", membershipRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/store-checkout", storeCheckoutRoutes);
app.use("/api/system-logs", systemLogRoutes);
app.use("/api/system/maintenance", maintenanceRoutes);
app.use("/api/admin/email", emailAdminRoutes);
app.use("/api/admin/recycle-bin", recycleBinRoutes);
app.use("/api/admin/analytics", analyticsRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/auth", authLimiter, authRoutes); // Auth routes have stricter rate limiting
app.use("/api/users", userRoutes); // Admin user management (no rate limiting)
app.use("/api/forms", formSubmissionRoutes);
app.use("/api/pro-verification", proVerificationRoutes);
app.use("/api/seeking-employment", seekingEmploymentRoutes);
app.use("/api/notifications", notificationRoutes);

// -----------------------------------------
// HEALTH CHECK
// -----------------------------------------
app.get("/", (req: Request, res: Response) => {
  res.json({
    success: true,
    message: "SalonTraining API is running",
    env: process.env.NODE_ENV || "development",
  });
});

// -----------------------------------------
// EXPORT APP ONLY - NO LISTEN HERE
// -----------------------------------------
export default app;

