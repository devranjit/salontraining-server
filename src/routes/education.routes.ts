import { Router } from "express";
import { protect, adminOnly, managerOrAdmin } from "../middleware/auth";
import { recaptchaMiddleware } from "../middleware/recaptcha";
import {
  getEducationListings,
  getFeaturedEducation,
  getSingleEducation,
  createEducation,
  getMyEducationListings,
  getMyEducationById,
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
  expireEducation,
  // Education Category CRUD
  getEducationCategories,
  adminGetEducationCategories,
  adminGetEducationCategoryById,
  createEducationCategory,
  updateEducationCategory,
  deleteEducationCategory,
  toggleEducationCategoryActive,
} from "../controllers/education.controller";

const router = Router();

/* ---------------------- PUBLIC ROUTES ---------------------- */
router.get("/", getEducationListings);
router.get("/featured", getFeaturedEducation);
router.get("/categories", getEducationCategories);

/* ---------------------- EDUCATION CATEGORY ADMIN ROUTES ---------------------- */
router.get("/admin/categories", protect, managerOrAdmin, adminGetEducationCategories);
router.get("/admin/categories/:id", protect, managerOrAdmin, adminGetEducationCategoryById);
router.post("/admin/categories", protect, managerOrAdmin, createEducationCategory);
router.put("/admin/categories/:id", protect, managerOrAdmin, updateEducationCategory);
router.patch("/admin/categories/:id/toggle-active", protect, managerOrAdmin, toggleEducationCategoryActive);
router.delete("/admin/categories/:id", protect, managerOrAdmin, deleteEducationCategory);

/* ---------------------- USER ROUTES ---------------------- */
router.post("/", protect, recaptchaMiddleware("submit_education"), createEducation);
router.get("/my", protect, getMyEducationListings);
router.get("/my/:id", protect, getMyEducationById);
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
router.patch("/admin/:id/expire", protect, managerOrAdmin, expireEducation);

/* ---------------------- PUBLIC SINGLE (must be last) ---------------------- */
router.get("/:id", getSingleEducation);

export default router;







