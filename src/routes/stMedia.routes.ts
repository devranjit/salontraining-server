import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { protect, adminOnly } from "../middleware/auth";
import {
  createStMedia,
  deleteStMedia,
  getStMedia,
  getStMediaAdmin,
  updateStMediaStatus,
} from "../controllers/stMedia.controller";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
});

const stMediaVideoDir = path.resolve(process.cwd(), "uploads", "st-media", "videos");
fs.mkdirSync(stMediaVideoDir, { recursive: true });

const stMediaVideoUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const allowedVideoTypes = new Set(["video/mp4", "video/webm"]);
    if (!allowedVideoTypes.has(String(file.mimetype || "").toLowerCase())) {
      return cb(new Error("Invalid video format. Allowed: mp4, webm"));
    }
    cb(null, true);
  },
});

const uploadSingleThumbnail = (req: any, res: any, next: any) => {
  const bodyType = String(req.body?.thumbnailType || "").toLowerCase();
  const headerType = String(req.headers["x-st-media-type"] || "").toLowerCase();
  const isVideo = bodyType === "video" || headerType === "video";
  const middleware = isVideo
    ? stMediaVideoUpload.single("thumbnailFile")
    : upload.single("thumbnailFile");

  middleware(req, res, (err: any) => {
    if (!err) return next();

    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        success: false,
        message: isVideo
          ? "File too large. Maximum size is 500MB"
          : "File too large. Maximum size is 10MB",
      });
    }

    return res.status(400).json({
      success: false,
      message: err?.message || "Upload failed",
    });
  });
};

router.get("/", getStMedia);

router.use(protect, adminOnly);
router.get("/all", getStMediaAdmin);
router.post("/", uploadSingleThumbnail, createStMedia);
router.patch("/:id/status", updateStMediaStatus);
router.delete("/:id", deleteStMedia);

export default router;

