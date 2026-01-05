import { Request, Response } from "express";
import { TrainerListing } from "../models/TrainerListing";
import User from "../models/User";
import mongoose from "mongoose";
import { createNotification, notifyAdmins } from "./notification.controller";
import { createVersionSnapshot } from "../services/versionHistoryService";

const normalizeCategory = (value?: string) => {
  const trimmed = (value || "").trim();
  return trimmed;
};

const normalizeTags = (tags: any): string[] => {
  let list: string[] = [];
  if (Array.isArray(tags)) list = tags as string[];
  else if (typeof tags === "string") {
    list = tags.split(",").map((t) => t.trim());
  }

  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const tag of list) {
    const val = (tag || "").trim();
    if (!val) continue;
    const key = val.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(val);
    if (cleaned.length >= 5) break;
  }
  return cleaned;
};

// Helper to normalize user id across decoded tokens
const currentUserId = (req: any) => req.user?._id || req.user?.id;

// ===============================
// USER — Create Trainer Listing
// ===============================
export const createTrainer = async (req: any, res: Response) => {
  try {
    const category = normalizeCategory(req.body.category);
    const tags = normalizeTags(req.body.tags);

    const listing = await TrainerListing.create({
      owner: req.user.id,
      ...req.body,
      category,
      tags,
      status: "pending",
    });

    // Notify admins about new submission
    notifyAdmins(
      "new_submission",
      "New Trainer Submission",
      `${req.user.name || req.user.email} submitted a new trainer listing "${listing.title}" for review.`,
      "/dashboard/admin/trainers",
      { listingId: listing._id, listingType: "trainer", submittedBy: req.user.id }
    ).catch((err) => console.error("Admin notification error:", err));

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

    const pendingBody = req.body?.changes || req.body || {};
    if (pendingBody.category !== undefined) {
      pendingBody.category = normalizeCategory(pendingBody.category);
    }
    if (pendingBody.tags !== undefined) {
      pendingBody.tags = normalizeTags(pendingBody.tags);
    }

    listing.pendingAction = "update";
    listing.pendingChanges = pendingBody;
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
    const {
      page = 1,
      limit = 30,
      search,
      status,
      sort = "newest",
    } = req.query;

    const query: any = {};
    if (status && status !== "all") query.status = status;

    let ownerIds: string[] | undefined;
    if (search) {
      // Escape special regex characters
      const escapedSearch = (search as string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Word boundary regex for exact word match on title
      const wordBoundaryRegex = new RegExp(`\\b${escapedSearch}\\b`, "i");
      // Partial match for email (need to match parts of email)
      const partialRegex = new RegExp(escapedSearch, "i");
      const owners = await User.find({ email: partialRegex }).select("_id");
      ownerIds = owners.map((o: any) => o._id.toString());
      query.$or = [
        { title: wordBoundaryRegex },
        { email: partialRegex },
        ...(ownerIds && ownerIds.length ? [{ owner: { $in: ownerIds } }] : []),
      ];
    }

    const sortMap: Record<string, any> = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
    };
    const sortOption = sortMap[(sort as string) || "newest"] || { createdAt: -1 };

    const skip = (Number(page) - 1) * Number(limit);

    const [trainers, total] = await Promise.all([
      TrainerListing.find(query)
        .populate("owner", "name email")
        .sort(sortOption)
        .skip(skip)
        .limit(Number(limit)),
      TrainerListing.countDocuments(query),
    ]);

    return res.json({
      success: true,
      trainers,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
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
export const approveTrainer = async (req: any, res: Response) => {
  try {
    // Get current state for version history
    const currentListing = await TrainerListing.findById(req.params.id);
    if (currentListing) {
      await createVersionSnapshot("trainer", currentListing, {
        changedBy: req.user?._id?.toString(),
        changedByName: req.user?.name,
        changedByEmail: req.user?.email,
        changeType: "status_change",
        newData: { status: "approved" },
      });
    }

    const listing = await TrainerListing.findByIdAndUpdate(
      req.params.id,
      { status: "approved" },
      { new: true }
    );

    // Send notification to the listing owner
    if (listing?.owner) {
      createNotification(
        listing.owner,
        "listing_approved",
        "Trainer Listing Approved",
        `Your trainer listing "${listing.title}" has been approved and is now live!`,
        "/dashboard/my-trainers",
        { listingId: listing._id, listingType: "trainer" }
      ).catch((err) => console.error("Notification error:", err));
    }

    res.json({ success: true, listing });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Reject Trainer
// ===============================
export const rejectTrainer = async (req: any, res: Response) => {
  try {
    // Get current state for version history
    const currentListing = await TrainerListing.findById(req.params.id);
    if (currentListing) {
      await createVersionSnapshot("trainer", currentListing, {
        changedBy: req.user?._id?.toString(),
        changedByName: req.user?.name,
        changedByEmail: req.user?.email,
        changeType: "status_change",
        newData: { status: "rejected" },
      });
    }

    const listing = await TrainerListing.findByIdAndUpdate(
      req.params.id,
      { status: "rejected" },
      { new: true }
    );

    // Send notification to the listing owner
    if (listing?.owner) {
      createNotification(
        listing.owner,
        "listing_rejected",
        "Trainer Listing Rejected",
        `Your trainer listing "${listing.title}" has been rejected. Please review and resubmit.`,
        "/dashboard/my-trainers",
        { listingId: listing._id, listingType: "trainer" }
      ).catch((err) => console.error("Notification error:", err));
    }

    res.json({ success: true, listing });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Update Trainer
// ===============================
export async function updateTrainerAdmin(req: any, res: Response) {
  try {
    const { id } = req.params;
    const category = normalizeCategory(req.body.category);
    const tags = req.body.tags !== undefined ? normalizeTags(req.body.tags) : undefined;

    // Get current state before update for version history
    const currentListing = await TrainerListing.findById(id);
    if (!currentListing) {
      return res.status(404).json({ success: false, message: "Trainer not found" });
    }

    // Create version snapshot before update
    await createVersionSnapshot("trainer", currentListing, {
      changedBy: req.user?._id?.toString(),
      changedByName: req.user?.name,
      changedByEmail: req.user?.email,
      changeType: "update",
      newData: req.body,
    });

    const updatePayload: any = {
      ...req.body,
    };

    if (req.body.category !== undefined) updatePayload.category = category;
    if (tags !== undefined) updatePayload.tags = tags;

    const listing = await TrainerListing.findByIdAndUpdate(id, updatePayload, { new: true });

    return res.json({ success: true, listing });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

// ===============================
// ADMIN — Set Pending
// ===============================
export async function setPendingTrainer(req: any, res: Response) {
  try {
    // Get current state for version history
    const currentListing = await TrainerListing.findById(req.params.id);
    if (!currentListing) {
      return res.status(404).json({
        success: false,
        message: "Trainer not found",
      });
    }

    await createVersionSnapshot("trainer", currentListing, {
      changedBy: req.user?._id?.toString(),
      changedByName: req.user?.name,
      changedByEmail: req.user?.email,
      changeType: "status_change",
      newData: { status: "pending" },
    });

    const listing = await TrainerListing.findByIdAndUpdate(
      req.params.id,
      { status: "pending" },
      { new: true }
    );

    return res.json({ success: true, listing });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

// ===============================
// ADMIN — Request Changes
// ===============================
export async function requestChanges(req: any, res: Response) {
  try {
    const { adminNotes } = req.body;
    
    // Get current state for version history
    const currentListing = await TrainerListing.findById(req.params.id);
    if (!currentListing) {
      return res.status(404).json({
        success: false,
        message: "Trainer not found",
      });
    }

    await createVersionSnapshot("trainer", currentListing, {
      changedBy: req.user?._id?.toString(),
      changedByName: req.user?.name,
      changedByEmail: req.user?.email,
      changeType: "status_change",
      newData: { status: "changes_requested", adminNotes },
    });

    const listing = await TrainerListing.findByIdAndUpdate(
      req.params.id,
      { status: "changes_requested", adminNotes },
      { new: true }
    );

    return res.json({ success: true, listing });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

// ===============================
// ADMIN — Publish Trainer
// ===============================
export async function publishTrainer(req: any, res: Response) {
  try {
    // Get current state for version history
    const currentListing = await TrainerListing.findById(req.params.id);
    if (!currentListing) {
      return res.status(404).json({
        success: false,
        message: "Trainer not found",
      });
    }

    await createVersionSnapshot("trainer", currentListing, {
      changedBy: req.user?._id?.toString(),
      changedByName: req.user?.name,
      changedByEmail: req.user?.email,
      changeType: "status_change",
      newData: { status: "published" },
    });

    const listing = await TrainerListing.findByIdAndUpdate(
      req.params.id,
      { status: "published", publishDate: new Date() },
      { new: true }
    );

    return res.json({ success: true, listing });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
}


// ===============================
// ADMIN — Toggle Featured
// ===============================
export const toggleFeatured = async (req: any, res: Response) => {
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

    // Create version snapshot before toggle
    await createVersionSnapshot("trainer", listing, {
      changedBy: req.user?._id?.toString(),
      changedByName: req.user?.name,
      changedByEmail: req.user?.email,
      changeType: "update",
      newData: { featured: !listing.featured },
    });

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
    const { 
      search, 
      searchType, // 'tag', 'category', 'title', 'city', or undefined for general search
      category, 
      city, 
      tag, // exact tag search
      sort, 
      page = 1, 
      limit = 12 
    } = req.query;
    
    const query: any = { status: { $in: ["approved", "published"] } };

    // Category filter (exact match, case-insensitive)
    if (category) {
      query.category = { $regex: `^${category}$`, $options: "i" };
    }
    
    // City filter
    if (city) query.city = { $regex: city as string, $options: "i" };
    
    // Tag filter (exact match, case-insensitive)
    if (tag) {
      query.tags = { $regex: `^${tag}$`, $options: "i" };
    }
    
    // Search with type-specific behavior
    if (search) {
      const searchTerm = (search as string).trim();
      const escapedSearch = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      if (searchType === 'tag') {
        // Exact tag match (case-insensitive)
        query.tags = { $regex: `^${escapedSearch}$`, $options: "i" };
      } else if (searchType === 'category') {
        // Exact category match (case-insensitive)
        query.category = { $regex: `^${escapedSearch}$`, $options: "i" };
      } else if (searchType === 'title') {
        // Partial title match
        query.title = { $regex: escapedSearch, $options: "i" };
      } else if (searchType === 'city') {
        // Partial city/state match
        query.$or = [
          { city: { $regex: escapedSearch, $options: "i" } },
          { state: { $regex: escapedSearch, $options: "i" } },
        ];
      } else {
        // General search: partial match for title/city, exact for tags/categories
        const partialRegex = { $regex: escapedSearch, $options: "i" };
        const exactRegex = { $regex: `^${escapedSearch}$`, $options: "i" };
        
        query.$or = [
          { title: partialRegex },
          { city: partialRegex },
          { state: partialRegex },
          { tags: exactRegex },
          { category: exactRegex },
        ];
      }
    }

    const baseSort = { featured: -1 }; // keep featured trainers first
    const sortOption: Record<string, any> = {
      newest: { ...baseSort, createdAt: -1 },
      oldest: { ...baseSort, createdAt: 1 },
      popular: { ...baseSort, views: -1, createdAt: -1 },
      az: { ...baseSort, title: 1 },
      za: { ...baseSort, title: -1 },
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

// ===============================
// PUBLIC — Suggestions (categories, tags, titles, cities)
// ===============================
export async function getTrainerSuggestions(req: Request, res: Response) {
  try {
    const { search = "" } = req.query;
    const searchTerm = String(search).trim();
    
    if (!searchTerm || searchTerm.length < 2) {
      return res.json({
        success: true,
        categories: [],
        tags: [],
        titles: [],
        cities: [],
      });
    }

    const regex = new RegExp(searchTerm, "i");

    // Get all distinct values from published trainers
    const [categoriesRaw, tagsRaw, titlesRaw, citiesRaw, statesRaw] = await Promise.all([
      TrainerListing.distinct("category", { 
        category: { $ne: "" },
        status: { $in: ["approved", "published"] }
      }),
      TrainerListing.distinct("tags", {
        status: { $in: ["approved", "published"] }
      }),
      TrainerListing.find({
        status: { $in: ["approved", "published"] },
        title: regex
      }).select("title").limit(10).lean(),
      TrainerListing.distinct("city", { 
        city: { $ne: "" },
        status: { $in: ["approved", "published"] }
      }),
      TrainerListing.distinct("state", { 
        state: { $ne: "" },
        status: { $in: ["approved", "published"] }
      }),
    ]);

    // Filter and dedupe categories
    const categories = (categoriesRaw as string[])
      .map((c) => (c || "").trim())
      .filter(Boolean)
      .filter((c) => regex.test(c));

    // Filter and dedupe tags
    const tags = (tagsRaw as string[])
      .flat()
      .map((t) => (t || "").trim())
      .filter(Boolean)
      .filter((t) => regex.test(t));

    // Extract titles
    const titles = titlesRaw.map((t: any) => t.title);

    // Filter cities and states, combine as locations
    const cities = (citiesRaw as string[])
      .map((c) => (c || "").trim())
      .filter(Boolean)
      .filter((c) => regex.test(c));

    const states = (statesRaw as string[])
      .map((s) => (s || "").trim())
      .filter(Boolean)
      .filter((s) => regex.test(s));

    const unique = (arr: string[]) => Array.from(new Set(arr));

    return res.json({
      success: true,
      categories: unique(categories).slice(0, 10),
      tags: unique(tags).slice(0, 10),
      titles: unique(titles).slice(0, 10),
      cities: unique([...cities, ...states]).slice(0, 10),
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
}
