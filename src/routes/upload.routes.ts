import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { uploadToCloudinary } from "../utils/uploadToCloudinary";
import { protect } from "../middleware/auth";

const router = Router();

// MUST USE MEMORY STORAGE FOR VERCEL
// Configure multer with proper limits for production
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 10 * 1024 * 1024, // 10MB limit (matches uploadToCloudinary)
    files: 10, // Max 10 files
  },
});

// Multer error handler middleware
const handleMulterError = (err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    console.error("[Upload] Multer error:", err.code, err.message);
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "File too large. Maximum size is 10MB",
      });
    }
    if (err.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({
        success: false,
        message: "Too many files. Maximum is 10 files",
      });
    }
    return res.status(400).json({
      success: false,
      message: `Upload error: ${err.message}`,
    });
  }
  next(err);
};

/**
 * SINGLE UPLOAD (field name: "file")
 * PROTECTED - requires authentication
 */
router.post("/", protect, upload.single("file"), handleMulterError, async (req: Request, res: Response) => {
  try {
    console.log("[Upload] Single file upload request received");
    
    if (!req.file) {
      console.log("[Upload] No file in request");
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    console.log(`[Upload] Processing file: ${req.file.originalname}, size: ${req.file.size}, type: ${req.file.mimetype}`);

    // Pass MIME type and original filename for validation
    const { url, public_id } = await uploadToCloudinary(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname
    );

    console.log(`[Upload] ✓ File uploaded to Cloudinary: ${public_id}`);

    return res.json({
      success: true,
      file: { url, public_id }
    });
  } catch (err: any) {
    console.error("[Upload] Upload failed:", err.message);
    // Return 400 for validation errors
    const statusCode = err.message.includes("Invalid") || 
                       err.message.includes("Blocked") ||
                       err.message.includes("too large") ? 400 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message,
    });
  }
});

/**
 * IMAGE UPLOAD (field name: "image") - Used by product forms
 * PROTECTED - requires authentication
 */
router.post("/image", protect, upload.single("image"), handleMulterError, async (req: Request, res: Response) => {
  try {
    console.log("[Upload] Image upload request received");
    
    if (!req.file) {
      console.log("[Upload] No image in request");
      return res.status(400).json({
        success: false,
        message: "No image uploaded",
      });
    }

    console.log(`[Upload] Processing image: ${req.file.originalname}, size: ${req.file.size}, type: ${req.file.mimetype}`);

    // Pass MIME type and original filename for validation
    const { url, public_id } = await uploadToCloudinary(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname
    );

    console.log(`[Upload] ✓ Image uploaded to Cloudinary: ${public_id}`);

    return res.json({
      success: true,
      url: url,
      publicId: public_id,
    });
  } catch (err: any) {
    console.error("[Upload] Image upload failed:", err.message);
    // Return 400 for validation errors
    const statusCode = err.message.includes("Invalid") || 
                       err.message.includes("Blocked") ||
                       err.message.includes("too large") ? 400 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message,
    });
  }
});


/**
 * MULTIPLE UPLOADS
 * PROTECTED - requires authentication
 */
router.post("/multiple", protect, upload.array("files", 10), handleMulterError, async (req: Request, res: Response) => {
  try {
    console.log("[Upload] Multiple files upload request received");
    
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      console.log("[Upload] No files in request");
      return res.status(400).json({
        success: false,
        message: "No files uploaded",
      });
    }

    console.log(`[Upload] Processing ${files.length} files`);

    const results = [];

    for (const file of files) {
      console.log(`[Upload] Processing: ${file.originalname}, size: ${file.size}, type: ${file.mimetype}`);
      // Pass MIME type and original filename for validation
      const { url, public_id } = await uploadToCloudinary(
        file.buffer,
        file.mimetype,
        file.originalname
      );
      results.push({ url, public_id });
      console.log(`[Upload] ✓ Uploaded: ${public_id}`);
    }

    console.log(`[Upload] ✓ All ${files.length} files uploaded successfully`);

    return res.json({
      success: true,
      files: results,
    });
  } catch (err: any) {
    console.error("[Upload] Multiple upload failed:", err.message);
    // Return 400 for validation errors
    const statusCode = err.message.includes("Invalid") || 
                       err.message.includes("Blocked") ||
                       err.message.includes("too large") ? 400 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message,
    });
  }
});

export default router;
