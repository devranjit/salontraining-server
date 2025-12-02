import { Router } from "express";
import {
  // Public
  getProducts,
  getFeaturedProducts,
  getSingleProduct,
  getProductsBySeller,
  // User (Seller)
  createUserProduct,
  getMyProducts,
  updateMyProduct,
  deleteMyProduct,
  importProduct,
  bulkImportProducts,
  // Admin
  adminGetAllProducts,
  getProductPendingCounts,
  createProduct,
  updateProduct,
  deleteProduct,
  approveProduct,
  publishProduct,
  rejectProduct,
  setProductPending,
  toggleFeatured,
  toggleProductStatus,
} from "../controllers/product.controller";
import { protect, adminOnly } from "../middleware/auth";

const router = Router();

/* ===========================================
   PUBLIC ROUTES
============================================ */
router.get("/", getProducts);
router.get("/featured", getFeaturedProducts);
router.get("/seller/:sellerId", getProductsBySeller);
router.get("/:id", getSingleProduct);

/* ===========================================
   USER (SELLER) ROUTES - Requires Auth
============================================ */
router.post("/my", protect, createUserProduct);
router.get("/my/list", protect, getMyProducts);
router.put("/my/:id", protect, updateMyProduct);
router.delete("/my/:id", protect, deleteMyProduct);

// Import routes
router.post("/my/import", protect, importProduct);
router.post("/my/import/bulk", protect, bulkImportProducts);

/* ===========================================
   ADMIN ROUTES
============================================ */
router.get("/admin/all", protect, adminOnly, adminGetAllProducts);
router.get("/admin/pending-counts", protect, adminOnly, getProductPendingCounts);
router.post("/admin", protect, adminOnly, createProduct);
router.put("/admin/:id", protect, adminOnly, updateProduct);
router.delete("/admin/:id", protect, adminOnly, deleteProduct);

// Status management
router.patch("/admin/:id/approve", protect, adminOnly, approveProduct);
router.patch("/admin/:id/publish", protect, adminOnly, publishProduct);
router.patch("/admin/:id/reject", protect, adminOnly, rejectProduct);
router.patch("/admin/:id/pending", protect, adminOnly, setProductPending);
router.patch("/admin/:id/feature", protect, adminOnly, toggleFeatured);
router.put("/admin/:id/toggle-status", protect, adminOnly, toggleProductStatus);

export default router;
