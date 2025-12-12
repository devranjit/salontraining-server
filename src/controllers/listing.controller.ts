import { Request, Response } from "express";
import { Listing } from "../models/Listing";
import { moveToRecycleBin } from "../services/recycleBinService";
import { expireOutdatedListings } from "../services/listingLifecycleService";

export const createListing = async (req: any, res: Response) => {
  try {
    const now = new Date();
    const publishDate = req.body.publishDate
      ? new Date(req.body.publishDate)
      : now;
    let expiryDate =
      "expiryDate" in req.body
        ? req.body.expiryDate
          ? new Date(req.body.expiryDate)
          : null
        : undefined;
    if (expiryDate === undefined && req.body.publishDate) {
      const endOfDay = new Date(publishDate);
      endOfDay.setHours(23, 59, 59, 999);
      expiryDate = endOfDay;
    }
    const hasExpired = expiryDate ? expiryDate <= now : false;

    const listing = await Listing.create({
      owner: req.user._id,
      featured: false,
      ...req.body,
      publishDate,
      ...(expiryDate !== undefined ? { expiryDate } : {}),
      isExpired: hasExpired,
      isPublished: !hasExpired,
    });

    return res.json({ success: true, listing });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};


export const updateListing = async (req: any, res: Response) => {
  try {
    await expireOutdatedListings();

    const now = new Date();
    const updatePayload: any = { ...req.body };

    if (req.body.publishDate) {
      updatePayload.publishDate = new Date(req.body.publishDate);
    }

    let expiryDate: Date | null | undefined;
    if ("expiryDate" in req.body) {
      expiryDate =
        req.body.expiryDate === null || req.body.expiryDate === undefined
          ? null
          : new Date(req.body.expiryDate);
    } else if (req.body.publishDate) {
      const endOfDay = new Date(updatePayload.publishDate);
      endOfDay.setHours(23, 59, 59, 999);
      expiryDate = endOfDay;
    }

    if (expiryDate !== undefined) {
      updatePayload.expiryDate = expiryDate;
      const hasExpired = expiryDate ? expiryDate <= now : false;
      updatePayload.isExpired = hasExpired;
      updatePayload.isPublished = !hasExpired;
    }

    const listing = await Listing.findOneAndUpdate(
      { _id: req.params.id, owner: req.user._id },
      updatePayload,
      { new: true }
    );

    if (!listing)
      return res
        .status(404)
        .json({ success: false, message: "Listing not found or unauthorized" });

    return res.json({ success: true, listing });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getListing = async (req: any, res: Response) => {
  try {
    await expireOutdatedListings();

    const listing = await Listing.findById(req.params.id);

    if (!listing)
      return res
        .status(404)
        .json({ success: false, message: "Not found" });

    const now = new Date();
    if (
      listing.expiryDate &&
      listing.expiryDate <= now &&
      !listing.isExpired
    ) {
      listing.isExpired = true;
      listing.isPublished = false;
      await listing.save();
    }

    return res.json({ success: true, listing });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteListing = async (req: any, res: Response) => {
  try {
    await expireOutdatedListings();

    const listing = await Listing.findOne({
      _id: req.params.id,
      owner: req.user._id,
    });

    if (!listing)
      return res
        .status(404)
        .json({ success: false, message: "Listing not found or not authorized" });

    await moveToRecycleBin("listing", listing, { deletedBy: req.user?.id });

    return res.json({ success: true, message: "Listing moved to recycle bin" });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const myListings = async (req: any, res: Response) => {
  try {
    await expireOutdatedListings();

    const listings = await Listing.find({ owner: req.user._id }).sort({
      createdAt: -1,
    });

    return res.json({ success: true, listings });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const featuredListings = async (req: Request, res: Response) => {
  try {
    await expireOutdatedListings();

    const now = new Date();
    const listings = await Listing.find({
      featured: true,
      isPublished: true,
      isExpired: { $ne: true },
      $and: [
        { publishDate: { $lte: now } },
        { $or: [{ expiryDate: null }, { expiryDate: { $gt: now } }] },
      ],
    })
      .limit(12)
      .sort({ createdAt: -1 });

    return res.json({ success: true, listings });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
