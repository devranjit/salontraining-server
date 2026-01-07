import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import { User } from "../models/User";
import { TokenBlacklist } from "../models/TokenBlacklist";

// Security: Validate JWT_SECRET is configured
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error("⚠️ SECURITY WARNING: JWT_SECRET must be at least 32 characters long");
}

export const protect = async (req: any, res: Response, next: NextFunction) => {
  try {
    // Security: Ensure JWT_SECRET is configured
    if (!JWT_SECRET) {
      console.error("JWT_SECRET not configured");
      return res.status(500).json({ success: false, message: "Server configuration error" });
    }

    // Get token from Authorization header OR httpOnly cookie
    const authHeader = req.headers.authorization;
    let token: string | undefined;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.replace("Bearer ", "");
    } else if (req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      return res.status(401).json({ success: false, message: "No token provided" });
    }

    // Security: Basic token format validation (JWT has 3 parts separated by dots)
    const tokenParts = token.split(".");
    if (tokenParts.length !== 3) {
      return res.status(401).json({ success: false, message: "Invalid token format" });
    }

    // Check if token has been invalidated (logout/revoked)
    const blacklisted = await TokenBlacklist.findOne({ token });
    if (blacklisted) {
      return res.status(401).json({ success: false, message: "Token has been revoked" });
    }

    const decoded: any = jwt.verify(token, JWT_SECRET);

    // Security: Validate token payload structure
    if (!decoded || !decoded.id || typeof decoded.id !== "string") {
      return res.status(401).json({ success: false, message: "Invalid token payload" });
    }

    // For access tokens with type field, verify it's an access token
    if (decoded.type && decoded.type !== "access") {
      return res.status(401).json({ success: false, message: "Invalid token type" });
    }

    const user = await User.findById(decoded.id).select("-password -otp -otpExpires -resetPasswordToken -resetPasswordExpires");
    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid token" });
    }

    if (user.status === "blocked") {
      return res.status(403).json({ success: false, message: "Account blocked" });
    }

    req.user = user;
    req.token = token; // Store token for potential logout

    next();
  } catch (err: any) {
    // Security: Log authentication failures for monitoring (without exposing token)
    console.warn(`[Auth] Token verification failed: ${err.name} - ${err.message}`);
    
    // Check for token expiration specifically
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ 
        success: false, 
        message: "Token expired",
        code: "TOKEN_EXPIRED"
      });
    }
    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({ success: false, message: "Invalid token" });
    }
    return res.status(401).json({ success: false, message: "Authentication failed" });
  }
};

export const adminOnly = (req: any, res: Response, next: NextFunction) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Admin access only",
    });
  }
  next();
};

export const memberOrAdmin = (req: any, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  const allowedRoles = ["admin", "manager", "member", "st-member"];

  // Allow if user is admin or has an approved member role
  if (allowedRoles.includes(req.user.role)) {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: "Member access only. Please upgrade to access this content.",
  });
};

export const managerOrAdmin = (req: any, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  if (req.user.role === "admin" || req.user.role === "manager") {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: "Manager or admin access only",
  });
};

// Security: Flexible role-based authorization middleware
export const authorize = (...allowedRoles: string[]) => {
  return (req: any, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Security: Validate role is a string and exists
    if (!req.user.role || typeof req.user.role !== "string") {
      console.warn(`[Security] User ${req.user._id} has invalid role: ${req.user.role}`);
      return res.status(403).json({
        success: false,
        message: "Invalid user role",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      // Security: Log unauthorized access attempts
      console.warn(`[Security] Unauthorized access attempt: User ${req.user._id} (${req.user.role}) tried to access resource requiring roles: ${allowedRoles.join(", ")}`);
      return res.status(403).json({
        success: false,
        message: "Access denied. Insufficient permissions.",
      });
    }

    return next();
  };
};

// Security: Resource ownership verification helper
export const isResourceOwner = (resourceOwnerId: string, userId: string): boolean => {
  return resourceOwnerId?.toString() === userId?.toString();
};

// Security: Combined ownership or admin check
export const isOwnerOrAdmin = (resourceOwnerId: string, user: any): boolean => {
  if (!user) return false;
  if (["admin", "manager"].includes(user.role)) return true;
  return isResourceOwner(resourceOwnerId, user._id?.toString());
};