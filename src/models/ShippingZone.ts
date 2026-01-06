import mongoose from "mongoose";

const geoFenceSchema = new mongoose.Schema(
  {
    center: {
      lat: Number,
      lng: Number,
    },
    radiusKm: Number,
  },
  { _id: false }
);

const shippingZoneSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: String,
    priority: { type: Number, default: 0 },
    isDefault: { type: Boolean, default: false },
    countries: [String],
    states: [String],
    cities: [String],
    postalCodes: [String],
    zipPrefixes: [String],
    geoFence: geoFenceSchema,
  },
  { timestamps: true }
);

shippingZoneSchema.index({ priority: -1 });
shippingZoneSchema.index({ isDefault: 1 });

const ShippingZone = mongoose.model("ShippingZone", shippingZoneSchema);
export default ShippingZone;

















































