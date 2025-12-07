import { Router } from "express";
import {
  adminDeleteReview,
  adminListReviews,
  adminUpdateReview,
  adminUpdateReviewStatus,
  createReview,
  deleteReview,
  getMyReviews,
  listReviewsForListing,
  pendingReviewCounts,
  updateReview,
} from "../controllers/review.controller";
import { adminOnly, protect } from "../middleware/auth";

const router = Router();

// Public listing reviews
router.get("/listing/:listingType/:listingId", listReviewsForListing);

// Authenticated user reviews
router.use(protect);
router.get("/mine", getMyReviews);
router.post("/", createReview);
router.put("/:id", updateReview);
router.delete("/:id", deleteReview);

// Admin review management
router.get("/admin", adminOnly, adminListReviews);
router.get("/admin/pending-count", adminOnly, pendingReviewCounts);
router.patch("/admin/:id/status", adminOnly, adminUpdateReviewStatus);
router.put("/admin/:id", adminOnly, adminUpdateReview);
router.delete("/admin/:id", adminOnly, adminDeleteReview);

export default router;




