import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

export async function uploadToCloudinary(localPath: string) {
  try {
    const result = await cloudinary.uploader.upload(localPath, {
      folder: "salontraining",
    });

    fs.unlinkSync(localPath); // delete local temp file

    return result.secure_url;
  } catch (err) {
    console.error("Cloudinary upload error:", err);
    throw err;
  }
}
