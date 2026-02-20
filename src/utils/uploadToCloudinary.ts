import { v2 as cloudinary } from "cloudinary";

// Security: File validation constants
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB max

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/webm",
  "application/pdf",
]);

const BLOCKED_EXTENSIONS = new Set([
  ".php", ".exe", ".js", ".sh", ".bat", ".svg",
  ".html", ".htm", ".asp", ".aspx", ".jsp",
  ".cgi", ".pl", ".py", ".rb", ".cmd", ".com",
  ".scr", ".pif", ".vbs", ".ws", ".wsf",
]);

/**
 * Validates file before upload
 * @throws Error if validation fails
 */
export function validateFile(
  buffer: Buffer,
  mimeType?: string,
  originalName?: string
): void {
  // Validate file size
  if (!buffer || buffer.length === 0) {
    throw new Error("Empty file provided");
  }
  
  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(`File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
  }

  // Validate MIME type if provided
  if (mimeType && !ALLOWED_MIME_TYPES.has(mimeType.toLowerCase())) {
    throw new Error(
      `Invalid file type: ${mimeType}. Allowed types: JPEG, PNG, GIF, WebP, MP4, WebM, PDF`
    );
  }

  // Validate extension if filename provided
  if (originalName) {
    const ext = originalName.toLowerCase().substring(originalName.lastIndexOf("."));
    if (BLOCKED_EXTENSIONS.has(ext)) {
      throw new Error(`Blocked file extension: ${ext}`);
    }
  }

  // Check magic bytes for common dangerous files
  if (buffer.length >= 4) {
    const header = buffer.slice(0, 4).toString("hex").toLowerCase();
    // Block PE executables (MZ header)
    if (header.startsWith("4d5a")) {
      throw new Error("Executable files are not allowed");
    }
    // Block ELF binaries
    if (header.startsWith("7f454c46")) {
      throw new Error("Binary files are not allowed");
    }
  }
}

export async function uploadToCloudinary(
  buffer: Buffer,
  mimeType?: string,
  originalName?: string
): Promise<any> {
  // Validate file before upload
  validateFile(buffer, mimeType, originalName);

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "salontraining",
        resource_type: "auto",
      },
      (error, result) => {
        if (error) return reject(error);
        if (!result) return reject(new Error("No result from Cloudinary"));

        resolve({
          url: result.secure_url,
          public_id: result.public_id,
        });
      }
    );

    uploadStream.end(buffer);
  });
}
