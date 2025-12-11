import { Router } from "express";
import {
  validateCoupon,
  applyCoupon,
  getAllCoupons,
  getCoupon,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  toggleCouponStatus,
  getCouponStats,
} from "../controllers/coupon.controller";
import { protect, adminOnly, managerOrAdmin } from "../middleware/auth";

const router = Router();

// Public routes
router.post("/validate", validateCoupon);

// Protected routes (require login)
router.post("/apply", protect, applyCoupon);

// Admin routes
router.get("/admin/all", protect, managerOrAdmin, getAllCoupons);
router.get("/admin/stats", protect, managerOrAdmin, getCouponStats);
router.get("/admin/:id", protect, managerOrAdmin, getCoupon);
router.post("/admin", protect, managerOrAdmin, createCoupon);
router.put("/admin/:id", protect, managerOrAdmin, updateCoupon);
router.delete("/admin/:id", protect, adminOnly, deleteCoupon);
router.patch("/admin/:id/toggle", protect, managerOrAdmin, toggleCouponStatus);

export default router;










