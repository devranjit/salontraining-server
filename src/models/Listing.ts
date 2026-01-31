import mongoose from "mongoose";

const listingSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    listingType: {
      type: String,
      required: true,
      default: "podcast",
    },

    title: { type: String, required: true },
    description: String,
    shortDescription: String,

    coverImage: String,
    hostName: String,
    brandName: String,
    primaryCategory: String,
    secondaryCategory: String,
    targetAudience: String,
    podcastStatus: {
      type: String,
      enum: ["active", "on_break"],
      default: "active",
    },
    frequency: String,
    language: String,
    applePodcastUrl: String,
    spotifyUrl: String,
    podcastLink: String,
    authorType: {
      type: String,
      enum: ["person", "company"],
    },
    authorName: String,
    additionalAuthors: [String],
    contactEmail: String,
    websiteUrl: String,

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
