import express from "express";
import { protect, adminOnly, memberOrAdmin } from "../middleware/auth";
import {
  getVideos,
  getVideo,
  getCategories,
  adminGetVideos,
  createVideo,
  updateVideo,
  deleteVideo,
  toggleFeatured,
  reorderVideos,
} from "../controllers/memberVideo.controller";

const router = express.Router();

// Member routes (requires login + member or admin role)
router.get("/", protect, memberOrAdmin, getVideos);
router.get("/categories", protect, memberOrAdmin, getCategories);
router.get("/:id", protect, memberOrAdmin, getVideo);

// Admin routes
router.get("/admin/all", protect, adminOnly, adminGetVideos);
router.post("/admin", protect, adminOnly, createVideo);
router.put("/admin/:id", protect, adminOnly, updateVideo);
router.delete("/admin/:id", protect, adminOnly, deleteVideo);
router.patch("/admin/:id/feature", protect, adminOnly, toggleFeatured);
router.post("/admin/reorder", protect, adminOnly, reorderVideos);

export default router;

