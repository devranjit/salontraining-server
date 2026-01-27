import mongoose, { Schema, Document } from "mongoose";

export type PaymentStatus = "success" | "failed" | "pending" | "refunded" | "requires_action";

export interface IUserMembership extends Document {
  user: mongoose.Types.ObjectId;
  plan: mongoose.Types.ObjectId;
  status: "active" | "expired" | "canceled" | "pending" | "past_due" | "hold" | "failed";
  startDate?: Date;
  expiryDate?: Date;
  nextBillingDate?: Date;
  autoRenew: boolean;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  cancelAtPeriodEnd?: boolean;
  metadata?: Record<string, any>;
  
  // Coupon / Discount tracking
  couponId?: mongoose.Types.ObjectId;
  couponCode?: string;
  couponDiscountType?: "percent" | "amount";
  couponAmount?: number;
  couponAppliedAt?: Date;
  
  // Payment tracking (NEW)
  paymentStatus?: PaymentStatus;
  stripePaymentIntentId?: string;
  lastPaymentDate?: Date;
  lastPaymentAmount?: number; // in cents
  originalPrice?: number; // in cents (before discount)
  finalPrice?: number; // in cents (after discount)
  discountAmount?: number; // in cents
  paymentMethodType?: string; // "card", "us_bank_account", etc.
  paymentMethodLast4?: string;
  paymentMethodBrand?: string; // "visa", "mastercard", etc.
  currency?: string;
  
  // Invoice tracking
  stripeInvoiceId?: string;
  invoiceUrl?: string;
  invoicePdf?: string;
  invoiceNumber?: string;
  
  // Marketing / Campaign tracking
  campaignSource?: string;
  
  // Failure tracking
  failureReason?: string;
  failureCode?: string;
  lastFailedAt?: Date;
  failureCount?: number;
  
  // Archive fields
  isArchived: boolean;
  archivedAt?: Date;
  archivedBy?: mongoose.Types.ObjectId;
  archivedReason?: string;
}

const UserMembershipSchema = new Schema<IUserMembership>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    plan: { type: Schema.Types.ObjectId, ref: "MembershipPlan", required: true },
    status: {
      type: String,
      enum: ["active", "expired", "canceled", "pending", "past_due", "hold", "failed"],
      default: "pending",
    },
    startDate: { type: Date },
    expiryDate: { type: Date },
    nextBillingDate: { type: Date },
    autoRenew: { type: Boolean, default: true },
    stripeCustomerId: { type: String },
    stripeSubscriptionId: { type: String },
    stripePriceId: { type: String },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    metadata: { type: Schema.Types.Mixed },
    
    // Coupon / Discount tracking
    couponId: { type: Schema.Types.ObjectId, ref: "MembershipCoupon" },
    couponCode: { type: String },
    couponDiscountType: { type: String, enum: ["percent", "amount"] },
    couponAmount: { type: Number },
    couponAppliedAt: { type: Date },
    
    // Payment tracking (NEW)
    paymentStatus: { 
      type: String, 
      enum: ["success", "failed", "pending", "refunded", "requires_action"],
    },
    stripePaymentIntentId: { type: String },
    lastPaymentDate: { type: Date },
    lastPaymentAmount: { type: Number }, // in cents
    originalPrice: { type: Number }, // in cents
    finalPrice: { type: Number }, // in cents
    discountAmount: { type: Number }, // in cents
    paymentMethodType: { type: String },
    paymentMethodLast4: { type: String },
    paymentMethodBrand: { type: String },
    currency: { type: String },
    
    // Invoice tracking
    stripeInvoiceId: { type: String },
    invoiceUrl: { type: String },
    invoicePdf: { type: String },
    invoiceNumber: { type: String },
    
    // Marketing / Campaign tracking
    campaignSource: { type: String },
    
    // Failure tracking
    failureReason: { type: String },
    failureCode: { type: String },
    lastFailedAt: { type: Date },
    failureCount: { type: Number, default: 0 },
    
    // Archive fields
    isArchived: { type: Boolean, default: false },
    archivedAt: { type: Date },
    archivedBy: { type: Schema.Types.ObjectId, ref: "User" },
    archivedReason: { type: String },
  },
  { timestamps: true }
);

UserMembershipSchema.index({ status: 1 });
UserMembershipSchema.index({ stripeSubscriptionId: 1 });
UserMembershipSchema.index({ stripeCustomerId: 1 });
UserMembershipSchema.index({ stripePaymentIntentId: 1 });
UserMembershipSchema.index({ stripeInvoiceId: 1 });
UserMembershipSchema.index({ paymentStatus: 1 });
UserMembershipSchema.index({ couponCode: 1 });
UserMembershipSchema.index({ isArchived: 1 });

export const UserMembership = mongoose.model<IUserMembership>(
  "UserMembership",
  UserMembershipSchema
);

export default UserMembership;


