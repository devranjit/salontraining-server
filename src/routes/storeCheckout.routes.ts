import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createCheckoutSession,
  stripeWebhook,
  verifyCheckoutSession,
  previewCoupon,
} from "../controllers/storeCheckout.controller";

const router = Router();

// Stripe webhook - raw body is stored via verify option in server.ts
// This endpoint should NOT use protect middleware
router.post("/webhook", stripeWebhook);

// Protected routes
router.post("/create-session", protect, createCheckoutSession);
router.get("/verify-session", verifyCheckoutSession);
router.post("/preview-coupon", protect, previewCoupon);

export default router;

