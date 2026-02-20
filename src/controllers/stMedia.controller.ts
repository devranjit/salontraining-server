import { Request, Response } from "express";
import { v2 as cloudinary } from "cloudinary";
import StMedia from "../models/StMedia";
import { uploadToCloudinary } from "../utils/uploadToCloudinary";

const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/webm",
]);

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
    const { thumbnailType, linkUrl, title, description, date } = req.body;

    if (!thumbnailType || !["image", "video"].includes(thumbnailType)) {
      return res.status(400).json({
        success: false,
        message: "thumbnailType is required and must be image or video",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "thumbnailFile is required",
      });
    }

    const mimeType = String(req.file.mimetype || "").toLowerCase();
    const imageType = thumbnailType === "image";
    const validMimeType = imageType
      ? IMAGE_MIME_TYPES.has(mimeType)
      : VIDEO_MIME_TYPES.has(mimeType);

    if (!validMimeType) {
      return res.status(400).json({
        success: false,
        message: imageType
          ? "Invalid image format. Allowed: jpg, jpeg, png, webp"
          : "Invalid video format. Allowed: mp4, webm",
      });
    }

    const uploaded = await uploadToCloudinary(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname
    );

    const item = await StMedia.create({
      thumbnailType,
      thumbnailPath: uploaded.url,
      linkUrl: linkUrl || undefined,
      title: title || undefined,
      description: description || undefined,
      date: date ? new Date(date) : undefined,
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
    const items = await StMedia.find().sort({ createdAt: -1 });
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

    const publicId = extractCloudinaryPublicId(item.thumbnailPath);
    if (publicId) {
      const resourceType = item.thumbnailType === "video" ? "video" : "image";
      try {
        await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
      } catch (uploadDeleteErr) {
        console.warn("ST Media file deletion failed:", uploadDeleteErr);
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

