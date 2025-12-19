import { Request, Response } from "express";
import Product from "../models/Product";
import Category from "../models/Category";
import { moveToRecycleBin } from "../services/recycleBinService";
import StoreTag from "../models/StoreTag";
import { User } from "../models/User";

const ROLE_CONTROL_ACTIONS: Record<string, string[]> = {
  admin: ["create", "edit_any", "delete_any", "approve", "publish", "feature"],
  manager: ["create", "edit_any", "delete_any", "approve", "publish", "feature"],
  "st-member": ["create", "edit_own", "delete_own", "request_review"],
  member: ["create", "edit_own", "delete_own", "request_review"],
  user: ["create", "edit_own", "delete_own", "request_review"],
  default: ["view"],
};

const getActionsForRole = (role?: string) =>
  ROLE_CONTROL_ACTIONS[role as keyof typeof ROLE_CONTROL_ACTIONS] ||
  ROLE_CONTROL_ACTIONS.default;

const normalizeBundleMode = (mode?: string) => {
  if (!mode) return "fixed";
  const val = String(mode).toLowerCase();
  if (val === "sum" || val === "calculated") return "calculated";
  if (val === "discount" || val === "discounted") return "discounted";
  return "fixed";
};

const normalizeBundleGroups = (groups?: any[]) => {
  if (!Array.isArray(groups)) return [];
  return groups
    .map((g) => ({
      name: g?.name || "",
      pricingMode: normalizeBundleMode(g?.pricingMode),
      discountPercent: Number(g?.discountPercent ?? 0),
      items: Array.isArray(g?.items)
        ? g.items
            .filter((it: any) => it?.product)
            .map((it: any) => ({
              product: it.product,
              quantity: Number(it.quantity ?? 1) || 1,
              optional: Boolean(it.optional),
              discountPercent: Number(it.discountPercent ?? 0),
            }))
        : [],
    }))
    .filter((g) => g.items.length > 0);
};

const normalizeSocialLinks = (links?: any[]) => {
  if (!Array.isArray(links)) return [];
  return links
    .map((link) => ({
      platform: typeof link?.platform === "string" ? link.platform.trim() : "",
      url: typeof link?.url === "string" ? link.url.trim() : "",
    }))
    .filter((link) => link.platform || link.url);
};

const buildSlug = (name?: string) =>
  name
    ? name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .concat("-", Date.now().toString(36))
    : undefined;

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
      productSource,  // Filter by product source: "store" or "listing"
    tags,
    } = req.query;

    // Filter by product source: "store" or "listing"
    const sourceFilter = (productSource as string) || "listing";

    const query: any = { 
      status: { $in: ["approved", "published"] },
    };

    // For store: only show products explicitly marked as store
    if (sourceFilter === "store") {
      query.productSource = "store";
    }
    // For listing: handled below with owner filtering

    // Category filter
    if (category) {
      query.category = category;
    }

    // Product type filter
    if (productType) {
      query.productType = productType;
    }

  // Tags filter (comma-separated)
  if (tags) {
    const tagList = String(tags)
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (tagList.length > 0) {
      query.tags = { $in: tagList };
    }
  }

    // Price range (support zero values)
    const hasMinPrice = minPrice !== undefined && minPrice !== "";
    const hasMaxPrice = maxPrice !== undefined && maxPrice !== "";
    if (hasMinPrice || hasMaxPrice) {
      query.price = {};
      const minVal = Number(minPrice);
      const maxVal = Number(maxPrice);
      if (hasMinPrice && !isNaN(minVal)) query.price.$gte = minVal;
      if (hasMaxPrice && !isNaN(maxVal)) query.price.$lte = maxVal;
    }

    // Search
    if (search) {
      query.$text = { $search: search as string };
    }

    // Featured only
    if (featured === "true") {
      query.featured = true;
    }

    // Sorting (keep featured items first for listing/archive views)
    const baseSort = sourceFilter === "listing" ? { featured: -1 } : {};
    let sortOption: any = { ...baseSort, createdAt: -1 };
    switch (sort) {
      case "oldest":
        sortOption = { ...baseSort, createdAt: 1 };
        break;
      case "price_low":
        sortOption = { ...baseSort, price: 1, createdAt: -1 };
        break;
      case "price_high":
        sortOption = { ...baseSort, price: -1, createdAt: -1 };
        break;
      case "popular":
        sortOption = { ...baseSort, sales: -1, createdAt: -1 };
        break;
      case "rating":
        sortOption = { ...baseSort, averageRating: -1, createdAt: -1 };
        break;
    }

    const skip = (Number(page) - 1) * Number(limit);

    // If listing source requested, show products that are NOT store catalog products
    if (sourceFilter === "listing") {
      // Show products where productSource is "listing", undefined, or null (anything except "store")
      query.productSource = { $ne: "store" };
    }

    const [products, total] = await Promise.all([
      Product.find(query)
        .populate("category", "name")
        .populate("owner", "name email role")
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

// GET filters for products (categories, product types, tags)
export const getProductFilters = async (req: Request, res: Response) => {
  try {
    const sourceFilter = (req.query.productSource as string) || "store";
    const baseQuery: any = {
      status: { $in: ["approved", "published"] },
    };
    if (sourceFilter === "store") {
      baseQuery.productSource = "store";
    } else if (sourceFilter === "listing") {
      baseQuery.productSource = { $ne: "store" };
    }

    // Aggregate only filters that have at least one published/approved product
    const [categoryAgg, productTypeAgg, tags, brands] = await Promise.all([
      Product.aggregate([
        { $match: { ...baseQuery, category: { $ne: null } } },
        { $group: { _id: "$category", count: { $sum: 1 } } },
      ]),
      Product.aggregate([
        { $match: { ...baseQuery, productType: { $nin: [null, ""] } } },
        { $group: { _id: "$productType", count: { $sum: 1 } } },
      ]),
      Product.distinct("tags", baseQuery),
      Product.distinct("brand", baseQuery),
    ]);

    // Fetch only existing categories that have products
    const categoryIds = categoryAgg.map((c: any) => c._id).filter(Boolean);
    const categories = await Category.find({ _id: { $in: categoryIds } })
      .select("_id name")
      .sort({ name: 1 });

    return res.json({
      success: true,
      categories,
      productTypes: (productTypeAgg as any[])
        .map((t) => t._id)
        .filter(Boolean)
        .sort((a: string, b: string) => a.localeCompare(b)),
      tags: (tags as string[]).filter(Boolean).sort((a, b) => a.localeCompare(b)),
      brands: (brands as string[]).filter(Boolean).sort((a, b) => a.localeCompare(b)),
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// GET FEATURED PRODUCTS
export const getFeaturedProducts = async (req: Request, res: Response) => {
  try {
    const { limit = 8, productSource } = req.query;

    const query: any = {
      status: "published",
      featured: true,
    };

    // Optionally filter by product source
    if (productSource) {
      query.productSource = productSource;
    }

    const products = await Product.find(query)
      .populate("category", "name")
      .sort({ createdAt: -1 })
      .limit(Number(limit));

    return res.json({ success: true, products });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ADMIN: STORE TAXONOMY (categories & tags for store catalog)
export const getStoreTaxonomy = async (_req: Request, res: Response) => {
  try {
    const matchStage = { productSource: "store" };

    const [categoryAgg, tagAgg, manualTags, allCategories] = await Promise.all([
      Product.aggregate([
        { $match: { ...matchStage, category: { $ne: null } } },
        { $group: { _id: "$category", count: { $sum: 1 } } },
      ]),
      Product.aggregate([
        { $match: matchStage },
        { $unwind: "$tags" },
        { $match: { tags: { $nin: [null, ""] } } },
        { $group: { _id: "$tags", count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
      ]),
      StoreTag.find().lean(),
      Category.find().select("_id name").sort({ name: 1 }).lean(),
    ]);

    const categoryCountMap = new Map<string, number>();
    categoryAgg.forEach((c: any) => {
      if (c?._id) categoryCountMap.set(String(c._id), c.count || 0);
    });

    const categoriesWithCounts = (allCategories || []).map((c: any) => ({
      _id: c._id,
      name: c.name,
      count: categoryCountMap.get(String(c._id)) || 0,
    }));

    const mergedTags = (() => {
      const aggMap = new Map<string, number>();
      (tagAgg || []).forEach((t: any) => {
        if (t?._id) aggMap.set(String(t._id).trim(), t.count || 0);
      });
      const names = new Set<string>();
      aggMap.forEach((_v, k) => names.add(k));
      (manualTags || []).forEach((t: any) => {
        if (t?.name) names.add(String(t.name).trim());
      });
      return Array.from(names)
        .map((name) => ({
          name,
          count: aggMap.get(name) || 0,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    })();

    return res.json({
      success: true,
      categories: categoriesWithCounts,
      tags: mergedTags,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ADMIN: RENAME A STORE TAG (affects store products)
export const renameStoreTag = async (req: Request, res: Response) => {
  try {
    const { oldTag, newTag } = req.body as { oldTag?: string; newTag?: string };

    if (!oldTag || !newTag) {
      return res.status(400).json({ success: false, message: "oldTag and newTag are required" });
    }

    const trimmedNew = newTag.trim();
    const trimmedOld = oldTag.trim();

    if (!trimmedNew || !trimmedOld) {
      return res.status(400).json({ success: false, message: "Tags cannot be empty" });
    }

    if (trimmedNew === trimmedOld) {
      return res.json({ success: true, modified: 0, message: "No changes applied" });
    }

    const result = await Product.updateMany(
      { productSource: "store", tags: trimmedOld },
      {
        $addToSet: { tags: trimmedNew },
        $pull: { tags: trimmedOld },
      }
    );

    await StoreTag.findOneAndUpdate(
      { name: trimmedOld },
      { name: trimmedNew },
      { upsert: true, new: true }
    );

    return res.json({
      success: true,
      matched: result.matchedCount ?? 0,
      modified: result.modifiedCount ?? 0,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ADMIN: DELETE A STORE TAG (removes from all store products)
export const deleteStoreTag = async (req: Request, res: Response) => {
  try {
    const { tag } = req.params;

    if (!tag) {
      return res.status(400).json({ success: false, message: "Tag is required" });
    }

    const result = await Product.updateMany(
      { productSource: "store" },
      { $pull: { tags: tag } }
    );

    await StoreTag.deleteOne({ name: tag });

    return res.json({
      success: true,
      matched: result.matchedCount ?? 0,
      modified: result.modifiedCount ?? 0,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ADMIN: CREATE A STORE TAG (manual)
export const createStoreTag = async (req: Request, res: Response) => {
  try {
    const { tag } = req.body as { tag?: string };
    const name = tag?.trim();
    if (!name) {
      return res.status(400).json({ success: false, message: "Tag is required" });
    }

    const existing = await StoreTag.findOne({ name });
    if (existing) {
      return res.status(400).json({ success: false, message: "Tag already exists" });
    }

    const created = await StoreTag.create({ name });
    return res.json({ success: true, tag: created });
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

    const basePopulate = [
      { path: "category", select: "name" },
      { path: "owner", select: "name email" },
      {
        path: "groupedProducts.product",
        select: "name slug price salePrice images productFormat stock",
      },
      {
        path: "bundleGroups.items.product",
        select: "name slug price salePrice images productFormat stock",
      },
    ];

    if (isValidObjectId) {
      // Try to find by ID first
      product = await Product.findById(id).select("+socialLinks").populate(basePopulate);
    }

    // If not found by ID, try slug
    if (!product) {
      product = await Product.findOne({ slug: id }).select("+socialLinks").populate(basePopulate);
    }

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    // Increment views without triggering full validation that can fail on legacy/partial records
    const nextViews = product.views + 1;
    product.views = nextViews;
    Product.updateOne({ _id: product._id }, { $inc: { views: 1 } }).catch(() => {
      // Non-blocking: if analytics update fails, still return the product
    });

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
      productSource: "listing", // Only show user-submitted listings for seller pages
    })
      .populate("category", "name")
      .sort({ createdAt: -1 });

    return res.json({ success: true, products });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// USER (SELLER) ROUTES - PRODUCT LISTINGS
// ============================================================

// CREATE PRODUCT LISTING (User) - Simplified for listings
export const createUserProduct = async (req: any, res: Response) => {
  try {
    const {
      name,
      description,
      shortDescription,
      price,
      salePrice,
      productType,
      images,
      tags,
      couponCode,
      shopUrl,
      socialLinks,
      contactEmail,
      contactPhone,
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
      productType: productType || "other",
      images: images || [],
      tags: tags || [],
      couponCode: couponCode?.trim() || undefined,
      shopUrl: shopUrl?.trim() || undefined,
      contactEmail: contactEmail?.trim() || undefined,
      contactPhone: contactPhone?.trim() || undefined,
      socialLinks: normalizeSocialLinks(socialLinks),
      owner: req.user.id,
      created_by: req.user.id,
      status: "pending",
      productSource: "listing",
    });

    return res.json({
      success: true,
      message: "Product listing created and pending approval",
      product,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// GET MY PRODUCTS (User)
export const getMyProducts = async (req: any, res: Response) => {
  try {
    const { status, page = 1, limit = 10, productSource } = req.query;

    // Default to listing products for user dashboard
    const sourceFilter = (productSource as string) || "listing";

    const query: any = { owner: req.user.id, productSource: sourceFilter };
    if (status) {
      query.status = status;
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [products, total] = await Promise.all([
      Product.find(query)
        .select("+socialLinks")
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

// GET SINGLE MY PRODUCT BY ID (User)
export const getMyProductById = async (req: any, res: Response) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      owner: req.user.id,
    }).populate("category", "name");

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found or unauthorized",
      });
    }

    return res.json({ success: true, product });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// UPDATE MY PRODUCT LISTING (User) - Simplified for listings
export const updateMyProduct = async (req: any, res: Response) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      owner: req.user.id,
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product listing not found or unauthorized",
      });
    }

    // Only allow updating listing-specific fields
    const {
      name,
      description,
      shortDescription,
      price,
      salePrice,
      productType,
      images,
      tags,
      couponCode,
      shopUrl,
      socialLinks,
      contactEmail,
      contactPhone,
    } = req.body;

    const updateData: any = {};
    
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (shortDescription !== undefined) updateData.shortDescription = shortDescription;
    if (price !== undefined) updateData.price = price;
    if (salePrice !== undefined) updateData.salePrice = salePrice;
    if (productType !== undefined) updateData.productType = productType;
    if (images !== undefined) updateData.images = images;
    if (tags !== undefined) updateData.tags = tags;
    if (couponCode !== undefined) updateData.couponCode = couponCode?.trim() || undefined;
    if (shopUrl !== undefined) updateData.shopUrl = shopUrl?.trim() || undefined;
    if (contactEmail !== undefined) updateData.contactEmail = contactEmail?.trim() || undefined;
    if (contactPhone !== undefined) updateData.contactPhone = contactPhone?.trim() || undefined;
    if (socialLinks !== undefined) updateData.socialLinks = normalizeSocialLinks(socialLinks);

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
      message: "Product listing updated",
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

    await moveToRecycleBin("product", product, { deletedBy: req.user?.id });

    return res.json({ success: true, message: "Product moved to recycle bin" });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// CONTROL PANEL (role-aware)
// ============================================================
export const getProductControlPanel = async (req: any, res: Response) => {
  try {
    const { productSource } = req.query;
    const role = req.user?.role || "user";
    const isModerator = ["admin", "manager"].includes(role);
    const scope = isModerator ? "global" : "owner";
    
    // Build base filter
    const baseFilter: any = isModerator ? {} : { owner: req.user?.id, productSource: "listing" };
    
    // For admins, filter by productSource if specified (store catalog vs user listings)
    if (productSource && isModerator) {
      baseFilter.productSource = productSource;
    }

    // For non-admins, ensure we never show store catalog products
    if (!isModerator) {
      baseFilter.productSource = "listing";
    }

    const statusKeys: Array<"pending" | "approved" | "published" | "rejected" | "draft"> = [
      "pending",
      "approved",
      "published",
      "rejected",
      "draft",
    ];

    const statusCountsEntries = await Promise.all(
      statusKeys.map(async (status) => {
        const count = await Product.countDocuments({ ...baseFilter, status });
        return [status, count] as const;
      })
    );

    const counts = Object.fromEntries(statusCountsEntries) as Record<string, number>;
    counts.total = await Product.countDocuments(baseFilter);
    counts.featured = await Product.countDocuments({ ...baseFilter, featured: true });
    counts.lowStock = await Product.countDocuments({
      ...baseFilter,
      stock: { $lte: 5 },
    });

    const recentProducts = await Product.find(baseFilter)
      .populate("owner", "name email role")
      .populate("category", "name")
      .sort({ createdAt: -1 })
      .limit(25);

    return res.json({
      success: true,
      role,
      scope,
      allowedActions: getActionsForRole(role),
      counts,
      products: recentProducts,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Failed to load product control panel",
      error: error.message,
    });
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
      productSource: "listing",  // Imported products are listings
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
          productSource: "listing",  // Bulk imported products are listings
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
    const { status, page = 1, limit = 20, search, owner, productSource } = req.query;

    const query: any = {};

    if (status) {
      query.status = status;
    }

    if (owner) {
      query.owner = owner;
    }

    // Filter by product source (store catalog vs user listings)
    if (productSource) {
      query.productSource = productSource;
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
        .select("+socialLinks")
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
      productStructure,
      stock,
      variations,
      combinedVariations,
      useCombinedVariations,
      groupedProducts,
      bundleGroups,
      bundlePricingMode,
      bundleDiscount,
      images,
      productFormat,
      downloadUrl,
      downloadLimit,
      downloadExpiry,
      tags,
      brand,
      couponCode,
      weight,
      dimensions,
      shippingClass,
      status,
      featured,
      owner,
      manageStock,
      backordersAllowed,
      lowStockThreshold,
      relatedProducts,
      crossSellProducts,
      purchaseNote,
      minQuantity,
      maxQuantity,
      soldIndividually,
      metaTitle,
      metaDescription,
      shopUrl,
      socialLinks,
      contactEmail,
      contactPhone,
    } = req.body;

    if (!name || price === undefined) {
      return res.status(400).json({
        success: false,
        message: "Name and price are required",
      });
    }

    // Normalize bundle mode and determine product structure based on input
    const normalizedBundleMode = normalizeBundleMode(bundlePricingMode);
    const normalizedBundleGroups = normalizeBundleGroups(bundleGroups);
    let finalProductStructure = productStructure || "simple";
    if (normalizedBundleGroups.length > 0) {
      finalProductStructure = "bundle";
    } else if (groupedProducts && groupedProducts.length > 0) {
      finalProductStructure = normalizedBundleMode === "fixed" ? "bundle" : "grouped";
    } else if ((variations && variations.length > 0) || (combinedVariations && combinedVariations.length > 0)) {
      finalProductStructure = "variable";
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
      productStructure: finalProductStructure,
      stock: stock || 0,
      variations: variations || [],
      combinedVariations: combinedVariations || [],
      useCombinedVariations: useCombinedVariations || false,
      groupedProducts: groupedProducts || [],
      bundleGroups: normalizedBundleGroups,
      bundlePricingMode: normalizedBundleMode,
      bundleDiscount: bundleDiscount || 0,
      images: images || [],
      productFormat,
      downloadUrl,
      downloadLimit: downloadLimit ?? -1,
      downloadExpiry: downloadExpiry ?? -1,
      tags: tags || [],
      brand,
      couponCode: couponCode?.trim() || undefined,
      weight,
      dimensions,
      shippingClass,
      owner: owner || req.user.id,
      created_by: req.user.id,
      status: status || "published",
      featured: featured || false,
      manageStock: manageStock ?? true,
      backordersAllowed: backordersAllowed || false,
      lowStockThreshold: lowStockThreshold || 5,
      relatedProducts: relatedProducts || [],
      crossSellProducts: crossSellProducts || [],
      purchaseNote,
      minQuantity: minQuantity || 1,
      maxQuantity,
      soldIndividually: soldIndividually || false,
      metaTitle,
      metaDescription,
      productSource: "store",  // Admin-created products are store catalog products
      shopUrl: shopUrl?.trim(),
      socialLinks: normalizeSocialLinks(socialLinks),
      contactEmail: contactEmail?.trim() || undefined,
      contactPhone: contactPhone?.trim() || undefined,
    });

    // Populate grouped products if any
    if (finalProductStructure === "grouped" || finalProductStructure === "bundle") {
      await product.populate("groupedProducts.product", "name slug price salePrice images stock");
    }

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

    // Determine product structure based on update data
    const updateData = { ...req.body };
    if (updateData.socialLinks !== undefined) {
      updateData.socialLinks = normalizeSocialLinks(updateData.socialLinks);
    }
    if (updateData.bundleGroups) {
      updateData.bundleGroups = normalizeBundleGroups(updateData.bundleGroups);
      updateData.bundlePricingMode = normalizeBundleMode(updateData.bundlePricingMode);
    }
    
    // Slug handling: only change slug when an explicit slug is provided.
    // This avoids breaking existing product URLs when a product name changes.
    if (updateData.slug) {
      updateData.slug = buildSlug(updateData.slug);
    } else if (!product.slug) {
      // Backfill slug only if the product somehow has none
      updateData.slug = buildSlug(product.name);
    }

    if (Array.isArray(updateData.bundleGroups) && updateData.bundleGroups.length > 0) {
      updateData.productStructure = "bundle";
      updateData.bundlePricingMode = normalizeBundleMode(updateData.bundlePricingMode);
    } else if (updateData.groupedProducts?.length > 0) {
      // Pure grouped products (no bundle groups)
      updateData.productStructure = "grouped";
      updateData.bundlePricingMode = undefined;
      updateData.bundleGroups = [];
    } else if (updateData.variations?.length > 0 || updateData.combinedVariations?.length > 0) {
      updateData.productStructure = "variable";
    } else if (updateData.productStructure === undefined) {
      // Keep existing or default to simple
      updateData.productStructure = product.productStructure || "simple";
    }

    const updated = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).populate("groupedProducts.product", "name slug price salePrice images stock")
     .populate("bundleGroups.items.product", "name slug price salePrice images stock")
     .populate("relatedProducts", "name slug price images")
     .populate("crossSellProducts", "name slug price images");

    return res.json({
      success: true,
      message: "Product updated",
      product: updated,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// CHANGE PRODUCT OWNER (Admin)
export const adminChangeProductOwner = async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, message: "User ID is required" });
    }

    const newOwner = await User.findById(userId).select("name email status");
    if (!newOwner) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (newOwner.status === "blocked") {
      return res.status(400).json({ success: false, message: "Blocked users cannot own listings" });
    }

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { owner: newOwner._id },
      { new: true }
    ).populate("owner", "name email");

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    return res.json({
      success: true,
      message: "Product owner updated",
      product,
      owner: product.owner,
    });
  } catch (error: any) {
    if (error.name === "CastError") {
      return res.status(400).json({ success: false, message: "Invalid ID supplied" });
    }
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

    await moveToRecycleBin("product", product, { deletedBy: req.user?.id });

    return res.json({ success: true, message: "Product moved to recycle bin" });
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
    const product = await Product.findById(req.params.id).select("featured productSource");

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Only toggle featured; keep the existing productSource (default to listing for legacy docs)
    const updateData: any = { featured: !product.featured };

    if (product.productSource) {
      updateData.productSource = product.productSource;
    } else {
      updateData.productSource = "listing";
    }

    const updated = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true });

    return res.json({
      success: true,
      message: updated?.featured ? "Product featured" : "Product unfeatured",
      featured: updated?.featured,
      productSource: updated?.productSource,
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

// ============================================================
// GROUPED/BUNDLE PRODUCT HELPERS
// ============================================================

// GET PRODUCT WITH FULL DETAILS (for grouped products)
export const getProductWithGroupedDetails = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const product = await Product.findById(id)
      .select("+socialLinks")
      .populate("category", "name")
      .populate("owner", "name email phone")
      .populate("groupedProducts.product", "name slug price salePrice images stock productFormat variations")
      .populate("bundleGroups.items.product", "name slug price salePrice images stock productFormat variations")
      .populate("relatedProducts", "name slug price salePrice images")
      .populate("crossSellProducts", "name slug price salePrice images");

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    // Calculate bundle total if grouped/bundle product
    let bundleTotal = 0;
    if ((product as any).productStructure === "grouped" || (product as any).productStructure === "bundle") {
      const groupedProducts = (product as any).groupedProducts || [];
      for (const item of groupedProducts) {
        if (item.product) {
          const itemPrice = item.product.salePrice || item.product.price;
          const discount = item.discountPercent || 0;
          const discountedPrice = itemPrice * (1 - discount / 100);
          bundleTotal += discountedPrice * item.quantity;
        }
      }
    }

    return res.json({
      success: true,
      product,
      bundleCalculatedTotal: bundleTotal,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// SEARCH PRODUCTS FOR GROUPING (Admin)
export const searchProductsForGrouping = async (req: any, res: Response) => {
  try {
    const { search, exclude } = req.query;
    
    // Allow admins to pull any catalog items that can be nested (simple/variable) and
    // are not archived/rejected. Using a wider status set makes it easier to build grouped
    // products before publishing.
    const query: any = {
      status: { $in: ["published", "approved", "pending", "draft"] },
      productStructure: { $in: ["simple", "variable"] }, // Can't nest grouped products
      stock: { $gt: 0 }, // Only show products with available stock
    };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { sku: { $regex: search, $options: "i" } },
      ];
    }

    // Exclude current product and already grouped products
    if (exclude) {
      const excludeIds = Array.isArray(exclude)
        ? exclude
        : String(exclude)
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean);
      query._id = { $nin: excludeIds };
    }

    const products = await Product.find(query)
      .select("name slug price salePrice images stock sku productFormat")
      .limit(20)
      .sort({ name: 1 });

    return res.json({ success: true, products });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// DUPLICATE PRODUCT (Admin)
export const duplicateProduct = async (req: any, res: Response) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    // Create a copy of the product - exclude non-copiable fields
    const productObj = product.toObject() as any;
    const { _id, slug, createdAt, updatedAt, __v, ...productData } = productObj;
    
    const duplicateData: any = {
      ...productData,
      name: `${productData.name} (Copy)`,
      status: "draft",
      views: 0,
      sales: 0,
      averageRating: 0,
      reviewCount: 0,
      created_by: req.user.id,
    };

    // Generate new SKU if exists
    if (duplicateData.sku) {
      duplicateData.sku = `${duplicateData.sku}-COPY-${Date.now().toString(36)}`;
    }

    const duplicate = await Product.create(duplicateData);

    return res.json({
      success: true,
      message: "Product duplicated successfully",
      product: duplicate,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// BULK UPDATE STOCK (Admin)
export const bulkUpdateStock = async (req: any, res: Response) => {
  try {
    const { updates } = req.body;
    
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Updates array is required",
      });
    }

    const results = [];
    const errors = [];

    for (const update of updates) {
      try {
        const { productId, stock, variationSku, combinationIndex } = update;
        
        if (!productId) {
          errors.push({ productId, error: "Product ID required" });
          continue;
        }

        const product = await Product.findById(productId);
        if (!product) {
          errors.push({ productId, error: "Product not found" });
          continue;
        }

        // Update variation stock
        if (variationSku) {
          let updated = false;
          for (const variation of (product as any).variations || []) {
            for (const option of variation.options) {
              if (option.sku === variationSku) {
                option.stock = stock;
                updated = true;
                break;
              }
            }
            if (updated) break;
          }
          if (!updated) {
            errors.push({ productId, variationSku, error: "Variation SKU not found" });
            continue;
          }
        } 
        // Update combined variation stock
        else if (combinationIndex !== undefined) {
          const combinations = (product as any).combinedVariations || [];
          if (combinations[combinationIndex]) {
            combinations[combinationIndex].stock = stock;
          } else {
            errors.push({ productId, combinationIndex, error: "Combination not found" });
            continue;
          }
        }
        // Update main stock
        else {
          (product as any).stock = stock;
        }

        await product.save();
        results.push({ productId, success: true });
      } catch (err: any) {
        errors.push({ productId: update.productId, error: err.message });
      }
    }

    return res.json({
      success: true,
      message: `Updated ${results.length} products`,
      results,
      errors,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// GET LOW STOCK PRODUCTS (Admin)
export const getLowStockProducts = async (req: any, res: Response) => {
  try {
    const { threshold = 5, page = 1, limit = 20 } = req.query;
    
    const query: any = {
      status: { $in: ["published", "approved"] },
      productFormat: "physical",
      manageStock: { $ne: false },
      $or: [
        { productStructure: "simple", stock: { $lte: Number(threshold) } },
        { productStructure: { $ne: "simple" } }, // Check variations separately
      ],
    };

    const skip = (Number(page) - 1) * Number(limit);

    const products = await Product.find(query)
      .populate("owner", "name email")
      .sort({ stock: 1 })
      .skip(skip)
      .limit(Number(limit));

    // Filter variable products with low stock in variations
    const filtered = products.filter((p: any) => {
      if (p.productStructure === "simple") {
        return p.stock <= Number(threshold);
      }
      
      // Check variations
      if (p.useCombinedVariations && p.combinedVariations?.length) {
        return p.combinedVariations.some((cv: any) => cv.stock <= Number(threshold));
      }
      
      if (p.variations?.length) {
        return p.variations.some((v: any) => 
          v.options.some((o: any) => o.stock <= Number(threshold))
        );
      }
      
      return false;
    });

    return res.json({
      success: true,
      products: filtered,
      threshold: Number(threshold),
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ARCHIVE PRODUCT (Admin)
export const archiveProduct = async (req: any, res: Response) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { status: "archived" },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    return res.json({
      success: true,
      message: "Product archived",
      product,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// BULK STATUS UPDATE (Admin)
export const bulkUpdateStatus = async (req: any, res: Response) => {
  try {
    const { productIds, status } = req.body;
    
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Product IDs array is required",
      });
    }

    const validStatuses = ["draft", "pending", "approved", "published", "rejected", "archived"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      });
    }

    const result = await Product.updateMany(
      { _id: { $in: productIds } },
      { status }
    );

    return res.json({
      success: true,
      message: `Updated ${result.modifiedCount} products to ${status}`,
      modifiedCount: result.modifiedCount,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// DEBUG & FIX PRODUCT SOURCE
// ============================================================

// GET PRODUCT SOURCE STATS (Admin) - Debug endpoint
export const getProductSourceStats = async (req: any, res: Response) => {
  try {
    const stats = await Product.aggregate([
      {
        $group: {
          _id: "$productSource",
          count: { $sum: 1 },
        },
      },
    ]);

    const bySource: Record<string, number> = {};
    stats.forEach((s) => {
      bySource[s._id || "undefined"] = s.count;
    });

    // Also get products without productSource field
    const withoutSource = await Product.countDocuments({
      productSource: { $exists: false },
    });

    return res.json({
      success: true,
      stats: {
        store: bySource["store"] || 0,
        listing: bySource["listing"] || 0,
        undefined: bySource["undefined"] || 0,
        missingField: withoutSource,
      },
      total: await Product.countDocuments(),
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// FIX PRODUCT SOURCE (Admin) - Fixes products with incorrect/missing productSource
export const fixProductSource = async (req: any, res: Response) => {
  try {
    // Find all products and determine correct productSource
    const products = await Product.find({})
      .populate("owner", "role")
      .populate("created_by", "role");

    let storeUpdated = 0;
    let listingUpdated = 0;
    const updates: string[] = [];

    for (const product of products) {
      const owner = product.owner as any;
      const createdBy = product.created_by as any;
      
      // Determine correct productSource:
      // - No owner OR created by admin/manager = store product
      // - Has regular user owner = listing
      let correctSource: "store" | "listing";
      
      if (!owner || (createdBy && ["admin", "manager"].includes(createdBy.role))) {
        correctSource = "store";
      } else {
        correctSource = "listing";
      }

      // Update if different
      if (product.productSource !== correctSource) {
        await Product.updateOne(
          { _id: product._id },
          { $set: { productSource: correctSource } }
        );
        
        updates.push(`${product.name}: ${product.productSource || "undefined"} → ${correctSource}`);
        
        if (correctSource === "store") storeUpdated++;
        else listingUpdated++;
      }
    }

    return res.json({
      success: true,
      message: `Fixed ${storeUpdated + listingUpdated} products`,
      storeUpdated,
      listingUpdated,
      updates,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
