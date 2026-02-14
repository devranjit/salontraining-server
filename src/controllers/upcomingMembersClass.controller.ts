import { Request, Response } from "express";
import { UpcomingMembersClass } from "../models/UpcomingMembersClass";
import { moveToRecycleBin } from "../services/recycleBinService";

// ===============================
// PUBLIC — Get Active Members Classes
// ===============================
export const getActiveMembersClasses = async (req: Request, res: Response) => {
  try {
    const { limit = 6 } = req.query;

    const classes = await UpcomingMembersClass.find({ isActive: true })
      .sort({ sortOrder: 1, classDate: 1, createdAt: -1 })
      .limit(Number(limit));

    return res.json({ success: true, classes });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ===============================
// ADMIN — Get All Members Classes (including inactive)
// ===============================
export const adminGetAllMembersClasses = async (req: Request, res: Response) => {
  try {
    const { search, active } = req.query;

    const query: any = {};
    if (active === "true") query.isActive = true;
    if (active === "false") query.isActive = false;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { instructor: { $regex: search, $options: "i" } },
      ];
    }

    const classes = await UpcomingMembersClass.find(query)
      .populate("createdBy", "name email")
      .sort({ sortOrder: 1, createdAt: -1 });

    return res.json({ success: true, classes });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ===============================
// ADMIN — Get Single Members Class by ID
// ===============================
export const adminGetMembersClassById = async (req: Request, res: Response) => {
  try {
    const item = await UpcomingMembersClass.findById(req.params.id).populate(
      "createdBy",
      "name email"
    );
    if (!item) {
      return res
        .status(404)
        .json({ success: false, message: "Members class not found" });
    }
    return res.json({ success: true, membersClass: item });
  } catch (error: any) {
    if (error.name === "CastError") {
      return res
        .status(404)
        .json({ success: false, message: "Members class not found" });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ===============================
// ADMIN — Create Members Class
// ===============================
export const createMembersClass = async (req: any, res: Response) => {
  try {
    const {
      title,
      thumbnail,
      gallery,
      description,
      registrationUrl,
      zoomLink,
      classDate,
      classEndDate,
      startTime,
      endTime,
      duration,
      price,
      currency,
      priceNote,
      category,
      tags,
      instructor,
      videoUrl,
      isActive,
      sortOrder,
    } = req.body;

    // Validate required: title + at least one image
    if (!title || !title.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Title is required" });
    }

    if (
      (!thumbnail || !thumbnail.url) &&
      (!gallery || !gallery.length || !gallery[0]?.url)
    ) {
      return res.status(400).json({
        success: false,
        message: "At least one image (thumbnail or gallery) is required",
      });
    }

    const newClass = new UpcomingMembersClass({
      title,
      thumbnail,
      gallery,
      description,
      registrationUrl,
      zoomLink,
      classDate,
      classEndDate,
      startTime,
      endTime,
      duration,
      price,
      currency,
      priceNote,
      category,
      tags,
      instructor,
      videoUrl,
      isActive: isActive !== false,
      sortOrder: sortOrder || 0,
      createdBy: req.user?._id,
    });

    await newClass.save();

    return res.status(201).json({
      success: true,
      message: "Members class created successfully",
      membersClass: newClass,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ===============================
// ADMIN — Update Members Class
// ===============================
export const updateMembersClass = async (req: Request, res: Response) => {
  try {
    const item = await UpcomingMembersClass.findById(req.params.id);
    if (!item) {
      return res
        .status(404)
        .json({ success: false, message: "Members class not found" });
    }

    // If title is being updated, validate it
    if (req.body.title !== undefined && !req.body.title.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Title cannot be empty" });
    }

    const updated = await UpcomingMembersClass.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    return res.json({
      success: true,
      message: "Members class updated successfully",
      membersClass: updated,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ===============================
// ADMIN — Delete Members Class (soft delete → recycle bin)
// ===============================
export const deleteMembersClass = async (req: any, res: Response) => {
  try {
    const item = await UpcomingMembersClass.findById(req.params.id);
    if (!item) {
      return res
        .status(404)
        .json({ success: false, message: "Members class not found" });
    }

    await moveToRecycleBin("upcomingMembersClass", item, {
      deletedBy: req.user?.id,
    });

    return res.json({
      success: true,
      message: "Members class moved to recycle bin",
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ===============================
// ADMIN — Toggle Active Status
// ===============================
export const toggleMembersClassActive = async (
  req: Request,
  res: Response
) => {
  try {
    const item = await UpcomingMembersClass.findById(req.params.id);
    if (!item) {
      return res
        .status(404)
        .json({ success: false, message: "Members class not found" });
    }

    item.isActive = !item.isActive;
    await item.save();

    return res.json({
      success: true,
      message: item.isActive ? "Class activated" : "Class deactivated",
      membersClass: item,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ===============================
// ADMIN — Reorder Members Classes
// ===============================
export const reorderMembersClasses = async (req: Request, res: Response) => {
  try {
    const { order } = req.body; // array of { id, sortOrder }

    if (!Array.isArray(order)) {
      return res
        .status(400)
        .json({ success: false, message: "Order array is required" });
    }

    const updates = order.map((item: { id: string; sortOrder: number }) =>
      UpcomingMembersClass.findByIdAndUpdate(item.id, {
        sortOrder: item.sortOrder,
      })
    );

    await Promise.all(updates);

    return res.json({
      success: true,
      message: "Classes reordered successfully",
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
