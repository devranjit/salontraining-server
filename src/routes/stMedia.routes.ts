import { Router } from "express";
import multer from "multer";
import { protect, adminOnly } from "../middleware/auth";
import { createStMedia, deleteStMedia, getStMedia } from "../controllers/stMedia.controller";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
});

const uploadSingleThumbnail = (req: any, res: any, next: any) => {
  const middleware = upload.single("thumbnailFile");
  middleware(req, res, (err: any) => {
    if (!err) return next();

    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        success: false,
        message: "File too large. Maximum size is 10MB",
      });
    }

    return res.status(400).json({
      success: false,
      message: err?.message || "Upload failed",
    });
  });
};

router.use(protect, adminOnly);

router.post("/", uploadSingleThumbnail, createStMedia);
router.get("/", getStMedia);
router.delete("/:id", deleteStMedia);

export default router;

