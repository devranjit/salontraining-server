import { Request, Response } from "express";
import Category from "../models/Category";
import { moveToRecycleBin } from "../services/recycleBinService";

// ---------------------------------------
// CREATE CATEGORY (Admin Only)
// ---------------------------------------
export const createCategory = async (req: Request, res: Response) => {
  try {
    const { name } = req.body;

    if (!name || name.trim() === "") {
      return res.status(400).json({ success: false, message: "Name is required" });
    }

    const exists = await Category.findOne({ name });
    if (exists) {
      return res.status(400).json({
        success: false,
        message: "Category already exists",
      });
    }

    const category = await Category.create({ name });

    return res.json({ success: true, category });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ---------------------------------------
// UPDATE CATEGORY NAME (Admin Only)
// ---------------------------------------
export const updateCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || name.trim() === "") {
      return res.status(400).json({ success: false, message: "Name is required" });
    }

    const exists = await Category.findOne({ name, _id: { $ne: id } });
    if (exists) {
      return res.status(400).json({
        success: false,
        message: "Category already exists",
      });
    }

    const updated = await Category.findByIdAndUpdate(id, { name }, { new: true });
    if (!updated) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    return res.json({ success: true, category: updated });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ---------------------------------------
// GET ALL CATEGORIES (Public)
// ---------------------------------------
export const getCategories = async (req: Request, res: Response) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    return res.json({ success: true, categories });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ---------------------------------------
// DELETE CATEGORY (Admin Only)
// ---------------------------------------
export const deleteCategory = async (req: any, res: Response) => {
  try {
    const cat = await Category.findById(req.params.id);

    if (!cat) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    await moveToRecycleBin("category", cat, { deletedBy: req.user?.id });

    return res.json({ success: true, message: "Category moved to recycle bin" });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
