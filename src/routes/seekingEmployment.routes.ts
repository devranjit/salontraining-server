import { Router } from "express";
import { protect, managerOrAdmin } from "../middleware/auth";
import {
  submitSeekingEmployment,
  adminGetSeekingEmployment,
  adminGetSeekingEmploymentById,
  adminUpdateSeekingEmployment,
  adminDeleteSeekingEmployment,
  getSeekingEmploymentPendingCounts,
  adminApproveSeeking,
  adminPublishSeeking,
  adminRejectSeeking,
  adminRequestChangesSeeking,
  getMySeekingSubmissions,
  getMySeekingSubmissionById,
  updateMySeekingSubmission,
  deleteMySeekingSubmission,
  getPublishedSeeking,
  getPublishedSeekingById,
} from "../controllers/seekingEmployment.controller";

const router = Router();

// Public submit/list (no params)
router.post("/", submitSeekingEmployment);
router.get("/", getPublishedSeeking);

// User routes - MUST come before /:id
router.get("/my", protect, getMySeekingSubmissions);
router.get("/my/:id", protect, getMySeekingSubmissionById);
router.patch("/my/:id", protect, updateMySeekingSubmission);
router.delete("/my/:id", protect, deleteMySeekingSubmission);

// Admin routes - MUST come before /:id
router.get("/admin", protect, managerOrAdmin, adminGetSeekingEmployment);
router.get("/admin/pending-counts", protect, managerOrAdmin, getSeekingEmploymentPendingCounts);
router.get("/admin/:id", protect, managerOrAdmin, adminGetSeekingEmploymentById);
router.patch("/admin/:id", protect, managerOrAdmin, adminUpdateSeekingEmployment);
router.delete("/admin/:id", protect, managerOrAdmin, adminDeleteSeekingEmployment);
router.patch("/admin/:id/approve", protect, managerOrAdmin, adminApproveSeeking);
router.patch("/admin/:id/publish", protect, managerOrAdmin, adminPublishSeeking);
router.patch("/admin/:id/reject", protect, managerOrAdmin, adminRejectSeeking);
router.patch("/admin/:id/request-changes", protect, managerOrAdmin, adminRequestChangesSeeking);

// Public single item - MUST be LAST because /:id catches everything
router.get("/:id", getPublishedSeekingById);

export default router;
