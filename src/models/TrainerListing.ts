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
    zip: String,
    coords: {
      lat: Number,
      lng: Number,
    },

    // Media
gallery: [
  {
    url: { type: String, required: true },
    public_id: { type: String, required: true }
  }
],



    // System Fields
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },

    featured: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export const TrainerListing = mongoose.model("TrainerListing", trainerListingSchema);
