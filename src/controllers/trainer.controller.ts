import { Request, Response } from "express";
import { TrainerListing } from "../models/TrainerListing";
import mongoose from "mongoose";
import { moveToRecycleBin } from "../services/recycleBinService";
import { User } from "../models/User";

const DISALLOWED_UPDATE_FIELDS = [
  "_id",
  "owner",
  "status",
  "pendingAction",
  "pendingChanges",
  "pendingReason",
  "pendingRequestedAt",
  "statusBeforePending",
  "featured",
  "views",
  "createdAt",
  "updatedAt",
];

function sanitizePendingPayload(payload: any) {
  const safe: any = {};
  Object.entries(payload || {}).forEach(([key, value]) => {
    if (!DISALLOWED_UPDATE_FIELDS.includes(key)) {
      safe[key] = value;
    }
  });
  return safe;
}

function clearPendingMeta(listing: any) {
  listing.pendingAction = undefined;
  listing.pendingChanges = undefined;
  listing.pendingReason = undefined;
  listing.pendingRequestedAt = undefined;
  listing.statusBeforePending = undefined;
}

function applyPendingUpdate(listing: any) {
  if (listing.pendingAction === "update" && listing.pendingChanges) {
    const sanitized = sanitizePendingPayload(listing.pendingChanges);
    Object.assign(listing, sanitized);
  }
  clearPendingMeta(listing);
}

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

export const getMyTrainerDetail = async (req: any, res: Response) => {
  try {
    const listing = await TrainerListing.findOne({
      _id: req.params.id,
      owner: req.user?.id || req.user?._id,
    });

    if (!listing) {
      return res
        .status(404)
        .json({ success: false, message: "Listing not found" });
    }

    return res.json({ success: true, listing });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err?.message || "Server error",
    });
  }
};

export const requestTrainerUpdate = async (req: any, res: Response) => {
  try {
    const listing = await TrainerListing.findOne({
      _id: req.params.id,
      owner: req.user?.id || req.user?._id,
    });

    if (!listing) {
      return res
        .status(404)
        .json({ success: false, message: "Listing not found" });
    }

    const pendingChanges = sanitizePendingPayload(req.body);

    listing.pendingAction = "update";
    listing.pendingChanges = pendingChanges;
    listing.pendingReason = req.body?.requestNote || "";
    listing.pendingRequestedAt = new Date();
    listing.statusBeforePending = listing.status;
    listing.status = "pending";
    listing.adminNotes =
      "User submitted updates for review. Please verify the pending changes.";

    await listing.save();

    return res.json({
      success: true,
      message: "Update submitted for admin review",
      listing,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err?.message || "Server error",
    });
  }
};

export const requestTrainerDelete = async (req: any, res: Response) => {
  try {
    const listing = await TrainerListing.findOne({
      _id: req.params.id,
      owner: req.user?.id || req.user?._id,
    });

    if (!listing) {
      return res
        .status(404)
        .json({ success: false, message: "Listing not found" });
    }

    listing.pendingAction = "delete";
    listing.pendingChanges = null;
    listing.pendingReason = req.body?.reason || "";
    listing.pendingRequestedAt = new Date();
    listing.statusBeforePending = listing.status;
    listing.status = "pending";
    listing.adminNotes =
      "User requested this listing to be deleted. Approve to remove.";

    await listing.save();

    return res.json({
      success: true,
      message: "Delete request submitted for admin approval",
      listing,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err?.message || "Server error",
    });
  }
};


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
    const listing = await TrainerListing.findById(req.params.id);

    if (!listing) {
      return res
        .status(404)
        .json({ success: false, message: "Trainer not found" });
    }

    if (listing.pendingAction === "delete") {
      await listing.deleteOne();
      return res.json({
        success: true,
        deleted: true,
        message: "Delete request approved",
      });
    }

    const previousStatus = listing.statusBeforePending;

    if (listing.pendingAction === "update") {
      applyPendingUpdate(listing);
    } else {
      clearPendingMeta(listing);
    }

    listing.status = (previousStatus || "approved") as "pending" | "approved" | "rejected" | "changes_requested" | "published";

    await listing.save();

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
    const listing = await TrainerListing.findById(req.params.id);

    if (!listing) {
      return res
        .status(404)
        .json({ success: false, message: "Trainer not found" });
    }

    if (listing.pendingAction) {
      const previousStatus = listing.statusBeforePending || listing.status || "approved";
      clearPendingMeta(listing);
      listing.status = previousStatus as "pending" | "approved" | "rejected" | "changes_requested" | "published";
      await listing.save();
      return res.json({
        success: true,
        listing,
        message: "Pending request rejected",
      });
    }

    listing.status = "rejected";
    await listing.save();

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

    const listing = await TrainerListing.findById(req.params.id);

    if (!listing) {
      return res
        .status(404)
        .json({ success: false, message: "Trainer not found" });
    }

    if (listing.pendingAction === "delete") {
      await listing.deleteOne();
      return res.json({
        success: true,
        deleted: true,
        message: "Delete request approved",
      });
    }

    if (listing.pendingAction === "update") {
      applyPendingUpdate(listing);
    } else {
      clearPendingMeta(listing);
    }

    listing.status = "published";
    listing.publishDate = publishDate || new Date();
    listing.expiryDate = expiryDate || listing.expiryDate;

    await listing.save();

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
// ADMIN — Change Trainer Owner
// ===============================
export const adminChangeTrainerOwner = async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, message: "User ID is required" });
    }

    const newOwner = await User.findById(userId).select("name email status");
    if (!newOwner) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (newOwner.status === "blocked") {
      return res.status(400).json({ success: false, message: "Blocked users cannot own listings" });
    }

    const listing = await TrainerListing.findByIdAndUpdate(
      req.params.id,
      { owner: newOwner._id },
      { new: true }
    ).populate("owner", "name email");

    if (!listing) {
      return res.status(404).json({ success: false, message: "Trainer not found" });
    }

    return res.json({
      success: true,
      message: "Trainer owner updated",
      listing,
      owner: listing.owner,
    });
  } catch (err: any) {
    if (err.name === "CastError") {
      return res.status(400).json({ success: false, message: "Invalid ID supplied" });
    }
    return res.status(500).json({ success: false, message: err.message });
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
// ADMIN — Delete Trainer
// ===============================
export const adminDeleteTrainer = async (req: any, res: Response) => {
  try {
    const listing = await TrainerListing.findById(req.params.id);

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Trainer not found",
      });
    }

    await moveToRecycleBin("trainer", listing, { deletedBy: req.user?.id });

    return res.json({
      success: true,
      message: "Trainer listing moved to recycle bin",
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err?.message || "Failed to delete trainer",
    });
  }
};


// ===============================
// ADMIN — Get Trainer by ID
// ===============================
export const adminGetTrainerById = async (req: Request, res: Response) => {
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
