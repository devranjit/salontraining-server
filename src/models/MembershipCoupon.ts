import mongoose, { Schema, Document } from "mongoose";

export type CouponDiscountType = "percent" | "amount";

export interface IMembershipCoupon extends Document {
  code: string;
  description?: string;
  discountType: CouponDiscountType;
  amount: number;
  maxRedemptions?: number;
  usedCount: number;
  startDate?: Date;
  endDate?: Date;
  isActive: boolean;
}

const MembershipCouponSchema = new Schema<IMembershipCoupon>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: { type: String },
    discountType: { type: String, enum: ["percent", "amount"], default: "percent" },
    amount: { type: Number, required: true, min: 0 },
    maxRedemptions: { type: Number },
    usedCount: { type: Number, default: 0 },
    startDate: { type: Date },
    endDate: { type: Date },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

MembershipCouponSchema.index({ code: 1 }, { unique: true });
MembershipCouponSchema.index({ isActive: 1, startDate: 1, endDate: 1 });

export const MembershipCoupon = mongoose.model<IMembershipCoupon>(
  "MembershipCoupon",
  MembershipCouponSchema
);

export default MembershipCoupon;


















