import { Router } from "express";
import { protect, adminOnly } from "../middleware/auth";
import {
  createCheckoutSession,
  stripeWebhook,
  verifyCheckoutSession,
  previewCoupon,
  checkStripeConfig,
} from "../controllers/storeCheckout.controller";

const router = Router();

// Stripe webhook - raw body is stored via verify option in server.ts
// This endpoint should NOT use protect middleware
router.post("/webhook", stripeWebhook);

// Protected routes
router.post("/create-session", protect, createCheckoutSession);
router.get("/verify-session", protect, verifyCheckoutSession); // PROTECTED - requires authentication
router.post("/preview-coupon", protect, previewCoupon);

// Admin-only: Check Stripe configuration
router.get("/check-stripe", protect, adminOnly, checkStripeConfig);

export default router;

