import { v2 as cloudinary } from "cloudinary";



export async function uploadToCloudinary(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "salontraining",
        resource_type: "auto",
      },
      (error, result) => {
        if (error) {
          console.error("Cloudinary Error:", error);
          return reject(error);
        }

        if (!result || !result.secure_url) {
          return reject(new Error("No Cloudinary URL returned"));
        }

        resolve(result.secure_url);
      }
    );

    uploadStream.end(buffer);
  });
}
