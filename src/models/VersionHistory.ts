import mongoose from "mongoose";

export type EntityType =
  | "trainer"
  | "event"
  | "product"
  | "store-product"
  | "job"
  | "blog"
  | "education"
  | "education-category"
  | "memberVideo"
  | "user"
  | "category"
  | "seekingEmployment"
  | "coupon"
  | "membership-plan"
  | "shipping-zone"
  | "shipping-method"
  | "email-template";

const versionHistorySchema = new mongoose.Schema(
  {
    entityType: {
      type: String,
      required: true,
      index: true,
    },
    entityId: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      index: true,
    },
    collectionName: {
      type: String,
      required: true,
    },
    version: {
      type: Number,
      required: true,
      default: 1,
    },
    snapshot: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    // Store a summary of what changed for quick display
    changeSummary: {
      type: [String],
      default: [],
    },
    // Metadata for quick display without loading full snapshot
    metadata: {
      title: String,
      name: String,
      email: String,
      status: String,
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    changedByName: String,
    changedByEmail: String,
    changeType: {
      type: String,
      enum: ["create", "update", "status_change", "restore"],
      default: "update",
    },
    // If this version was restored, track which version it was restored from
    restoredFromVersion: Number,
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient querying
versionHistorySchema.index({ entityType: 1, entityId: 1, version: -1 });
versionHistorySchema.index({ entityType: 1, createdAt: -1 });
versionHistorySchema.index({ changedBy: 1, createdAt: -1 });

// TTL index - auto-delete versions older than 90 days (configurable)
// Comment out if you want to keep versions indefinitely
// versionHistorySchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const VersionHistory = mongoose.model("VersionHistory", versionHistorySchema);
export default VersionHistory;



