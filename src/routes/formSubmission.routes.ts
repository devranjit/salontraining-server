import { Router } from "express";
import {
  submitContactForm,
  subscribeNewsletter,
  unsubscribeNewsletter,
  getSubmissions,
  getSubmission,
  updateSubmission,
  deleteSubmission,
  bulkDeleteSubmissions,
  bulkUpdateStatus,
  getSubmissionStats,
  exportNewsletterEmails,
  getPendingCounts,
} from "../controllers/formSubmission.controller";
import { protect } from "../middleware/auth";
import { adminOrManager } from "../middleware/admin";

const router = Router();

// ===== PUBLIC ROUTES =====
// Contact form submission
router.post("/contact", submitContactForm);

// Newsletter subscription
router.post("/newsletter/subscribe", subscribeNewsletter);
router.post("/newsletter/unsubscribe", unsubscribeNewsletter);

// ===== ADMIN/MANAGER ROUTES =====
// Get pending counts for sidebar badge
router.get("/admin/pending-counts", protect, adminOrManager, getPendingCounts);

// Get submission stats
router.get("/admin/stats", protect, adminOrManager, getSubmissionStats);

// Export newsletter emails
router.get("/admin/newsletter/export", protect, adminOrManager, exportNewsletterEmails);

// Get all submissions (with filters)
router.get("/admin", protect, adminOrManager, getSubmissions);

// Bulk operations
router.post("/admin/bulk-delete", protect, adminOrManager, bulkDeleteSubmissions);
router.post("/admin/bulk-status", protect, adminOrManager, bulkUpdateStatus);

// Single submission CRUD
router.get("/admin/:id", protect, adminOrManager, getSubmission);
router.patch("/admin/:id", protect, adminOrManager, updateSubmission);
router.delete("/admin/:id", protect, adminOrManager, deleteSubmission);

export default router;


























