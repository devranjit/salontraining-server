import { v2 as cloudinary } from "cloudinary";
import { Request } from "express";
import fs from "fs";

export async function uploadToCloudinary(filePath: string) {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: "salontraining",
    });

    fs.unlinkSync(filePath); // delete local temp file
    return result.secure_url;
  } catch (err) {
    console.error("Cloudinary upload error:", err);
    throw err;
  }
}
