import express from "express";
import { protect, adminOnly } from "../middleware/auth";
import {
  createPlan,
  listActivePlans,
  adminListPlans,
  updatePlan,
  togglePlan,
  deletePlan,
} from "../controllers/membershipPlan.controller";
import {
  adminListCoupons,
  adminCreateCoupon,
  adminUpdateCoupon,
  adminToggleCoupon,
  adminDeleteCoupon,
} from "../controllers/membershipCoupon.controller";
import {
  getMyMembership,
  previewCheckout,
  createCheckoutSession,
  cancelAutoRenew,
  adminListMemberships,
  adminUpdateMembership,
  adminExtendMembership,
  adminArchiveMembership,
  adminRestoreMembership,
  adminCleanupOrphanedMemberships,
  handleStripeWebhook,
  getStripeConfig,
} from "../controllers/membership.controller";

const router = express.Router();

// Debug route - temporary, remove after confirming routes are mounted
router.get("/preview", (_req, res) => {
  res.json({ ok: true, message: "Membership routes mounted correctly. Use POST for actual preview." });
});

// Public / user routes
router.get("/plans", listActivePlans);
router.get("/config", getStripeConfig);
router.get("/me", protect, getMyMembership);
router.post("/preview", protect, previewCheckout);
router.post("/checkout", protect, createCheckoutSession);
router.post("/cancel", protect, cancelAutoRenew);

// Admin plan management
router.get("/admin/plans", protect, adminOnly, adminListPlans);
router.post("/admin/plans", protect, adminOnly, createPlan);
router.put("/admin/plans/:id", protect, adminOnly, updatePlan);
router.patch("/admin/plans/:id/toggle", protect, adminOnly, togglePlan);
router.delete("/admin/plans/:id", protect, adminOnly, deletePlan);

// Admin coupons
router.get("/admin/coupons", protect, adminOnly, adminListCoupons);
router.post("/admin/coupons", protect, adminOnly, adminCreateCoupon);
router.put("/admin/coupons/:id", protect, adminOnly, adminUpdateCoupon);
router.patch("/admin/coupons/:id/toggle", protect, adminOnly, adminToggleCoupon);
router.delete("/admin/coupons/:id", protect, adminOnly, adminDeleteCoupon);

// Admin membership management
router.get("/admin/users", protect, adminOnly, adminListMemberships);
router.patch("/admin/users/:id", protect, adminOnly, adminUpdateMembership);
router.post("/admin/users/:id/extend", protect, adminOnly, adminExtendMembership);
router.post("/admin/users/:id/archive", protect, adminOnly, adminArchiveMembership);
router.post("/admin/users/:id/restore", protect, adminOnly, adminRestoreMembership);
router.post("/admin/cleanup-orphaned", protect, adminOnly, adminCleanupOrphanedMemberships);

// Stripe webhook (no auth)
router.post("/stripe/webhook", handleStripeWebhook);

export default router;


