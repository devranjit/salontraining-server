import { Request, Response } from "express";
import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import path from "path";
import StMedia from "../models/StMedia";
import { uploadToCloudinary } from "../utils/uploadToCloudinary";

const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

function isValidHttpUrl(value: string): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function extractCloudinaryPublicId(url: string): string | null {
  try {
    const cleanUrl = url.split("?")[0];
    const uploadToken = "/upload/";
    const uploadIndex = cleanUrl.indexOf(uploadToken);
    if (uploadIndex === -1) return null;

    const afterUpload = cleanUrl.slice(uploadIndex + uploadToken.length);
    const pathWithoutVersion = afterUpload.replace(/^v\d+\//, "");
    const lastDotIndex = pathWithoutVersion.lastIndexOf(".");
    if (lastDotIndex === -1) return pathWithoutVersion;
    return pathWithoutVersion.slice(0, lastDotIndex);
  } catch {
    return null;
  }
}

export const createStMedia = async (req: any, res: Response) => {
  try {
    const { thumbnailType, linkUrl, title, description, date, videoUrl } = req.body;

    if (!thumbnailType || !["image", "video"].includes(thumbnailType)) {
      return res.status(400).json({
        success: false,
        message: "thumbnailType is required and must be image or video",
      });
    }

    let thumbnailPath: string;

    if (thumbnailType === "video") {
      if (req.file) {
        return res.status(400).json({
          success: false,
          message: "Video items require a video URL. File uploads are not allowed.",
        });
      }
      const normalizedVideoUrl = String(videoUrl || "").trim();
      if (!normalizedVideoUrl) {
        return res.status(400).json({
          success: false,
          message: "Video URL is required for video items",
        });
      }
      if (!isValidHttpUrl(normalizedVideoUrl)) {
        return res.status(400).json({
          success: false,
          message: "Enter a valid video URL",
        });
      }
      thumbnailPath = normalizedVideoUrl;
    } else {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "thumbnailFile is required",
        });
      }

      const mimeType = String(req.file.mimetype || "").toLowerCase();
      const validMimeType = IMAGE_MIME_TYPES.has(mimeType);

      if (!validMimeType) {
        return res.status(400).json({
          success: false,
          message: "Invalid image format. Allowed: jpg, jpeg, png, webp",
        });
      }

      const uploaded = await uploadToCloudinary(
        req.file.buffer,
        req.file.mimetype,
        req.file.originalname
      );
      thumbnailPath = uploaded.url;
    }

    const item = await StMedia.create({
      thumbnailType,
      thumbnailPath,
      linkUrl: linkUrl || undefined,
      title: title || undefined,
      description: description || undefined,
      date: date ? new Date(date) : undefined,
      status: "draft",
    });

    return res.status(201).json({
      success: true,
      item,
    });
  } catch (err: any) {
    console.error("Create ST Media error:", err);
    return res.status(500).json({
      success: false,
      message: err?.message || "Failed to create ST Media item",
    });
  }
};

export const getStMedia = async (_req: Request, res: Response) => {
  try {
    const items = await StMedia.find({ status: "published" }).sort({ createdAt: -1 });
    return res.json({
      success: true,
      items,
    });
  } catch (err: any) {
    console.error("Get ST Media error:", err);
    return res.status(500).json({
      success: false,
      message: err?.message || "Failed to fetch ST Media items",
    });
  }
};

export const getStMediaAdmin = async (_req: Request, res: Response) => {
  try {
    const items = await StMedia.find().sort({ createdAt: -1 });
    return res.json({
      success: true,
      items,
    });
  } catch (err: any) {
    console.error("Get ST Media Admin error:", err);
    return res.status(500).json({
      success: false,
      message: err?.message || "Failed to fetch ST Media items",
    });
  }
};

export const updateStMediaStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !["draft", "published"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "status is required and must be draft or published",
      });
    }

    const item = await StMedia.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true }
    );

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "ST Media item not found",
      });
    }

    return res.json({
      success: true,
      item,
    });
  } catch (err: any) {
    console.error("Update ST Media status error:", err);
    return res.status(500).json({
      success: false,
      message: err?.message || "Failed to update ST Media status",
    });
  }
};

export const deleteStMedia = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const item = await StMedia.findById(id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "ST Media item not found",
      });
    }

    if (item.thumbnailType === "video" && item.thumbnailPath.startsWith("/uploads/st-media/videos/")) {
      const localPath = path.join(process.cwd(), item.thumbnailPath.replace(/^\//, ""));
      try {
        if (fs.existsSync(localPath)) {
          fs.unlinkSync(localPath);
        }
      } catch (localDeleteErr) {
        console.warn("ST Media local video deletion failed:", localDeleteErr);
      }
    } else {
      const publicId = extractCloudinaryPublicId(item.thumbnailPath);
      if (publicId) {
        const resourceType = item.thumbnailType === "video" ? "video" : "image";
        try {
          await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
        } catch (uploadDeleteErr) {
          console.warn("ST Media file deletion failed:", uploadDeleteErr);
        }
      }
    }

    await item.deleteOne();

    return res.json({
      success: true,
      message: "ST Media item deleted",
    });
  } catch (err: any) {
    console.error("Delete ST Media error:", err);
    return res.status(500).json({
      success: false,
      message: err?.message || "Failed to delete ST Media item",
    });
  }
};

