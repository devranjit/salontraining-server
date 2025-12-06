import mongoose, { Schema, Document } from "mongoose";

export type MembershipLogType =
  | "purchase"
  | "renewal"
  | "expiry"
  | "cancellation"
  | "plan_edit"
  | "status_change";

export interface IMembershipLog extends Document {
  user?: mongoose.Types.ObjectId;
  plan?: mongoose.Types.ObjectId;
  type: MembershipLogType;
  message: string;
  data?: Record<string, any>;
  createdBy?: mongoose.Types.ObjectId;
}

const MembershipLogSchema = new Schema<IMembershipLog>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User" },
    plan: { type: Schema.Types.ObjectId, ref: "MembershipPlan" },
    type: {
      type: String,
      enum: ["purchase", "renewal", "expiry", "cancellation", "plan_edit", "status_change"],
      required: true,
    },
    message: { type: String, required: true },
    data: { type: Schema.Types.Mixed },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

MembershipLogSchema.index({ user: 1, createdAt: -1 });

export const MembershipLog = mongoose.model<IMembershipLog>("MembershipLog", MembershipLogSchema);
export default MembershipLog;


