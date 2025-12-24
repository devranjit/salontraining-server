import mongoose from "mongoose";

const formSubmissionSchema = new mongoose.Schema(
  {
    // Type of form submission
    type: {
      type: String,
      enum: ["contact", "newsletter"],
      required: true,
    },

    // Contact form specific fields
    name: { type: String },
    email: { type: String, required: true },
    phone: { type: String },
    subject: { type: String },
    category: {
      type: String,
      enum: ["general", "support", "partnership", "advertising", "feedback", "other"],
      default: "general",
    },
    message: { type: String },

    // Status tracking
    status: {
      type: String,
      enum: ["new", "read", "replied", "archived", "spam"],
      default: "new",
    },

    // Admin notes for internal tracking
    adminNotes: { type: String },

    // Response tracking
    repliedAt: { type: Date },
    repliedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // Metadata
    ipAddress: { type: String },
    userAgent: { type: String },
    source: { type: String, default: "website" }, // where form was submitted from

    // Newsletter specific
    subscribed: { type: Boolean, default: true }, // for newsletter - allows unsubscribe tracking
    unsubscribedAt: { type: Date },
  },
  { timestamps: true }
);

// Indexes for efficient queries
formSubmissionSchema.index({ type: 1, status: 1 });
formSubmissionSchema.index({ email: 1 });
formSubmissionSchema.index({ createdAt: -1 });
formSubmissionSchema.index({ type: 1, createdAt: -1 });

export const FormSubmission = mongoose.model("FormSubmission", formSubmissionSchema);
























