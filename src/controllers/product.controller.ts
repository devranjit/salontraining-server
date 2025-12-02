import { Request, Response } from "express";
import Product from "../models/Product";
import Category from "../models/Category";

// ============================================================
// PUBLIC ROUTES
// ============================================================

// GET ALL PUBLISHED PRODUCTS (with filters)
export const getProducts = async (req: Request, res: Response) => {
  try {
    const {
      page = 1,
      limit = 12,
      category,
      productType,
      minPrice,
      maxPrice,
      search,
      sort = "newest",
      featured,
    } = req.query;

    const query: any = { status: { $in: ["approved", "published"] } };

    // Category filter
    if (category) {
      query.category = category;
    }

    // Product type filter
    if (productType) {
      query.productType = productType;
    }

    // Price range
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    // Search
    if (search) {
      query.$text = { $search: search as string };
    }

    // Featured only
    if (featured === "true") {
      query.featured = true;
    }

    // Sorting
    let sortOption: any = { createdAt: -1 };
    switch (sort) {
      case "oldest":
        sortOption = { createdAt: 1 };
        break;
      case "price_low":
        sortOption = { price: 1 };
        break;
      case "price_high":
        sortOption = { price: -1 };
        break;
      case "popular":
        sortOption = { sales: -1 };
        break;
      case "rating":
        sortOption = { averageRating: -1 };
        break;
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [products, total] = await Promise.all([
      Product.find(query)
        .populate("category", "name")
        .populate("owner", "name email")
        .sort(sortOption)
        .skip(skip)
        .limit(Number(limit)),
      Product.countDocuments(query),
    ]);

    return res.json({
      success: true,
      products,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// GET FEATURED PRODUCTS
export const getFeaturedProducts = async (req: Request, res: Response) => {
  try {
    const { limit = 8 } = req.query;

    const products = await Product.find({
      status: "published",
      featured: true,
    })
      .populate("category", "name")
      .sort({ createdAt: -1 })
      .limit(Number(limit));

    return res.json({ success: true, products });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// GET SINGLE PRODUCT BY ID OR SLUG
export const getSingleProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    let product = null;

    // Check if id is a valid MongoDB ObjectId
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(id);

    if (isValidObjectId) {
      // Try to find by ID first
      product = await Product.findById(id)
        .populate("category", "name")
        .populate("owner", "name email");
    }

    // If not found by ID, try slug
    if (!product) {
      product = await Product.findOne({ slug: id })
        .populate("category", "name")
        .populate("owner", "name email");
    }

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    // Increment views
    product.views += 1;
    await product.save();

    return res.json({ success: true, product });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// GET PRODUCTS BY SELLER
export const getProductsBySeller = async (req: Request, res: Response) => {
  try {
    const { sellerId } = req.params;

    const products = await Product.find({
      owner: sellerId,
      status: "published",
    })
      .populate("category", "name")
      .sort({ createdAt: -1 });

    return res.json({ success: true, products });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// USER (SELLER) ROUTES
// ============================================================

// CREATE PRODUCT (User)
export const createUserProduct = async (req: any, res: Response) => {
  try {
    const {
      name,
      description,
      shortDescription,
      price,
      salePrice,
      sku,
      category,
      productType,
      stock,
      variations,
      images,
      productFormat,
      downloadUrl,
      tags,
      brand,
      weight,
      dimensions,
    } = req.body;

    if (!name || !price) {
      return res.status(400).json({
        success: false,
        message: "Name and price are required",
      });
    }

    const product = await Product.create({
      name,
      description,
      shortDescription,
      price,
      salePrice,
      sku,
      category,
      productType,
      stock: stock || 0,
      variations: variations || [],
      images: images || [],
      productFormat,
      downloadUrl,
      tags: tags || [],
      brand,
      weight,
      dimensions,
      owner: req.user.id,
      created_by: req.user.id,
      status: "pending", // User products need approval
    });

    return res.json({
      success: true,
      message: "Product created and pending approval",
      product,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// GET MY PRODUCTS (User)
export const getMyProducts = async (req: any, res: Response) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;

    const query: any = { owner: req.user.id };
    if (status) {
      query.status = status;
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [products, total] = await Promise.all([
      Product.find(query)
        .populate("category", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Product.countDocuments(query),
    ]);

    return res.json({
      success: true,
      products,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// UPDATE MY PRODUCT (User)
export const updateMyProduct = async (req: any, res: Response) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      owner: req.user.id,
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found or unauthorized",
      });
    }

    // Don't allow changing status
    const { status, featured, adminNotes, ...updateData } = req.body;

    // If product was published, set back to pending for review
    if (product.status === "published") {
      updateData.status = "pending";
    }

    const updated = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    return res.json({
      success: true,
      message: "Product updated",
      product: updated,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE MY PRODUCT (User)
export const deleteMyProduct = async (req: any, res: Response) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      owner: req.user.id,
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found or unauthorized",
      });
    }

    await Product.findByIdAndDelete(req.params.id);

    return res.json({ success: true, message: "Product deleted" });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// IMPORT PRODUCT FROM EXTERNAL SOURCE (User)
export const importProduct = async (req: any, res: Response) => {
  try {
    const {
      name,
      description,
      price,
      images,
      externalUrl,
      externalId,
      source,
      category,
      productType,
    } = req.body;

    if (!name || !price) {
      return res.status(400).json({
        success: false,
        message: "Name and price are required for import",
      });
    }

    // Check if already imported
    if (externalId) {
      const existing = await Product.findOne({
        externalId,
        owner: req.user.id,
      });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: "Product already imported",
        });
      }
    }

    const product = await Product.create({
      name,
      description,
      price,
      images: images || [],
      externalUrl,
      externalId,
      importedFrom: source || "external",
      category,
      productType,
      owner: req.user.id,
      created_by: req.user.id,
      status: "pending",
    });

    return res.json({
      success: true,
      message: "Product imported successfully",
      product,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// BULK IMPORT PRODUCTS (User)
export const bulkImportProducts = async (req: any, res: Response) => {
  try {
    const { products, source } = req.body;

    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Products array is required",
      });
    }

    const imported = [];
    const errors = [];

    for (const p of products) {
      try {
        if (!p.name || !p.price) {
          errors.push({ product: p.name, error: "Name and price required" });
          continue;
        }

        // Check for existing
        if (p.externalId) {
          const existing = await Product.findOne({
            externalId: p.externalId,
            owner: req.user.id,
          });
          if (existing) {
            errors.push({ product: p.name, error: "Already imported" });
            continue;
          }
        }

        const product = await Product.create({
          name: p.name,
          description: p.description || "",
          price: p.price,
          salePrice: p.salePrice,
          images: p.images || [],
          externalUrl: p.externalUrl,
          externalId: p.externalId,
          importedFrom: source || "bulk",
          category: p.category,
          productType: p.productType,
          stock: p.stock || 0,
          owner: req.user.id,
          created_by: req.user.id,
          status: "pending",
        });

        imported.push(product);
      } catch (err: any) {
        errors.push({ product: p.name, error: err.message });
      }
    }

    return res.json({
      success: true,
      message: `Imported ${imported.length} products`,
      imported: imported.length,
      errors,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// ADMIN ROUTES
// ============================================================

// GET ALL PRODUCTS (Admin)
export const adminGetAllProducts = async (req: any, res: Response) => {
  try {
    const { status, page = 1, limit = 20, search, owner } = req.query;

    const query: any = {};

    if (status) {
      query.status = status;
    }

    if (owner) {
      query.owner = owner;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [products, total] = await Promise.all([
      Product.find(query)
        .populate("category", "name")
        .populate("owner", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Product.countDocuments(query),
    ]);

    return res.json({
      success: true,
      products,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// GET PENDING COUNTS (Admin)
export const getProductPendingCounts = async (req: any, res: Response) => {
  try {
    const [pending, draft, published, rejected] = await Promise.all([
      Product.countDocuments({ status: "pending" }),
      Product.countDocuments({ status: "draft" }),
      Product.countDocuments({ status: "published" }),
      Product.countDocuments({ status: "rejected" }),
    ]);

    return res.json({
      success: true,
      counts: { pending, draft, published, rejected, total: pending + draft + published + rejected },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// CREATE PRODUCT (Admin)
export const createProduct = async (req: any, res: Response) => {
  try {
    const {
      name,
      description,
      shortDescription,
      price,
      salePrice,
      sku,
      category,
      productType,
      stock,
      variations,
      images,
      productFormat,
      downloadUrl,
      tags,
      brand,
      weight,
      dimensions,
      status,
      featured,
      owner, // Admin can assign owner
    } = req.body;

    if (!name || !price) {
      return res.status(400).json({
        success: false,
        message: "Name and price are required",
      });
    }

    const product = await Product.create({
      name,
      description,
      shortDescription,
      price,
      salePrice,
      sku,
      category,
      productType,
      stock: stock || 0,
      variations: variations || [],
      images: images || [],
      productFormat,
      downloadUrl,
      tags: tags || [],
      brand,
      weight,
      dimensions,
      owner: owner || req.user.id,
      created_by: req.user.id,
      status: status || "published", // Admin products can be published directly
      featured: featured || false,
    });

    return res.json({ success: true, product });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// UPDATE PRODUCT (Admin)
export const updateProduct = async (req: any, res: Response) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const updated = await Product.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    return res.json({
      success: true,
      message: "Product updated",
      product: updated,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE PRODUCT (Admin)
export const deleteProduct = async (req: any, res: Response) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    await Product.findByIdAndDelete(req.params.id);

    return res.json({ success: true, message: "Product deleted" });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// APPROVE PRODUCT (Admin)
export const approveProduct = async (req: any, res: Response) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { status: "approved", rejectionReason: null },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    return res.json({
      success: true,
      message: "Product approved",
      product,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// PUBLISH PRODUCT (Admin)
export const publishProduct = async (req: any, res: Response) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { status: "published" },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    return res.json({
      success: true,
      message: "Product published",
      product,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// REJECT PRODUCT (Admin)
export const rejectProduct = async (req: any, res: Response) => {
  try {
    const { reason } = req.body;

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      {
        status: "rejected",
        rejectionReason: reason,
      },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    return res.json({
      success: true,
      message: "Product rejected",
      product,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// SET PENDING (Admin)
export const setProductPending = async (req: any, res: Response) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { status: "pending" },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    return res.json({
      success: true,
      message: "Product set to pending",
      product,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// TOGGLE FEATURED (Admin)
export const toggleFeatured = async (req: any, res: Response) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    product.featured = !product.featured;
    await product.save();

    return res.json({
      success: true,
      message: product.featured ? "Product featured" : "Product unfeatured",
      featured: product.featured,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// TOGGLE STATUS (Admin) - legacy support
export const toggleProductStatus = async (req: any, res: Response) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    product.status = product.status === "published" ? "draft" : "published";
    await product.save();

    return res.json({
      success: true,
      status: product.status,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
