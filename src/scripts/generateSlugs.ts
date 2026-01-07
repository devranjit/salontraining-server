/**
 * Migration script to generate slugs for existing records.
 * Run with: npx ts-node src/scripts/generateSlugs.ts
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

// Slug generator
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 100);
}

async function run() {
  const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!MONGO_URI) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB");

  const db = mongoose.connection.db;

  // Collections to migrate
  const collections = [
    { name: "trainerlistings", titleField: "title" },
    { name: "jobs", titleField: "title" },
    { name: "events", titleField: "title" },
    { name: "blogs", titleField: "title" },
    { name: "educations", titleField: "title" },
    { name: "products", titleField: "name" },
  ];

  for (const { name, titleField } of collections) {
    console.log(`\nProcessing ${name}...`);
    const collection = db!.collection(name);

    // Find docs without a slug
    const docs = await collection.find({ slug: { $exists: false } }).toArray();
    console.log(`  Found ${docs.length} documents without slug`);

    for (const doc of docs) {
      const title = doc[titleField];
      if (!title) {
        console.log(`  Skipping ${doc._id} - no ${titleField}`);
        continue;
      }

      let baseSlug = generateSlug(title);
      let slug = baseSlug;
      let counter = 1;

      // Ensure uniqueness
      while (await collection.findOne({ slug, _id: { $ne: doc._id } })) {
        slug = `${baseSlug}-${counter}`;
        counter++;
      }

      await collection.updateOne({ _id: doc._id }, { $set: { slug } });
      console.log(`  ${doc._id} -> ${slug}`);
    }
  }

  console.log("\nDone!");
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});












