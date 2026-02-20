import mongoose, { Schema, Document } from "mongoose";

export interface IStMedia extends Document {
  thumbnailType: "image" | "video";
  thumbnailPath: string;
  linkUrl?: string;
  title?: string;
  description?: string;
  date?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const StMediaSchema = new Schema<IStMedia>(
  {
    thumbnailType: {
      type: String,
      enum: ["image", "video"],
      required: true,
    },
    thumbnailPath: {
      type: String,
      required: true,
      trim: true,
    },
    linkUrl: {
      type: String,
      trim: true,
    },
    title: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 300,
    },
    date: {
      type: Date,
    },
  },
  {
    timestamps: true,
    collection: "st_media",
  }
);

StMediaSchema.index({ createdAt: -1 });

export default mongoose.model<IStMedia>("StMedia", StMediaSchema);

