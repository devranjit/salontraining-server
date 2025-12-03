import { Router } from "express";
import { protect, adminOnly } from "../middleware/auth";

import {
  // Public
  getJobs,
  getFeaturedJobs,
  getSingleJob,
  // User
  createJob,
  getMyJobs,
  updateMyJob,
  deleteMyJob,
  // Admin
  adminGetAllJobs,
  adminGetJobById,
  adminUpdateJob,
  adminDeleteJob,
  approveJob,
  publishJob,
  rejectJob,
  requestJobChanges,
  setPendingJob,
  markJobFilled,
  toggleJobFeatured,
  getJobPendingCounts,
} from "../controllers/job.controller";

const router = Router();

/* ---------------------- PUBLIC ROUTES ---------------------- */
router.get("/", getJobs);
router.get("/featured", getFeaturedJobs);

/* ---------------------- USER ROUTES ---------------------- */
router.post("/", protect, createJob);
router.get("/my", protect, getMyJobs);
router.put("/my/:id", protect, updateMyJob);
router.delete("/my/:id", protect, deleteMyJob);

/* ---------------------- ADMIN ROUTES ---------------------- */
router.get("/admin/all", protect, adminOnly, adminGetAllJobs);
router.get("/admin/pending-counts", protect, adminOnly, getJobPendingCounts);
router.get("/admin/:id", protect, adminOnly, adminGetJobById);
router.put("/admin/:id", protect, adminOnly, adminUpdateJob);
router.delete("/admin/:id", protect, adminOnly, adminDeleteJob);
router.patch("/admin/:id/approve", protect, adminOnly, approveJob);
router.patch("/admin/:id/publish", protect, adminOnly, publishJob);
router.patch("/admin/:id/reject", protect, adminOnly, rejectJob);
router.patch("/admin/:id/request-changes", protect, adminOnly, requestJobChanges);
router.patch("/admin/:id/set-pending", protect, adminOnly, setPendingJob);
router.patch("/admin/:id/filled", protect, adminOnly, markJobFilled);
router.patch("/admin/:id/feature", protect, adminOnly, toggleJobFeatured);

/* ---------------------- PUBLIC SINGLE JOB (must be last) ---------------------- */
router.get("/:id", getSingleJob);

export default router;


