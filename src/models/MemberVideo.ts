import mongoose, { Schema, Document } from "mongoose";

export interface IMemberVideo extends Document {
  title: string;
  description?: string;
  youtubeUrl: string;
  youtubeId: string;
  thumbnail?: string;
  trainer?: {
    name: string;
    title?: string;
    avatar?: string;
  };
  category?: string;
  tags?: string[];
  duration?: string;
  order: number;
  featured: boolean;
  status: "draft" | "published";
  publishDate?: Date;
  views: number;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const MemberVideoSchema = new Schema<IMemberVideo>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    youtubeUrl: {
      type: String,
      required: true,
    },
    youtubeId: {
      type: String,
      required: true,
    },
    thumbnail: {
      type: String,
    },
    trainer: {
      name: String,
      title: String,
      avatar: String,
    },
    category: {
      type: String,
      trim: true,
    },
    tags: [String],
    duration: String,
    order: {
      type: Number,
      default: 0,
    },
    featured: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "published",
    },
    publishDate: Date,
    views: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
MemberVideoSchema.index({ status: 1, order: 1 });
MemberVideoSchema.index({ category: 1 });
MemberVideoSchema.index({ featured: 1 });

export default mongoose.model<IMemberVideo>("MemberVideo", MemberVideoSchema);

































