import { Router } from "express";
import { protect } from "../middleware/auth";
import { adminOnly } from "../middleware/admin";
import { User } from "../models/User";
import { Listing } from "../models/Listing";

const router = Router();

router.get("/users", protect, adminOnly, async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 });
  res.json({ success: true, users });
});

// ADMIN — Get ALL listings
router.get("/listings", protect, adminOnly, async (req, res) => {
  try {
    const listings = await Listing.find()
      .sort({ createdAt: -1 })
      .populate("owner", "name email role");

    res.json({ success: true, listings });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ADMIN — Delete ANY listing
router.delete("/listings/:id", protect, adminOnly, async (req, res) => {
  try {
    const listing = await Listing.findByIdAndDelete(req.params.id);

    if (!listing) {
      return res.status(404).json({ success: false, message: "Listing not found" });
    }

    res.json({ success: true, message: "Listing deleted by admin" });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});


router.put("/listings/:id/featured", protect, adminOnly, async (req, res) => {
  try {
    const updated = await Listing.findByIdAndUpdate(
      req.params.id,
      { featured: req.body.featured },
      { new: true }
    );

    res.json({ success: true, listing: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});


// ADMIN — Approve Listing
router.put("/listings/:id/approve", protect, adminOnly, async (req, res) => {
  try {
    const listing = await Listing.findByIdAndUpdate(
      req.params.id,
      { status: "approved" },
      { new: true }
    );

    res.json({ success: true, listing });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ADMIN — Reject Listing
router.put("/listings/:id/reject", protect, adminOnly, async (req, res) => {
  try {
    const listing = await Listing.findByIdAndUpdate(
      req.params.id,
      { status: "rejected" },
      { new: true }
    );

    res.json({ success: true, listing });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ADMIN — Dashboard Stats
router.get("/stats", protect, adminOnly, async (req, res) => {
  try {
    const total = await Listing.countDocuments();
    const pending = await Listing.countDocuments({ status: "pending" });
    const approved = await Listing.countDocuments({ status: "approved" });

    const trainers = await Listing.countDocuments({ category: "trainer" });
    const events = await Listing.countDocuments({ category: "event" });
    const inperson = await Listing.countDocuments({ category: "inperson" });
    const jobs = await Listing.countDocuments({ category: "job" });

    res.json({
      success: true,
      stats: {
        total,
        pending,
        approved,
        trainers,
        events,
        inperson,
        jobs,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});


router.get("/pending-counts", protect, adminOnly, async (req, res) => {
  try {
    const trainers = await Listing.countDocuments({ category: "trainer", status: "pending" });
    const events = await Listing.countDocuments({ category: "event", status: "pending" });
    const inperson = await Listing.countDocuments({ category: "inperson", status: "pending" });
    const jobs = await Listing.countDocuments({ category: "job", status: "pending" });

    res.json({
      success: true,
      pending: {
        trainers,
        events,
        inperson,
        jobs,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});


export default router;
