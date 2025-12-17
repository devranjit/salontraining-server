import { Router } from "express";
import { createCategory, deleteCategory, getCategories, updateCategory } from "../controllers/category.controller";
import { protect, managerOrAdmin } from "../middleware/auth";

const router = Router();

// public
router.get("/", getCategories);

// admin
router.post("/", protect, managerOrAdmin, createCategory);
router.patch("/:id", protect, managerOrAdmin, updateCategory);
router.delete("/:id", protect, managerOrAdmin, deleteCategory);

export default router;