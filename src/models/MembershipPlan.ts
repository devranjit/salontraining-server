import mongoose, { Schema, Document } from "mongoose";

export interface IMembershipPlan extends Document {
  name: string;
  description?: string;
  price: number;
  interval: "month" | "year";
  stripePriceId: string;
  stripeProductId?: string;
  isActive: boolean;
}

const MembershipPlanSchema = new Schema<IMembershipPlan>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String },
    price: { type: Number, required: true, min: 0 },
    interval: {
      type: String,
      enum: ["month", "year"],
      default: "year",
    },
    stripePriceId: { type: String, required: true },
    stripeProductId: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

MembershipPlanSchema.index({ isActive: 1 });

export const MembershipPlan = mongoose.model<IMembershipPlan>(
  "MembershipPlan",
  MembershipPlanSchema
);

export default MembershipPlan;


