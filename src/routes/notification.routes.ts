import express from "express";
import { protect, adminOnly, managerOrAdmin } from "../middleware/auth";
import {
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearAllNotifications,
  getAllNotifications,
  broadcastNotification,
} from "../controllers/notification.controller";

const router = express.Router();

// ============================================
// USER ROUTES (authenticated)
// ============================================

// Get notifications for current user
router.get("/", protect, getUserNotifications);

// Get unread count (for badge)
router.get("/unread-count", protect, getUnreadCount);

// Mark a specific notification as read
router.patch("/:id/read", protect, markAsRead);

// Mark all notifications as read
router.patch("/read-all", protect, markAllAsRead);

// Delete a specific notification
router.delete("/:id", protect, deleteNotification);

// Clear all notifications
router.delete("/", protect, clearAllNotifications);

// ============================================
// ADMIN ROUTES
// ============================================

// Get all notifications (admin view)
router.get("/admin/all", protect, managerOrAdmin, getAllNotifications);

// Broadcast notification to multiple users
router.post("/admin/broadcast", protect, adminOnly, broadcastNotification);

export default router;
