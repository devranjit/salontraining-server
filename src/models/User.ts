import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: String,
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },

    role: {
      type: String,
      enum: ["user", "member", "st-member", "manager", "admin"],
      default: "user",
    },
    status: {
      type: String,
      enum: ["active", "blocked", "registration_locked"],
      default: "active",
    },

    // Registration lock tracking (for users locked due to failed registration verification)
    registrationLockedAt: { type: Date, default: null },
    registrationLockReason: { type: String, default: null },

    first_name: String,
    last_name: String,
    phone: String,
    business: String,
    instagram: String,
    facebook: String,

    // Profile fields
    category: { type: String, default: "" },
    portfolio: { type: String, default: "" },
    country: { type: String, default: "" },
    state: { type: String, default: "" },
    city: { type: String, default: "" },

    // OTP login fields
    otp: { type: String, default: null },
    otpExpires: { type: Date, default: null },

    // Password reset fields
    resetPasswordToken: { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null },

    // Security fields
    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    lastLogin: { type: Date, default: null },
  },
  { timestamps: true }
);

// Single model export - use named export for consistency
export const User = mongoose.model("User", userSchema);
export default User;
