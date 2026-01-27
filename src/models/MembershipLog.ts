import mongoose, { Schema, Document } from "mongoose";

export type MembershipLogType =
  | "purchase"
  | "renewal"
  | "expiry"
  | "cancellation"
  | "plan_edit"
  | "status_change"
  // Payment events
  | "payment_started"
  | "payment_success"
  | "payment_failed"
  | "payment_refunded"
  | "payment_disputed"
  // Coupon events
  | "coupon_applied"
  | "coupon_removed"
  // Admin actions
  | "admin_action"
  | "email_sent"
  | "invoice_sent"
  | "manual_extend"
  | "manual_activate"
  | "archived"
  | "restored";

export interface IMembershipLog extends Document {
  user?: mongoose.Types.ObjectId;
  membership?: mongoose.Types.ObjectId;
  plan?: mongoose.Types.ObjectId;
  type: MembershipLogType;
  message: string;
  data?: Record<string, any>;
  createdBy?: mongoose.Types.ObjectId;
  // Payment-specific fields
  stripeEventId?: string;
  stripePaymentIntentId?: string;
  stripeInvoiceId?: string;
  amount?: number; // in cents
  currency?: string;
}

const MembershipLogSchema = new Schema<IMembershipLog>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User" },
    membership: { type: Schema.Types.ObjectId, ref: "UserMembership" },
    plan: { type: Schema.Types.ObjectId, ref: "MembershipPlan" },
    type: {
      type: String,
      enum: [
        "purchase", "renewal", "expiry", "cancellation", "plan_edit", "status_change",
        "payment_started", "payment_success", "payment_failed", "payment_refunded", "payment_disputed",
        "coupon_applied", "coupon_removed",
        "admin_action", "email_sent", "invoice_sent", "manual_extend", "manual_activate",
        "archived", "restored"
      ],
      required: true,
    },
    message: { type: String, required: true },
    data: { type: Schema.Types.Mixed },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    // Payment-specific fields
    stripeEventId: { type: String },
    stripePaymentIntentId: { type: String },
    stripeInvoiceId: { type: String },
    amount: { type: Number },
    currency: { type: String },
  },
  { timestamps: true }
);

MembershipLogSchema.index({ user: 1, createdAt: -1 });
MembershipLogSchema.index({ membership: 1, createdAt: -1 });
MembershipLogSchema.index({ stripeEventId: 1 });
MembershipLogSchema.index({ type: 1, createdAt: -1 });

export const MembershipLog = mongoose.model<IMembershipLog>("MembershipLog", MembershipLogSchema);
export default MembershipLog;


