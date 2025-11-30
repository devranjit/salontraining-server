import { Request, Response } from "express";
import User from "../models/User";

export async function updateProfile(req: any, res: Response) {
  try {
    const userId = req.user._id;

    const fields = {
      first_name: req.body.first_name || "",
      last_name: req.body.last_name || "",
      phone: req.body.phone || "",
      business: req.body.business || "",
      instagram: req.body.instagram || "",
      facebook: req.body.facebook || "",
    };

    const updated = await User.findByIdAndUpdate(userId, fields, { new: true });

    return res.json({
      success: true,
      user: updated,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}
