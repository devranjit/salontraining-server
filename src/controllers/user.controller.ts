import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import mongoose from "mongoose";
import User from "../models/User";
import PendingRegistration from "../models/PendingRegistration";
import { moveToRecycleBin } from "../services/recycleBinService";
import { dispatchEmailEvent } from "../services/emailService";

const ALLOWED_ROLES = ["user", "member", "st-member", "manager", "admin"];
const ALLOWED_STATUSES = ["active", "blocked", "registration_locked"];

// Password complexity requirements
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const RESET_TOKEN_EXPIRY = 60 * 60 * 1000; // 1 hour

const FRONTEND_BASE_URL = (
  process.env.FRONTEND_URL ||
  (process.env.NODE_ENV === "development"
    ? "http://localhost:5173"
    : "https://salontraining.com")
).replace(/\/+$/, "");

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

const generateSecureToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

const sanitizeUser = (user: any) => {
  const obj = user.toObject ? user.toObject() : user;
  delete obj.password;
  delete obj.otp;
  delete obj.otpExpires;
  return obj;
};

const generateSecurePassword = (length = 12) => {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789!@#$%^&*";
  const bytes = crypto.randomBytes(length);
  let password = "";
  for (let i = 0; i < length; i += 1) {
    const index = bytes[i] % charset.length;
    password += charset[index];
  }
  return password;
};

// ------------------------------------------------------
// GET ALL USERS (Admin)
// ------------------------------------------------------
export const getAllUsers = async (req: any, res: Response) => {
  try {
    const users = await User.find()
      .select("-password -otp -otpExpires")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      users,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ------------------------------------------------------
// SEARCH USERS (Admin + Manager)
// ------------------------------------------------------
export const searchUsers = async (req: Request, res: Response) => {
  try {
    const { q = "", limit = 8 } = req.query;
    const searchTerm = String(q).trim();
    const maxResults = Math.min(Math.max(parseInt(limit as string, 10) || 8, 1), 25);

    const query: any = {};
    if (searchTerm) {
      const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "i");
      const orConditions: Array<Record<string, any>> = [
        { name: regex },
        { email: regex },
        { first_name: regex },
        { last_name: regex },
      ];

      if (mongoose.Types.ObjectId.isValid(searchTerm)) {
        orConditions.push({ _id: searchTerm });
      }

      query.$or = orConditions;
    }

    const users = await User.find(query)
      .select("name email role status")
      .sort({ createdAt: -1 })
      .limit(maxResults);

    res.json({ success: true, users });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Server error" });
  }
};

// ------------------------------------------------------
// GET SINGLE USER BY ID (Admin)
// ------------------------------------------------------
export const getUserById = async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.params.id).select("-password -otp -otpExpires");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ------------------------------------------------------
// CREATE USER (Admin)
// ------------------------------------------------------
export const createUser = async (req: Request, res: Response) => {
  try {
    const {
      name,
      email,
      role = "user",
      status = "active",
      password,
      first_name,
      last_name,
      phone,
      business,
      instagram,
      facebook,
      category,
      portfolio,
      country,
      state,
      city,
    } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }

    const normalizedRole = typeof role === "string" ? role : "user";
    if (!ALLOWED_ROLES.includes(normalizedRole)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Must be one of: ${ALLOWED_ROLES.join(", ")}`,
      });
    }

    const normalizedStatus = typeof status === "string" ? status : "active";
    if (!ALLOWED_STATUSES.includes(normalizedStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be either active or blocked",
      });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "A user with this email already exists",
      });
    }

    let finalPassword = typeof password === "string" ? password.trim() : "";
    let autoGenerated = false;

    if (!finalPassword) {
      finalPassword = generateSecurePassword(12);
      autoGenerated = true;
    }

    if (finalPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long",
      });
    }

    const hashedPassword = await bcrypt.hash(finalPassword, 12);

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      role: normalizedRole,
      status: normalizedStatus,
      first_name,
      last_name,
      phone,
      business,
      instagram,
      facebook,
      category,
      portfolio,
      country,
      state,
      city,
    });

    const createdUser = sanitizeUser(user);

    return res.status(201).json({
      success: true,
      message: "User created successfully",
      user: createdUser,
      tempPassword: autoGenerated ? finalPassword : undefined,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Server error" });
  }
};

// ------------------------------------------------------
// UPDATE USER (Admin)
// ------------------------------------------------------
export const updateUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Don't allow password update through this route
    delete updateData.password;
    delete updateData.otp;
    delete updateData.otpExpires;

    const user = await User.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    }).select("-password -otp -otpExpires");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({ success: true, user, message: "User updated successfully" });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Server error" });
  }
};

// ------------------------------------------------------
// DELETE USER (Admin)
// ------------------------------------------------------
export const deleteUser = async (req: any, res: Response) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Prevent deleting yourself
    if (req.user && req.user._id.toString() === id) {
      return res.status(400).json({ 
        success: false, 
        message: "You cannot delete your own account" 
      });
    }

    await moveToRecycleBin("user", user, { deletedBy: req.user?.id });

    res.json({ success: true, message: "User moved to recycle bin" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ------------------------------------------------------
// CHANGE USER ROLE (Admin)
// ------------------------------------------------------
export const changeUserRole = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ 
        success: false, 
      message: "Invalid role. Must be one of: user, member, st-member, manager, admin" 
      });
    }

    // Prevent changing your own role
    if (req.user && req.user._id.toString() === id) {
      return res.status(400).json({ 
        success: false, 
        message: "You cannot change your own role" 
      });
    }

    const user = await User.findByIdAndUpdate(
      id,
      { role },
      { new: true }
    ).select("-password -otp -otpExpires");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({ 
      success: true, 
      user, 
      message: `User role changed to ${role}` 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ------------------------------------------------------
// UPDATE USER STATUS (Admin)
// ------------------------------------------------------
export const updateUserStatus = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be either active or blocked",
      });
    }

    if (req.user && req.user._id.toString() === id) {
      return res.status(400).json({
        success: false,
        message: "You cannot change your own status",
      });
    }

    const user = await User.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    ).select("-password -otp -otpExpires");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({
      success: true,
      user,
      message: status === "blocked" ? "User blocked successfully" : "User unblocked successfully",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ------------------------------------------------------
// GET USER STATS (Admin)
// ------------------------------------------------------
export const getUserStats = async (req: Request, res: Response) => {
  try {
    const totalUsers = await User.countDocuments();
    const adminUsers = await User.countDocuments({ role: "admin" });
    const managerUsers = await User.countDocuments({ role: "manager" });
    const regularUsers = await User.countDocuments({ role: "user" });
    const stMembers = await User.countDocuments({ role: "st-member" });
    const memberUsers = await User.countDocuments({ role: { $in: ["member", "st-member"] } });
    const blockedUsers = await User.countDocuments({ status: "blocked" });
    const activeUsers = await User.countDocuments({ status: "active" });
    const registrationLockedUsers = await User.countDocuments({ status: "registration_locked" });
    
    // Count locked pending registrations
    const lockedPendingRegistrations = await PendingRegistration.countDocuments({ isLocked: true });
    
    // Users registered in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const newUsers = await User.countDocuments({
      createdAt: { $gte: thirtyDaysAgo }
    });

    res.json({
      success: true,
      stats: {
        total: totalUsers,
        admins: adminUsers,
        managers: managerUsers,
        users: regularUsers,
        members: memberUsers,
        stMembers,
        active: activeUsers,
        blocked: blockedUsers,
        registrationLocked: registrationLockedUsers,
        lockedPendingRegistrations,
        newThisMonth: newUsers,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ------------------------------------------------------
// GET LOCKED USERS (Admin) - Both locked pending registrations and registration_locked users
// ------------------------------------------------------
export const getLockedUsers = async (req: Request, res: Response) => {
  try {
    // Get locked pending registrations
    const lockedPendingRegistrations = await PendingRegistration.find({ isLocked: true })
      .select("-password -otp")
      .sort({ lockedAt: -1 });

    // Get users with registration_locked status
    const registrationLockedUsers = await User.find({ status: "registration_locked" })
      .select("-password -otp -otpExpires")
      .sort({ registrationLockedAt: -1 });

    // Combine both into a unified list
    const lockedItems = [
      ...lockedPendingRegistrations.map((pr: any) => ({
        _id: pr._id,
        type: "pending_registration",
        name: pr.name,
        email: pr.email,
        lockedAt: pr.lockedAt,
        lockReason: pr.lockReason || "Too many failed verification attempts",
        verificationAttempts: pr.verificationAttempts,
        createdAt: pr.createdAt,
      })),
      ...registrationLockedUsers.map((u: any) => ({
        _id: u._id,
        type: "user",
        name: u.name,
        email: u.email,
        lockedAt: u.registrationLockedAt,
        lockReason: u.registrationLockReason || "Registration locked",
        createdAt: u.createdAt,
      })),
    ];

    // Sort by lockedAt descending
    lockedItems.sort((a, b) => {
      const dateA = a.lockedAt ? new Date(a.lockedAt).getTime() : 0;
      const dateB = b.lockedAt ? new Date(b.lockedAt).getTime() : 0;
      return dateB - dateA;
    });

    res.json({
      success: true,
      lockedUsers: lockedItems,
      count: lockedItems.length,
    });
  } catch (error: any) {
    console.error("Get locked users error:", error);
    res.status(500).json({ success: false, message: error.message || "Server error" });
  }
};

// ------------------------------------------------------
// UNLOCK USER/PENDING REGISTRATION (Admin)
// ------------------------------------------------------
export const unlockLockedUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { type } = req.body; // "pending_registration" or "user"

    if (!id) {
      return res.status(400).json({ success: false, message: "ID is required" });
    }

    let email = "";
    let name = "";

    if (type === "pending_registration") {
      // Unlock pending registration - just delete it so user can register again
      const pending = await PendingRegistration.findById(id);
      if (!pending) {
        return res.status(404).json({ success: false, message: "Pending registration not found" });
      }

      email = pending.email;
      name = pending.name;

      // Delete the locked pending registration
      await PendingRegistration.findByIdAndDelete(id);
    } else {
      // Unlock user with registration_locked status
      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      email = user.email;
      name = user.name || user.email;

      // Update user status to active
      user.status = "active";
      (user as any).registrationLockedAt = null;
      (user as any).registrationLockReason = null;
      await user.save();
    }

    // Send unlock notification email
    dispatchEmailEvent("auth.account-unlocked", {
      to: email,
      data: {
        user: {
          name,
          email,
        },
      },
    }).catch((err) => console.error("Failed to send unlock notification:", err));

    res.json({
      success: true,
      message: type === "pending_registration" 
        ? "Pending registration unlocked. User can now register again."
        : "User account unlocked successfully.",
    });
  } catch (error: any) {
    console.error("Unlock user error:", error);
    res.status(500).json({ success: false, message: error.message || "Server error" });
  }
};

// ------------------------------------------------------
// ADMIN SET PASSWORD (Admin Only)
// ------------------------------------------------------
export const adminSetPassword = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { password, notifyUser = true } = req.body;

    if (!password) {
      return res.status(400).json({ 
        success: false, 
        message: "Password is required" 
      });
    }

    // Validate password complexity
    const validation = validatePassword(password);
    if (!validation.valid) {
      return res.status(400).json({ 
        success: false, 
        message: validation.message 
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Prevent admin from changing their own password through this route
    if (req.user && req.user._id.toString() === id) {
      return res.status(400).json({ 
        success: false, 
        message: "You cannot change your own password through this route. Use the profile settings instead." 
      });
    }

    // Hash and save new password
    const hashedPassword = await bcrypt.hash(password, 12);
    user.password = hashedPassword;
    
    // Clear any password reset tokens
    (user as any).resetPasswordToken = null;
    (user as any).resetPasswordExpires = null;
    
    // Reset login attempts and locks
    (user as any).loginAttempts = 0;
    (user as any).lockUntil = null;
    
    await user.save();

    // Send notification email if requested
    if (notifyUser) {
      dispatchEmailEvent("admin.password-set", {
        to: user.email,
        data: {
          user: {
            name: user.name || user.email,
            email: user.email,
          },
          admin: {
            name: req.user?.name || "Administrator",
          },
          context: {
            timestamp: new Date().toISOString(),
          },
        },
      }).catch((err) => console.error("Failed to send password set notification:", err));
    }

    res.json({ 
      success: true, 
      message: `Password set successfully for ${user.email}${notifyUser ? ". User has been notified." : ""}` 
    });
  } catch (error: any) {
    console.error("Admin set password error:", error);
    res.status(500).json({ success: false, message: error.message || "Server error" });
  }
};

// ------------------------------------------------------
// ADMIN SEND PASSWORD RESET EMAIL (Admin Only)
// ------------------------------------------------------
export const adminSendPasswordReset = async (req: any, res: Response) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Generate secure reset token
    const resetToken = generateSecureToken();
    const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");

    // Save token to user
    (user as any).resetPasswordToken = hashedToken;
    (user as any).resetPasswordExpires = new Date(Date.now() + RESET_TOKEN_EXPIRY);
    await user.save();

    // Create reset URL
    const resetUrl = `${FRONTEND_BASE_URL}/reset-password?token=${resetToken}&email=${encodeURIComponent(user.email)}`;

    // Send password reset email
    dispatchEmailEvent("admin.password-reset-request", {
      to: user.email,
      data: {
        user: {
          name: user.name || user.email,
          email: user.email,
        },
        admin: {
          name: req.user?.name || "Administrator",
        },
        reset: {
          url: resetUrl,
          expiresIn: "1 hour",
        },
      },
    }).catch((err) => console.error("Failed to send admin password reset:", err));

    res.json({ 
      success: true, 
      message: `Password reset email sent to ${user.email}`,
      expiresIn: "1 hour"
    });
  } catch (error: any) {
    console.error("Admin send password reset error:", error);
    res.status(500).json({ success: false, message: error.message || "Server error" });
  }
};

// ------------------------------------------------------
// ADMIN GENERATE TEMP PASSWORD (Admin Only)
// ------------------------------------------------------
export const adminGenerateTempPassword = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { notifyUser = true } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Prevent admin from changing their own password
    if (req.user && req.user._id.toString() === id) {
      return res.status(400).json({ 
        success: false, 
        message: "You cannot generate a temporary password for yourself" 
      });
    }

    // Generate temporary password
    const tempPassword = generateSecurePassword(12);
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    user.password = hashedPassword;
    
    // Clear any password reset tokens
    (user as any).resetPasswordToken = null;
    (user as any).resetPasswordExpires = null;
    
    // Reset login attempts and locks
    (user as any).loginAttempts = 0;
    (user as any).lockUntil = null;
    
    await user.save();

    // Send notification email with temp password if requested
    if (notifyUser) {
      dispatchEmailEvent("admin.temp-password", {
        to: user.email,
        data: {
          user: {
            name: user.name || user.email,
            email: user.email,
          },
          admin: {
            name: req.user?.name || "Administrator",
          },
          tempPassword,
          context: {
            timestamp: new Date().toISOString(),
          },
        },
      }).catch((err) => console.error("Failed to send temp password notification:", err));
    }

    res.json({ 
      success: true, 
      message: `Temporary password generated for ${user.email}${notifyUser ? ". User has been notified." : ""}`,
      tempPassword: notifyUser ? undefined : tempPassword, // Only return if not notifying user
    });
  } catch (error: any) {
    console.error("Admin generate temp password error:", error);
    res.status(500).json({ success: false, message: error.message || "Server error" });
  }
};
