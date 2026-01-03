import express from "express";
import { protect, adminOnly } from "../middleware/auth";
import {
  getMyProVerification,
  listProVerifications,
  submitProVerification,
  updateProVerificationStatus,
  deleteProVerification,
  adminSearchUsersForProVerification,
  adminApproveUserForProVerification,
  getPendingProVerificationCounts,
} from "../controllers/proVerification.controller";

const router = express.Router();

// User endpoints
router.get("/me", protect, getMyProVerification);
router.post("/", protect, submitProVerification);

// Admin endpoints
router.get("/admin", protect, adminOnly, listProVerifications);
router.get("/admin/pending-counts", protect, adminOnly, getPendingProVerificationCounts);
router.patch("/admin/:id/status", protect, adminOnly, updateProVerificationStatus);
router.delete("/admin/:id", protect, adminOnly, deleteProVerification);
router.get("/admin/search-users", protect, adminOnly, adminSearchUsersForProVerification);
router.post("/admin/approve-user", protect, adminOnly, adminApproveUserForProVerification);

export default router;

























