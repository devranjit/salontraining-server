import { Request, Response } from "express";
import MemberVideo from "../models/MemberVideo";

// Helper to extract YouTube video ID from URL
function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s?]+)/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Get YouTube thumbnail
function getYouTubeThumbnail(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
}

// ---------------------------------------------
// GET ALL VIDEOS (Public for members)
// ---------------------------------------------
export const getVideos = async (req: Request, res: Response) => {
  try {
    const { category, featured, limit = 50, page = 1 } = req.query;

    const filter: any = { status: "published" };

    if (category) filter.category = category;
    if (featured === "true") filter.featured = true;

    const skip = (Number(page) - 1) * Number(limit);

    const [videos, total] = await Promise.all([
      MemberVideo.find(filter)
        .sort({ order: 1, createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("createdBy", "name email"),
      MemberVideo.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      videos,
      pagination: {
        total,
        page: Number(page),
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err) {
    console.error("Get videos error:", err);
    return res.status(500).json({ message: "Failed to fetch videos" });
  }
};

// ---------------------------------------------
// GET SINGLE VIDEO (Public for members)
// ---------------------------------------------
export const getVideo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const video = await MemberVideo.findById(id).populate("createdBy", "name email");

    if (!video) {
      return res.status(404).json({ message: "Video not found" });
    }

    // Increment view count
    video.views += 1;
    await video.save();

    return res.json({ success: true, video });
  } catch (err) {
    console.error("Get video error:", err);
    return res.status(500).json({ message: "Failed to fetch video" });
  }
};

// ---------------------------------------------
// GET CATEGORIES (Public for members)
// ---------------------------------------------
export const getCategories = async (req: Request, res: Response) => {
  try {
    const categories = await MemberVideo.distinct("category", { 
      status: "published",
      category: { $ne: null, $ne: "" }
    });

    return res.json({ success: true, categories });
  } catch (err) {
    console.error("Get categories error:", err);
    return res.status(500).json({ message: "Failed to fetch categories" });
  }
};

// ---------------------------------------------
// ADMIN: GET ALL VIDEOS
// ---------------------------------------------
export const adminGetVideos = async (req: Request, res: Response) => {
  try {
    const { status, category, limit = 50, page = 1 } = req.query;

    const filter: any = {};

    if (status && status !== "all") filter.status = status;
    if (category) filter.category = category;

    const skip = (Number(page) - 1) * Number(limit);

    const [videos, total] = await Promise.all([
      MemberVideo.find(filter)
        .sort({ order: 1, createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("createdBy", "name email"),
      MemberVideo.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      videos,
      pagination: {
        total,
        page: Number(page),
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err) {
    console.error("Admin get videos error:", err);
    return res.status(500).json({ message: "Failed to fetch videos" });
  }
};

// ---------------------------------------------
// ADMIN: CREATE VIDEO
// ---------------------------------------------
export const createVideo = async (req: any, res: Response) => {
  try {
    const { 
      title, 
      description, 
      youtubeUrl, 
      trainer, 
      category, 
      tags, 
      duration,
      order,
      featured,
      status,
      publishDate
    } = req.body;

    if (!title || !youtubeUrl) {
      return res.status(400).json({ message: "Title and YouTube URL are required" });
    }

    const youtubeId = extractYouTubeId(youtubeUrl);
    if (!youtubeId) {
      return res.status(400).json({ message: "Invalid YouTube URL" });
    }

    const thumbnail = getYouTubeThumbnail(youtubeId);

    const video = await MemberVideo.create({
      title,
      description,
      youtubeUrl,
      youtubeId,
      thumbnail,
      trainer,
      category,
      tags,
      duration,
      order: order || 0,
      featured: featured || false,
      status: status || "published",
      publishDate,
      createdBy: req.user.id,
    });

    return res.json({ 
      success: true, 
      message: "Video created successfully",
      video 
    });
  } catch (err) {
    console.error("Create video error:", err);
    return res.status(500).json({ message: "Failed to create video" });
  }
};

// ---------------------------------------------
// ADMIN: UPDATE VIDEO
// ---------------------------------------------
export const updateVideo = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // If YouTube URL is being updated, extract new ID and thumbnail
    if (updates.youtubeUrl) {
      const youtubeId = extractYouTubeId(updates.youtubeUrl);
      if (!youtubeId) {
        return res.status(400).json({ message: "Invalid YouTube URL" });
      }
      updates.youtubeId = youtubeId;
      updates.thumbnail = getYouTubeThumbnail(youtubeId);
    }

    const video = await MemberVideo.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true }
    );

    if (!video) {
      return res.status(404).json({ message: "Video not found" });
    }

    return res.json({ 
      success: true, 
      message: "Video updated successfully",
      video 
    });
  } catch (err) {
    console.error("Update video error:", err);
    return res.status(500).json({ message: "Failed to update video" });
  }
};

// ---------------------------------------------
// ADMIN: DELETE VIDEO
// ---------------------------------------------
export const deleteVideo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const video = await MemberVideo.findByIdAndDelete(id);

    if (!video) {
      return res.status(404).json({ message: "Video not found" });
    }

    return res.json({ 
      success: true, 
      message: "Video deleted successfully" 
    });
  } catch (err) {
    console.error("Delete video error:", err);
    return res.status(500).json({ message: "Failed to delete video" });
  }
};

// ---------------------------------------------
// ADMIN: TOGGLE FEATURED
// ---------------------------------------------
export const toggleFeatured = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const video = await MemberVideo.findById(id);
    if (!video) {
      return res.status(404).json({ message: "Video not found" });
    }

    video.featured = !video.featured;
    await video.save();

    return res.json({ 
      success: true, 
      message: video.featured ? "Video featured" : "Video unfeatured",
      video 
    });
  } catch (err) {
    console.error("Toggle featured error:", err);
    return res.status(500).json({ message: "Failed to update video" });
  }
};

// ---------------------------------------------
// ADMIN: REORDER VIDEOS
// ---------------------------------------------
export const reorderVideos = async (req: Request, res: Response) => {
  try {
    const { videos } = req.body; // Array of { id, order }

    if (!Array.isArray(videos)) {
      return res.status(400).json({ message: "Invalid data format" });
    }

    const bulkOps = videos.map((v: { id: string; order: number }) => ({
      updateOne: {
        filter: { _id: v.id },
        update: { $set: { order: v.order } },
      },
    }));

    await MemberVideo.bulkWrite(bulkOps);

    return res.json({ 
      success: true, 
      message: "Videos reordered successfully" 
    });
  } catch (err) {
    console.error("Reorder videos error:", err);
    return res.status(500).json({ message: "Failed to reorder videos" });
  }
};

