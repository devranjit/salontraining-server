import mongoose from "mongoose";

const emailTriggerSchema = new mongoose.Schema(
  {
    event: { type: String, unique: true, required: true },
    templateKey: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

emailTriggerSchema.index({ event: 1 });

export const EmailTrigger = mongoose.model("EmailTrigger", emailTriggerSchema);
export default EmailTrigger;




































