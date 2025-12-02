import { Router } from "express";
import multer from "multer";
import { uploadToCloudinary } from "../utils/uploadToCloudinary";

const router = Router();

// MUST USE MEMORY STORAGE FOR VERCEL
const upload = multer({ storage: multer.memoryStorage() });

/**
 * SINGLE UPLOAD (field name: "file")
 */
router.post("/", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    const { url, public_id } = await uploadToCloudinary(req.file.buffer);

    return res.json({
      success: true,
      file: { url, public_id }
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

/**
 * IMAGE UPLOAD (field name: "image") - Used by product forms
 */
router.post("/image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image uploaded",
      });
    }

    console.log("🔥 Image Upload Called...");
    console.log("🔥 Buffer Size:", req.file.buffer.length);

    const { url, public_id } = await uploadToCloudinary(req.file.buffer);

    console.log("🔥 Cloudinary Response:", { url, public_id });

    return res.json({
      success: true,
      url: url,
      publicId: public_id,
    });
  } catch (err: any) {
    console.error("🔥 Upload Error:", err.message);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});


/**
 * MULTIPLE UPLOADS
 */
router.post("/multiple", upload.array("files", 10), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[];

    const results = [];

    for (const file of files) {
      const { url, public_id } = await uploadToCloudinary(file.buffer);
      results.push({ url, public_id });
    }

    return res.json({
      success: true,
      files: results,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

export default router;
