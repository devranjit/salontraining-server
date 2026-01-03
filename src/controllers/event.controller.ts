import { Request, Response } from "express";
import mongoose from "mongoose";
import { Event } from "../models/Event";
import { moveToRecycleBin } from "../services/recycleBinService";
import { User } from "../models/User";

const normalizeCategory = (value?: string) => (value || "").trim();
const normalizeTags = (tags: any): string[] => {
  let list: string[] = [];
  if (Array.isArray(tags)) list = tags as string[];
  else if (typeof tags === "string") list = tags.split(",").map((t) => t.trim());
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

// ===============================
// PUBLIC — Get All Events (Published)
// ===============================
export const getEvents = async (req: Request, res: Response) => {
  try {
    const {
      search,
      category,
      city,
      state,
      startDate,
      endDate,
      sort = "upcoming",
      page = 1,
      limit = 12,
      featured,
      eventType, // "show" or "event" or "all"
    } = req.query;

    // Build query - only show published/approved events
    const query: any = {
      status: { $in: ["approved", "published"] }
    };

    // Event Type filter (show or event)
    if (eventType && eventType !== "all") {
      query.eventType = eventType;
    }

    // Search filter
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { venue: { $regex: search, $options: "i" } },
      ];
    }

    // Category filter
    if (category && category !== "all") {
      query.category = category;
    }

    // Location filters
    if (city) query.city = { $regex: city, $options: "i" };
    if (state) query.state = { $regex: state, $options: "i" };

    // Date filters
    if (startDate) {
      query.startDate = { $gte: new Date(startDate as string) };
    }
    if (endDate) {
      query.endDate = { $lte: new Date(endDate as string) };
    }

    // Featured filter
    if (featured === "true") {
      query.featured = true;
    }

    // Only filter by upcoming date when sort is "upcoming" (not newest/oldest)
    if (sort === "upcoming" && !startDate) {
      query.startDate = { $gte: new Date() };
    }

    // Sort options
    let sortOption: any = { startDate: 1 }; // upcoming first
    if (sort === "newest") sortOption = { createdAt: -1 };
    if (sort === "oldest") sortOption = { createdAt: 1 };
    if (sort === "popular") sortOption = { views: -1 };
    if (sort === "az") sortOption = { title: 1 };
    if (sort === "za") sortOption = { title: -1 };

    // Pagination
    const skip = (Number(page) - 1) * Number(limit);

    const [events, total] = await Promise.all([
      Event.find(query)
        .sort(sortOption)
        .skip(skip)
        .limit(Number(limit))
        .select("-adminNotes"),
      Event.countDocuments(query),
    ]);

    return res.json({
      success: true,
      events,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ===============================
// PUBLIC — Get Featured Events/Shows
// ===============================
export const getFeaturedEvents = async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 4;
    const { eventType } = req.query;
    
    const query: any = {
      featured: true,
      status: { $in: ["approved", "published"] },
      startDate: { $gte: new Date() }, // Only upcoming events
    };

    // Filter by type if specified
    if (eventType && eventType !== "all") {
      query.eventType = eventType;
    }

    const events = await Event.find(query)
      .sort({ startDate: 1 })
      .limit(limit)
      .select("-adminNotes");

    return res.json({ success: true, events });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// PUBLIC — Get Single Event
// ===============================
export const getSingleEvent = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const query = mongoose.Types.ObjectId.isValid(id)
      ? { $or: [{ _id: id }, { slug: id }] }
      : { slug: id };

    const event = await Event.findOne(query).populate("owner", "name email");

    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found" });
    }

    // Increment views
    event.views += 1;
    await event.save();

    return res.json({ success: true, event });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// USER — Create Event/Show
// ===============================
export const createEvent = async (req: any, res: Response) => {
  try {
    const body: {
      eventType?: string;
      title?: string;
      description?: string;
      email?: string;
      phone?: string;
      website?: string;
      facebook?: string;
      instagram?: string;
      twitter?: string;
      tiktok?: string;
      youtube?: string;
      videoUrl?: string;
      startDate?: string;
      endDate?: string;
      allDay?: boolean;
      startTime?: string;
      endTime?: string;
      address?: string;
      city?: string;
      state?: string;
      zip?: string;
      country?: string;
      coords?: any;
      venue?: string;
      category?: string;
      tags?: any;
      gallery?: any[];
      thumbnail?: any;
      specialOffers?: string;
      ticketUrl?: string;
      ticketPrice?: string;
      capacity?: number;
    } = req.body;

    const eventType = body.eventType;
    const title = body.title;
    const description = body.description;
    const email = body.email;
    const phone = body.phone;
    const website = body.website;
    const facebook = body.facebook;
    const instagram = body.instagram;
    const twitter = body.twitter;
    const tiktok = body.tiktok;
    const youtube = body.youtube;
    const videoUrl = body.videoUrl;
    const startDate = body.startDate;
    const endDate = body.endDate;
    const allDay = body.allDay;
    const startTime = body.startTime;
    const endTime = body.endTime;
    const address = body.address;
    const city = body.city;
    const state = body.state;
    const zip = body.zip;
    const country = body.country;
    const coords = body.coords;
    const venue = body.venue;
    const category = normalizeCategory(body.category);
    const tags = normalizeTags(body.tags);
    const gallery = body.gallery;
    const thumbnail = body.thumbnail;
    const specialOffers = body.specialOffers;
    const ticketUrl = body.ticketUrl;
    const ticketPrice = body.ticketPrice;
    const capacity = body.capacity;

    if (!title || !description || !email || !startDate) {
      return res.status(400).json({
        success: false,
        message: "Title, description, email, and start date are required",
      });
    }

    const event = await Event.create({
      owner: req.user.id,
      eventType: eventType || "event",
      title,
      description,
      email,
      phone,
      website,
      facebook,
      instagram,
      twitter,
      tiktok,
      youtube,
      videoUrl,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : undefined,
      allDay,
      startTime,
      endTime,
      address,
      city,
      state,
      zip,
      country,
      coords,
      venue,
      category,
      tags,
      gallery: gallery || [],
      thumbnail: thumbnail || (gallery && gallery[0]) || null,
      specialOffers,
      ticketUrl,
      ticketPrice,
      capacity,
      status: "pending",
    });

    const typeLabel = eventType === "show" ? "Show" : "Event";
    return res.status(201).json({
      success: true,
      message: `${typeLabel} submitted for review`,
      event,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// USER — Get My Events
// ===============================
export const getMyEvents = async (req: any, res: Response) => {
  try {
    const events = await Event.find({ owner: req.user.id })
      .sort({ createdAt: -1 });

    return res.json({ success: true, events });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// USER — Get Single My Event by ID
// ===============================
export const getMyEventById = async (req: any, res: Response) => {
  try {
    const event = await Event.findOne({
      _id: req.params.id,
      owner: req.user.id,
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found or unauthorized",
      });
    }

    return res.json({ success: true, event });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// USER — Update My Event
// ===============================
export const updateMyEvent = async (req: any, res: Response) => {
  try {
    const event = await Event.findOne({
      _id: req.params.id,
      owner: req.user.id,
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found or unauthorized",
      });
    }

    // Don't allow changing status
    const { status, featured, adminNotes, ...updateData }: any = req.body;

    if (updateData.category !== undefined) {
      updateData.category = normalizeCategory(updateData.category);
    }
    if (updateData.tags !== undefined) {
      updateData.tags = normalizeTags(updateData.tags);
    }

    // If event was published, set back to pending for review
    if (event.status === "published") {
      updateData.status = "pending";
    }

    // Convert date strings to Date objects
    if (updateData.startDate) {
      updateData.startDate = new Date(updateData.startDate);
    }
    if (updateData.endDate) {
      updateData.endDate = new Date(updateData.endDate);
    }

    const updated = await Event.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    return res.json({
      success: true,
      message: "Event updated",
      event: updated,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// USER — Delete My Event
// ===============================
export const deleteMyEvent = async (req: any, res: Response) => {
  try {
    const event = await Event.findOne({
      _id: req.params.id,
      owner: req.user.id,
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found or unauthorized",
      });
    }

    await moveToRecycleBin("event", event, { deletedBy: req.user?.id });

    return res.json({ success: true, message: "Event moved to recycle bin" });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Get All Events/Shows
// ===============================
export const adminGetAllEvents = async (req: Request, res: Response) => {
  try {
    const { status, featured, eventType, page = 1, limit = 20 } = req.query;

    const query: any = {};
    if (status) query.status = status;
    if (featured === "true") query.featured = true;
    if (eventType && eventType !== "all") query.eventType = eventType;

    const skip = (Number(page) - 1) * Number(limit);

    const [events, total] = await Promise.all([
      Event.find(query)
        .populate("owner", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Event.countDocuments(query),
    ]);

    return res.json({
      success: true,
      events,
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
};

// ===============================
// ADMIN — Get Single Event
// ===============================
export const adminGetEventById = async (req: Request, res: Response) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate("owner", "name email");

    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found" });
    }

    return res.json({ success: true, event });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Update Event
// ===============================
export const adminUpdateEvent = async (req: Request, res: Response) => {
  try {
    const updateData: any = { ...req.body };

    if (updateData.category !== undefined) {
      updateData.category = normalizeCategory(updateData.category);
    }
    if (updateData.tags !== undefined) {
      updateData.tags = normalizeTags(updateData.tags);
    }

    // Convert date strings to Date objects
    if (updateData.startDate) {
      updateData.startDate = new Date(updateData.startDate);
    }
    if (updateData.endDate) {
      updateData.endDate = new Date(updateData.endDate);
    }

    const event = await Event.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found" });
    }

    return res.json({ success: true, event });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Change Event Owner
// ===============================
export const adminChangeEventOwner = async (req: Request, res: Response) => {
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

    const event = await Event.findByIdAndUpdate(
      req.params.id,
      { owner: newOwner._id },
      { new: true }
    ).populate("owner", "name email");

    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found" });
    }

    return res.json({
      success: true,
      message: "Event author updated",
      event,
      owner: event.owner,
    });
  } catch (err: any) {
    if (err.name === "CastError") {
      return res.status(400).json({ success: false, message: "Invalid ID supplied" });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Delete Event
// ===============================
export const adminDeleteEvent = async (req: any, res: Response) => {
  try {
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found" });
    }

    await moveToRecycleBin("event", event, { deletedBy: req.user?.id });

    return res.json({ success: true, message: "Event moved to recycle bin" });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Approve Event
// ===============================
export const approveEvent = async (req: Request, res: Response) => {
  try {
    const event = await Event.findByIdAndUpdate(
      req.params.id,
      { status: "approved" },
      { new: true }
    );

    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found" });
    }

    return res.json({ success: true, message: "Event approved", event });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Publish Event
// ===============================
export const publishEvent = async (req: Request, res: Response) => {
  try {
    const event = await Event.findByIdAndUpdate(
      req.params.id,
      { status: "published" },
      { new: true }
    );

    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found" });
    }

    return res.json({ success: true, message: "Event published", event });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Reject Event
// ===============================
export const rejectEvent = async (req: Request, res: Response) => {
  try {
    const event = await Event.findByIdAndUpdate(
      req.params.id,
      { status: "rejected", adminNotes: req.body.notes || "" },
      { new: true }
    );

    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found" });
    }

    return res.json({ success: true, message: "Event rejected", event });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Request Changes
// ===============================
export const requestChangesEvent = async (req: Request, res: Response) => {
  try {
    const event = await Event.findByIdAndUpdate(
      req.params.id,
      { status: "changes_requested", adminNotes: req.body.notes || "" },
      { new: true }
    );

    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found" });
    }

    return res.json({ success: true, message: "Changes requested", event });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Set to Pending
// ===============================
export const setEventPending = async (req: Request, res: Response) => {
  try {
    const event = await Event.findByIdAndUpdate(
      req.params.id,
      { status: "pending" },
      { new: true }
    );

    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found" });
    }

    return res.json({ success: true, message: "Event set to pending", event });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Toggle Featured
// ===============================
export const toggleFeaturedEvent = async (req: Request, res: Response) => {
  try {
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found" });
    }

    event.featured = !event.featured;
    await event.save();

    return res.json({
      success: true,
      message: event.featured ? "Event featured" : "Event unfeatured",
      event,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Get Pending Counts
// ===============================
export const getEventPendingCounts = async (req: Request, res: Response) => {
  try {
    const pendingCount = await Event.countDocuments({ status: "pending" });

    return res.json({
      success: true,
      counts: {
        events: pendingCount,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// PUBLIC — Suggestions (categories & tags)
// ===============================
export const getEventSuggestions = async (req: Request, res: Response) => {
  try {
    const { search = "" } = req.query;
    const regex = new RegExp(String(search), "i");

    const [categoriesRaw, tagsRaw] = await Promise.all([
      Event.distinct("category", { category: { $ne: "" } }),
      Event.distinct("tags"),
    ]);

    const unique = (arr: string[]) =>
      Array.from(
        new Set(
          arr
            .map((v) => (v || "").trim())
            .filter(Boolean)
            .filter((v) => regex.test(v))
        )
      );

    return res.json({
      success: true,
      categories: unique(categoriesRaw as string[]),
      tags: unique(tagsRaw as string[]),
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

