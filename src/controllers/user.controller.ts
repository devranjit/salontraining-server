import { Request, Response } from "express";
import User from "../models/User";

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
export const deleteUser = async (req: Request, res: Response) => {
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

    await User.findByIdAndDelete(id);

    res.json({ success: true, message: "User deleted successfully" });
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

    if (!["user", "admin"].includes(role)) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid role. Must be 'user' or 'admin'" 
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
// GET USER STATS (Admin)
// ------------------------------------------------------
export const getUserStats = async (req: Request, res: Response) => {
  try {
    const totalUsers = await User.countDocuments();
    const adminUsers = await User.countDocuments({ role: "admin" });
    const regularUsers = await User.countDocuments({ role: "user" });
    
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
        users: regularUsers,
        newThisMonth: newUsers,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};
