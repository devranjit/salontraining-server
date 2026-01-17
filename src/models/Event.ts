import mongoose from "mongoose";

// Helper to generate a URL-friendly slug
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 100);
}

const eventSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Type: Show or Event (combined)
    eventType: {
      type: String,
      enum: ["show", "event"],
      default: "event",
      required: true,
    },

    // Basic Info
    title: { type: String, required: true },
    description: { type: String, required: true },

    // Contact (all optional)
    email: { type: String },
    phone: { type: String },
    website: { type: String },

    // Social Links
    facebook: String,
    instagram: String,
    twitter: String,
    tiktok: String,
    youtube: String,
    videoUrl: String,

    // Event Date & Time
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    allDay: { type: Boolean, default: false },
    startTime: { type: String }, // e.g., "10:00 AM"
    endTime: { type: String },   // e.g., "6:00 PM"

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
    venue: String, // Venue name

    // Categories & Tags
    category: {
      type: String,
      trim: true,
      default: "",
    },
    tags: {
      type: [String],
      default: [],
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

    // Additional Info
    specialOffers: { type: String },
    ticketUrl: { type: String },
    ticketPrice: { type: String },
    capacity: { type: Number },

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

    // Admin feedback
    adminNotes: { type: String },

    // View tracking
    views: { type: Number, default: 0 },

    // SEO slug
    slug: { type: String, index: true, unique: true, sparse: true },
  },
  { timestamps: true }
);

// Indexes for efficient queries
eventSchema.index({ eventType: 1, status: 1, featured: 1 });
eventSchema.index({ startDate: 1 });
eventSchema.index({ category: 1 });
eventSchema.index({ "coords.lat": 1, "coords.lng": 1 });
eventSchema.index({ city: 1, state: 1 });

// Pre-save slug generation
eventSchema.pre("save", async function (next) {
  try {
    if (this.isNew || this.isModified("title")) {
      const base = generateSlug(this.title || "event");
      let slug = base;
      let counter = 1;

      while (true) {
        const existing = await mongoose
          .model("Event")
          .findOne({ slug, _id: { $ne: this._id } });
        if (!existing) break;
        slug = `${base}-${counter}`;
        counter += 1;
      }

      this.slug = slug;
    }
    next();
  } catch (err) {
    next(err as any);
  }
});

export const Event = mongoose.model("Event", eventSchema);
