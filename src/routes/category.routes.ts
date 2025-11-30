import { Router } from "express";
import { createCategory, deleteCategory, getCategories } from "../controllers/category.controller";
import { protect, adminOnly } from "../middleware/auth";

const router = Router();

// public
router.get("/", getCategories);

// admin
router.post("/", protect, adminOnly, createCategory);
router.delete("/:id", protect, adminOnly, deleteCategory);

export default router;