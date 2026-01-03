import { Request, Response } from "express";
import { Notification } from "../models/Notification";
import mongoose from "mongoose";

// Get notifications for the current user
export const getUserNotifications = async (req: any, res: Response) => {
  try {
    const userId = req.user._id;
    const { limit = 20, skip = 0, unreadOnly = false } = req.query;

    const query: any = { user: userId };
    if (unreadOnly === "true") {
      query.read = false;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(Number(skip))
        .limit(Number(limit))
        .lean(),
      Notification.countDocuments(query),
      Notification.countDocuments({ user: userId, read: false }),
    ]);

    return res.json({
      success: true,
      notifications,
      total,
      unreadCount,
    });
  } catch (err) {
    console.error("Get notifications error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch notifications",
    });
  }
};

// Get unread count only (lightweight endpoint for badge)
export const getUnreadCount = async (req: any, res: Response) => {
  try {
    const userId = req.user._id;
    const unreadCount = await Notification.countDocuments({ user: userId, read: false });

    return res.json({
      success: true,
      unreadCount,
    });
  } catch (err) {
    console.error("Get unread count error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch unread count",
    });
  }
};

// Mark a single notification as read
export const markAsRead = async (req: any, res: Response) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const notification = await Notification.findOneAndUpdate(
      { _id: id, user: userId },
      { read: true, readAt: new Date() },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    return res.json({
      success: true,
      notification,
    });
  } catch (err) {
    console.error("Mark as read error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to mark notification as read",
    });
  }
};

// Mark all notifications as read for the user
export const markAllAsRead = async (req: any, res: Response) => {
  try {
    const userId = req.user._id;

    await Notification.updateMany(
      { user: userId, read: false },
      { read: true, readAt: new Date() }
    );

    return res.json({
      success: true,
      message: "All notifications marked as read",
    });
  } catch (err) {
    console.error("Mark all as read error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to mark notifications as read",
    });
  }
};

// Delete a notification
export const deleteNotification = async (req: any, res: Response) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const notification = await Notification.findOneAndDelete({
      _id: id,
      user: userId,
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    return res.json({
      success: true,
      message: "Notification deleted",
    });
  } catch (err) {
    console.error("Delete notification error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to delete notification",
    });
  }
};

// Clear all notifications for the user
export const clearAllNotifications = async (req: any, res: Response) => {
  try {
    const userId = req.user._id;

    await Notification.deleteMany({ user: userId });

    return res.json({
      success: true,
      message: "All notifications cleared",
    });
  } catch (err) {
    console.error("Clear all notifications error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to clear notifications",
    });
  }
};

// ============================================
// ADMIN ENDPOINTS
// ============================================

// Get all notifications (admin view)
export const getAllNotifications = async (req: any, res: Response) => {
  try {
    const { limit = 50, skip = 0, type, userId } = req.query;

    const query: any = {};
    if (type) query.type = type;
    if (userId) query.user = userId;

    const [notifications, total] = await Promise.all([
      Notification.find(query)
        .populate("user", "name email")
        .sort({ createdAt: -1 })
        .skip(Number(skip))
        .limit(Number(limit))
        .lean(),
      Notification.countDocuments(query),
    ]);

    return res.json({
      success: true,
      notifications,
      total,
    });
  } catch (err) {
    console.error("Admin get notifications error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch notifications",
    });
  }
};

// Create a notification (admin/system use)
export const createNotification = async (
  userId: string | mongoose.Types.ObjectId,
  type: string,
  title: string,
  message: string,
  link?: string,
  metadata?: Record<string, any>
) => {
  try {
    const notification = await Notification.create({
      user: userId,
      type,
      title,
      message,
      link,
      metadata,
    });
    return notification;
  } catch (err) {
    console.error("Create notification error:", err);
    return null;
  }
};

// Broadcast notification to multiple users (admin use)
export const broadcastNotification = async (req: any, res: Response) => {
  try {
    const { userIds, type, title, message, link, metadata } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "User IDs array is required",
      });
    }

    if (!type || !title || !message) {
      return res.status(400).json({
        success: false,
        message: "Type, title, and message are required",
      });
    }

    const notifications = userIds.map((userId: string) => ({
      user: userId,
      type,
      title,
      message,
      link,
      metadata,
    }));

    await Notification.insertMany(notifications);

    return res.json({
      success: true,
      message: `Notification sent to ${userIds.length} users`,
    });
  } catch (err) {
    console.error("Broadcast notification error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to broadcast notification",
    });
  }
};

// Send notification to all admins
export const notifyAdmins = async (
  type: string,
  title: string,
  message: string,
  link?: string,
  metadata?: Record<string, any>
) => {
  try {
    const { User } = await import("../models/User");
    const admins = await User.find({ role: { $in: ["admin", "manager"] } }).select("_id");
    
    if (admins.length === 0) return;

    const notifications = admins.map((admin) => ({
      user: admin._id,
      type,
      title,
      message,
      link,
      metadata,
    }));

    await Notification.insertMany(notifications);
  } catch (err) {
    console.error("Notify admins error:", err);
  }
};
