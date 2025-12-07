/**
 * Migration Script: Fix productSource field for existing products
 * 
 * This script updates products to have the correct productSource value:
 * - Products created by admin (no owner or admin owner) → "store"
 * - Products created by regular users → "listing"
 * 
 * Run with: npx ts-node src/scripts/fix-product-source.ts
 */

import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "";

// Product schema (simplified for migration)
const productSchema = new mongoose.Schema({
  name: String,
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  productSource: String,
}, { strict: false });

const Product = mongoose.model("Product", productSchema);

// User schema for role checking
const userSchema = new mongoose.Schema({
  email: String,
  role: String,
}, { strict: false });

const User = mongoose.model("User", userSchema);

async function migrate() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("Connected!\n");

    // Get all products
    const products = await Product.find({}).populate("owner", "role email").populate("created_by", "role email");
    
    console.log(`Found ${products.length} products to check\n`);

    let storeCount = 0;
    let listingCount = 0;
    let unchangedCount = 0;

    for (const product of products) {
      const owner = product.owner as any;
      const createdBy = product.created_by as any;
      
      // Determine correct productSource
      let correctSource: "store" | "listing";
      
      // If created by admin/manager OR no owner, it's a store product
      if (!owner || (createdBy && ["admin", "manager"].includes(createdBy.role))) {
        correctSource = "store";
      } else {
        correctSource = "listing";
      }

      // Check if update needed
      if (product.productSource !== correctSource) {
        console.log(`Updating "${product.name}": ${product.productSource || "undefined"} → ${correctSource}`);
        console.log(`  Owner: ${owner?.email || "None"} (${owner?.role || "N/A"})`);
        console.log(`  Created by: ${createdBy?.email || "None"} (${createdBy?.role || "N/A"})\n`);
        
        await Product.updateOne(
          { _id: product._id },
          { $set: { productSource: correctSource } }
        );
        
        if (correctSource === "store") storeCount++;
        else listingCount++;
      } else {
        unchangedCount++;
      }
    }

    console.log("\n========================================");
    console.log("Migration Complete!");
    console.log("========================================");
    console.log(`Updated to "store": ${storeCount}`);
    console.log(`Updated to "listing": ${listingCount}`);
    console.log(`Unchanged: ${unchangedCount}`);
    console.log(`Total: ${products.length}`);

  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await mongoose.disconnect();
    console.log("\nDisconnected from MongoDB");
  }
}

migrate();

