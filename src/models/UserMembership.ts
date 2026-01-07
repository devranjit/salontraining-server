import mongoose, { Schema, Document } from "mongoose";

export interface IUserMembership extends Document {
  user: mongoose.Types.ObjectId;
  plan: mongoose.Types.ObjectId;
  status: "active" | "expired" | "canceled" | "pending" | "past_due" | "hold";
  startDate?: Date;
  expiryDate?: Date;
  nextBillingDate?: Date;
  autoRenew: boolean;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  cancelAtPeriodEnd?: boolean;
  metadata?: Record<string, any>;
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
      enum: ["active", "expired", "canceled", "pending", "past_due", "hold"],
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
UserMembershipSchema.index({ isArchived: 1 });

export const UserMembership = mongoose.model<IUserMembership>(
  "UserMembership",
  UserMembershipSchema
);

export default UserMembership;


