import mongoose from "mongoose";

// Helper function to generate slug from title
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Replace multiple hyphens with single
    .replace(/(^-|-$)/g, ""); // Remove leading/trailing hyphens
}

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
    slug: { type: String, unique: true, sparse: true },
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
listingSchema.index({ slug: 1 });

// Pre-save hook to auto-generate slug from title
listingSchema.pre("save", async function (next) {
  try {
    if (this.isNew || this.isModified("title")) {
      const base = generateSlug(this.title || "podcast");
      let slug = base;
      let counter = 1;

      // Ensure uniqueness
      while (true) {
        const existing = await mongoose
          .model("Listing")
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

export const Listing = mongoose.model("Listing", listingSchema);
