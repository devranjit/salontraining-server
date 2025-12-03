import { Router } from "express";
import { protect, adminOnly } from "../middleware/auth";
import {
  getEducationListings,
  getFeaturedEducation,
  getSingleEducation,
  createEducation,
  getMyEducationListings,
  updateMyEducation,
  deleteMyEducation,
  adminGetAllEducation,
  getEducationPendingCounts,
  adminGetEducationById,
  adminUpdateEducation,
  adminDeleteEducation,
  approveEducation,
  publishEducation,
  rejectEducation,
  requestEducationChanges,
  setPendingEducation,
  toggleEducationFeatured,
} from "../controllers/education.controller";

const router = Router();

/* ---------------------- PUBLIC ROUTES ---------------------- */
router.get("/", getEducationListings);
router.get("/featured", getFeaturedEducation);

/* ---------------------- USER ROUTES ---------------------- */
router.post("/", protect, createEducation);
router.get("/my", protect, getMyEducationListings);
router.put("/my/:id", protect, updateMyEducation);
router.delete("/my/:id", protect, deleteMyEducation);

/* ---------------------- ADMIN ROUTES ---------------------- */
router.get("/admin/all", protect, adminOnly, adminGetAllEducation);
router.get("/admin/pending-counts", protect, adminOnly, getEducationPendingCounts);
router.get("/admin/:id", protect, adminOnly, adminGetEducationById);
router.put("/admin/:id", protect, adminOnly, adminUpdateEducation);
router.delete("/admin/:id", protect, adminOnly, adminDeleteEducation);
router.patch("/admin/:id/approve", protect, adminOnly, approveEducation);
router.patch("/admin/:id/publish", protect, adminOnly, publishEducation);
router.patch("/admin/:id/reject", protect, adminOnly, rejectEducation);
router.patch("/admin/:id/request-changes", protect, adminOnly, requestEducationChanges);
router.patch("/admin/:id/set-pending", protect, adminOnly, setPendingEducation);
router.patch("/admin/:id/feature", protect, adminOnly, toggleEducationFeatured);

/* ---------------------- PUBLIC SINGLE (must be last) ---------------------- */
router.get("/:id", getSingleEducation);

export default router;







