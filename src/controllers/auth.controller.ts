import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import User from "../models/User";
import PendingRegistration from "../models/PendingRegistration";
import { TokenBlacklist } from "../models/TokenBlacklist";
import { Request, Response } from "express";
import { dispatchEmailEvent } from "../services/emailService";
import { notifyAdmins } from "./notification.controller";

// Security constants
const MAX_LOGIN_ATTEMPTS = 5;
const MAX_REGISTRATION_ATTEMPTS = 3;
const MAX_OTP_VERIFY_ATTEMPTS = 5; // Max OTP verification attempts before lockout
const LOCK_TIME = 15 * 60 * 1000; // 15 minutes
const OTP_VERIFY_LOCK_TIME = 15 * 60 * 1000; // 15 minutes lockout for OTP verification abuse
const OTP_EXPIRY = 5 * 60 * 1000; // 5 minutes
const REGISTRATION_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours for pending registration
const RESET_TOKEN_EXPIRY = 60 * 60 * 1000; // 1 hour

// Password complexity requirements
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/; // At least 1 lowercase, 1 uppercase, 1 digit

// Token expiration times
const ACCESS_TOKEN_EXPIRY = "1h"; // Short-lived access token
const REFRESH_TOKEN_EXPIRY = "7d"; // Long-lived refresh token
const REFRESH_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

// Cookie configuration
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: IS_PRODUCTION,
  sameSite: IS_PRODUCTION ? ("strict" as const) : ("lax" as const),
  path: "/",
};

// Helper to set auth cookies
const setAuthCookies = (res: Response, accessToken: string, refreshToken: string) => {
  // Access token cookie (1 hour)
  res.cookie("accessToken", accessToken, {
    ...COOKIE_OPTIONS,
    maxAge: 60 * 60 * 1000, // 1 hour
  });
  
  // Refresh token cookie (7 days)
  res.cookie("refreshToken", refreshToken, {
    ...COOKIE_OPTIONS,
    maxAge: REFRESH_TOKEN_EXPIRY_MS,
  });
};

// Helper to clear auth cookies
const clearAuthCookies = (res: Response) => {
  res.clearCookie("accessToken", { path: "/" });
  res.clearCookie("refreshToken", { path: "/" });
};
const FRONTEND_BASE_URL = (
  process.env.FRONTEND_URL ||
  (process.env.NODE_ENV === "development"
    ? "http://localhost:5173"
    : "https://salontraining.com")
).replace(/\/+$/, "");

// Generate secure random token
const generateSecureToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

// Generate 6-digit OTP
const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Check if user is locked (login attempts)
const isLocked = (user: any) => {
  return user.lockUntil && user.lockUntil > Date.now();
};

// Check if user is locked for OTP verification (brute-force protection)
const isOtpVerifyLocked = (user: any) => {
  return user.otpVerifyLockUntil && user.otpVerifyLockUntil > Date.now();
};

// Validate password complexity
const validatePassword = (password: string): { valid: boolean; message: string } => {
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return { 
      valid: false, 
      message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters` 
    };
  }
  if (!PASSWORD_REGEX.test(password)) {
    return { 
      valid: false, 
      message: "Password must contain at least one uppercase letter, one lowercase letter, and one number" 
    };
  }
  return { valid: true, message: "" };
};

// ------------------------------------------------------
// REGISTER USER (Step 1: Initiate registration with OTP)
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

    const normalizedEmail = email?.toLowerCase();

    // Basic validation
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    // Password complexity validation
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({ message: passwordValidation.message });
    }

    // Check if email already exists as a registered user
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered. Please login instead." });
    }

    // Check for existing locked pending registration
    const lockedPending = await PendingRegistration.findOne({ 
      email: normalizedEmail, 
      isLocked: true 
    });
    if (lockedPending) {
      return res.status(423).json({ 
        message: "This email has been locked due to too many failed verification attempts. Please contact support.",
        locked: true,
        email: normalizedEmail
      });
    }

    // Hash password
    const hashed = await bcrypt.hash(password, 12);

    // Generate OTP
    const otp = generateOtp();
    const otpExpires = new Date(Date.now() + OTP_EXPIRY);
    const expiresAt = new Date(Date.now() + REGISTRATION_EXPIRY);

    // Create or update pending registration
    const pendingData = {
      name,
      email: normalizedEmail,
      password: hashed,
      phone: phone || "",
      business: business || "",
      category: category || "",
      portfolio: portfolio || "",
      country: country || "",
      state: state || "",
      city: city || "",
      otp,
      otpExpires,
      expiresAt,
      verificationAttempts: 0,
      isLocked: false,
    };

    await PendingRegistration.findOneAndUpdate(
      { email: normalizedEmail },
      pendingData,
      { upsert: true, new: true }
    );

    // Send verification email asynchronously (fire-and-forget) for faster response
    dispatchEmailEvent("auth.registration-otp", {
      to: normalizedEmail,
      data: {
        user: {
          name: name,
          email: normalizedEmail,
        },
        otp,
      },
    }).catch((emailError) => {
      // Log error but don't fail - OTP is already stored in pending registration
      console.error("Failed to send registration OTP email (async):", emailError);
    });

    // Respond immediately - email is being sent in background
    return res.json({ 
      success: true, 
      requiresVerification: true,
      email: normalizedEmail,
      message: "Verification code sent to your email. Please check your inbox.",
      expiresIn: OTP_EXPIRY / 1000
    });
  } catch (err) {
    console.error("Registration error:", err);
    return res.status(500).json({ message: "Registration failed" });
  }
};

// ------------------------------------------------------
// VERIFY REGISTRATION OTP (Step 2: Complete registration)
// ------------------------------------------------------
export const verifyRegistrationOtp = async (req: Request, res: Response) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and verification code are required" });
    }

    const normalizedEmail = email.toLowerCase();

    // Find pending registration
    const pending = await PendingRegistration.findOne({ email: normalizedEmail });
    
    if (!pending) {
      return res.status(404).json({ message: "No pending registration found. Please register again." });
    }

    // Check if locked
    if (pending.isLocked) {
      return res.status(423).json({ 
        message: "This registration has been locked due to too many failed attempts. Please contact support.",
        locked: true
      });
    }

    // Check if OTP expired
    if (!pending.otp || !pending.otpExpires || Date.now() > new Date(pending.otpExpires).getTime()) {
      return res.status(400).json({ 
        message: "Verification code expired. Please request a new one.",
        expired: true
      });
    }

    // Verify OTP
    if (pending.otp !== otp) {
      // Increment verification attempts
      pending.verificationAttempts = (pending.verificationAttempts || 0) + 1;
      
      // Check if max attempts reached
      if (pending.verificationAttempts >= MAX_REGISTRATION_ATTEMPTS) {
        pending.isLocked = true;
        pending.lockedAt = new Date();
        pending.lockReason = "Too many failed verification attempts";
        await pending.save();

        // Send lock notification email
        dispatchEmailEvent("auth.registration-locked", {
          to: normalizedEmail,
          data: {
            user: {
              name: pending.name,
              email: normalizedEmail,
            },
          },
        }).catch((err) => console.error("Failed to send lock notification:", err));

        return res.status(423).json({ 
          message: "Too many failed attempts. Your registration has been locked. Please contact support.",
          locked: true
        });
      }

      await pending.save();
      const remaining = MAX_REGISTRATION_ATTEMPTS - pending.verificationAttempts;
      return res.status(400).json({ 
        message: `Invalid verification code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
        attemptsRemaining: remaining
      });
    }

    // OTP verified - create the actual user
    const user = await User.create({
      name: pending.name,
      email: normalizedEmail,
      password: pending.password, // Already hashed
      phone: pending.phone,
      business: pending.business,
      category: pending.category,
      portfolio: pending.portfolio,
      country: pending.country,
      state: pending.state,
      city: pending.city,
    });

    // Delete pending registration
    await PendingRegistration.deleteOne({ email: normalizedEmail });

    const safeUser = { ...user.toObject(), password: undefined };

    // Send welcome email
    dispatchEmailEvent("auth.registered", {
      to: normalizedEmail,
      data: {
        user: {
          name: safeUser.name || safeUser.email,
          email: safeUser.email,
        },
      },
    }).catch((err) => console.error("Welcome email failed:", err));

    // Notify admins about new user registration
    notifyAdmins(
      "new_user",
      "New User Registered",
      `${safeUser.name || safeUser.email} has registered on the platform.`,
      "/dashboard/users",
      { userId: user._id, email: safeUser.email }
    ).catch((err) => console.error("Admin notification error:", err));

    return res.json({ 
      success: true, 
      verified: true,
      message: "Email verified successfully! You can now log in.",
      user: safeUser 
    });
  } catch (err) {
    console.error("Verify registration OTP error:", err);
    return res.status(500).json({ message: "Verification failed" });
  }
};

// ------------------------------------------------------
// RESEND REGISTRATION OTP
// ------------------------------------------------------
export const resendRegistrationOtp = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const normalizedEmail = email.toLowerCase();

    // Find pending registration
    const pending = await PendingRegistration.findOne({ email: normalizedEmail });
    
    if (!pending) {
      return res.status(404).json({ message: "No pending registration found. Please register again." });
    }

    // Check if locked
    if (pending.isLocked) {
      return res.status(423).json({ 
        message: "This registration has been locked. Please contact support.",
        locked: true
      });
    }

    // Generate new OTP
    const otp = generateOtp();
    pending.otp = otp;
    pending.otpExpires = new Date(Date.now() + OTP_EXPIRY);
    await pending.save();

    // Send verification email asynchronously (fire-and-forget) for faster response
    dispatchEmailEvent("auth.registration-otp", {
      to: normalizedEmail,
      data: {
        user: {
          name: pending.name,
          email: normalizedEmail,
        },
        otp,
      },
    }).catch((emailError) => {
      // Log error but don't fail - OTP is already stored
      console.error("Failed to resend registration OTP email (async):", emailError);
    });

    // Respond immediately - email is being sent in background
    return res.json({ 
      success: true, 
      message: "New verification code sent to your email.",
      expiresIn: OTP_EXPIRY / 1000
    });
  } catch (err) {
    console.error("Resend registration OTP error:", err);
    return res.status(500).json({ message: "Failed to resend verification code" });
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
    
    // Security: Use generic message to prevent user enumeration
    if (!user) {
      // Perform a dummy bcrypt compare to prevent timing attacks
      await bcrypt.compare(password, "$2a$12$dummyhashtopreventtimingattacksxx");
      return res.status(401).json({ message: "Invalid email or password" });
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
      // Security: Use generic message to prevent user enumeration
      return res.status(401).json({ 
        message: "Invalid email or password",
        attemptsRemaining: remaining
      });
    }

    // Reset login attempts on successful login
    user.loginAttempts = 0;
    user.lockUntil = null;
    user.lastLogin = new Date();
    await user.save();

    // Generate short-lived access token (1 hour)
    const accessToken = jwt.sign(
      { id: user._id, type: "access" },
      process.env.JWT_SECRET as string,
      { expiresIn: ACCESS_TOKEN_EXPIRY }
    );

    // Generate long-lived refresh token (7 days)
    const refreshToken = jwt.sign(
      { id: user._id, type: "refresh" },
      process.env.JWT_SECRET as string,
      { expiresIn: REFRESH_TOKEN_EXPIRY }
    );

    // Set httpOnly cookies
    setAuthCookies(res, accessToken, refreshToken);

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
      token: accessToken, // Still return token for backward compatibility
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
    
    // Security: Always return success to prevent user enumeration
    // Only actually send OTP if user exists and is not blocked/locked
    if (!user) {
      // Simulate delay to prevent timing attacks
      await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
      return res.json({ 
        success: true, 
        message: "If an account exists with this email, a verification code has been sent.",
        expiresIn: OTP_EXPIRY / 1000
      });
    }

    if (user.status === "blocked") {
      // Still return generic message to prevent enumeration
      await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
      return res.json({ 
        success: true, 
        message: "If an account exists with this email, a verification code has been sent.",
        expiresIn: OTP_EXPIRY / 1000
      });
    }

    // Check if account is locked for login attempts
    if (isLocked(user)) {
      const remainingTime = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return res.status(423).json({ 
        message: `Account locked. Try again in ${remainingTime} minutes`,
        locked: true
      });
    }

    // Check if OTP verification is locked (brute-force protection)
    if (isOtpVerifyLocked(user)) {
      const remainingTime = Math.ceil((user.otpVerifyLockUntil - Date.now()) / 60000);
      return res.status(429).json({ 
        message: `Too many failed verification attempts. Try again in ${remainingTime} minutes.`,
        locked: true,
        retryAfter: remainingTime
      });
    }

    // Generate OTP
    const otp = generateOtp();

    // Store OTP + expiry and reset verification attempts
    user.otp = otp;
    user.otpExpires = new Date(Date.now() + OTP_EXPIRY);
    user.otpVerifyAttempts = 0; // Reset attempts when new OTP is requested
    await user.save();

    // Send email asynchronously (fire-and-forget) for faster response
    // The OTP is already saved, so even if email is delayed, verification will work
    dispatchEmailEvent("auth.otp", {
      to: email,
      data: {
        user: {
          name: user.name || user.email,
          email: user.email,
        },
        otp,
        purpose,
      },
    }).catch((error) => {
      // Log error but don't fail the request - OTP is already stored
      console.error("Send OTP email failed (async):", error);
    });

    // Respond immediately - email is being sent in background
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
    // Security: Use generic message to prevent user enumeration
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Check if OTP verification is locked due to too many failed attempts
    if (isOtpVerifyLocked(user)) {
      const remainingTime = Math.ceil((user.otpVerifyLockUntil - Date.now()) / 60000);
      return res.status(429).json({ 
        message: `Too many failed attempts. Try again in ${remainingTime} minutes.`,
        locked: true,
        retryAfter: remainingTime
      });
    }

    if (!user.otp || !user.otpExpires) {
      return res.status(400).json({ message: "No verification code requested" });
    }

    if (Date.now() > user.otpExpires) {
      user.otp = null;
      user.otpExpires = null;
      user.otpVerifyAttempts = 0; // Reset attempts when OTP expires
      await user.save();
      return res.status(400).json({ message: "Verification code expired" });
    }

    // Check OTP - with brute-force protection
    if (user.otp !== otp) {
      user.otpVerifyAttempts = (user.otpVerifyAttempts || 0) + 1;
      
      // Lock OTP verification if max attempts reached
      if (user.otpVerifyAttempts >= MAX_OTP_VERIFY_ATTEMPTS) {
        user.otp = null;
        user.otpExpires = null;
        user.otpVerifyAttempts = 0;
        user.otpVerifyLockUntil = new Date(Date.now() + OTP_VERIFY_LOCK_TIME);
        await user.save();
        return res.status(429).json({ 
          message: "Too many failed attempts. Please request a new verification code after 15 minutes.",
          locked: true
        });
      }
      
      await user.save();
      const remaining = MAX_OTP_VERIFY_ATTEMPTS - user.otpVerifyAttempts;
      return res.status(400).json({ 
        message: `Invalid verification code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
        attemptsRemaining: remaining
      });
    }

    // Clear OTP after successful verification
    user.otp = null;
    user.otpExpires = null;
    user.otpVerifyAttempts = 0;
    user.otpVerifyLockUntil = null;
    user.loginAttempts = 0;
    user.lockUntil = null;
    user.lastLogin = new Date();
    await user.save();

    // Generate short-lived access token (1 hour)
    const accessToken = jwt.sign(
      { id: user._id, type: "access" },
      process.env.JWT_SECRET as string,
      { expiresIn: ACCESS_TOKEN_EXPIRY }
    );

    // Generate long-lived refresh token (7 days)
    const refreshToken = jwt.sign(
      { id: user._id, type: "refresh" },
      process.env.JWT_SECRET as string,
      { expiresIn: REFRESH_TOKEN_EXPIRY }
    );

    // Set httpOnly cookies
    setAuthCookies(res, accessToken, refreshToken);

    return res.json({
      success: true,
      token: accessToken, // Still return token for backward compatibility
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

    // Password complexity validation
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({ message: passwordValidation.message });
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

    // Password complexity validation
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({ message: passwordValidation.message });
    }

    const user: any = await User.findOne({ email: email.toLowerCase() });
    // Security: Use generic message to prevent user enumeration
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Check if OTP verification is locked due to too many failed attempts
    if (isOtpVerifyLocked(user)) {
      const remainingTime = Math.ceil((user.otpVerifyLockUntil - Date.now()) / 60000);
      return res.status(429).json({ 
        message: `Too many failed attempts. Try again in ${remainingTime} minutes.`,
        locked: true,
        retryAfter: remainingTime
      });
    }

    if (!user.otp || !user.otpExpires) {
      return res.status(400).json({ message: "No verification code requested" });
    }

    if (Date.now() > user.otpExpires) {
      user.otp = null;
      user.otpExpires = null;
      user.otpVerifyAttempts = 0;
      await user.save();
      return res.status(400).json({ message: "Verification code expired" });
    }

    // Check OTP - with brute-force protection
    if (user.otp !== otp) {
      user.otpVerifyAttempts = (user.otpVerifyAttempts || 0) + 1;
      
      if (user.otpVerifyAttempts >= MAX_OTP_VERIFY_ATTEMPTS) {
        user.otp = null;
        user.otpExpires = null;
        user.otpVerifyAttempts = 0;
        user.otpVerifyLockUntil = new Date(Date.now() + OTP_VERIFY_LOCK_TIME);
        await user.save();
        return res.status(429).json({ 
          message: "Too many failed attempts. Please request a new verification code after 15 minutes.",
          locked: true
        });
      }
      
      await user.save();
      const remaining = MAX_OTP_VERIFY_ATTEMPTS - user.otpVerifyAttempts;
      return res.status(400).json({ 
        message: `Invalid verification code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
        attemptsRemaining: remaining
      });
    }

    // Update password
    user.password = await bcrypt.hash(password, 12);
    user.otp = null;
    user.otpExpires = null;
    user.otpVerifyAttempts = 0;
    user.otpVerifyLockUntil = null;
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
    // Security: Use generic message to prevent user enumeration
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Check if OTP verification is locked due to too many failed attempts
    if (isOtpVerifyLocked(user)) {
      const remainingTime = Math.ceil((user.otpVerifyLockUntil - Date.now()) / 60000);
      return res.status(429).json({ 
        message: `Too many failed attempts. Try again in ${remainingTime} minutes.`,
        locked: true,
        retryAfter: remainingTime
      });
    }

    if (!user.otp || !user.otpExpires) {
      return res.status(400).json({ message: "No verification code requested" });
    }

    if (Date.now() > user.otpExpires) {
      user.otp = null;
      user.otpExpires = null;
      user.otpVerifyAttempts = 0;
      await user.save();
      return res.status(400).json({ message: "Verification code expired" });
    }

    // Check OTP - with brute-force protection
    if (user.otp !== otp) {
      user.otpVerifyAttempts = (user.otpVerifyAttempts || 0) + 1;
      
      if (user.otpVerifyAttempts >= MAX_OTP_VERIFY_ATTEMPTS) {
        user.otp = null;
        user.otpExpires = null;
        user.otpVerifyAttempts = 0;
        user.otpVerifyLockUntil = new Date(Date.now() + OTP_VERIFY_LOCK_TIME);
        await user.save();
        return res.status(429).json({ 
          message: "Too many failed attempts. Please request a new verification code after 15 minutes.",
          locked: true
        });
      }
      
      await user.save();
      const remaining = MAX_OTP_VERIFY_ATTEMPTS - user.otpVerifyAttempts;
      return res.status(400).json({ 
        message: `Invalid verification code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
        attemptsRemaining: remaining
      });
    }

    // Unlock the account
    user.otp = null;
    user.otpExpires = null;
    user.otpVerifyAttempts = 0;
    user.otpVerifyLockUntil = null;
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

// ---------------------------------------------
// LOGOUT USER (Invalidate Token + Clear Cookies)
// ---------------------------------------------
export const logoutUser = async (req: any, res: Response) => {
  try {
    const accessToken = req.token || req.cookies?.accessToken || req.headers.authorization?.replace("Bearer ", "");
    const refreshToken = req.cookies?.refreshToken;
    
    // Blacklist access token if present
    if (accessToken) {
      const decoded: any = jwt.decode(accessToken);
      if (decoded?.exp) {
        await TokenBlacklist.findOneAndUpdate(
          { token: accessToken },
          {
            token: accessToken,
            userId: req.user._id,
            expiresAt: new Date(decoded.exp * 1000),
            reason: "logout",
          },
          { upsert: true, new: true }
        );
      }
    }

    // Blacklist refresh token if present
    if (refreshToken) {
      const decoded: any = jwt.decode(refreshToken);
      if (decoded?.exp) {
        await TokenBlacklist.findOneAndUpdate(
          { token: refreshToken },
          {
            token: refreshToken,
            userId: req.user._id,
            expiresAt: new Date(decoded.exp * 1000),
            reason: "logout",
          },
          { upsert: true, new: true }
        );
      }
    }

    // Clear httpOnly cookies
    clearAuthCookies(res);

    return res.json({ 
      success: true, 
      message: "Logged out successfully" 
    });

  } catch (err) {
    console.error("Logout error:", err);
    return res.status(500).json({ success: false, message: "Logout failed" });
  }
};

// ---------------------------------------------
// REFRESH ACCESS TOKEN
// ---------------------------------------------
export const refreshAccessToken = async (req: Request, res: Response) => {
  try {
    // Get refresh token from cookie or body
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
    
    if (!refreshToken) {
      return res.status(401).json({ 
        success: false, 
        message: "Refresh token required" 
      });
    }

    // Check if refresh token is blacklisted
    const blacklisted = await TokenBlacklist.findOne({ token: refreshToken });
    if (blacklisted) {
      clearAuthCookies(res);
      return res.status(401).json({ 
        success: false, 
        message: "Refresh token has been revoked" 
      });
    }

    // Verify refresh token
    let decoded: any;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_SECRET as string);
    } catch (err) {
      clearAuthCookies(res);
      return res.status(401).json({ 
        success: false, 
        message: "Invalid or expired refresh token" 
      });
    }

    // Verify it's a refresh token type
    if (decoded.type !== "refresh") {
      return res.status(401).json({ 
        success: false, 
        message: "Invalid token type" 
      });
    }

    // Get user
    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      clearAuthCookies(res);
      return res.status(401).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    if (user.status === "blocked") {
      clearAuthCookies(res);
      return res.status(403).json({ 
        success: false, 
        message: "Account blocked" 
      });
    }

    // Generate new access token
    const newAccessToken = jwt.sign(
      { id: user._id, type: "access" },
      process.env.JWT_SECRET as string,
      { expiresIn: ACCESS_TOKEN_EXPIRY }
    );

    // Set new access token cookie
    res.cookie("accessToken", newAccessToken, {
      ...COOKIE_OPTIONS,
      maxAge: 60 * 60 * 1000, // 1 hour
    });

    return res.json({
      success: true,
      token: newAccessToken,
      user: { ...user.toObject(), password: undefined },
    });

  } catch (err) {
    console.error("Refresh token error:", err);
    return res.status(500).json({ 
      success: false, 
      message: "Failed to refresh token" 
    });
  }
};

// ---------------------------------------------
// CHANGE PASSWORD
// ---------------------------------------------
export const changePassword = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        success: false, 
        message: "Current password and new password are required" 
      });
    }

    // Password complexity validation
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
      return res.status(400).json({ 
        success: false, 
        message: passwordValidation.message 
      });
    }

    const user: any = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ 
        success: false, 
        message: "Current password is incorrect" 
      });
    }

    // Hash and save new password
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    // Send notification email
    dispatchEmailEvent("auth.password-changed", {
      to: user.email,
      data: {
        user: { name: user.name || user.email, email: user.email },
        context: { timestamp: new Date().toISOString() },
      },
    }).catch((err) => console.error("Password change email failed:", err));

    return res.json({ 
      success: true, 
      message: "Password changed successfully" 
    });

  } catch (err) {
    console.error("Change password error:", err);
    return res.status(500).json({ success: false, message: "Failed to change password" });
  }
};

// ---------------------------------------------
// REQUEST EMAIL CHANGE (sends OTP to new email)
// ---------------------------------------------
export const requestEmailChange = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { newEmail, password } = req.body;

    if (!newEmail || !password) {
      return res.status(400).json({ 
        success: false, 
        message: "New email and password are required" 
      });
    }

    const normalizedEmail = newEmail.toLowerCase().trim();

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid email format" 
      });
    }

    const user: any = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ 
        success: false, 
        message: "Password is incorrect" 
      });
    }

    // Check if new email is same as current
    if (normalizedEmail === user.email.toLowerCase()) {
      return res.status(400).json({ 
        success: false, 
        message: "New email must be different from current email" 
      });
    }

    // Check if email is already in use
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: "This email is already registered" 
      });
    }

    // Generate OTP and store pending email change
    const otp = generateOtp();
    user.pendingEmail = normalizedEmail;
    user.pendingEmailOtp = otp;
    user.pendingEmailExpires = new Date(Date.now() + OTP_EXPIRY);
    user.pendingEmailOtpAttempts = 0; // Reset attempts when new OTP is requested
    await user.save();

    // Send OTP to new email
    dispatchEmailEvent("auth.email-change-otp", {
      to: normalizedEmail,
      data: {
        user: { name: user.name || user.email, email: normalizedEmail },
        otp,
        currentEmail: user.email,
      },
    }).catch((err) => console.error("Email change OTP failed:", err));

    return res.json({ 
      success: true, 
      message: "Verification code sent to new email",
      expiresIn: OTP_EXPIRY / 1000
    });

  } catch (err) {
    console.error("Request email change error:", err);
    return res.status(500).json({ success: false, message: "Failed to request email change" });
  }
};

// ---------------------------------------------
// CONFIRM EMAIL CHANGE (verify OTP)
// ---------------------------------------------
export const confirmEmailChange = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { otp } = req.body;

    if (!otp) {
      return res.status(400).json({ 
        success: false, 
        message: "Verification code is required" 
      });
    }

    const user: any = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Check if there's a pending email change
    if (!user.pendingEmail || !user.pendingEmailOtp) {
      return res.status(400).json({ 
        success: false, 
        message: "No pending email change request" 
      });
    }

    // Check if OTP expired
    if (user.pendingEmailExpires < new Date()) {
      user.pendingEmail = null;
      user.pendingEmailOtp = null;
      user.pendingEmailExpires = null;
      user.pendingEmailOtpAttempts = 0;
      await user.save();
      return res.status(400).json({ 
        success: false, 
        message: "Verification code expired. Please request a new one." 
      });
    }

    // Verify OTP - with brute-force protection
    if (user.pendingEmailOtp !== otp) {
      user.pendingEmailOtpAttempts = (user.pendingEmailOtpAttempts || 0) + 1;
      
      // Lock email change if max attempts reached
      if (user.pendingEmailOtpAttempts >= MAX_OTP_VERIFY_ATTEMPTS) {
        user.pendingEmail = null;
        user.pendingEmailOtp = null;
        user.pendingEmailExpires = null;
        user.pendingEmailOtpAttempts = 0;
        await user.save();
        return res.status(429).json({ 
          success: false, 
          message: "Too many failed attempts. Please request a new email change.",
          locked: true
        });
      }
      
      await user.save();
      const remaining = MAX_OTP_VERIFY_ATTEMPTS - user.pendingEmailOtpAttempts;
      return res.status(400).json({ 
        success: false, 
        message: `Invalid verification code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
        attemptsRemaining: remaining
      });
    }

    const oldEmail = user.email;
    const newEmail = user.pendingEmail;

    // Update email
    user.email = newEmail;
    user.pendingEmail = null;
    user.pendingEmailOtp = null;
    user.pendingEmailExpires = null;
    user.pendingEmailOtpAttempts = 0;
    await user.save();

    // Notify old email about the change
    dispatchEmailEvent("auth.email-changed", {
      to: oldEmail,
      data: {
        user: { name: user.name || oldEmail, email: oldEmail },
        newEmail,
        context: { timestamp: new Date().toISOString() },
      },
    }).catch((err) => console.error("Email changed notification failed:", err));

    return res.json({ 
      success: true, 
      message: "Email changed successfully",
      user: { ...user.toObject(), password: undefined }
    });

  } catch (err) {
    console.error("Confirm email change error:", err);
    return res.status(500).json({ success: false, message: "Failed to change email" });
  }
};

// ---------------------------------------------
// DELETE ACCOUNT
// ---------------------------------------------
export const deleteAccount = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { password, confirmation } = req.body;

    if (!password) {
      return res.status(400).json({ 
        success: false, 
        message: "Password is required to delete account" 
      });
    }

    if (confirmation !== "DELETE") {
      return res.status(400).json({ 
        success: false, 
        message: "Please type DELETE to confirm account deletion" 
      });
    }

    const user: any = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Prevent admin/manager deletion through this endpoint
    if (user.role === "admin" || user.role === "manager") {
      return res.status(403).json({ 
        success: false, 
        message: "Admin and manager accounts cannot be deleted through this method" 
      });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ 
        success: false, 
        message: "Password is incorrect" 
      });
    }

    const userEmail = user.email;
    const userName = user.name;

    // Delete the user
    await User.findByIdAndDelete(userId);

    // Clear auth cookies
    clearAuthCookies(res);

    // Send confirmation email
    dispatchEmailEvent("auth.account-deleted", {
      to: userEmail,
      data: {
        user: { name: userName || userEmail, email: userEmail },
        context: { timestamp: new Date().toISOString() },
      },
    }).catch((err) => console.error("Account deletion email failed:", err));

    return res.json({ 
      success: true, 
      message: "Account deleted successfully" 
    });

  } catch (err) {
    console.error("Delete account error:", err);
    return res.status(500).json({ success: false, message: "Failed to delete account" });
  }
};