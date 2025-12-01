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
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://salontraining.local:5173",
      "https://placefindy.com",
      "https://salontraining.com",
    ],
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
