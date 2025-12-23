import { Request, Response } from "express";
import ProVerification from "../models/ProVerification";
import User from "../models/User";

type AuthRequest = Request & { user?: any };

export const submitProVerification = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const { name, license, phone, salonOrSchool } = req.body as {
      name?: string;
      license?: string;
      phone?: string;
      salonOrSchool?: string;
    };

    if (!name || !license) {
      return res.status(400).json({ success: false, message: "Name and license are required" });
    }

    const existing = await ProVerification.findOne({ user: req.user._id });

    if (existing && existing.status === "approved") {
      return res.json({ success: true, status: "approved", verification: existing });
    }

    if (existing && existing.status === "pending") {
      return res.json({
        success: true,
        status: "pending",
        verification: existing,
        message: "Your verification is already pending review.",
      });
    }

    // If rejected or not existing, (re)create as pending
    const verification =
      existing ??
      new ProVerification({
        user: req.user._id,
      });

    verification.name = name.trim();
    verification.license = license.trim();
    verification.phone = (phone || "").trim();
    verification.salonOrSchool = (salonOrSchool || "").trim();
    verification.status = "pending";
    verification.reviewedBy = null;
    verification.reviewedAt = null;
    verification.notes = "";

    await verification.save();

    return res.json({
      success: true,
      status: verification.status,
      verification,
      message: "Verification submitted. We will review it shortly.",
    });
  } catch (error) {
    console.error("submitProVerification error:", error);
    return res.status(500).json({ success: false, message: "Failed to submit verification" });
  }
};

export const getMyProVerification = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const verification = await ProVerification.findOne({ user: req.user._id });

    return res.json({
      success: true,
      status: verification?.status || "none",
      verification,
    });
  } catch (error) {
    console.error("getMyProVerification error:", error);
    return res.status(500).json({ success: false, message: "Failed to load verification status" });
  }
};

export const listProVerifications = async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.query;
    const query: Record<string, unknown> = {};
    if (status && typeof status === "string") {
      query.status = status;
    }

    const verifications = await ProVerification.find(query)
      .populate("user", "name email role status")
      .populate("reviewedBy", "name email role")
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ success: true, verifications });
  } catch (error) {
    console.error("listProVerifications error:", error);
    return res.status(500).json({ success: false, message: "Failed to load verifications" });
  }
};

export const updateProVerificationStatus = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const { id } = req.params;
    const { status, notes } = req.body as { status?: string; notes?: string };

    if (!status || !["approved", "rejected", "pending"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    const verification = await ProVerification.findById(id);
    if (!verification) {
      return res.status(404).json({ success: false, message: "Verification not found" });
    }

    verification.status = status as any;
    verification.reviewedBy = req.user._id;
    verification.reviewedAt = new Date();
    if (typeof notes === "string") {
      verification.notes = notes;
    }

    await verification.save();

    return res.json({ success: true, verification });
  } catch (error) {
    console.error("updateProVerificationStatus error:", error);
    return res.status(500).json({ success: false, message: "Failed to update verification" });
  }
};

export const deleteProVerification = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const { id } = req.params;
    const deleted = await ProVerification.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Verification not found" });
    }

    return res.json({ success: true, deleted: { _id: deleted._id } });
  } catch (error) {
    console.error("deleteProVerification error:", error);
    return res.status(500).json({ success: false, message: "Failed to delete verification" });
  }
};

export const adminSearchUsersForProVerification = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const q = (req.query.q as string | undefined)?.trim() || "";
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);

    const search: Record<string, unknown> = {};
    if (q) {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      search.$or = [{ name: regex }, { email: regex }, { phone: regex }];
    }

    const users = await User.find(search)
      .sort({ createdAt: -1 })
      .limit(limit)
      .select("name email phone business first_name last_name role status createdAt");

    const userIds = users.map((u) => u._id);
    const verifications = await ProVerification.find({ user: { $in: userIds } }).select("user status reviewedAt");
    const verificationMap = new Map<string, { status: string; reviewedAt: Date | null }>();
    verifications.forEach((v) => {
      verificationMap.set(String(v.user), { status: v.status, reviewedAt: v.reviewedAt });
    });

    return res.json({
      success: true,
      users: users.map((u) => ({
        _id: u._id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        business: u.business,
        first_name: (u as any).first_name,
        last_name: (u as any).last_name,
        role: u.role,
        status: u.status,
        createdAt: u.createdAt,
        verification: verificationMap.get(String(u._id)) || null,
      })),
    });
  } catch (error) {
    console.error("adminSearchUsersForProVerification error:", error);
    return res.status(500).json({ success: false, message: "Failed to search users" });
  }
};

export const adminApproveUserForProVerification = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const { userId, name, license, phone, salonOrSchool, notes } = req.body as {
      userId?: string;
      name?: string;
      license?: string;
      phone?: string;
      salonOrSchool?: string;
      notes?: string;
    };

    if (!userId) {
      return res.status(400).json({ success: false, message: "userId is required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const existing = await ProVerification.findOne({ user: userId });
    const verification = existing ?? new ProVerification({ user: userId });

    const resolvedName =
      (name || user.name || `${(user as any).first_name || ""} ${(user as any).last_name || ""}`).trim() ||
      "Admin Approved";
    const resolvedLicense = (license || "ADMIN-MANUAL-APPROVAL").trim();

    verification.name = resolvedName;
    verification.license = resolvedLicense;
    verification.phone = (phone || (user as any).phone || "").trim();
    verification.salonOrSchool = (salonOrSchool || (user as any).business || "").trim();
    verification.status = "approved";
    verification.reviewedBy = req.user._id;
    verification.reviewedAt = new Date();
    if (typeof notes === "string") {
      verification.notes = notes;
    }

    await verification.save();

    return res.json({
      success: true,
      verification,
      message: `User ${user.email} approved for ST Shop purchases.`,
    });
  } catch (error) {
    console.error("adminApproveUserForProVerification error:", error);
    return res.status(500).json({ success: false, message: "Failed to approve user" });
  }
};










