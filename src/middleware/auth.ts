import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import { User } from "../models/User";
import { TokenBlacklist } from "../models/TokenBlacklist";

export const protect = async (req: any, res: Response, next: NextFunction) => {
  try {
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

    // Check if token has been invalidated (logout/revoked)
    const blacklisted = await TokenBlacklist.findOne({ token });
    if (blacklisted) {
      return res.status(401).json({ success: false, message: "Token has been revoked" });
    }

    const decoded: any = jwt.verify(token, process.env.JWT_SECRET as string);

    // For access tokens with type field, verify it's an access token
    if (decoded.type && decoded.type !== "access") {
      return res.status(401).json({ success: false, message: "Invalid token type" });
    }

    const user = await User.findById(decoded.id).select("-password");
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
    // Check for token expiration specifically
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ 
        success: false, 
        message: "Token expired",
        code: "TOKEN_EXPIRED"
      });
    }
    return res.status(401).json({ success: false, message: "Token error" });
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