import { Router } from "express";
import { protect, adminOnly, managerOrAdmin } from "../middleware/auth";
import { recaptchaMiddleware } from "../middleware/recaptcha";
import multer from "multer";
import { TrainerListing } from "../models/TrainerListing";

import {
  createTrainer,
  getMyTrainers,
  getMyTrainerDetail,
  requestTrainerUpdate,
  requestTrainerDelete,
  adminGetAllTrainers,
  approveTrainer,
  rejectTrainer,
  setPendingTrainer,
  requestChanges,
  publishTrainer,
  updateTrainerAdmin,
  toggleFeatured,
  adminGetTrainerById,
  getPendingCounts,
  getAllTrainers,
  getFeaturedTrainers,
  adminDeleteTrainer,
  adminChangeTrainerOwner,
  getTrainerSuggestions,
} from "../controllers/trainer.controller";

import { uploadToCloudinary } from "../utils/uploadToCloudinary";

const router = Router();

/* ---------------------- USER ROUTES ---------------------- */
router.get("/my", protect, getMyTrainers);
router.get("/my/:id", protect, getMyTrainerDetail);
router.patch("/my/:id", protect, requestTrainerUpdate);
router.post("/my/:id/delete-request", protect, requestTrainerDelete);
router.post("/", protect, recaptchaMiddleware("submit_trainer"), createTrainer);


/* ---------------------- MULTER MEMORY STORAGE ---------------------- */
// VERCEL-SAFE — uses RAM, not disk
const upload = multer({ storage: multer.memoryStorage() });


/* ---------------------- IMAGE UPLOAD (Cloudinary) ---------------------- */
router.post("/upload", protect, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    // Pass MIME type and original filename for validation
    const uploaded = await uploadToCloudinary(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname
    );

    return res.json({
      success: true,
      file: uploaded,   // contains url + public_id
    });
  } catch (err: any) {
    // Return 400 for validation errors
    const statusCode = err.message.includes("Invalid") || 
                       err.message.includes("Blocked") ||
                       err.message.includes("too large") ? 400 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message,
    });
  }
});




/* ---------------------- PUBLIC ROUTES ---------------------- */
router.get("/suggestions", getTrainerSuggestions);
router.get("/all", getAllTrainers);              // GET /api/trainers/all?search=&category=&city=&sort=
router.get("/featured", getFeaturedTrainers);    // GET /api/trainers/featured?limit=4


/* ---------------------- ADMIN ROUTES ---------------------- */
router.get("/admin/pending-counts", protect, managerOrAdmin, getPendingCounts);
router.get("/admin/all", protect, managerOrAdmin, adminGetAllTrainers);
router.patch("/admin/:id/approve", protect, managerOrAdmin, approveTrainer);
router.patch("/admin/:id/reject", protect, managerOrAdmin, rejectTrainer);
router.patch("/admin/:id/set-pending", protect, managerOrAdmin, setPendingTrainer);
router.patch("/admin/:id/request-changes", protect, managerOrAdmin, requestChanges);
router.patch("/admin/:id/publish", protect, managerOrAdmin, publishTrainer);
router.patch("/admin/:id/update", protect, managerOrAdmin, updateTrainerAdmin);
router.patch("/admin/:id/feature", protect, managerOrAdmin, toggleFeatured);
router.patch("/admin/:id/owner", protect, managerOrAdmin, adminChangeTrainerOwner);
router.delete("/admin/:id", protect, managerOrAdmin, adminDeleteTrainer);
router.get("/admin/:id", protect, managerOrAdmin, adminGetTrainerById);


/* ---------------------- CATCH SINGLE TRAINER (supports ID or slug) ---------------------- */
router.get("/:idOrSlug", async (req, res) => {
  try {
    const { idOrSlug } = req.params;
    
    // Try to find by ID first (if it's a valid ObjectId), then by slug
    let trainer = null;
    
    // Check if it's a valid MongoDB ObjectId
    const isObjectId = /^[a-f\d]{24}$/i.test(idOrSlug);
    
    if (isObjectId) {
      trainer = await TrainerListing.findById(idOrSlug);
    }
    
    // If not found by ID, try by slug
    if (!trainer) {
      trainer = await TrainerListing.findOne({ slug: idOrSlug });
    }

    if (!trainer) {
      return res
        .status(404)
        .json({ success: false, message: "Trainer not found" });
    }

    const trainerObj = (trainer as any)?.toObject ? (trainer as any).toObject() : trainer;
    const trainerResponse = {
      ...trainerObj,
      // Backward-compatible SEO aliases for SSR consumers.
      seoTitle: trainerObj?.seoTitle ?? trainerObj?.metaTitle ?? "",
      seoDescription: trainerObj?.seoDescription ?? trainerObj?.metaDescription ?? "",
      name: trainerObj?.name ?? trainerObj?.title ?? "",
    };

    return res.json({ success: true, trainer: trainerResponse });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
