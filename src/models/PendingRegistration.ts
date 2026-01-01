import mongoose from "mongoose";

const pendingRegistrationSchema = new mongoose.Schema(
  {
    // User details
    name: { type: String, required: true },
    email: { type: String, unique: true, required: true, lowercase: true },
    password: { type: String, required: true }, // Already hashed

    // Optional profile fields
    phone: { type: String, default: "" },
    business: { type: String, default: "" },
    category: { type: String, default: "" },
    portfolio: { type: String, default: "" },
    country: { type: String, default: "" },
    state: { type: String, default: "" },
    city: { type: String, default: "" },

    // OTP verification
    otp: { type: String, required: true },
    otpExpires: { type: Date, required: true },

    // Attempt tracking
    verificationAttempts: { type: Number, default: 0 },
    isLocked: { type: Boolean, default: false },
    lockedAt: { type: Date, default: null },
    lockReason: { type: String, default: null },

    // Expiry - auto-delete pending registrations after 24 hours
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true }
);

// Index for quick lookups
pendingRegistrationSchema.index({ email: 1 });
pendingRegistrationSchema.index({ isLocked: 1 });

export const PendingRegistration = mongoose.model("PendingRegistration", pendingRegistrationSchema);
export default PendingRegistration;




































