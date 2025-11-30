import { Router } from "express";
import { protect } from "../middleware/auth";
import uploadTemp from "../middleware/uploadTemp"; 
import { uploadToCloudinary } from "../utils/uploadToCloudinary";
import { v2 as cloudinary } from "cloudinary";

const router = Router();


/**
 * SINGLE UPLOAD – VERCEL SAFE
 * POST /api/upload
 */
router.post("/", uploadTemp.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    // Buffer-based upload
    const url = await uploadToCloudinary(req.file.buffer);

    return res.json({ success: true, url });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});


/**
 * MULTIPLE UPLOADS – VERCEL SAFE
 * POST /api/upload/multiple
 */
router.post("/multiple", uploadTemp.array("files", 10), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No files uploaded",
      });
    }

    const results = [];

    for (let file of files) {
      const url = await uploadToCloudinary(file.buffer);
      results.push({ url });
    }

    return res.json({
      success: true,
      count: results.length,
      files: results,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});


/**
 * DELETE IMAGE
 */
router.post("/delete", protect, async (req, res) => {
  const { public_id } = req.body;

  if (!public_id) {
    return res.status(400).json({
      success: false,
      message: "public_id is required",
    });
  }

  try {
    await cloudinary.uploader.destroy(public_id);

    return res.json({
      success: true,
      message: "Deleted successfully",
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Cloudinary error",
    });
  }
});


export default router;
