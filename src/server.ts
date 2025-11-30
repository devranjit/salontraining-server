import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI as string)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.log("MongoDB error:", err));

app.get("/", (req: Request, res: Response) => {
  res.json({ success: true, message: "Backend running!" });
});

export default app;