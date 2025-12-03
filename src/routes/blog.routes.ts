import { Router } from "express";
import { protect, adminOnly } from "../middleware/auth";

import {
  // Public
  getBlogs,
  getFeaturedBlogs,
  getSingleBlog,
  // User
  createBlog,
  getMyBlogs,
  updateMyBlog,
  deleteMyBlog,
  // Admin
  adminGetAllBlogs,
  adminGetBlogById,
  adminUpdateBlog,
  adminDeleteBlog,
  approveBlog,
  publishBlog,
  rejectBlog,
  requestBlogChanges,
  setPendingBlog,
  toggleBlogFeatured,
  getBlogPendingCounts,
} from "../controllers/blog.controller";

const router = Router();

/* ---------------------- PUBLIC ROUTES ---------------------- */
router.get("/", getBlogs);
router.get("/featured", getFeaturedBlogs);

/* ---------------------- USER ROUTES ---------------------- */
router.post("/", protect, createBlog);
router.get("/my", protect, getMyBlogs);
router.put("/my/:id", protect, updateMyBlog);
router.delete("/my/:id", protect, deleteMyBlog);

/* ---------------------- ADMIN ROUTES ---------------------- */
router.get("/admin/all", protect, adminOnly, adminGetAllBlogs);
router.get("/admin/pending-counts", protect, adminOnly, getBlogPendingCounts);
router.get("/admin/:id", protect, adminOnly, adminGetBlogById);
router.put("/admin/:id", protect, adminOnly, adminUpdateBlog);
router.delete("/admin/:id", protect, adminOnly, adminDeleteBlog);
router.patch("/admin/:id/approve", protect, adminOnly, approveBlog);
router.patch("/admin/:id/publish", protect, adminOnly, publishBlog);
router.patch("/admin/:id/reject", protect, adminOnly, rejectBlog);
router.patch("/admin/:id/request-changes", protect, adminOnly, requestBlogChanges);
router.patch("/admin/:id/set-pending", protect, adminOnly, setPendingBlog);
router.patch("/admin/:id/feature", protect, adminOnly, toggleBlogFeatured);

/* ---------------------- PUBLIC SINGLE BLOG (must be last) ---------------------- */
router.get("/:id", getSingleBlog); // By ID or slug

export default router;







