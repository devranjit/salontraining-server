import mongoose from "mongoose";

const emailLogSchema = new mongoose.Schema(
  {
    event: { type: String, required: true },
    templateKey: { type: String },
    to: [{ type: String }],
    subject: { type: String },
    status: {
      type: String,
      enum: ["queued", "sent", "failed", "skipped"],
      default: "queued",
    },
    payload: { type: mongoose.Schema.Types.Mixed },
    response: { type: mongoose.Schema.Types.Mixed },
    error: { type: mongoose.Schema.Types.Mixed },
    note: { type: String },
  },
  { timestamps: true }
);

emailLogSchema.index({ createdAt: -1 });
emailLogSchema.index({ event: 1, createdAt: -1 });

export const EmailLog = mongoose.model("EmailLog", emailLogSchema);
export default EmailLog;




































