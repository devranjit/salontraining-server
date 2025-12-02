import { Request, Response } from "express";
import { TrainerListing } from "../models/TrainerListing";
import mongoose from "mongoose";

// ===============================
// USER — Create Trainer Listing
// ===============================
export const createTrainer = async (req: any, res: Response) => {
  try {
    const listing = await TrainerListing.create({
      owner: req.user.id,
      ...req.body,
      status: "pending",
    });

    res.json({ success: true, listing });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// USER — My Listings
// ===============================
export async function getMyTrainers(req: Request, res: Response) {
  try {
const userId = req.user?._id || req.user?.id;

    const listings = await TrainerListing.find({ owner: userId })
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      items: listings
    });

  } catch (err: any) {
    console.error("getMyTrainers Error:", err);
    return res.status(500).json({
      success: false,
      message: err?.message || "Server error",
    });
  }
} // ← FIXED MISSING BRACE HERE!!!


// ===============================
// ADMIN — All Trainers
// ===============================
export async function adminGetAllTrainers(req: Request, res: Response) {
  try {
    const trainers = await TrainerListing.find()
      .populate("owner", "name email")
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      trainers,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
}

// ===============================
// ADMIN — Approve Trainer
// ===============================
export const approveTrainer = async (req: Request, res: Response) => {
  try {
    const listing = await TrainerListing.findByIdAndUpdate(
      req.params.id,
      { status: "approved" },
      { new: true }
    );

    res.json({ success: true, listing });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Reject Trainer
// ===============================
export const rejectTrainer = async (req: Request, res: Response) => {
  try {
    const listing = await TrainerListing.findByIdAndUpdate(
      req.params.id,
      { status: "rejected" },
      { new: true }
    );

    res.json({ success: true, listing });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Set to Pending (Draft)
// ===============================
export const setPendingTrainer = async (req: Request, res: Response) => {
  try {
    const listing = await TrainerListing.findByIdAndUpdate(
      req.params.id,
      { status: "pending" },
      { new: true }
    );

    if (!listing) {
      return res.status(404).json({ success: false, message: "Trainer not found" });
    }

    res.json({ success: true, listing, message: "Trainer set to pending" });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Request Changes
// ===============================
export const requestChanges = async (req: Request, res: Response) => {
  try {
    const { adminNotes } = req.body;
    
    const listing = await TrainerListing.findByIdAndUpdate(
      req.params.id,
      { 
        status: "changes_requested",
        adminNotes: adminNotes || "Please review and make necessary changes."
      },
      { new: true }
    );

    if (!listing) {
      return res.status(404).json({ success: false, message: "Trainer not found" });
    }

    res.json({ success: true, listing });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Publish Trainer (with optional dates)
// ===============================
export const publishTrainer = async (req: Request, res: Response) => {
  try {
    const { publishDate, expiryDate } = req.body;
    
    const updateData: any = { 
      status: "published",
      publishDate: publishDate || new Date(),
    };
    
    if (expiryDate) {
      updateData.expiryDate = expiryDate;
    }

    const listing = await TrainerListing.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!listing) {
      return res.status(404).json({ success: false, message: "Trainer not found" });
    }

    res.json({ success: true, listing });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Get Pending Counts (all listing types)
// ===============================
export const getPendingCounts = async (req: Request, res: Response) => {
  try {
    const trainersCount = await TrainerListing.countDocuments({ status: "pending" });
    
    // Add more counts here when other listing models exist
    // const eventsCount = await EventListing.countDocuments({ status: "pending" });
    // etc.

    res.json({
      success: true,
      counts: {
        trainers: trainersCount,
        events: 0,
        virtualClasses: 0,
        inpersonClasses: 0,
        jobs: 0,
        blogs: 0,
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};


// ===============================
// ADMIN — Update Trainer
// ===============================
export const updateTrainerAdmin = async (req: Request, res: Response) => {
  try {
    const listing = await TrainerListing.findByIdAndUpdate(
      req.params.id,
      { ...req.body },
      { new: true }
    );

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Trainer not found",
      });
    }

    res.json({
      success: true,
      listing,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};


// ===============================
// ADMIN — Toggle Featured
// ===============================
export const toggleFeatured = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;

    const listing = await TrainerListing.findById(id)
      .populate("owner", "name email");

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Trainer not found",
      });
    }

    listing.featured = !listing.featured;
    await listing.save();

    return res.json({
      success: true,
      message: listing.featured
        ? "Trainer marked as Featured"
        : "Trainer removed from Featured",
      listing,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};


// ===============================
// ADMIN — Get Trainer by ID
// ===============================
export const adminGetTrainerById = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;

    const listing = await TrainerListing.findById(id);
    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Trainer not found",
      });
    }

    return res.json({ success: true, listing });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ===============================
// PUBLIC — Get All Trainers (with filters)
// ===============================
export const getAllTrainers = async (req: Request, res: Response) => {
  try {
    const {
      search,
      category,
      city,
      state,
      country,
      sort = "newest",
      page = 1,
      limit = 12,
      featured,
    } = req.query;

    // Build query - only show published/approved trainers
    const query: any = {
      status: { $in: ["approved", "published"] }
    };

    // Search filter
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { city: { $regex: search, $options: "i" } },
        { state: { $regex: search, $options: "i" } },
      ];
    }

    // Category filter
    if (category && category !== "all") {
      query.category = category;
    }

    // Location filters
    if (city) query.city = { $regex: city, $options: "i" };
    if (state) query.state = { $regex: state, $options: "i" };
    if (country) query.country = { $regex: country, $options: "i" };

    // Featured only filter
    if (featured === "true") {
      query.featured = true;
    }

    // Sort options
    let sortOption: any = { createdAt: -1 }; // newest
    if (sort === "oldest") sortOption = { createdAt: 1 };
    if (sort === "popular") sortOption = { views: -1 };
    if (sort === "az") sortOption = { title: 1 };
    if (sort === "za") sortOption = { title: -1 };

    // Pagination
    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 12;
    const skip = (pageNum - 1) * limitNum;

    // Execute query
    const [trainers, total] = await Promise.all([
      TrainerListing.find(query)
        .sort(sortOption)
        .skip(skip)
        .limit(limitNum)
        .select("-adminNotes"), // Don't expose admin notes publicly
      TrainerListing.countDocuments(query)
    ]);

    return res.json({
      success: true,
      trainers,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      }
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ===============================
// PUBLIC — Get Featured Trainers
// ===============================
export const getFeaturedTrainers = async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 4;
    
    const trainers = await TrainerListing.find({
      featured: true,
      status: { $in: ["approved", "published"] }
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select("-adminNotes");

    return res.json({ success: true, trainers });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
