import { Request, Response } from "express";
import ProVerification from "../models/ProVerification";

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





