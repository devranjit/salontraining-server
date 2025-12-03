import express from "express";
import { protect, adminOnly, managerOrAdmin } from "../middleware/auth";
import {
  getAdminDashboardStats,
  getUserDashboardStats,
} from "../controllers/dashboard.controller";

const router = express.Router();

// Admin dashboard stats
router.get("/admin/stats", protect, managerOrAdmin, getAdminDashboardStats);

// User dashboard stats (for logged-in users)
router.get("/user/stats", protect, getUserDashboardStats);

export default router;

