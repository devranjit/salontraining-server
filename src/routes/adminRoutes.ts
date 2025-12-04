import { Router } from "express";
import { protect } from "../middleware/auth";
import { adminOnly } from "../middleware/admin";
import { User } from "../models/User";
import { Listing } from "../models/Listing";
import { dispatchEmailEvent } from "../services/emailService";
import { moveToRecycleBin } from "../services/recycleBinService";

const router = Router();

const FRONTEND_BASE_URL = (
  process.env.FRONTEND_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://salontraining.com"
    : "http://localhost:5173")
).replace(/\/+$/, "");

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
router.delete("/listings/:id", protect, adminOnly, async (req: any, res) => {
  try {
    const listing = await Listing.findById(req.params.id);

    if (!listing) {
      return res
        .status(404)
        .json({ success: false, message: "Listing not found" });
    }

    await moveToRecycleBin("listing", listing, {
      deletedBy: req.user?.id,
    });

    res.json({ success: true, message: "Listing moved to recycle bin" });
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
    ).populate("owner", "name email");

    if (listing) {
      const recipient =
        (listing.owner as any)?.email || (listing as any).email || null;
      if (recipient) {
        dispatchEmailEvent("listing.approved", {
          to: recipient,
          data: {
            user: {
              name: (listing.owner as any)?.name || recipient,
              email: recipient,
            },
            listing: {
              title: listing.title,
              url: `${FRONTEND_BASE_URL}/listings/${listing._id}`,
            },
          },
        }).catch((err) => console.error("listing approve email failed:", err));
      }
    }

    res.json({ success: true, listing });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ADMIN — Reject Listing
router.put("/listings/:id/reject", protect, adminOnly, async (req, res) => {
  try {
    const reason = req.body?.reason || "Please review your submission.";
    const listing = await Listing.findByIdAndUpdate(
      req.params.id,
      { status: "rejected" },
      { new: true }
    ).populate("owner", "name email");

    if (listing) {
      const recipient =
        (listing.owner as any)?.email || (listing as any).email || null;
      if (recipient) {
        dispatchEmailEvent("listing.rejected", {
          to: recipient,
          data: {
            user: {
              name: (listing.owner as any)?.name || recipient,
              email: recipient,
            },
            listing: {
              title: listing.title,
              reason,
              url: `${FRONTEND_BASE_URL}/listings/${listing._id}`,
            },
          },
        }).catch((err) => console.error("listing reject email failed:", err));
      }
    }

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
