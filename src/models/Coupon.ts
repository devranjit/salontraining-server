import mongoose from "mongoose";

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    discountType: {
      type: String,
      enum: ["percentage", "fixed"],
      default: "percentage",
    },
    discountValue: {
      type: Number,
      required: true,
      min: 0,
    },
    // Minimum order amount to use this coupon
    minimumOrderAmount: {
      type: Number,
      default: 0,
    },
    // Maximum discount amount (for percentage discounts)
    maximumDiscount: {
      type: Number,
      default: null,
    },
    // Usage limits
    usageLimit: {
      type: Number,
      default: null, // null = unlimited
    },
    usageCount: {
      type: Number,
      default: 0,
    },
    // Per-user usage limit
    usageLimitPerUser: {
      type: Number,
      default: 1,
    },
    // Track which users have used this coupon
    usedBy: [{
      user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      usedAt: { type: Date, default: Date.now },
      orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    }],
    // Validity period
    startDate: {
      type: Date,
      default: Date.now,
    },
    endDate: {
      type: Date,
      default: null, // null = no expiration
    },
    // Product restrictions
    applicableTo: {
      type: String,
      enum: ["all", "specific_products", "specific_categories"],
      default: "all",
    },
    // Specific products this coupon applies to
    products: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
    }],
    // Specific categories this coupon applies to
    categories: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
    }],
    // Only for store products (not user listings)
    storeOnly: {
      type: Boolean,
      default: true,
    },
    // Coupon status
    isActive: {
      type: Boolean,
      default: true,
    },
    // Who created this coupon
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

// Index for fast code lookup
couponSchema.index({ code: 1 });
couponSchema.index({ isActive: 1, startDate: 1, endDate: 1 });

const Coupon = mongoose.model("Coupon", couponSchema);
export default Coupon;








