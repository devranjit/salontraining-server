import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: String,
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },

    role: {
      type: String,
    enum: ["user", "member", "st-member", "admin"],
      default: "user",
    },

    first_name: String,
    last_name: String,
    phone: String,
    business: String,
    instagram: String,
    facebook: String,

    // NEW FIELDS
    category: { type: String, default: "" },
    portfolio: { type: String, default: "" },
    country: { type: String, default: "" },
    state: { type: String, default: "" },
    city: { type: String, default: "" },

    // 🔥 OTP LOGIN FIELDS
    otp: { type: String, default: null },
    otpExpires: { type: Date, default: null },

    // 🔐 PASSWORD RESET FIELDS
    resetPasswordToken: { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null },

    // 🛡️ SECURITY FIELDS
    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    lastLogin: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
export const User = mongoose.model("User", userSchema);
