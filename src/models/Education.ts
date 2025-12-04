import mongoose from "mongoose";

// Education types: virtual-class, in-person, pre-recorded
const educationSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    
    // Type of education listing
    educationType: {
      type: String,
      enum: ["virtual-class", "in-person", "pre-recorded"],
      required: true,
    },

    // Basic Information
    title: { type: String, required: true },
    description: { type: String, required: true },
    
    // Category & Tags
    category: { type: String },
    tags: [{ type: String }],

    // Contact Information
    email: { type: String, required: true },
    phone: { type: String },
    website: { type: String },
    
    // Social Links
    facebook: { type: String },
    instagram: { type: String },
    twitter: { type: String },
    tiktok: { type: String },
    youtube: { type: String },

    // Class Details
    classFormat: {
      type: String,
      enum: ["live", "pre-recorded", "hybrid"],
      default: "live",
    },
    byAppointment: { type: String },
    
    // Schedule (for live/hybrid classes)
    classDate: { type: Date },
    startTime: { type: String },
    endTime: { type: String },
    duration: { type: String }, // e.g., "2 hours", "3 days"
    
    // Pricing
    price: { type: Number },
    currency: { type: String, default: "USD" },
    priceNote: { type: String }, // e.g., "per person", "early bird discount"

    // Level & Language
    difficulty: {
      type: String,
      enum: ["Beginner", "Intermediate", "Advanced", "All Levels"],
      default: "All Levels",
    },
    language: { type: String, default: "English" },

    // Location (for in-person classes)
    address: { type: String },
    city: { type: String },
    state: { type: String },
    zip: { type: String },
    country: { type: String },
    coords: {
      lat: { type: Number },
      lng: { type: Number },
    },

    // Registration & Resources
    registrationUrl: { type: String },
    zoomLink: { type: String },
    resource1: { type: String },
    resource2: { type: String },
    
    // Media
    videoUrl: { type: String },
    embedHtml: { type: String },
    gallery: [
      {
        url: { type: String },
        public_id: { type: String },
      },
    ],
    thumbnail: {
      url: { type: String },
      public_id: { type: String },
    },

    // Additional Info
    specialOffers: { type: String },
    maxAttendees: { type: Number },
    prerequisites: { type: String },
    whatYouWillLearn: { type: String },
    materialsIncluded: { type: String },
    certificationOffered: { type: Boolean, default: false },

    // Admin & Status
    status: {
      type: String,
      enum: ["draft", "pending", "approved", "rejected", "changes_requested", "published"],
      default: "pending",
    },
    featured: { type: Boolean, default: false },
    adminNotes: { type: String },
    views: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Indexes for efficient querying
educationSchema.index({ status: 1, featured: 1 });
educationSchema.index({ educationType: 1 });
educationSchema.index({ category: 1 });
educationSchema.index({ "coords.lat": 1, "coords.lng": 1 });
educationSchema.index({ city: 1, state: 1 });
educationSchema.index({ classDate: 1 });
educationSchema.index({ difficulty: 1 });
educationSchema.index({ price: 1 });

export const Education = mongoose.model("Education", educationSchema);









