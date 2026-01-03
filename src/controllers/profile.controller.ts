import { Response } from "express";
import User from "../models/User";

export async function updateProfile(req: any, res: Response) {
  try {
    const userId = req.user._id || req.user.id;

    // Build update object with only defined fields
    const allowedFields = [
      "first_name", "last_name", "phone", "business", 
      "instagram", "facebook", "category", "portfolio",
      "country", "state", "city", "avatar"
    ];

    const fields: Record<string, any> = {};
    for (const field of allowedFields) {
      const value = req.body[field];
      if (value !== undefined) {
        fields[field] = typeof value === "string" ? value.trim() : value;
      }
    }

    const updated = await User.findByIdAndUpdate(userId, fields, { 
      new: true,
      select: "-password -otp -otpExpires -resetPasswordToken -resetPasswordExpires"
    });

    if (!updated) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.json({
      success: true,
      user: updated,
    });
  } catch (err) {
    console.error("Update profile error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}
