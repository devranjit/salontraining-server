import { Request, Response } from "express";
import { Listing } from "../models/Listing";
import { moveToRecycleBin } from "../services/recycleBinService";

export const createListing = async (req: Request, res: Response) => {
  try {
    const listing = await Listing.create({
      owner: req.user._id,
      featured: false,
      ...req.body,       
    });

    return res.json({ success: true, listing });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};


export const updateListing = async (req: Request, res: Response) => {
  try {
    const listing = await Listing.findOneAndUpdate(
      { _id: req.params.id, owner: req.user._id },
      req.body,
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

export const getListing = async (req: Request, res: Response) => {
  try {
    const listing = await Listing.findById(req.params.id);

    if (!listing)
      return res
        .status(404)
        .json({ success: false, message: "Not found" });

    return res.json({ success: true, listing });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteListing = async (req: any, res: Response) => {
  try {
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

export const myListings = async (req: Request, res: Response) => {
  try {
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
    const listings = await Listing.find({ featured: true })
      .limit(12)
      .sort({ createdAt: -1 });

    return res.json({ success: true, listings });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
