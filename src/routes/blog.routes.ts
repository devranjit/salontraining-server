import { Router } from "express";
import { protect, adminOnly, managerOrAdmin } from "../middleware/auth";

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
  adminChangeBlogOwner,
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
router.get("/admin/all", protect, managerOrAdmin, adminGetAllBlogs);
router.get("/admin/pending-counts", protect, managerOrAdmin, getBlogPendingCounts);
router.get("/admin/:id", protect, managerOrAdmin, adminGetBlogById);
router.put("/admin/:id", protect, managerOrAdmin, adminUpdateBlog);
router.delete("/admin/:id", protect, managerOrAdmin, adminDeleteBlog);
router.patch("/admin/:id/approve", protect, managerOrAdmin, approveBlog);
router.patch("/admin/:id/publish", protect, managerOrAdmin, publishBlog);
router.patch("/admin/:id/reject", protect, managerOrAdmin, rejectBlog);
router.patch("/admin/:id/request-changes", protect, managerOrAdmin, requestBlogChanges);
router.patch("/admin/:id/set-pending", protect, managerOrAdmin, setPendingBlog);
router.patch("/admin/:id/owner", protect, managerOrAdmin, adminChangeBlogOwner);
router.patch("/admin/:id/feature", protect, managerOrAdmin, toggleBlogFeatured);

/* ---------------------- PUBLIC SINGLE BLOG (must be last) ---------------------- */
router.get("/:id", getSingleBlog); // By ID or slug

export default router;







