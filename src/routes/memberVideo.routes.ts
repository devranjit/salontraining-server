import express from "express";
import { protect, adminOnly, memberOrAdmin, managerOrAdmin } from "../middleware/auth";
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
router.get("/admin/all", protect, managerOrAdmin, adminGetVideos);
router.post("/admin", protect, managerOrAdmin, createVideo);
router.put("/admin/:id", protect, managerOrAdmin, updateVideo);
router.delete("/admin/:id", protect, managerOrAdmin, deleteVideo);
router.patch("/admin/:id/feature", protect, managerOrAdmin, toggleFeatured);
router.post("/admin/reorder", protect, managerOrAdmin, reorderVideos);

export default router;






