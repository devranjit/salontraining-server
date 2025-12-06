import { Router } from "express";
import { protect, adminOnly, managerOrAdmin } from "../middleware/auth";
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
  adminChangeEducationOwner,
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
router.get("/admin/all", protect, managerOrAdmin, adminGetAllEducation);
router.get("/admin/pending-counts", protect, managerOrAdmin, getEducationPendingCounts);
router.get("/admin/:id", protect, managerOrAdmin, adminGetEducationById);
router.put("/admin/:id", protect, managerOrAdmin, adminUpdateEducation);
router.delete("/admin/:id", protect, managerOrAdmin, adminDeleteEducation);
router.patch("/admin/:id/approve", protect, managerOrAdmin, approveEducation);
router.patch("/admin/:id/publish", protect, managerOrAdmin, publishEducation);
router.patch("/admin/:id/reject", protect, managerOrAdmin, rejectEducation);
router.patch("/admin/:id/request-changes", protect, managerOrAdmin, requestEducationChanges);
router.patch("/admin/:id/set-pending", protect, managerOrAdmin, setPendingEducation);
router.patch("/admin/:id/owner", protect, managerOrAdmin, adminChangeEducationOwner);
router.patch("/admin/:id/feature", protect, managerOrAdmin, toggleEducationFeatured);

/* ---------------------- PUBLIC SINGLE (must be last) ---------------------- */
router.get("/:id", getSingleEducation);

export default router;







