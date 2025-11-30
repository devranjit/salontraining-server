import { Router } from "express";
import {
  createProduct,
  getProducts,
  getSingleProduct,
  updateProduct,
  deleteProduct,
  toggleProductStatus,
} from "../controllers/product.controller";
import { protect, adminOnly } from "../middleware/auth";

const router = Router();

/* -------------------------------------------
   PUBLIC ROUTES
-------------------------------------------- */
router.get("/", getProducts);
router.get("/:id", getSingleProduct);

/* -------------------------------------------
   ADMIN ROUTES
-------------------------------------------- */
router.post("/", protect, adminOnly, createProduct);
router.put("/:id", protect, adminOnly, updateProduct);
router.delete("/:id", protect, adminOnly, deleteProduct);
router.put("/:id/toggle-status", protect, adminOnly, toggleProductStatus);

export default router;
