import mongoose from "mongoose";

const emailTemplateSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, required: true },
    label: { type: String, required: true },
    description: { type: String, default: "" },
    subject: { type: String, default: "" },
    html: { type: String, default: "" },
    text: { type: String, default: "" },
    enabled: { type: Boolean, default: true },
    placeholders: [{ type: String }],
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

emailTemplateSchema.index({ key: 1 });

export const EmailTemplate = mongoose.model("EmailTemplate", emailTemplateSchema);
export default EmailTemplate;






























