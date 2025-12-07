import mongoose, { Document, Schema } from "mongoose";

type VariationSelection = {
  label: string;
  optionName: string;
  priceAdjustment?: number;
};

type ShippingHistory = {
  status: string;
  note?: string;
  createdAt?: Date;
  createdBy?: mongoose.Types.ObjectId;
};

type ShippingAddress = {
  fullName: string;
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode?: string;
  country?: string;
  phone?: string;
};

export interface IOrderItem {
  product: mongoose.Types.ObjectId;
  owner?: mongoose.Types.ObjectId;
  name: string;
  slug?: string;
  sku?: string;
  image?: string;
  productType?: string;
  productFormat: "physical" | "digital";
  quantity: number;
  unitPrice: number;
  subtotal: number;
  selectedVariations?: VariationSelection[];
  downloadUrl?: string;
}

export interface IOrder extends Document {
  orderNumber: string;
  user: mongoose.Types.ObjectId;
  items: IOrderItem[];
  itemsTotal: number;
  shippingCost: number;
  taxTotal: number;
  discountTotal: number;
  grandTotal: number;
  paymentStatus: "pending" | "awaiting_payment" | "paid" | "failed" | "refunded" | "partial";
  fulfillmentStatus: "pending" | "processing" | "ready_to_ship" | "shipped" | "delivered" | "cancelled" | "refunded";
  shippingStatus: "not_required" | "pending" | "label_created" | "in_transit" | "delivered" | "returned" | "cancelled";
  shippingAddress?: ShippingAddress;
  shippingMethod?: string;
  shippingMethodId?: string;
  shippingRateId?: string;
  shippingOptionLabel?: string;
  shippingQuoteSnapshot?: Record<string, any>;
  shippingTracking?: {
    carrier?: string;
    trackingNumber?: string;
    estimatedDelivery?: Date;
    shippedAt?: Date;
    deliveredAt?: Date;
  };
  shippingTimeline: ShippingHistory[];
  payment: {
    method: string;
    status: string;
    transactionId?: string;
    provider?: string;
    paidAt?: Date;
    stripeSessionId?: string;
    stripePaymentIntentId?: string;
  };
  contactEmail?: string;
  contactPhone?: string;
  notes?: string;
  couponCode?: string;
  refund: {
    status: "none" | "requested" | "approved" | "rejected" | "processed";
    reason?: string;
    amount?: number;
    requestedAt?: Date;
    processedAt?: Date;
    processedBy?: mongoose.Types.ObjectId;
    resolutionNote?: string;
  };
}

const variationSelectionSchema = new Schema<VariationSelection>(
  {
    label: String,
    optionName: String,
    priceAdjustment: { type: Number, default: 0 },
  },
  { _id: false }
);

const orderItemSchema = new Schema<IOrderItem>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    owner: { type: Schema.Types.ObjectId, ref: "User" },
    name: { type: String, required: true },
    slug: String,
    sku: String,
    image: String,
    productType: String,
    productFormat: {
      type: String,
      enum: ["physical", "digital"],
      default: "physical",
    },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true },
    subtotal: { type: Number, required: true },
    selectedVariations: [variationSelectionSchema],
    downloadUrl: String,
  },
  { _id: false }
);

const shippingAddressSchema = new Schema<ShippingAddress>(
  {
    fullName: String,
    line1: String,
    line2: String,
    city: String,
    state: String,
    postalCode: String,
    country: { type: String, default: "US" },
    phone: String,
  },
  { _id: false }
);

const shippingTimelineSchema = new Schema<ShippingHistory>(
  {
    status: String,
    note: String,
    createdAt: { type: Date, default: Date.now },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { _id: false }
);

const paymentSchema = new Schema(
  {
    method: { type: String, default: "manual" },
    status: {
      type: String,
      enum: ["pending", "awaiting_payment", "paid", "failed", "refunded", "partial"],
      default: "pending",
    },
    transactionId: String,
    provider: String,
    paidAt: Date,
    stripeSessionId: String,
    stripePaymentIntentId: String,
  },
  { _id: false }
);

const refundSchema = new Schema(
  {
    status: {
      type: String,
      enum: ["none", "requested", "approved", "rejected", "processed"],
      default: "none",
    },
    reason: String,
    amount: Number,
    requestedAt: Date,
    processedAt: Date,
    processedBy: { type: Schema.Types.ObjectId, ref: "User" },
    resolutionNote: String,
  },
  { _id: false }
);

const orderSchema = new Schema<IOrder>(
  {
    orderNumber: { type: String, unique: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    items: { type: [orderItemSchema], required: true },
    itemsTotal: { type: Number, required: true },
    shippingCost: { type: Number, default: 0 },
    taxTotal: { type: Number, default: 0 },
    discountTotal: { type: Number, default: 0 },
    grandTotal: { type: Number, required: true },
    paymentStatus: {
      type: String,
      enum: ["pending", "awaiting_payment", "paid", "failed", "refunded", "partial"],
      default: "pending",
    },
    fulfillmentStatus: {
      type: String,
      enum: ["pending", "processing", "ready_to_ship", "shipped", "delivered", "cancelled", "refunded"],
      default: "pending",
    },
    shippingStatus: {
      type: String,
      enum: ["not_required", "pending", "label_created", "in_transit", "delivered", "returned", "cancelled"],
      default: "not_required",
    },
    shippingAddress: shippingAddressSchema,
    shippingMethod: { type: String, default: "standard" },
    shippingMethodId: String,
    shippingRateId: String,
    shippingOptionLabel: String,
    shippingQuoteSnapshot: mongoose.Schema.Types.Mixed,
    shippingTracking: {
      carrier: String,
      trackingNumber: String,
      estimatedDelivery: Date,
      shippedAt: Date,
      deliveredAt: Date,
    },
    shippingTimeline: { type: [shippingTimelineSchema], default: [] },
    payment: paymentSchema,
    contactEmail: String,
    contactPhone: String,
    notes: String,
    couponCode: String,
    refund: {
      type: refundSchema,
      default: () => ({ status: "none" }),
    },
  },
  { timestamps: true }
);

orderSchema.pre("save", function (next) {
  if (!this.orderNumber) {
    const random = Math.floor(Math.random() * 999)
      .toString()
      .padStart(3, "0");
    const timestamp = Date.now().toString(36).toUpperCase();
    this.orderNumber = `ST-${timestamp}-${random}`;
  }
  next();
});

orderSchema.index({ orderNumber: 1 }, { unique: true });
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ fulfillmentStatus: 1 });
orderSchema.index({ "items.owner": 1 });

const Order = mongoose.model<IOrder>("Order", orderSchema);
export default Order;


