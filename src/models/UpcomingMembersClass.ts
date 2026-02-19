import mongoose from "mongoose";

function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

const upcomingMembersClassSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    slug: { type: String, unique: true, sparse: true },

    description: { type: String },
    trainer_name: { type: String },

    thumbnail_image: {
      url: { type: String },
      public_id: { type: String },
    },

    class_date: { type: String },
    class_time: { type: String },
    timezone: { type: String },
    duration_minutes: { type: Number },

    join_url: { type: String },

    status: {
      type: String,
      enum: ["draft", "published", "trashed"],
      default: "draft",
    },
    position: { type: Number, default: 0 },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // Legacy fields preserved for backward compatibility with older documents
    thumbnail: { url: { type: String }, public_id: { type: String } },
    gallery: [{ url: { type: String }, public_id: { type: String } }],
    registrationUrl: { type: String },
    zoomLink: { type: String },
    classDate: { type: Date },
    classEndDate: { type: Date },
    startTime: { type: String },
    endTime: { type: String },
    duration: { type: String },
    price: { type: Number },
    currency: { type: String, default: "USD" },
    priceNote: { type: String },
    category: { type: String },
    tags: [{ type: String }],
    instructor: { type: String },
    videoUrl: { type: String },
    isActive: { type: Boolean },
    sortOrder: { type: Number },
  },
  {
    timestamps: true,
    strict: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

upcomingMembersClassSchema.index({ status: 1, position: 1 });
upcomingMembersClassSchema.index({ slug: 1 });
upcomingMembersClassSchema.index({ createdAt: -1 });

upcomingMembersClassSchema.pre("save", function (next) {
  if (!this.slug && this.title) {
    this.slug = slugify(this.title) + "-" + Date.now().toString(36);
  }
  next();
});

export const UpcomingMembersClass = mongoose.model(
  "UpcomingMembersClass",
  upcomingMembersClassSchema
);
export default UpcomingMembersClass;
