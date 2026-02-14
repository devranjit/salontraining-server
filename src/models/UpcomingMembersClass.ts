import mongoose from "mongoose";

const upcomingMembersClassSchema = new mongoose.Schema(
  {
    // Required fields
    title: { type: String, required: true },
    thumbnail: {
      url: { type: String },
      public_id: { type: String },
    },
    gallery: [
      {
        url: { type: String },
        public_id: { type: String },
      },
    ],

    // Optional fields
    description: { type: String },
    registrationUrl: { type: String },
    zoomLink: { type: String },

    // Schedule
    classDate: { type: Date },
    classEndDate: { type: Date },
    startTime: { type: String },
    endTime: { type: String },
    duration: { type: String },

    // Pricing
    price: { type: Number },
    currency: { type: String, default: "USD" },
    priceNote: { type: String },

    // Extra optional
    category: { type: String },
    tags: [{ type: String }],
    instructor: { type: String },
    videoUrl: { type: String },

    // Admin controls
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },

    // Created by (admin who added it)
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

upcomingMembersClassSchema.index({ isActive: 1, sortOrder: 1 });
upcomingMembersClassSchema.index({ classDate: 1 });
upcomingMembersClassSchema.index({ createdAt: -1 });

export const UpcomingMembersClass = mongoose.model(
  "UpcomingMembersClass",
  upcomingMembersClassSchema
);
export default UpcomingMembersClass;
