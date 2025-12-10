import mongoose from "mongoose";

const jobSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Basic Info
    title: { type: String, required: true },
    description: { type: String, required: true },
    companyName: { type: String },

    // Job Details
    jobType: {
      type: String,
      enum: ["full-time", "part-time", "contract", "temporary", "internship", "freelance", "other"],
      default: "full-time",
    },
    experienceLevel: {
      type: String,
      enum: ["entry", "mid", "senior", "lead", "executive"],
    },
    requirements: { type: String },
    qualifications: { type: String },
    responsibilities: { type: String },
    benefits: { type: String },

    // Compensation
    salary: { type: String }, // e.g., "$50k-$70k" or "$25/hr"
    salaryMin: { type: Number },
    salaryMax: { type: Number },
    salaryType: {
      type: String,
      enum: ["hourly", "yearly", "monthly", "project"],
      default: "yearly",
    },

    // Contact & Application
    email: { type: String }, // optional email
    phone: { type: String },
    website: { type: String },
    applyUrl: { type: String },

    // Social Links
    facebook: String,
    instagram: String,
    twitter: String,
    linkedin: String,

    // Location
    address: String,
    city: String,
    state: String,
    zip: String,
    country: String,
    coords: {
      lat: Number,
      lng: Number,
    },
    remote: { type: Boolean, default: false },
    hybrid: { type: Boolean, default: false },

    // Categories & Tags
    category: {
      type: String,
      enum: ["hair", "makeup", "barber", "nails", "skin", "management", "reception", "education", "sales", "other"],
    },
    tags: [String],

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

    // Additional Info
    specialOffers: { type: String },
    videoUrl: { type: String },

    // Application deadline
    deadline: { type: Date },

    // System Fields
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "changes_requested", "published", "expired", "filled"],
      default: "pending",
    },

    featured: {
      type: Boolean,
      default: false,
    },

    // Admin feedback
    adminNotes: { type: String },
    publishDate: { type: Date },
    expiryDate: { type: Date },

    // Stats
    views: { type: Number, default: 0 },
    applications: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Indexes for efficient queries
jobSchema.index({ status: 1, featured: 1 });
jobSchema.index({ category: 1 });
jobSchema.index({ jobType: 1 });
jobSchema.index({ city: 1, state: 1 });
jobSchema.index({ "coords.lat": 1, "coords.lng": 1 });
jobSchema.index({ deadline: 1 });
jobSchema.index({ owner: 1 });

export const Job = mongoose.model("Job", jobSchema);
export default Job;





















