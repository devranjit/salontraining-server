import { Request, Response } from "express";
import { UpcomingMembersClass } from "../models/UpcomingMembersClass";
import { moveToRecycleBin } from "../services/recycleBinService";

// Normalize a DB document so the frontend always gets consistent field names.
// Handles both old-schema docs (classDate, instructor, thumbnail, isActive, sortOrder)
// and new-schema docs (class_date, trainer_name, thumbnail_image, status, position).
function normalize(doc: any) {
  const o = typeof doc.toObject === "function" ? doc.toObject({ virtuals: true }) : { ...doc };

  // id
  if (!o.id && o._id) o.id = o._id.toString();

  // slug fallback
  if (!o.slug && o.title) {
    o.slug = o.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
  }

  // thumbnail_image ← thumbnail
  if (!o.thumbnail_image?.url && o.thumbnail?.url) {
    o.thumbnail_image = { url: o.thumbnail.url, public_id: o.thumbnail.public_id };
  }

  // trainer_name ← instructor
  if (!o.trainer_name && o.instructor) o.trainer_name = o.instructor;

  // class_date ← classDate
  if (!o.class_date && o.classDate) {
    const d = new Date(o.classDate);
    if (!isNaN(d.getTime())) o.class_date = d.toISOString().slice(0, 10);
  }

  // class_time ← startTime
  if (!o.class_time && o.startTime) o.class_time = o.startTime;

  // duration_minutes ← duration
  if (o.duration_minutes == null && o.duration) {
    const parsed = parseInt(o.duration, 10);
    if (!isNaN(parsed)) o.duration_minutes = parsed;
  }

  // join_url ← registrationUrl | zoomLink
  if (!o.join_url) o.join_url = o.registrationUrl || o.zoomLink || "";

  // status ← isActive (old boolean scheme)
  if (!o.status) {
    if (typeof o.isActive === "boolean") {
      o.status = o.isActive ? "published" : "draft";
    } else {
      o.status = "draft";
    }
  }

  // position ← sortOrder
  if (o.position == null && o.sortOrder != null) o.position = o.sortOrder;
  if (o.position == null) o.position = 0;

  return o;
}

// Map incoming frontend field names to what we persist.
// Accepts the frontend payload and returns a clean DB-ready object.
function fromFrontend(body: any) {
  const out: any = {};

  if (body.title !== undefined) out.title = body.title;
  if (body.description !== undefined) out.description = body.description;
  if (body.trainer_name !== undefined) out.trainer_name = body.trainer_name;
  if (body.thumbnail_image !== undefined) out.thumbnail_image = body.thumbnail_image;
  if (body.class_date !== undefined) out.class_date = body.class_date;
  if (body.class_time !== undefined) out.class_time = body.class_time;
  if (body.timezone !== undefined) out.timezone = body.timezone;
  if (body.duration_minutes !== undefined) out.duration_minutes = body.duration_minutes;
  if (body.join_url !== undefined) out.join_url = body.join_url;
  if (body.status !== undefined) out.status = body.status;
  if (body.position !== undefined) out.position = body.position;

  return out;
}

// -------------------------------------------------------
// PUBLIC — list published classes
// -------------------------------------------------------
export const getActiveMembersClasses = async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 6, 50);

    const classes = await UpcomingMembersClass.find({
      $or: [
        { status: "published" },
        { isActive: true, status: { $exists: false } },
      ],
    })
      .sort({ position: 1, class_date: 1, createdAt: -1 })
      .limit(limit);

    const listings = classes.map(normalize);
    return res.json({ success: true, listings });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// -------------------------------------------------------
// PUBLIC — single class by slug
// -------------------------------------------------------
export const getClassBySlug = async (req: Request, res: Response) => {
  try {
    const doc = await UpcomingMembersClass.findOne({
      slug: req.params.slug,
      $or: [
        { status: "published" },
        { isActive: true, status: { $exists: false } },
      ],
    });

    if (!doc) {
      return res.status(404).json({ success: false, message: "Class not found" });
    }

    return res.json({ success: true, upcomingClass: normalize(doc) });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// -------------------------------------------------------
// ADMIN — list all (with optional status filter)
// -------------------------------------------------------
export const adminGetAllMembersClasses = async (req: Request, res: Response) => {
  try {
    const { status, search, limit = 200 } = req.query;
    const query: any = {};

    if (status === "trashed") {
      query.status = "trashed";
    } else {
      query.status = { $ne: "trashed" };
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { trainer_name: { $regex: search, $options: "i" } },
        { instructor: { $regex: search, $options: "i" } },
      ];
    }

    const classes = await UpcomingMembersClass.find(query)
      .populate("createdBy", "name email")
      .sort({ position: 1, createdAt: -1 })
      .limit(Number(limit));

    const listings = classes.map(normalize);
    return res.json({ success: true, listings });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// -------------------------------------------------------
// ADMIN — single by ID
// -------------------------------------------------------
export const adminGetMembersClassById = async (req: Request, res: Response) => {
  try {
    const item = await UpcomingMembersClass.findById(req.params.id).populate("createdBy", "name email");
    if (!item) {
      return res.status(404).json({ success: false, message: "Class not found" });
    }
    return res.json({ success: true, upcomingClass: normalize(item) });
  } catch (error: any) {
    if (error.name === "CastError") {
      return res.status(404).json({ success: false, message: "Class not found" });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
};

// -------------------------------------------------------
// ADMIN — create
// -------------------------------------------------------
export const createMembersClass = async (req: any, res: Response) => {
  try {
    const data = fromFrontend(req.body);

    if (!data.title || !data.title.trim()) {
      return res.status(400).json({ success: false, message: "Title is required" });
    }

    data.status = data.status || "draft";
    data.createdBy = req.user?._id;

    const newClass = new UpcomingMembersClass(data);
    await newClass.save();

    return res.status(201).json({
      success: true,
      message: "Class created successfully",
      upcomingClass: normalize(newClass),
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// -------------------------------------------------------
// ADMIN — update
// -------------------------------------------------------
export const updateMembersClass = async (req: Request, res: Response) => {
  try {
    const item = await UpcomingMembersClass.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: "Class not found" });
    }

    const data = fromFrontend(req.body);
    if (data.title !== undefined && !data.title.trim()) {
      return res.status(400).json({ success: false, message: "Title cannot be empty" });
    }

    const updated = await UpcomingMembersClass.findByIdAndUpdate(
      req.params.id,
      { $set: data },
      { new: true, runValidators: true }
    );

    return res.json({
      success: true,
      message: "Class updated successfully",
      upcomingClass: normalize(updated),
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// -------------------------------------------------------
// ADMIN — publish
// -------------------------------------------------------
export const publishMembersClass = async (req: Request, res: Response) => {
  try {
    const item = await UpcomingMembersClass.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: "Class not found" });
    }

    item.set("status", "published");
    item.set("isActive", true);
    await item.save();

    return res.json({ success: true, message: "Published", upcomingClass: normalize(item) });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// -------------------------------------------------------
// ADMIN — unpublish (revert to draft)
// -------------------------------------------------------
export const unpublishMembersClass = async (req: Request, res: Response) => {
  try {
    const item = await UpcomingMembersClass.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: "Class not found" });
    }

    item.set("status", "draft");
    item.set("isActive", false);
    await item.save();

    return res.json({ success: true, message: "Reverted to draft", upcomingClass: normalize(item) });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// -------------------------------------------------------
// ADMIN — trash (soft-delete, keeps doc in collection)
// -------------------------------------------------------
export const trashMembersClass = async (req: Request, res: Response) => {
  try {
    const item = await UpcomingMembersClass.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: "Class not found" });
    }

    item.set("status", "trashed");
    item.set("isActive", false);
    item.set("trashed_at", new Date().toISOString());
    await item.save();

    return res.json({ success: true, message: "Moved to trash" });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// -------------------------------------------------------
// ADMIN — restore from trash
// -------------------------------------------------------
export const restoreMembersClass = async (req: Request, res: Response) => {
  try {
    const item = await UpcomingMembersClass.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: "Class not found" });
    }

    item.set("status", "draft");
    item.set("isActive", false);
    item.set("trashed_at", undefined);
    await item.save();

    return res.json({ success: true, message: "Restored to draft", upcomingClass: normalize(item) });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// -------------------------------------------------------
// ADMIN — permanent delete
// -------------------------------------------------------
export const deleteMembersClass = async (req: any, res: Response) => {
  try {
    const item = await UpcomingMembersClass.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: "Class not found" });
    }

    await moveToRecycleBin("upcomingMembersClass", item, {
      deletedBy: req.user?.id,
    });

    return res.json({ success: true, message: "Permanently deleted" });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// -------------------------------------------------------
// ADMIN — reorder
// -------------------------------------------------------
export const reorderMembersClasses = async (req: Request, res: Response) => {
  try {
    const { order } = req.body;

    if (!Array.isArray(order)) {
      return res.status(400).json({ success: false, message: "Order array is required" });
    }

    const updates = order.map((item: { id: string; position: number; sortOrder?: number }) =>
      UpcomingMembersClass.findByIdAndUpdate(item.id, {
        position: item.position ?? item.sortOrder,
        sortOrder: item.position ?? item.sortOrder,
      })
    );

    await Promise.all(updates);
    return res.json({ success: true, message: "Classes reordered" });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// -------------------------------------------------------
// ADMIN — toggle active (legacy compat)
// -------------------------------------------------------
export const toggleMembersClassActive = async (req: Request, res: Response) => {
  try {
    const item = await UpcomingMembersClass.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: "Class not found" });
    }

    const currentStatus = (item as any).status || (item.get("isActive") ? "published" : "draft");
    const newStatus = currentStatus === "published" ? "draft" : "published";

    item.set("status", newStatus);
    item.set("isActive", newStatus === "published");
    await item.save();

    return res.json({
      success: true,
      message: newStatus === "published" ? "Activated" : "Deactivated",
      membersClass: normalize(item),
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
