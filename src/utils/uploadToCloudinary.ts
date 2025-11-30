import { v2 as cloudinary } from "cloudinary";

export async function uploadToCloudinary(buffer: Buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "salontraining" },
      (err, result) => {
        if (err) return reject(err);
        resolve(result?.secure_url);
      }
    );

    stream.end(buffer);
  });
}
