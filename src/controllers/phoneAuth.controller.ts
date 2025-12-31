import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import User from "../models/User";
import {
  verifyFirebaseToken,
  extractPhoneFromToken,
  parseCountryCode,
  isFirebaseConfigured,
} from "../services/firebaseAdmin";
import {
  canUsePhoneOtp,
  logSmsRequest,
  getSmsStats,
  getPhoneRateLimitStatus,
} from "../services/smsUsageService";

// Token expiration times (same as main auth)
const ACCESS_TOKEN_EXPIRY = "1h";
const REFRESH_TOKEN_EXPIRY = "7d";
const REFRESH_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

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
  res.cookie("accessToken", accessToken, {
    ...COOKIE_OPTIONS,
    maxAge: 60 * 60 * 1000,
  });
  res.cookie("refreshToken", refreshToken, {
    ...COOKIE_OPTIONS,
    maxAge: REFRESH_TOKEN_EXPIRY_MS,
  });
};

/**
 * Check if phone OTP is available for a given phone number
 * Called BEFORE Firebase sends the SMS to check rate limits
 * 
 * POST /auth/phone/check-availability
 * Body: { phone: string }
 */
export const checkPhoneOtpAvailability = async (req: Request, res: Response) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ message: "Phone number is required" });
    }

    // Validate phone format (basic E.164 check)
    if (!phone.startsWith("+") || phone.length < 8) {
      return res.status(400).json({
        message: "Invalid phone format. Use international format (e.g., +1234567890)",
      });
    }

    // Check if Firebase is configured
    if (!isFirebaseConfigured()) {
      return res.status(503).json({
        available: false,
        message: "Phone verification is not available. Please use email instead.",
        fallbackToEmail: true,
      });
    }

    // Get client IP for rate limiting
    const ipAddress = (req.headers["x-forwarded-for"] as string)?.split(",")[0] || req.ip;

    // Check if phone OTP is allowed
    const check = await canUsePhoneOtp(phone, ipAddress);

    if (!check.allowed) {
      // Log the blocked request
      await logSmsRequest({
        phone,
        type: "otp_requested",
        ipAddress,
        smsSent: false,
        blockReason: check.reason,
        countryCode: parseCountryCode(phone),
      });

      return res.status(429).json({
        available: false,
        message: check.reason,
        fallbackToEmail: check.fallbackToEmail,
        retryAfter: check.retryAfter,
      });
    }

    // Get rate limit status for UI
    const rateLimitStatus = await getPhoneRateLimitStatus(phone);

    return res.json({
      available: true,
      message: "Phone OTP is available",
      rateLimit: {
        hourlyRemaining: rateLimitStatus.hourlyLimit - rateLimitStatus.hourlyUsed,
        dailyRemaining: rateLimitStatus.dailyLimit - rateLimitStatus.dailyUsed,
      },
    });
  } catch (err) {
    console.error("Check phone OTP availability error:", err);
    return res.status(500).json({
      available: false,
      message: "Unable to check availability. Please use email instead.",
      fallbackToEmail: true,
    });
  }
};

/**
 * Log that an SMS OTP was sent (called after Firebase sends SMS)
 * This helps track usage even though Firebase handles the actual sending
 * 
 * POST /auth/phone/log-sms-sent
 * Body: { phone: string, verificationId?: string }
 */
export const logSmsSent = async (req: Request, res: Response) => {
  try {
    const { phone, verificationId } = req.body;

    if (!phone) {
      return res.status(400).json({ message: "Phone number is required" });
    }

    const ipAddress = (req.headers["x-forwarded-for"] as string)?.split(",")[0] || req.ip;
    const countryCode = parseCountryCode(phone);

    await logSmsRequest({
      phone,
      type: "otp_requested",
      ipAddress,
      smsSent: true,
      countryCode,
      verificationId,
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("Log SMS sent error:", err);
    // Don't fail the request - logging is best-effort
    return res.json({ success: true });
  }
};

/**
 * Verify phone OTP and authenticate user
 * Called after user verifies OTP via Firebase on frontend
 * 
 * POST /auth/phone/verify
 * Body: { firebaseToken: string }
 */
export const verifyPhoneOtp = async (req: Request, res: Response) => {
  try {
    const { firebaseToken } = req.body;

    if (!firebaseToken) {
      return res.status(400).json({ message: "Firebase token is required" });
    }

    // Verify Firebase token
    const decodedToken = await verifyFirebaseToken(firebaseToken);

    if (!decodedToken) {
      return res.status(401).json({ message: "Invalid or expired verification" });
    }

    // Extract phone number from token
    const phone = extractPhoneFromToken(decodedToken);

    if (!phone) {
      return res.status(400).json({
        message: "No phone number found in verification. Please try again.",
      });
    }

    const countryCode = parseCountryCode(phone);
    const ipAddress = (req.headers["x-forwarded-for"] as string)?.split(",")[0] || req.ip;

    // Log successful verification
    await logSmsRequest({
      phone,
      type: "otp_verified",
      countryCode,
      ipAddress,
    });

    // Normalize phone for comparison (remove spaces, dashes, parentheses)
    const normalizePhone = (p: string) => p?.replace(/[\s\-\(\)\.]/g, "") || "";
    const phoneNormalized = normalizePhone(phone);
    
    // Find user by verified phone first
    let user = await User.findOne({ verifiedPhone: phone });

    // If not found, try matching against the unverified phone field
    if (!user) {
      // Try exact match on phone field
      user = await User.findOne({ phone: phone });
      
      // Try normalized match (phone might be stored without + or with different formatting)
      if (!user) {
        const users = await User.find({
          phone: { $exists: true, $ne: null, $ne: "" }
        }).select("_id phone");
        
        for (const u of users) {
          const userPhoneNormalized = normalizePhone(u.phone);
          // Check if normalized versions match (with or without +)
          if (userPhoneNormalized === phoneNormalized ||
              userPhoneNormalized === phoneNormalized.replace(/^\+/, "") ||
              `+${userPhoneNormalized}` === phoneNormalized) {
            user = await User.findById(u._id);
            break;
          }
        }
      }
      
      // If found via phone field, update their verifiedPhone
      if (user) {
        user.verifiedPhone = phone;
        user.phoneVerified = true;
        user.phoneVerifiedAt = new Date();
        user.firebasePhoneUid = decodedToken.uid;
        user.phoneCountryCode = countryCode;
        await user.save();
      }
    }

    if (!user) {
      // No user with this phone - return info for linking
      return res.json({
        success: true,
        phoneVerified: true,
        phone,
        countryCode,
        userFound: false,
        message: "Phone verified but no account found. Please sign in with email first.",
        firebaseUid: decodedToken.uid,
      });
    }

    // User found - log them in
    if (user.status === "blocked") {
      return res.status(423).json({
        message: "This account has been blocked. Please contact support.",
        blocked: true,
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate tokens
    const accessToken = jwt.sign(
      { id: user._id, type: "access" },
      process.env.JWT_SECRET as string,
      { expiresIn: ACCESS_TOKEN_EXPIRY }
    );

    const refreshToken = jwt.sign(
      { id: user._id, type: "refresh" },
      process.env.JWT_SECRET as string,
      { expiresIn: REFRESH_TOKEN_EXPIRY }
    );

    setAuthCookies(res, accessToken, refreshToken);

    return res.json({
      success: true,
      phoneVerified: true,
      userFound: true,
      token: accessToken,
      user: {
        ...user.toObject(),
        password: undefined,
        otp: undefined,
        otpExpires: undefined,
      },
    });
  } catch (err) {
    console.error("Verify phone OTP error:", err);
    return res.status(500).json({ message: "Verification failed" });
  }
};

/**
 * Link verified phone to existing user account
 * User must be authenticated (via email/password or email OTP)
 * 
 * POST /auth/phone/link
 * Body: { firebaseToken: string }
 * Headers: Authorization: Bearer <token>
 */
export const linkPhoneToAccount = async (req: any, res: Response) => {
  try {
    const { firebaseToken } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (!firebaseToken) {
      return res.status(400).json({ message: "Firebase token is required" });
    }

    // Verify Firebase token
    const decodedToken = await verifyFirebaseToken(firebaseToken);

    if (!decodedToken) {
      return res.status(401).json({ message: "Invalid or expired verification" });
    }

    const phone = extractPhoneFromToken(decodedToken);

    if (!phone) {
      return res.status(400).json({
        message: "No phone number found in verification",
      });
    }

    // Check if phone is already linked to another account
    const existingUser = await User.findOne({
      verifiedPhone: phone,
      _id: { $ne: userId },
    });

    if (existingUser) {
      return res.status(409).json({
        message: "This phone number is already linked to another account",
      });
    }

    // Link phone to user
    const user = await User.findByIdAndUpdate(
      userId,
      {
        verifiedPhone: phone,
        phoneVerified: true,
        phoneVerifiedAt: new Date(),
        firebasePhoneUid: decodedToken.uid,
        phoneCountryCode: parseCountryCode(phone),
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Log the linking
    await logSmsRequest({
      phone,
      type: "otp_verified",
      userId: userId,
      countryCode: parseCountryCode(phone),
    });

    return res.json({
      success: true,
      message: "Phone number verified and linked to your account",
      user: {
        ...user.toObject(),
        password: undefined,
        otp: undefined,
        otpExpires: undefined,
      },
    });
  } catch (err) {
    console.error("Link phone to account error:", err);
    return res.status(500).json({ message: "Failed to link phone number" });
  }
};

/**
 * Unlink phone from account
 * 
 * DELETE /auth/phone/unlink
 * Headers: Authorization: Bearer <token>
 */
export const unlinkPhone = async (req: any, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      {
        verifiedPhone: null,
        phoneVerified: false,
        phoneVerifiedAt: null,
        firebasePhoneUid: null,
        phoneCountryCode: null,
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({
      success: true,
      message: "Phone number unlinked from your account",
      user: {
        ...user.toObject(),
        password: undefined,
        otp: undefined,
        otpExpires: undefined,
      },
    });
  } catch (err) {
    console.error("Unlink phone error:", err);
    return res.status(500).json({ message: "Failed to unlink phone number" });
  }
};

/**
 * Get SMS usage statistics (admin only)
 * 
 * GET /auth/phone/stats
 */
export const getPhoneStats = async (req: any, res: Response) => {
  try {
    const stats = await getSmsStats();
    return res.json({ success: true, stats });
  } catch (err) {
    console.error("Get phone stats error:", err);
    return res.status(500).json({ message: "Failed to get statistics" });
  }
};

/**
 * Detect input type (email vs phone)
 * Helper endpoint for frontend
 * 
 * POST /auth/detect-input-type
 * Body: { input: string }
 */
export const detectInputType = async (req: Request, res: Response) => {
  try {
    const { input } = req.body;

    if (!input || typeof input !== "string") {
      return res.status(400).json({ message: "Input is required" });
    }

    const trimmed = input.trim();

    // Check if it looks like an email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailRegex.test(trimmed)) {
      return res.json({
        type: "email",
        value: trimmed.toLowerCase(),
        valid: true,
      });
    }

    // Check if it looks like a phone number
    // Remove common formatting characters
    const phoneClean = trimmed.replace(/[\s\-\(\)\.]/g, "");
    
    // Check for E.164 format or common patterns
    if (/^\+?[1-9]\d{6,14}$/.test(phoneClean)) {
      // Ensure it has + prefix
      const phone = phoneClean.startsWith("+") ? phoneClean : `+${phoneClean}`;
      
      // Check if phone OTP is available
      const phoneAvailable = isFirebaseConfigured();
      
      return res.json({
        type: "phone",
        value: phone,
        valid: true,
        phoneOtpAvailable: phoneAvailable,
        message: phoneAvailable
          ? undefined
          : "Phone verification unavailable. Please use email.",
      });
    }

    // Unknown format
    return res.json({
      type: "unknown",
      value: trimmed,
      valid: false,
      message: "Please enter a valid email or phone number",
    });
  } catch (err) {
    console.error("Detect input type error:", err);
    return res.status(500).json({ message: "Failed to detect input type" });
  }
};

export default {
  checkPhoneOtpAvailability,
  logSmsSent,
  verifyPhoneOtp,
  linkPhoneToAccount,
  unlinkPhone,
  getPhoneStats,
  detectInputType,
};


