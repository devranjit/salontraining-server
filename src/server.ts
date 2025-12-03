import dotenv from "dotenv";
dotenv.config();

import express, { Request, Response } from "express";
import cors from "cors";
import { connectDB } from "./config/connectDB";

// ROUTES
import authRoutes from "./routes/auth.routes";
import adminRoutes from "./routes/adminRoutes";
import trainerRoutes from "./routes/trainer.routes";
import categoryRoutes from "./routes/category.routes";
import uploadRoutes from "./routes/upload.routes";
import productRoutes from "./routes/product.routes";
import eventRoutes from "./routes/event.routes";
import blogRoutes from "./routes/blog.routes";
import jobRoutes from "./routes/job.routes";
import educationRoutes from "./routes/education.routes";
import memberVideoRoutes from "./routes/memberVideo.routes";
import maintenanceRoutes from "./routes/maintenance.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import "./lib/cloudinary";


// -----------------------------------------
// LAZY DB CONNECT (REQUIRED FOR VERCEL)
// -----------------------------------------
let dbConnected = false;
async function initDB() {
  if (!dbConnected) {
    await connectDB();
    dbConnected = true;
  }
}

// -----------------------------------------
// EXPRESS APP
// -----------------------------------------
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// -----------------------------------------
// CORS CONFIG
// -----------------------------------------
// Allowed origins list
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

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, Postman)
      if (!origin) return callback(null, true);
      
      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      
      // Allow Vercel preview deployments (*.vercel.app)
      if (origin.endsWith(".vercel.app")) {
        return callback(null, true);
      }
      
      // Block other origins
      return callback(new Error("Not allowed by CORS"), false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// -----------------------------------------
// CONNECT DB BEFORE HANDLING ANY REQUEST
// -----------------------------------------
app.use(async (req, res, next) => {
  await initDB();
  next();
});

// -----------------------------------------
// API ROUTES
// -----------------------------------------
app.use("/api/upload", uploadRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/trainers", trainerRoutes);
app.use("/api/products", productRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/blogs", blogRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/education", educationRoutes);
app.use("/api/member-videos", memberVideoRoutes);
app.use("/api/system/maintenance", maintenanceRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/auth", authRoutes);

// -----------------------------------------
// HEALTH CHECK
// -----------------------------------------
app.get("/", (req: Request, res: Response) => {
  res.json({
    success: true,
    message: "SalonTraining API is running (Vercel Serverless)...",
  });
});

// DO NOT USE app.listen() — Vercel runs serverless
export default app;
