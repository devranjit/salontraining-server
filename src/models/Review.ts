import mongoose from "mongoose";

export const REVIEW_TARGETS = [
  "trainer",
  "event",
  "product",
  "job",
  "education",
  "virtual-class",
  "in-person",
  "blog",
] as const;

export type ReviewTarget = (typeof REVIEW_TARGETS)[number];

const reviewSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    listingType: {
      type: String,
      enum: REVIEW_TARGETS,
      required: true,
    },

    listingId: {
      type: String,
      required: true,
      trim: true,
    },

    listingTitleSnapshot: { type: String, trim: true },
    listingUrl: { type: String, trim: true },
    listingOwner: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },

    review: {
      type: String,
      required: true,
      trim: true,
    },

    status: {
      type: String,
      enum: ["pending", "approved", "changes_requested", "rejected", "archived"],
      default: "pending",
    },

    adminNotes: { type: String },
    changeRequestMessage: { type: String },
    adminDecisionBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    approvedAt: { type: Date },

    lastSubmittedAt: { type: Date, default: Date.now },

    userSnapshot: {
      name: { type: String },
      email: { type: String },
    },
  },
  { timestamps: true }
);

reviewSchema.index({ listingType: 1, listingId: 1, status: 1 });
reviewSchema.index({ user: 1, listingType: 1, listingId: 1 }, { unique: true });
reviewSchema.index({ status: 1, updatedAt: -1 });

const Review = mongoose.models.Review || mongoose.model("Review", reviewSchema);
export default Review;




