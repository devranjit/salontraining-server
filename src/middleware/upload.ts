import multer from "multer";

export const upload = multer({
  storage: multer.memoryStorage(), // NO DISK STORAGE
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});
