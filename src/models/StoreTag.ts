import mongoose from "mongoose";

const storeTagSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
  },
  { timestamps: true }
);

const StoreTag =
  mongoose.models.StoreTag || mongoose.model("StoreTag", storeTagSchema);

export default StoreTag;















