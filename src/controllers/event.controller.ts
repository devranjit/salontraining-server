import { Request, Response } from "express";
import { Event } from "../models/Event";

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
    const event = await Event.findById(req.params.id)
      .populate("owner", "name email");

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
    const {
      eventType, // "show" or "event"
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
      startDate,
      endDate,
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
      gallery,
      thumbnail,
      specialOffers,
      ticketUrl,
      ticketPrice,
      capacity,
    } = req.body;

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
    const { status, featured, adminNotes, ...updateData } = req.body;

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
    const event = await Event.findOneAndDelete({
      _id: req.params.id,
      owner: req.user.id,
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found or unauthorized",
      });
    }

    return res.json({ success: true, message: "Event deleted" });
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
    const updateData = { ...req.body };

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
// ADMIN — Delete Event
// ===============================
export const adminDeleteEvent = async (req: Request, res: Response) => {
  try {
    const event = await Event.findByIdAndDelete(req.params.id);

    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found" });
    }

    return res.json({ success: true, message: "Event deleted" });
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

