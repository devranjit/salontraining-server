import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import User from "../models/User";
import { Request, Response } from "express";
import { dispatchEmailEvent } from "../services/emailService";

// Security constants
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME = 15 * 60 * 1000; // 15 minutes
const OTP_EXPIRY = 5 * 60 * 1000; // 5 minutes
const RESET_TOKEN_EXPIRY = 60 * 60 * 1000; // 1 hour
const FRONTEND_BASE_URL = (
  process.env.FRONTEND_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://salontraining.com"
    : "http://localhost:5173")
).replace(/\/+$/, "");

// Generate secure random token
const generateSecureToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

// Generate 6-digit OTP
const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Check if user is locked
const isLocked = (user: any) => {
  return user.lockUntil && user.lockUntil > Date.now();
};

// ------------------------------------------------------
// REGISTER USER
// ------------------------------------------------------
export const registerUser = async (req: Request, res: Response) => {
  try {
    const {
      name,
      email,
      password,
      phone,
      business,
      category,
      portfolio,
      country,
      state,
      city,
    } = req.body;

    // Basic validation
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    // Password strength validation
    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    const exist = await User.findOne({ email: email.toLowerCase() });
    if (exist) return res.status(400).json({ message: "Email already exists" });

    const hashed = await bcrypt.hash(password, 12); // Increased rounds for security

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password: hashed,
      phone,
      business,
      category,
      portfolio,
      country,
      state,
      city,
    });

    const safeUser = { ...user.toObject(), password: undefined };

    dispatchEmailEvent("auth.registered", {
      to: safeUser.email,
      data: {
        user: {
          name: safeUser.name || safeUser.email,
          email: safeUser.email,
        },
      },
    }).catch((err) => console.error("register email failed:", err));

    return res.json({ success: true, user: safeUser });
  } catch (err) {
    console.error("Registration error:", err);
    return res.status(500).json({ message: "Registration failed" });
  }
};

// ------------------------------------------------------
// LOGIN USER (with rate limiting)
// ------------------------------------------------------
export const loginUser = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user: any = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.status === "blocked") {
      return res.status(423).json({
        message: "This account has been blocked. Please contact support.",
        blocked: true,
      });
    }

    if (user.status === "blocked") {
      return res.status(423).json({
        message: "This account has been blocked. Please contact support.",
        blocked: true,
      });
    }

    // Check if account is locked
    if (isLocked(user)) {
      const remainingTime = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return res.status(423).json({ 
        message: `Account locked. Try again in ${remainingTime} minutes`,
        locked: true,
        remainingMinutes: remainingTime
      });
    }

    const match = await bcrypt.compare(password, user.password);
    
    if (!match) {
      // Increment login attempts
      user.loginAttempts = (user.loginAttempts || 0) + 1;
      
      // Lock account if max attempts reached
      if (user.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
        user.lockUntil = new Date(Date.now() + LOCK_TIME);
        await user.save();
        return res.status(423).json({ 
          message: "Account locked due to too many failed attempts. Try again in 15 minutes.",
          locked: true
        });
      }
      
      await user.save();
      const remaining = MAX_LOGIN_ATTEMPTS - user.loginAttempts;
      return res.status(400).json({ 
        message: `Invalid password. ${remaining} attempts remaining.`,
        attemptsRemaining: remaining
      });
    }

    // Reset login attempts on successful login
    user.loginAttempts = 0;
    user.lockUntil = null;
    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET as string,
      { expiresIn: "7d" }
    );

    dispatchEmailEvent("auth.login", {
      to: user.email,
      data: {
        user: {
          name: user.name || user.email,
          email: user.email,
        },
        context: {
          timestamp: new Date().toISOString(),
          ip: req.headers["x-forwarded-for"] || req.ip,
          userAgent: req.headers["user-agent"],
        },
      },
    }).catch((err) => console.error("login email failed:", err));

    return res.json({
      success: true,
      token,
      user: { ...user.toObject(), password: undefined, otp: undefined, otpExpires: undefined },
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ message: "Login failed" });
  }
};

// ------------------------------------------------------
// GET ME
// ------------------------------------------------------
export const getMe = async (req: any, res: any) => {
  try {
    const user = await User.findById(req.user.id).select(
      "name email role status first_name last_name phone business instagram facebook category portfolio country state city lastLogin"
    );

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({
      success: true,
      user,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ---------------------------------------------
// SEND OTP (for login or password reset)
// ---------------------------------------------
export const sendOtp = async (req: Request, res: Response) => {
  try {
    const { email, purpose = "login" } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user: any = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ message: "No account found with this email" });
    }

    if (user.status === "blocked") {
      return res.status(423).json({
        message: "This account has been blocked. Please contact support.",
        blocked: true,
      });
    }

    // Check if account is locked
    if (isLocked(user)) {
      const remainingTime = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return res.status(423).json({ 
        message: `Account locked. Try again in ${remainingTime} minutes`,
        locked: true
      });
    }

    // Generate OTP
    const otp = generateOtp();

    // Store OTP + expiry
    user.otp = otp;
    user.otpExpires = new Date(Date.now() + OTP_EXPIRY);
    await user.save();

    try {
      await dispatchEmailEvent("auth.otp", {
        to: email,
        data: {
          user: {
            name: user.name || user.email,
            email: user.email,
          },
          otp,
          purpose,
        },
      });
    } catch (error) {
      console.error("Send OTP email failed:", error);
      return res.status(500).json({
        message: "Unable to send verification code. Please try again later.",
      });
    }

    return res.json({ 
      success: true, 
      message: "Verification code sent to your email",
      expiresIn: OTP_EXPIRY / 1000 // seconds
    });

  } catch (err) {
    console.error("Send OTP error:", err);
    return res.status(500).json({ message: "Failed to send verification code" });
  }
};

// ---------------------------------------------
// VERIFY OTP → return JWT token
// ---------------------------------------------
export const verifyOtp = async (req: Request, res: Response) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const user: any = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.otp || !user.otpExpires) {
      return res.status(400).json({ message: "No verification code requested" });
    }

    if (Date.now() > user.otpExpires) {
      user.otp = null;
      user.otpExpires = null;
      await user.save();
      return res.status(400).json({ message: "Verification code expired" });
    }

    if (user.otp !== otp) {
      return res.status(400).json({ message: "Invalid verification code" });
    }

    // Clear OTP after verification
    user.otp = null;
    user.otpExpires = null;
    user.loginAttempts = 0;
    user.lockUntil = null;
    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET as string,
      { expiresIn: "7d" }
    );

    return res.json({
      success: true,
      token,
      user: { ...user.toObject(), password: undefined, otp: undefined, otpExpires: undefined },
    });

  } catch (err) {
    console.error("Verify OTP error:", err);
    return res.status(500).json({ message: "Verification failed" });
  }
};

// ---------------------------------------------
// FORGOT PASSWORD - Send Reset Link
// ---------------------------------------------
export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user: any = await User.findOne({ email: email.toLowerCase() });
    
    // Always return success for security (don't reveal if email exists)
    if (!user) {
      return res.json({ 
        success: true, 
        message: "If an account exists with this email, you will receive a password reset link." 
      });
    }

    // Generate secure reset token
    const resetToken = generateSecureToken();
    const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = new Date(Date.now() + RESET_TOKEN_EXPIRY);
    await user.save();

    // Create reset URL
    const resetUrl = `${FRONTEND_BASE_URL}/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;

    await dispatchEmailEvent("auth.password-reset", {
      to: email,
      data: {
        user: {
          name: user.name || user.email,
          email: user.email,
        },
        reset: {
          url: resetUrl,
        },
      },
    });

    return res.json({ 
      success: true, 
      message: "If an account exists with this email, you will receive a password reset link." 
    });

  } catch (err) {
    console.error("Forgot password error:", err);
    return res.status(500).json({ message: "Failed to process request" });
  }
};

// ---------------------------------------------
// RESET PASSWORD
// ---------------------------------------------
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { email, token, password } = req.body;

    if (!email || !token || !password) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Password strength validation
    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user: any = await User.findOne({ 
      email: email.toLowerCase(),
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired reset link" });
    }

    // Update password
    user.password = await bcrypt.hash(password, 12);
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    user.loginAttempts = 0;
    user.lockUntil = null;
    await user.save();

    return res.json({ 
      success: true, 
      message: "Password reset successfully. You can now log in with your new password." 
    });

  } catch (err) {
    console.error("Reset password error:", err);
    return res.status(500).json({ message: "Failed to reset password" });
  }
};

// ---------------------------------------------
// RESET PASSWORD WITH OTP
// ---------------------------------------------
export const resetPasswordWithOtp = async (req: Request, res: Response) => {
  try {
    const { email, otp, password } = req.body;

    if (!email || !otp || !password) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Password strength validation
    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    const user: any = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.otp || !user.otpExpires) {
      return res.status(400).json({ message: "No verification code requested" });
    }

    if (Date.now() > user.otpExpires) {
      user.otp = null;
      user.otpExpires = null;
      await user.save();
      return res.status(400).json({ message: "Verification code expired" });
    }

    if (user.otp !== otp) {
      return res.status(400).json({ message: "Invalid verification code" });
    }

    // Update password
    user.password = await bcrypt.hash(password, 12);
    user.otp = null;
    user.otpExpires = null;
    user.loginAttempts = 0;
    user.lockUntil = null;
    await user.save();

    return res.json({ 
      success: true, 
      message: "Password reset successfully. You can now log in with your new password." 
    });

  } catch (err) {
    console.error("Reset password with OTP error:", err);
    return res.status(500).json({ message: "Failed to reset password" });
  }
};

// ---------------------------------------------
// UNLOCK ACCOUNT (Admin only)
// ---------------------------------------------
export const unlockAccount = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user: any = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.loginAttempts = 0;
    user.lockUntil = null;
    await user.save();

    return res.json({ 
      success: true, 
      message: `Account ${email} has been unlocked.` 
    });

  } catch (err) {
    console.error("Unlock account error:", err);
    return res.status(500).json({ message: "Failed to unlock account" });
  }
};

// ---------------------------------------------
// UNLOCK ACCOUNT VIA OTP (Self-service)
// ---------------------------------------------
export const unlockWithOtp = async (req: Request, res: Response) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const user: any = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.otp || !user.otpExpires) {
      return res.status(400).json({ message: "No verification code requested" });
    }

    if (Date.now() > user.otpExpires) {
      user.otp = null;
      user.otpExpires = null;
      await user.save();
      return res.status(400).json({ message: "Verification code expired" });
    }

    if (user.otp !== otp) {
      return res.status(400).json({ message: "Invalid verification code" });
    }

    // Unlock the account
    user.otp = null;
    user.otpExpires = null;
    user.loginAttempts = 0;
    user.lockUntil = null;
    await user.save();

    return res.json({ 
      success: true, 
      message: "Account unlocked. You can now log in." 
    });

  } catch (err) {
    console.error("Unlock with OTP error:", err);
    return res.status(500).json({ message: "Failed to unlock account" });
  }
};