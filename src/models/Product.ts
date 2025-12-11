import mongoose from "mongoose";

// Variation option schema - each option within a variation (e.g., "Small", "Medium", "Large")
const variationOptionSchema = new mongoose.Schema({
  name: { type: String, required: true },       // e.g. "Large"
  sku: { type: String },                        // SKU for this specific variation
  price: { type: Number, default: 0 },          // price adjustment (adds to base price)
  stock: { type: Number, default: 0 },          // stock for this specific variation
  image: {                                       // image for this variation option
    url: { type: String },
    publicId: { type: String },
  },
  weight: { type: Number },                     // weight override for this variation
  isDefault: { type: Boolean, default: false }, // is this the default selection
  enabled: { type: Boolean, default: true },    // is this option available
});

// Variation schema - e.g., "Size", "Color"
const variationSchema = new mongoose.Schema({
  label: { type: String, required: true },      // e.g. "Size"
  displayType: {                                 // how to display this variation
    type: String,
    enum: ["dropdown", "buttons", "swatch", "radio"],
    default: "buttons",
  },
  required: { type: Boolean, default: true },   // must user select this?
  options: [variationOptionSchema],
});

// Combined variation schema - for complex products with multiple variation combinations
// e.g., Size + Color combinations with unique SKU/stock for each
const combinedVariationSchema = new mongoose.Schema({
  sku: { type: String },                        // Unique SKU for this combination
  price: { type: Number },                      // Override price for this combination
  stock: { type: Number, default: 0 },          // Stock for this specific combination
  weight: { type: Number },                     // Weight for this combination
  image: {
    url: { type: String },
    publicId: { type: String },
  },
  enabled: { type: Boolean, default: true },
  // Store the combination as an array of selections
  // e.g., [{ label: "Size", option: "Large" }, { label: "Color", option: "Red" }]
  combination: [{
    label: { type: String, required: true },
    option: { type: String, required: true },
  }],
});

// Grouped product item schema - for bundled/grouped products
const groupedItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  quantity: { type: Number, default: 1, min: 1 },
  optional: { type: Boolean, default: false },  // is this item optional in the bundle
  discountPercent: { type: Number, default: 0 }, // discount when bought as part of group
});

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, unique: true },
    
    description: { type: String, default: "" },
    shortDescription: { type: String, default: "" },

    // Product structure type
    productStructure: {
      type: String,
      enum: ["simple", "variable", "grouped", "bundle"],
      default: "simple",
    },

    price: { type: Number, required: true },     // base price
    salePrice: { type: Number },                 // optional sale price
    
    sku: { type: String },                       // stock keeping unit (for simple products)

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
    },
    
    // Product categories for beauty industry
    productType: {
      type: String,
      trim: true,
      default: "",
    },

    couponCode: { type: String, trim: true },

    images: [{
      url: String,
      publicId: String,  // Cloudinary public ID for deletion
    }],

    // Variation system - for variable products
    variations: [variationSchema],
    
    // Combined variations - for products with multiple variation types
    // that need specific SKU/stock per combination
    combinedVariations: [combinedVariationSchema],
    
    // Use combined variations flag
    useCombinedVariations: { type: Boolean, default: false },

    // Grouped/Bundle products - contains references to other products
    groupedProducts: [groupedItemSchema],
    
    // Bundle pricing mode
    bundlePricingMode: {
      type: String,
      enum: ["fixed", "calculated", "discounted"],
      default: "fixed",
    },
    bundleDiscount: { type: Number, default: 0 }, // Discount percentage for calculated bundles

    stock: { type: Number, default: 0 },         // general stock (for simple products)
    lowStockThreshold: { type: Number, default: 5 },
    manageStock: { type: Boolean, default: true }, // whether to track stock
    backordersAllowed: { type: Boolean, default: false },
    
    // Track if this is a digital or physical product
    productFormat: {
      type: String,
      enum: ["physical", "digital"],
      default: "physical",
    },
    
    // For digital products
    downloadUrl: { type: String },
    downloadLimit: { type: Number, default: -1 }, // -1 = unlimited
    downloadExpiry: { type: Number, default: -1 }, // days, -1 = never expires

    status: {
      type: String,
      enum: ["draft", "pending", "approved", "published", "rejected", "archived"],
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
    
    // Shipping class for special shipping rules
    shippingClass: { type: String },
    
    // Tags for better searchability
    tags: [String],
    
    // Product source - distinguishes between store catalog and user listings
    productSource: {
      type: String,
      enum: ["store", "listing"],
      default: "listing",  // Default to listing for backward compatibility
    },

    // External shop URL for listing products
    shopUrl: {
      type: String,
      trim: true,
    },
    
    // Brand
    brand: { type: String },
    
    // Reviews
    averageRating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },

    // Related products (for upselling)
    relatedProducts: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
    }],

    // Cross-sell products
    crossSellProducts: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
    }],

    // Purchase note shown after purchase
    purchaseNote: { type: String },

    // Minimum and maximum purchase quantities
    minQuantity: { type: Number, default: 1 },
    maxQuantity: { type: Number }, // undefined = no limit

    // Sold individually - can only buy one at a time
    soldIndividually: { type: Boolean, default: false },
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

// Helper function to calculate total variation stock
function calculateVariationStock(doc: any): number {
  if (doc.productStructure !== "variable") {
    return doc.stock;
  }
  
  if (doc.useCombinedVariations && doc.combinedVariations?.length) {
    return doc.combinedVariations.reduce((sum: number, cv: any) => sum + (cv.stock || 0), 0);
  }
  
  // For simple variations, calculate from first variation's options
  if (doc.variations?.length) {
    const firstVariation = doc.variations[0];
    return firstVariation.options.reduce((sum: number, opt: any) => sum + (opt.stock || 0), 0);
  }
  
  return doc.stock;
}

// Virtual to get total stock across all variations
productSchema.virtual("totalVariationStock").get(function() {
  return calculateVariationStock(this);
});

// Virtual to check if product is in stock
productSchema.virtual("inStock").get(function() {
  if (!this.manageStock) return true;
  
  if (this.productStructure === "variable") {
    return calculateVariationStock(this) > 0;
  }
  
  return this.stock > 0;
});

// Indexes for better query performance
productSchema.index({ name: "text", description: "text", tags: "text" });
productSchema.index({ owner: 1, status: 1 });
productSchema.index({ status: 1, featured: 1 });
productSchema.index({ productType: 1 });
productSchema.index({ productStructure: 1 });
productSchema.index({ slug: 1 });
productSchema.index({ sku: 1 });
productSchema.index({ "variations.options.sku": 1 });
productSchema.index({ "combinedVariations.sku": 1 });
productSchema.index({ productSource: 1, status: 1 });

const Product = mongoose.model("Product", productSchema);
export default Product;
