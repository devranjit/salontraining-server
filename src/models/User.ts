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
    
    // Phone number (unverified, user-provided)
    phone: String,
    
    // Verified phone number in E.164 format (e.g., +14155551234)
    verifiedPhone: { type: String, default: null, index: true },
    
    // Phone verification status
    phoneVerified: { type: Boolean, default: false },
    phoneVerifiedAt: { type: Date, default: null },
    
    // Firebase UID associated with phone verification
    firebasePhoneUid: { type: String, default: null },
    
    // Country code from verified phone (e.g., "US", "GB", "IN")
    phoneCountryCode: { type: String, default: null },
    
    business: String,
    instagram: String,
    facebook: String,

    // Profile fields
    category: { type: String, default: "" },
    portfolio: { type: String, default: "" },
    country: { type: String, default: "" },
    state: { type: String, default: "" },
    city: { type: String, default: "" },
    avatar: { type: String, default: "" },

    // OTP login fields
    otp: { type: String, default: null },
    otpExpires: { type: Date, default: null },

    // Password reset fields
    resetPasswordToken: { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null },

    // Email change fields
    pendingEmail: { type: String, default: null },
    pendingEmailOtp: { type: String, default: null },
    pendingEmailExpires: { type: Date, default: null },
    pendingEmailOtpAttempts: { type: Number, default: 0 },

    // Security fields
    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    lastLogin: { type: Date, default: null },
    
    // OTP verification attempt tracking (brute-force protection)
    otpVerifyAttempts: { type: Number, default: 0 },
    otpVerifyLockUntil: { type: Date, default: null },
  },
  { timestamps: true }
);

// Indexes for efficient dashboard queries
userSchema.index({ createdAt: -1 }); // For sorting by recent
userSchema.index({ role: 1 }); // For role-based queries
userSchema.index({ status: 1 }); // For status filtering

// Single model export - use named export for consistency
export const User = mongoose.model("User", userSchema);
export default User;
