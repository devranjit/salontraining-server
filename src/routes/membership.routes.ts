import express from "express";
import { protect, adminOnly } from "../middleware/auth";
import {
  createPlan,
  listActivePlans,
  adminListPlans,
  updatePlan,
  togglePlan,
} from "../controllers/membershipPlan.controller";
import {
  getMyMembership,
  createCheckoutSession,
  cancelAutoRenew,
  adminListMemberships,
  adminUpdateMembership,
  adminExtendMembership,
  handleStripeWebhook,
} from "../controllers/membership.controller";

const router = express.Router();

// Public / user routes
router.get("/plans", listActivePlans);
router.get("/me", protect, getMyMembership);
router.post("/checkout", protect, createCheckoutSession);
router.post("/cancel", protect, cancelAutoRenew);

// Admin plan management
router.get("/admin/plans", protect, adminOnly, adminListPlans);
router.post("/admin/plans", protect, adminOnly, createPlan);
router.put("/admin/plans/:id", protect, adminOnly, updatePlan);
router.patch("/admin/plans/:id/toggle", protect, adminOnly, togglePlan);

// Admin membership management
router.get("/admin/users", protect, adminOnly, adminListMemberships);
router.patch("/admin/users/:id", protect, adminOnly, adminUpdateMembership);
router.post("/admin/users/:id/extend", protect, adminOnly, adminExtendMembership);

// Stripe webhook (no auth)
router.post("/stripe/webhook", handleStripeWebhook);

export default router;


