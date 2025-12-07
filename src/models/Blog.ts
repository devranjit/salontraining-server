import mongoose from "mongoose";

const blogSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Basic Info
    title: { type: String, required: true },
    slug: { type: String, unique: true, sparse: true },
    content: { type: String, required: true },
    excerpt: { type: String }, // Short description/summary

    // Categories & Tags
    category: {
      type: String,
      enum: ["hair", "makeup", "skincare", "nails", "business", "trends", "tutorials", "industry_news", "other"],
      default: "other",
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

    // Author Info (for display purposes)
    authorName: { type: String },
    authorBio: { type: String },
    authorImage: { type: String },

    // System Fields
    status: {
      type: String,
      enum: ["draft", "pending", "approved", "rejected", "changes_requested", "published"],
      default: "pending",
    },

    featured: {
      type: Boolean,
      default: false,
    },

    // Admin feedback
    adminNotes: { type: String },

    // Publish scheduling
    publishDate: { type: Date },

    // Stats
    views: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },

    // SEO
    seoTitle: { type: String },
    seoDescription: { type: String },
    seoKeywords: [String],

    // Reading time (in minutes)
    readingTime: { type: Number },
  },
  { timestamps: true }
);

// Pre-save hook to generate slug
blogSchema.pre("save", function (next) {
  if (this.isModified("title") && !this.slug) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      + "-" + Date.now().toString(36);
  }
  
  // Calculate reading time (average 200 words per minute)
  if (this.isModified("content")) {
    const wordCount = this.content.split(/\s+/).length;
    this.readingTime = Math.ceil(wordCount / 200);
  }
  
  next();
});

// Indexes for efficient queries
blogSchema.index({ status: 1, featured: 1 });
blogSchema.index({ category: 1 });
blogSchema.index({ tags: 1 });
blogSchema.index({ createdAt: -1 });
blogSchema.index({ slug: 1 });

export const Blog = mongoose.model("Blog", blogSchema);


















