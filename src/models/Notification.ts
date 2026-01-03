import mongoose from "mongoose";

export interface INotification extends mongoose.Document {
  user: mongoose.Types.ObjectId;
  type: string;
  title: string;
  message: string;
  link?: string;
  read: boolean;
  readAt?: Date;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new mongoose.Schema(
  {
    // The user who receives this notification
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Type of notification for categorization and filtering
    type: {
      type: String,
      enum: [
        "listing_approved",
        "listing_rejected",
        "listing_pending",
        "new_submission",
        "new_user",
        "order_placed",
        "order_status",
        "review_received",
        "membership_update",
        "system",
        "admin_alert",
      ],
      required: true,
    },

    // Notification title
    title: {
      type: String,
      required: true,
      maxlength: 200,
    },

    // Notification message/description
    message: {
      type: String,
      required: true,
      maxlength: 500,
    },

    // Optional link to navigate to when clicking notification
    link: {
      type: String,
      default: null,
    },

    // Read status
    read: {
      type: Boolean,
      default: false,
    },

    // When the notification was read
    readAt: {
      type: Date,
      default: null,
    },

    // Additional metadata (e.g., listing ID, order ID, etc.)
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

// Indexes for efficient queries
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, read: 1, createdAt: -1 });
notificationSchema.index({ createdAt: -1 }); // For admin viewing all notifications

// Auto-delete old notifications (keep last 90 days)
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const Notification = mongoose.model<INotification>("Notification", notificationSchema);
