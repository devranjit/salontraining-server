import { Request, Response } from "express";
import Product from "../models/Product";
import Category from "../models/Category.js";

// -----------------------------------------------------
// ADMIN — CREATE PRODUCT
// -----------------------------------------------------
export const createProduct = async (req: any, res: Response) => {
  try {
    const {
      name,
      description,
      price,
      category,
      stock,
      variations,
      images,
    } = req.body;

    // Category check
    const cat = await Category.findById(category);
    if (!cat) return res.status(400).json({ message: "Invalid category" });

    const product = await Product.create({
      name,
      description,
      price,
      category,
      stock,
      variations: variations || [],
      images: images || [],
      created_by: req.user.id, // admin id
    });

    return res.json({ success: true, product });
  } catch (error) {
    return res.status(500).json({ message: error });
  }
};

// -----------------------------------------------------
// PUBLIC — GET ALL PUBLISHED PRODUCTS
// -----------------------------------------------------
export const getProducts = async (req: Request, res: Response) => {
  try {
    const products = await Product.find({ status: "published" })
      .populate("category", "name")
      .sort({ createdAt: -1 });

    return res.json({ success: true, products });
  } catch (error) {
    return res.status(500).json({ message: error });
  }
};

// -----------------------------------------------------
// PUBLIC — GET SINGLE PRODUCT
// -----------------------------------------------------
export const getSingleProduct = async (req: Request, res: Response) => {
  try {
    const product = await Product.findById(req.params.id).populate(
      "category",
      "name"
    );

    if (!product)
      return res.status(404).json({ message: "Product not found" });

    return res.json({ success: true, product });
  } catch (error) {
    return res.status(500).json({ message: error });
  }
};

// -----------------------------------------------------
// ADMIN — UPDATE PRODUCT
// -----------------------------------------------------
export const updateProduct = async (req: any, res: Response) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product)
      return res.status(404).json({ message: "Product not found" });

    await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });

    return res.json({ success: true, message: "Product updated" });
  } catch (error) {
    return res.status(500).json({ message: error });
  }
};

// -----------------------------------------------------
// ADMIN — DELETE PRODUCT
// -----------------------------------------------------
export const deleteProduct = async (req: any, res: Response) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product)
      return res.status(404).json({ message: "Product not found" });

    await Product.findByIdAndDelete(req.params.id);

    return res.json({ success: true, message: "Product deleted" });
  } catch (error) {
    return res.status(500).json({ message: error });
  }
};

// -----------------------------------------------------
// ADMIN — PUBLISH / UNPUBLISH
// -----------------------------------------------------
export const toggleProductStatus = async (req: any, res: Response) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product)
      return res.status(404).json({ message: "Product not found" });

    product.status = product.status === "draft" ? "published" : "draft";
    await product.save();

    return res.json({
      success: true,
      status: product.status,
    });
  } catch (error) {
    return res.status(500).json({ message: error });
  }
};
