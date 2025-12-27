import mongoose from "mongoose";

const educationCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    description: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const EducationCategory = mongoose.model("EducationCategory", educationCategorySchema);








