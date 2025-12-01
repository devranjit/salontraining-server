import cloudinary from "../lib/cloudinary";

export function uploadToCloudinary(file: Express.Multer.File): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "salontraining",
      },
      (err, result) => {
        if (err || !result) {
          console.error("Cloudinary upload error:", err);
          return reject(err);
        }
        resolve(result.secure_url);
      }
    );

    // Write file buffer to cloudinary
    stream.end(file.buffer);
  });
}
