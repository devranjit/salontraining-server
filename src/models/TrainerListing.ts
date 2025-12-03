import mongoose from "mongoose";

const trainerListingSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Basic Info
    title: { type: String, required: true },
    description: { type: String, required: true },

    // Contact
    email: { type: String, required: true },
    phone: { type: String },
    website: { type: String },

    // Social Links
    facebook: String,
    instagram: String,
    tiktok: String,
    youtube: String,

    // Address / Map
    address: String,
    city: String,
    state: String,
    zip: String,
    country: String,
    coords: {
      lat: Number,
      lng: Number,
    },

    // Categories
    category: {
      type: String,
      enum: ["hair", "makeup", "barber", "nails", "skin", "educator", "other"],
    },

    // Media
    gallery: [
      {
        url: { type: String },
        public_id: { type: String }
      }
    ],
    thumbnail: {
      url: { type: String },
      public_id: { type: String }
    },

    // System Fields
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "changes_requested", "published"],
      default: "pending",
    },

    featured: {
      type: Boolean,
      default: false,
    },

    // Admin feedback when requesting changes
    adminNotes: { type: String },

    // User initiated maintenance
    pendingAction: {
      type: String,
      enum: ["update", "delete"],
    },
    pendingChanges: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    pendingReason: { type: String },
    pendingRequestedAt: { type: Date },
    statusBeforePending: { type: String },

    // Date management
    publishDate: { type: Date },
    expiryDate: { type: Date },

    // View tracking
    views: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Index for efficient queries
trainerListingSchema.index({ status: 1, featured: 1 });
trainerListingSchema.index({ category: 1 });
trainerListingSchema.index({ "coords.lat": 1, "coords.lng": 1 });

export const TrainerListing = mongoose.model("TrainerListing", trainerListingSchema);
