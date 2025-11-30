import mongoose from "mongoose";

const variationOptionSchema = new mongoose.Schema({
  name: { type: String, required: true },       // e.g. "Large"
  price: { type: Number, default: 0 },          // price override (optional)
  stock: { type: Number, default: 0 },          // stock per variant
});

const variationSchema = new mongoose.Schema({
  label: { type: String, required: true },      // e.g. "Size"
  options: [variationOptionSchema],
});

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },

    description: { type: String, default: "" },

    price: { type: Number, required: true },     // base price

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },

    images: [String],                            // array of image URLs

    // Variation system
    variations: [variationSchema],

    stock: { type: Number, default: 0 },         // general stock

    status: {
      type: String,
      enum: ["draft", "published"],
      default: "draft",
    },

    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Product", productSchema);
export const Product = mongoose.model("Product", productSchema);
