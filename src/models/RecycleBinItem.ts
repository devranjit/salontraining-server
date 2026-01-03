import mongoose from "mongoose";

const recycleBinSchema = new mongoose.Schema(
  {
    entityType: { type: String, required: true },
    entityId: { type: mongoose.Schema.Types.Mixed, required: true },
    collectionName: { type: String, required: true },
    snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    metadata: { type: mongoose.Schema.Types.Mixed },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    deletedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    restoredAt: { type: Date },
    permanentlyDeletedAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

recycleBinSchema.index({ expiresAt: 1 });
recycleBinSchema.index({ entityType: 1, deletedAt: -1 });

export const RecycleBinItem = mongoose.model(
  "RecycleBinItem",
  recycleBinSchema
);
export default RecycleBinItem;














































