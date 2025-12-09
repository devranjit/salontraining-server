import { Request, Response } from "express";
import { TrainerListing } from "../models/TrainerListing";
import mongoose from "mongoose";

// Helper to normalize user id across decoded tokens
const currentUserId = (req: any) => req.user?._id || req.user?.id;

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
const userId = currentUserId(req);

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
// USER — My Trainer Detail
// ===============================
export async function getMyTrainerDetail(req: any, res: Response) {
  try {
    const listing = await TrainerListing.findOne({
      _id: req.params.id,
      owner: currentUserId(req),
    });

    if (!listing) {
      return res.status(404).json({ success: false, message: "Trainer not found" });
    }

    return res.json({ success: true, listing });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

// ===============================
// USER — Request Update/Delete
// ===============================
export async function requestTrainerUpdate(req: any, res: Response) {
  try {
    const listing = await TrainerListing.findOne({
      _id: req.params.id,
      owner: currentUserId(req),
    });

    if (!listing) {
      return res.status(404).json({ success: false, message: "Trainer not found" });
    }

    listing.pendingAction = "update";
    listing.pendingChanges = req.body?.changes || req.body || {};
    listing.pendingReason = req.body?.reason || "";
    listing.pendingRequestedAt = new Date();
    listing.statusBeforePending = listing.status;
    listing.status = "changes_requested";
    await listing.save();

    return res.json({ success: true, message: "Update requested", listing });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function requestTrainerDelete(req: any, res: Response) {
  try {
    const listing = await TrainerListing.findOne({
      _id: req.params.id,
      owner: currentUserId(req),
    });

    if (!listing) {
      return res.status(404).json({ success: false, message: "Trainer not found" });
    }

    listing.pendingAction = "delete";
    listing.pendingReason = req.body?.reason || "";
    listing.pendingRequestedAt = new Date();
    listing.statusBeforePending = listing.status;
    listing.status = "pending";
    await listing.save();

    return res.json({ success: true, message: "Delete requested", listing });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
}


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
// ADMIN — Set Pending
// ===============================
export async function setPendingTrainer(req: Request, res: Response) {
  try {
    const listing = await TrainerListing.findByIdAndUpdate(
      req.params.id,
      { status: "pending" },
      { new: true }
    );

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Trainer not found",
      });
    }

    return res.json({ success: true, listing });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

// ===============================
// ADMIN — Request Changes
// ===============================
export async function requestChanges(req: Request, res: Response) {
  try {
    const { adminNotes } = req.body;
    const listing = await TrainerListing.findByIdAndUpdate(
      req.params.id,
      { status: "changes_requested", adminNotes },
      { new: true }
    );

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Trainer not found",
      });
    }

    return res.json({ success: true, listing });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

// ===============================
// ADMIN — Publish Trainer
// ===============================
export async function publishTrainer(req: Request, res: Response) {
  try {
    const listing = await TrainerListing.findByIdAndUpdate(
      req.params.id,
      { status: "published", publishDate: new Date() },
      { new: true }
    );

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Trainer not found",
      });
    }

    return res.json({ success: true, listing });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
}


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
// ADMIN — Pending Counts
// ===============================
export async function getPendingCounts(_req: Request, res: Response) {
  try {
    const [pending, approved, published, rejected] = await Promise.all([
      TrainerListing.countDocuments({ status: "pending" }),
      TrainerListing.countDocuments({ status: "approved" }),
      TrainerListing.countDocuments({ status: "published" }),
      TrainerListing.countDocuments({ status: "rejected" }),
    ]);

    return res.json({
      success: true,
      pendingCounts: { pending, approved, published, rejected },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
}


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
// ADMIN — Delete Trainer
// ===============================
export async function adminDeleteTrainer(req: Request, res: Response) {
  try {
    const listing = await TrainerListing.findByIdAndDelete(req.params.id);

    if (!listing) {
      return res.status(404).json({ success: false, message: "Trainer not found" });
    }

    return res.json({ success: true, message: "Trainer deleted", listing });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

// ===============================
// ADMIN — Change Trainer Owner
// ===============================
export async function adminChangeTrainerOwner(req: Request, res: Response) {
  try {
    const { userId } = req.body;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: "Valid userId is required" });
    }

    const listing = await TrainerListing.findByIdAndUpdate(
      req.params.id,
      { owner: userId },
      { new: true }
    );

    if (!listing) {
      return res.status(404).json({ success: false, message: "Trainer not found" });
    }

    return res.json({ success: true, listing });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

// ===============================
// PUBLIC — All / Featured
// ===============================
export async function getAllTrainers(req: Request, res: Response) {
  try {
    const { search, category, city, sort, page = 1, limit = 12 } = req.query;
    const query: any = { status: { $in: ["approved", "published"] } };

    if (category) query.category = category;
    if (city) query.city = city;
    if (search) {
      query.$or = [
        { title: { $regex: search as string, $options: "i" } },
        { description: { $regex: search as string, $options: "i" } },
        { city: { $regex: search as string, $options: "i" } },
      ];
    }

    const baseSort = { featured: -1 }; // keep featured trainers first
    const sortOption: Record<string, any> = {
      newest: { ...baseSort, createdAt: -1 },
      oldest: { ...baseSort, createdAt: 1 },
      popular: { ...baseSort, views: -1, createdAt: -1 },
    };

    const skip = (Number(page) - 1) * Number(limit);

    const [listings, total] = await Promise.all([
      TrainerListing.find(query)
        .sort(sortOption[(sort as string) || "newest"] || { ...baseSort, createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      TrainerListing.countDocuments(query),
    ]);

    return res.json({
      success: true,
      listings,
      trainers: listings, // alias for front-end compatibility
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function getFeaturedTrainers(req: Request, res: Response) {
  try {
    const { limit = 4 } = req.query;
    const listings = await TrainerListing.find({
      status: { $in: ["approved", "published"] },
      featured: true,
    })
      .sort({ createdAt: -1 })
      .limit(Number(limit));

    return res.json({ success: true, listings });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
}
