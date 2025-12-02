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
    slug: { type: String, unique: true },
    
    description: { type: String, default: "" },
    shortDescription: { type: String, default: "" },

    price: { type: Number, required: true },     // base price
    salePrice: { type: Number },                 // optional sale price
    
    sku: { type: String },                       // stock keeping unit

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
    },
    
    // Product categories for beauty industry
    productType: {
      type: String,
      enum: ["hair", "makeup", "skincare", "nails", "tools", "education", "other"],
      default: "other",
    },

    images: [{
      url: String,
      publicId: String,  // Cloudinary public ID for deletion
    }],

    // Variation system
    variations: [variationSchema],

    stock: { type: Number, default: 0 },         // general stock
    lowStockThreshold: { type: Number, default: 5 },
    
    // Track if this is a digital or physical product
    productFormat: {
      type: String,
      enum: ["physical", "digital"],
      default: "physical",
    },
    
    // For digital products
    downloadUrl: { type: String },
    downloadLimit: { type: Number, default: -1 }, // -1 = unlimited

    status: {
      type: String,
      enum: ["draft", "pending", "approved", "published", "rejected"],
      default: "pending",
    },

    featured: { type: Boolean, default: false },
    
    // Owner - can be admin or regular user (seller)
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    
    // If created by admin on behalf of someone
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    
    // Seller-specific fields
    sellerCommission: { type: Number, default: 0 }, // percentage
    
    // Import source tracking
    importedFrom: { type: String }, // e.g., "external", "csv", "api"
    externalId: { type: String },   // ID from external source
    externalUrl: { type: String },  // Original product URL
    
    // SEO
    metaTitle: { type: String },
    metaDescription: { type: String },
    
    // Admin notes
    adminNotes: { type: String },
    rejectionReason: { type: String },
    
    // Stats
    views: { type: Number, default: 0 },
    sales: { type: Number, default: 0 },
    
    // Shipping
    weight: { type: Number },        // in grams
    dimensions: {
      length: { type: Number },
      width: { type: Number },
      height: { type: Number },
    },
    
    // Tags for better searchability
    tags: [String],
    
    // Brand
    brand: { type: String },
    
    // Reviews
    averageRating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Create slug from name before saving
productSchema.pre("save", function(next) {
  if (this.isModified("name") || !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") + 
      "-" + Date.now().toString(36);
  }
  next();
});

// Indexes for better query performance
productSchema.index({ name: "text", description: "text", tags: "text" });
productSchema.index({ owner: 1, status: 1 });
productSchema.index({ status: 1, featured: 1 });
productSchema.index({ productType: 1 });
productSchema.index({ slug: 1 });

const Product = mongoose.model("Product", productSchema);
export default Product;
