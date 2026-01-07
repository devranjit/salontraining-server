import { Request, Response } from "express";
import Coupon from "../models/Coupon";
import Product from "../models/Product";

// ============================================================
// PUBLIC ROUTES
// ============================================================

// Validate a coupon code
export const validateCoupon = async (req: Request, res: Response) => {
  try {
    const { code, cartTotal, productIds } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: "Coupon code is required",
      });
    }

    const coupon = await Coupon.findOne({
      code: code.toUpperCase(),
      isActive: true,
    });

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Invalid coupon code",
      });
    }

    // Check if coupon has started
    if (coupon.startDate && new Date() < coupon.startDate) {
      return res.status(400).json({
        success: false,
        message: "This coupon is not yet active",
      });
    }

    // Check if coupon has expired
    if (coupon.endDate && new Date() > coupon.endDate) {
      return res.status(400).json({
        success: false,
        message: "This coupon has expired",
      });
    }

    // Check usage limit
    if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
      return res.status(400).json({
        success: false,
        message: "This coupon has reached its usage limit",
      });
    }

    // Check minimum order amount
    if (cartTotal && coupon.minimumOrderAmount > 0 && cartTotal < coupon.minimumOrderAmount) {
      return res.status(400).json({
        success: false,
        message: `Minimum order amount of $${coupon.minimumOrderAmount} required`,
      });
    }

    // Check if user has already used this coupon (if logged in)
    const userId = (req as any).user?.id;
    if (userId && coupon.usageLimitPerUser) {
      const userUsageCount = coupon.usedBy.filter(
        (u) => u.user?.toString() === userId
      ).length;
      if (userUsageCount >= coupon.usageLimitPerUser) {
        return res.status(400).json({
          success: false,
          message: "You have already used this coupon",
        });
      }
    }

    // Check product restrictions for store-only coupons
    if (coupon.storeOnly && productIds && productIds.length > 0) {
      const products = await Product.find({ _id: { $in: productIds } });
      const hasNonStoreProducts = products.some(p => p.productSource !== "store");
      if (hasNonStoreProducts) {
        return res.status(400).json({
          success: false,
          message: "This coupon only applies to store products",
        });
      }
    }

    // Calculate discount
    let discountAmount = 0;
    if (cartTotal) {
      if (coupon.discountType === "percentage") {
        discountAmount = (cartTotal * coupon.discountValue) / 100;
        if (coupon.maximumDiscount && discountAmount > coupon.maximumDiscount) {
          discountAmount = coupon.maximumDiscount;
        }
      } else {
        discountAmount = coupon.discountValue;
      }
    }

    return res.json({
      success: true,
      coupon: {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        minimumOrderAmount: coupon.minimumOrderAmount,
        maximumDiscount: coupon.maximumDiscount,
        description: coupon.description,
      },
      discountAmount,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Apply coupon to order (called during checkout)
export const applyCoupon = async (req: any, res: Response) => {
  try {
    const { code, orderId } = req.body;
    const userId = req.user?.id;

    const coupon = await Coupon.findOne({
      code: code.toUpperCase(),
      isActive: true,
    });

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Invalid coupon code",
      });
    }

    // Record usage
    coupon.usageCount += 1;
    coupon.usedBy.push({
      user: userId,
      usedAt: new Date(),
      orderId,
    });
    await coupon.save();

    return res.json({
      success: true,
      message: "Coupon applied successfully",
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// ADMIN ROUTES
// ============================================================

// Get all coupons
export const getAllCoupons = async (req: any, res: Response) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;

    const query: any = {};

    if (status === "active") {
      query.isActive = true;
    } else if (status === "inactive") {
      query.isActive = false;
    } else if (status === "expired") {
      query.endDate = { $lt: new Date() };
    }

    if (search) {
      query.$or = [
        { code: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [coupons, total] = await Promise.all([
      Coupon.find(query)
        .populate("createdBy", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Coupon.countDocuments(query),
    ]);

    return res.json({
      success: true,
      coupons,
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

// Get single coupon
export const getCoupon = async (req: Request, res: Response) => {
  try {
    const coupon = await Coupon.findById(req.params.id)
      .populate("createdBy", "name email")
      .populate("products", "name price images")
      .populate("categories", "name");

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found",
      });
    }

    return res.json({ success: true, coupon });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Create coupon
export const createCoupon = async (req: any, res: Response) => {
  try {
    const {
      code,
      description,
      discountType,
      discountValue,
      minimumOrderAmount,
      maximumDiscount,
      usageLimit,
      usageLimitPerUser,
      startDate,
      endDate,
      applicableTo,
      products,
      categories,
      storeOnly,
      isActive,
      // New fields
      applyToShipping,
      productScope,
      scopedProducts,
    } = req.body;

    // Validation
    if (!code || !discountValue) {
      return res.status(400).json({
        success: false,
        message: "Code and discount value are required",
      });
    }
    
    // Validate discount value
    if (Number(discountValue) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Discount value must be greater than 0",
      });
    }
    
    // Validate percentage not > 100
    if (discountType === "percentage" && Number(discountValue) > 100) {
      return res.status(400).json({
        success: false,
        message: "Percentage discount cannot exceed 100%",
      });
    }
    
    // Validate fixed discount not greater than max discount (if set)
    if (discountType === "fixed" && maximumDiscount && Number(discountValue) > Number(maximumDiscount)) {
      return res.status(400).json({
        success: false,
        message: "Fixed discount cannot be greater than max discount",
      });
    }
    
    // Validate product selection when product-scoped
    if ((productScope === "include" || productScope === "exclude") && 
        (!scopedProducts || scopedProducts.length === 0)) {
      return res.status(400).json({
        success: false,
        message: "Please select at least one product for product-scoped coupons",
      });
    }

    // Check if code already exists
    const existing = await Coupon.findOne({ code: code.toUpperCase() });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: "A coupon with this code already exists",
      });
    }

    const coupon = await Coupon.create({
      code: code.toUpperCase(),
      description,
      discountType: discountType || "percentage",
      discountValue,
      minimumOrderAmount: minimumOrderAmount || 0,
      maximumDiscount: maximumDiscount || null,
      usageLimit: usageLimit || null,
      usageLimitPerUser: usageLimitPerUser || 1,
      startDate: startDate || new Date(),
      endDate: endDate || null,
      applicableTo: applicableTo || "all",
      products: products || [],
      categories: categories || [],
      storeOnly: storeOnly !== false,
      isActive: isActive !== false,
      createdBy: req.user.id,
      // New fields
      applyToShipping: applyToShipping === true,
      productScope: productScope || "all",
      scopedProducts: scopedProducts || [],
    });

    return res.json({
      success: true,
      message: "Coupon created successfully",
      coupon,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Update coupon
export const updateCoupon = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Validation
    if (updates.discountValue !== undefined && Number(updates.discountValue) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Discount value must be greater than 0",
      });
    }
    
    // Validate percentage not > 100
    if (updates.discountType === "percentage" && updates.discountValue !== undefined && Number(updates.discountValue) > 100) {
      return res.status(400).json({
        success: false,
        message: "Percentage discount cannot exceed 100%",
      });
    }
    
    // Validate fixed discount not greater than max discount (if set)
    if (updates.discountType === "fixed" && updates.maximumDiscount && updates.discountValue !== undefined) {
      if (Number(updates.discountValue) > Number(updates.maximumDiscount)) {
        return res.status(400).json({
          success: false,
          message: "Fixed discount cannot be greater than max discount",
        });
      }
    }
    
    // Validate product selection when product-scoped
    if ((updates.productScope === "include" || updates.productScope === "exclude") && 
        (!updates.scopedProducts || updates.scopedProducts.length === 0)) {
      return res.status(400).json({
        success: false,
        message: "Please select at least one product for product-scoped coupons",
      });
    }

    // If updating code, check it doesn't conflict
    if (updates.code) {
      const existing = await Coupon.findOne({
        code: updates.code.toUpperCase(),
        _id: { $ne: id },
      });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: "A coupon with this code already exists",
        });
      }
      updates.code = updates.code.toUpperCase();
    }
    
    // Clear scoped products if switching to "all"
    if (updates.productScope === "all") {
      updates.scopedProducts = [];
    }

    const coupon = await Coupon.findByIdAndUpdate(id, updates, { new: true });

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found",
      });
    }

    return res.json({
      success: true,
      message: "Coupon updated successfully",
      coupon,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Delete coupon
export const deleteCoupon = async (req: Request, res: Response) => {
  try {
    const coupon = await Coupon.findByIdAndDelete(req.params.id);

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found",
      });
    }

    return res.json({
      success: true,
      message: "Coupon deleted successfully",
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Toggle coupon status
export const toggleCouponStatus = async (req: Request, res: Response) => {
  try {
    const coupon = await Coupon.findById(req.params.id);

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found",
      });
    }

    coupon.isActive = !coupon.isActive;
    await coupon.save();

    return res.json({
      success: true,
      message: `Coupon ${coupon.isActive ? "activated" : "deactivated"}`,
      coupon,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Get coupon stats
export const getCouponStats = async (req: Request, res: Response) => {
  try {
    const now = new Date();

    const [total, active, expired, totalUsage] = await Promise.all([
      Coupon.countDocuments(),
      Coupon.countDocuments({ isActive: true, $or: [{ endDate: null }, { endDate: { $gt: now } }] }),
      Coupon.countDocuments({ endDate: { $lt: now } }),
      Coupon.aggregate([{ $group: { _id: null, total: { $sum: "$usageCount" } } }]),
    ]);

    return res.json({
      success: true,
      stats: {
        total,
        active,
        expired,
        inactive: total - active - expired,
        totalUsage: totalUsage[0]?.total || 0,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

