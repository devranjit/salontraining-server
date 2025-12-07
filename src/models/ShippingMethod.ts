import mongoose from "mongoose";

const shippingRateSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    code: String,
    zone: { type: mongoose.Schema.Types.ObjectId, ref: "ShippingZone" },
    type: {
      type: String,
      enum: ["flat", "per_item", "per_weight", "local_pickup"],
      default: "flat",
    },
    baseCost: { type: Number, default: 0 },
    perItemCost: { type: Number, default: 0 },
    perWeightKgCost: { type: Number, default: 0 },
    handlingFee: { type: Number, default: 0 },
    minSubtotal: Number,
    maxSubtotal: Number,
    freeAbove: Number,
    minDistanceKm: Number,
    maxDistanceKm: Number,
    enableForDigital: { type: Boolean, default: false },
    allowPickup: { type: Boolean, default: false },
  },
  { _id: true }
);

const shippingMethodSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, unique: true },
    description: String,
    type: {
      type: String,
      enum: ["flat_rate", "local_pickup", "carrier", "custom"],
      default: "flat_rate",
    },
    status: {
      type: String,
      enum: ["active", "disabled"],
      default: "active",
    },
    currency: { type: String, default: "USD" },
    defaultCost: { type: Number, default: 0 },
    handlingFee: { type: Number, default: 0 },
    allowDigitalProducts: { type: Boolean, default: false },
    allowPhysicalProducts: { type: Boolean, default: true },
    estimatedDaysMin: Number,
    estimatedDaysMax: Number,
    displayOrder: { type: Number, default: 0 },
    icon: String,
    instructions: String,
    notes: String,
    rates: [shippingRateSchema],
  },
  { timestamps: true }
);

shippingMethodSchema.pre("save", function (next) {
  if (this.isModified("name") || !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 50);
  }
  next();
});

shippingMethodSchema.index({ status: 1, displayOrder: 1 });

const ShippingMethod = mongoose.model("ShippingMethod", shippingMethodSchema);
export default ShippingMethod;




