import { Router } from "express";
import multer from "multer";
import { uploadToCloudinary } from "../utils/uploadToCloudinary";

const router = Router();

// MUST USE MEMORY STORAGE FOR VERCEL
const upload = multer({ storage: multer.memoryStorage() });

/**
 * SINGLE UPLOAD
 */
router.post("/", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    // FIX HERE
    const url = await uploadToCloudinary(req.file.buffer);

    return res.json({ success: true, url });
  } catch (err: any) {
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
      // FIX HERE
      const url = await uploadToCloudinary(file.buffer);
      results.push({ url });
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
