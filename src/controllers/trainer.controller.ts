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
