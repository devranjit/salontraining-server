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
  getProductControlPanel,
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
  adminChangeProductOwner,
  // New endpoints for grouped products and stock management
  getProductWithGroupedDetails,
  searchProductsForGrouping,
  duplicateProduct,
  bulkUpdateStock,
  getLowStockProducts,
  archiveProduct,
  bulkUpdateStatus,
  // Debug & Fix
  getProductSourceStats,
  fixProductSource,
} from "../controllers/product.controller";
import { protect, adminOnly, managerOrAdmin } from "../middleware/auth";

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
router.get("/control-panel", protect, getProductControlPanel);
router.put("/my/:id", protect, updateMyProduct);
router.delete("/my/:id", protect, deleteMyProduct);

// Import routes
router.post("/my/import", protect, importProduct);
router.post("/my/import/bulk", protect, bulkImportProducts);

/* ===========================================
   ADMIN ROUTES
============================================ */
router.get("/admin/all", protect, managerOrAdmin, adminGetAllProducts);
router.get("/admin/pending-counts", protect, managerOrAdmin, getProductPendingCounts);
router.get("/admin/low-stock", protect, managerOrAdmin, getLowStockProducts);
router.get("/admin/search-for-grouping", protect, managerOrAdmin, searchProductsForGrouping);
router.post("/admin", protect, managerOrAdmin, createProduct);
router.put("/admin/:id", protect, managerOrAdmin, updateProduct);
router.delete("/admin/:id", protect, managerOrAdmin, deleteProduct);

// Status management
router.patch("/admin/:id/approve", protect, managerOrAdmin, approveProduct);
router.patch("/admin/:id/publish", protect, managerOrAdmin, publishProduct);
router.patch("/admin/:id/reject", protect, managerOrAdmin, rejectProduct);
router.patch("/admin/:id/pending", protect, managerOrAdmin, setProductPending);
router.patch("/admin/:id/feature", protect, managerOrAdmin, toggleFeatured);
router.patch("/admin/:id/owner", protect, managerOrAdmin, adminChangeProductOwner);
router.put("/admin/:id/toggle-status", protect, managerOrAdmin, toggleProductStatus);
router.patch("/admin/:id/archive", protect, managerOrAdmin, archiveProduct);
router.post("/admin/:id/duplicate", protect, managerOrAdmin, duplicateProduct);

// Get product with full grouped details
router.get("/admin/:id/full", protect, managerOrAdmin, getProductWithGroupedDetails);

// Bulk operations
router.post("/admin/bulk/stock", protect, managerOrAdmin, bulkUpdateStock);
router.post("/admin/bulk/status", protect, managerOrAdmin, bulkUpdateStatus);

// Debug & Fix product source
router.get("/admin/debug/source-stats", protect, adminOnly, getProductSourceStats);
router.post("/admin/fix/product-source", protect, adminOnly, fixProductSource);

export default router;
