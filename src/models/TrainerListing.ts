import mongoose from "mongoose";

// Helper function to generate slug from title
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-')     // Replace spaces with hyphens
    .replace(/-+/g, '-')      // Replace multiple hyphens with single
    .substring(0, 100);       // Limit length
}

const trainerListingSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Basic Info
    title: { type: String, required: true },
    slug: { type: String, unique: true, sparse: true },
    description: { type: String, default: "" },

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

    // Categories (free-form, type-ahead)
    category: {
      type: String,
      trim: true,
      default: "",
    },

    // Tags (max 5 enforced in controller)
    tags: {
      type: [String],
      default: [],
    },

    // Media
    gallery: [
      {
        url: { type: String },
        public_id: { type: String },
        altText: { type: String },
      }
    ],
    thumbnail: {
      url: { type: String },
      public_id: { type: String },
      altText: { type: String },
    },

    // SEO (optional)
    metaTitle: { type: String },
    metaDescription: { type: String },
    imageAltText: { type: String },

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

// Pre-save hook to auto-generate slug from title
trainerListingSchema.pre('save', async function(next) {
  if (this.isNew || this.isModified('title')) {
    let baseSlug = generateSlug(this.title);
    let slug = baseSlug;
    let counter = 1;
    
    // Check for existing slugs and make unique
    while (true) {
      const existing = await mongoose.model('TrainerListing').findOne({ 
        slug, 
        _id: { $ne: this._id } 
      });
      if (!existing) break;
      slug = `${baseSlug}-${counter}`;
      counter++;
    }
    
    this.slug = slug;
  }
  next();
});

// Index for efficient queries
trainerListingSchema.index({ status: 1, featured: 1 });
trainerListingSchema.index({ status: 1 }); // For dashboard count queries
trainerListingSchema.index({ category: 1 });
trainerListingSchema.index({ slug: 1 });
trainerListingSchema.index({ "coords.lat": 1, "coords.lng": 1 });
trainerListingSchema.index({ createdAt: -1 }); // For sorting by recent
trainerListingSchema.index({ owner: 1, status: 1 }); // For user dashboard queries
trainerListingSchema.index({ featured: 1 }); // For featured trainer queries

export const TrainerListing = mongoose.model("TrainerListing", trainerListingSchema);
