import mongoose from "mongoose";

const systemLogSchema = new mongoose.Schema(
  {
    source: {
      type: String,
      enum: ["frontend", "backend"],
      default: "frontend",
      index: true,
    },
    task: { type: String, required: true, trim: true, index: true },
    action: { type: String, required: true, trim: true },
    level: {
      type: String,
      enum: ["info", "warning", "error", "debug"],
      default: "info",
      index: true,
    },
    status: {
      type: String,
      enum: ["success", "error", "pending", "info"],
      default: "info",
      index: true,
    },
    message: { type: String, trim: true },
    route: { type: String, trim: true },
    component: { type: String, trim: true },
    sessionId: { type: String, index: true },
    tags: [{ type: String, trim: true }],
    payload: { type: mongoose.Schema.Types.Mixed },
    meta: { type: mongoose.Schema.Types.Mixed },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    userEmail: { type: String, index: true, trim: true, lowercase: true },
    userName: { type: String, trim: true },
    userRole: { type: String, trim: true },
    ip: { type: String, trim: true },
    userAgent: { type: String },
  },
  { timestamps: true }
);

systemLogSchema.index({ createdAt: -1 });
systemLogSchema.index({ task: 1, createdAt: -1 });
systemLogSchema.index({ userEmail: 1, task: 1 });
systemLogSchema.index({ route: 1 });

export const SystemLog = mongoose.model("SystemLog", systemLogSchema);
export default SystemLog;

