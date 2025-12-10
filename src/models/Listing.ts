import mongoose from "mongoose";

const listingSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    title: { type: String, required: true },
    description: String,

    email: String,
    phone: String,
    website: String,
    facebook: String,
    instagram: String,
    tiktok: String,
    youtube: String,

    address: String,
    zip: String,

    coords: {
      lat: Number,
      lng: Number,
    },

    gallery: [String],

    featured: {
      type: Boolean,
      default: false,
    },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },

    publishDate: {
      type: Date,
      default: Date.now,
    },

    expiryDate: {
      type: Date,
    },

    isPublished: {
      type: Boolean,
      default: true,
    },

    isExpired: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
)

listingSchema.index({ expiryDate: 1 });
listingSchema.index({ publishDate: 1 });

export const Listing = mongoose.model("Listing", listingSchema);
