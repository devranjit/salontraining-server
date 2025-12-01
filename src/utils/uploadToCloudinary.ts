import { v2 as cloudinary } from "cloudinary";

export async function uploadToCloudinary(buffer: Buffer): Promise<any> {
  console.log("🔥 Cloudinary Upload Called...");
  console.log("🔥 Buffer Size:", buffer?.length);

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "salontraining",
        resource_type: "auto",
      },
      (error, result) => {
        console.log("🔥 Cloudinary Response:", { error, result });

        if (error) return reject(error);
        if (!result) return reject("No result from Cloudinary");

        resolve({
          url: result.secure_url,
          public_id: result.public_id,
        });
      }
    );

    uploadStream.end(buffer);
  });
}
