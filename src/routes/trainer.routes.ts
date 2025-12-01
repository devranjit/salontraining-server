import { Router } from "express";
import { Request, Response } from "express";
import { protect, adminOnly } from "../middleware/auth";
import multer from "multer";

import {
  createTrainer,
  getMyTrainers,
  adminGetAllTrainers,
  approveTrainer,
  rejectTrainer,
  updateTrainerAdmin,
  toggleFeatured,
  adminGetTrainerById,
} from "../controllers/trainer.controller";

import { TrainerListing } from "../models/TrainerListing";
import { uploadToCloudinary } from "../utils/uploadToCloudinary";

const router = Router();

/* ---------------------- USER ROUTES ---------------------- */
router.get("/my", protect, getMyTrainers);
router.post("/", protect, createTrainer);


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

    const uploaded = await uploadToCloudinary(req.file.buffer);

    return res.json({
      success: true,
      file: uploaded,   // contains url + public_id
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});




/* ---------------------- USER UPDATE ROUTE ---------------------- */
export async function updateTrainerUser(req: Request, res: Response) {
  try {
    const listing = await TrainerListing.findOneAndUpdate(
      { _id: req.params.id, owner: req.user?.id },
      req.body,
      { new: true }
    );

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Unauthorized or listing not found",
      });
    }

    return res.json({ success: true, listing });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err.message || "Server error",
    });
  }
}


/* ---------------------- PUBLIC ROUTES ---------------------- */
router.get("/featured", async (req, res) => {
  try {
    const featured = await TrainerListing.find({
      featured: true,
      status: "approved",
    }).sort({ createdAt: -1 });

    return res.json({ success: true, trainers: featured });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});


/* ---------------------- ADMIN ROUTES ---------------------- */
router.get("/admin/all", protect, adminOnly, adminGetAllTrainers);
router.patch("/admin/:id/approve", protect, adminOnly, approveTrainer);
router.patch("/admin/:id/reject", protect, adminOnly, rejectTrainer);
router.patch("/admin/:id/update", protect, adminOnly, updateTrainerAdmin);
router.patch("/admin/:id/feature", protect, adminOnly, toggleFeatured);
router.get("/admin/:id", protect, adminOnly, adminGetTrainerById);


/* ---------------------- CATCH SINGLE TRAINER ---------------------- */
router.get("/:id", async (req, res) => {
  try {
    const trainer = await TrainerListing.findById(req.params.id);

    if (!trainer) {
      return res
        .status(404)
        .json({ success: false, message: "Trainer not found" });
    }

    return res.json({ success: true, trainer });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
