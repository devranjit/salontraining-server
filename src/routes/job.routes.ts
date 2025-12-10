import { Router } from "express";
import { protect, adminOnly, managerOrAdmin } from "../middleware/auth";
import { recaptchaMiddleware } from "../middleware/recaptcha";

import {
  // Public
  getJobs,
  getFeaturedJobs,
  getSingleJob,
  // User
  createJob,
  getMyJobs,
  getMyJobById,
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
  adminChangeJobOwner,
  expireJob,
} from "../controllers/job.controller";

const router = Router();

/* ---------------------- PUBLIC ROUTES ---------------------- */
router.get("/", getJobs);
router.get("/featured", getFeaturedJobs);

/* ---------------------- USER ROUTES ---------------------- */
router.post("/", protect, recaptchaMiddleware("submit_job"), createJob);
router.get("/my", protect, getMyJobs);
router.get("/my/:id", protect, getMyJobById);
router.put("/my/:id", protect, updateMyJob);
router.delete("/my/:id", protect, deleteMyJob);

/* ---------------------- ADMIN ROUTES ---------------------- */
router.get("/admin/all", protect, managerOrAdmin, adminGetAllJobs);
router.get("/admin/pending-counts", protect, managerOrAdmin, getJobPendingCounts);
router.get("/admin/:id", protect, managerOrAdmin, adminGetJobById);
router.put("/admin/:id", protect, managerOrAdmin, adminUpdateJob);
router.delete("/admin/:id", protect, managerOrAdmin, adminDeleteJob);
router.patch("/admin/:id/approve", protect, managerOrAdmin, approveJob);
router.patch("/admin/:id/publish", protect, managerOrAdmin, publishJob);
router.patch("/admin/:id/reject", protect, managerOrAdmin, rejectJob);
router.patch("/admin/:id/request-changes", protect, managerOrAdmin, requestJobChanges);
router.patch("/admin/:id/set-pending", protect, managerOrAdmin, setPendingJob);
router.patch("/admin/:id/filled", protect, managerOrAdmin, markJobFilled);
router.patch("/admin/:id/feature", protect, managerOrAdmin, toggleJobFeatured);
router.patch("/admin/:id/owner", protect, managerOrAdmin, adminChangeJobOwner);
router.patch("/admin/:id/expire", protect, managerOrAdmin, expireJob);

/* ---------------------- PUBLIC SINGLE JOB (must be last) ---------------------- */
router.get("/:id", getSingleJob);

export default router;







