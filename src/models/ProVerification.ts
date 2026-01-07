import mongoose from "mongoose";

const proVerificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", unique: true, required: true },
    name: { type: String, required: true },
    license: { type: String, required: true },
    phone: { type: String, default: "" },
    salonOrSchool: { type: String, default: "" },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

const ProVerification = mongoose.models.ProVerification || mongoose.model("ProVerification", proVerificationSchema);

export default ProVerification;



































