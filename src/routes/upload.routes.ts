import { Router } from "express";
import multer from "multer";
import { uploadToCloudinary } from "../utils/uploadToCloudinary";
import { protect } from "../middleware/auth";

const router = Router();

// MUST USE MEMORY STORAGE FOR VERCEL
const upload = multer({ storage: multer.memoryStorage() });

/**
 * SINGLE UPLOAD (field name: "file")
 * PROTECTED - requires authentication
 */
router.post("/", protect, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    // Pass MIME type and original filename for validation
    const { url, public_id } = await uploadToCloudinary(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname
    );

    return res.json({
      success: true,
      file: { url, public_id }
    });
  } catch (err: any) {
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
router.post("/image", protect, upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image uploaded",
      });
    }

    // Pass MIME type and original filename for validation
    const { url, public_id } = await uploadToCloudinary(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname
    );

    return res.json({
      success: true,
      url: url,
      publicId: public_id,
    });
  } catch (err: any) {
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
router.post("/multiple", protect, upload.array("files", 10), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No files uploaded",
      });
    }

    const results = [];

    for (const file of files) {
      // Pass MIME type and original filename for validation
      const { url, public_id } = await uploadToCloudinary(
        file.buffer,
        file.mimetype,
        file.originalname
      );
      results.push({ url, public_id });
    }

    return res.json({
      success: true,
      files: results,
    });
  } catch (err: any) {
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
