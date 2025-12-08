import mongoose from "mongoose";

const analyticsSnapshotSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true, unique: true },
    visitors: { type: Number, default: 0 },
    uniqueVisitors: { type: Number, default: 0 },
    topLocations: [
      {
        label: String,
        value: Number,
      },
    ],
    topPages: [
      {
        label: String,
        value: Number,
      },
    ],
    trafficSources: [
      {
        label: String,
        value: Number,
      },
    ],
    devices: [
      {
        label: String,
        value: Number,
      },
    ],
    seoScore: { type: Number, default: 0 },
    seoNotes: { type: String, default: "" },
    listingsCreated: { type: Number, default: 0 },
    listingsApproved: { type: Number, default: 0 },
    listingsRejected: { type: Number, default: 0 },
  },
  { timestamps: true }
);

analyticsSnapshotSchema.index({ date: -1 });

export const AnalyticsSnapshot = mongoose.model(
  "AnalyticsSnapshot",
  analyticsSnapshotSchema
);

export default AnalyticsSnapshot;









