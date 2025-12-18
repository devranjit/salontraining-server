import express from "express";
import { protect, adminOnly } from "../middleware/auth";
import {
  getMyProVerification,
  listProVerifications,
  submitProVerification,
  updateProVerificationStatus,
  deleteProVerification,
} from "../controllers/proVerification.controller";

const router = express.Router();

// User endpoints
router.get("/me", protect, getMyProVerification);
router.post("/", protect, submitProVerification);

// Admin endpoints
router.get("/admin", protect, adminOnly, listProVerifications);
router.patch("/admin/:id/status", protect, adminOnly, updateProVerificationStatus);
router.delete("/admin/:id", protect, adminOnly, deleteProVerification);

export default router;



