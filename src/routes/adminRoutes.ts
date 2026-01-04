import { Router } from "express";
import { protect } from "../middleware/auth";
import { adminOnly } from "../middleware/admin";
import { User } from "../models/User";
import { Listing } from "../models/Listing";
import { dispatchEmailEvent } from "../services/emailService";
import { moveToRecycleBin } from "../services/recycleBinService";
import { expireOutdatedListings } from "../services/listingLifecycleService";
import { createNotification } from "../controllers/notification.controller";

const router = Router();

const FRONTEND_BASE_URL = (
  process.env.FRONTEND_URL ||
  (process.env.NODE_ENV === "development"
    ? "http://localhost:5173"
    : "https://salontraining.com")
).replace(/\/+$/, "");

router.get("/users", protect, adminOnly, async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 });
  res.json({ success: true, users });
});

// ADMIN — Get ALL listings (with pagination, search, filters)
router.get("/listings", protect, adminOnly, async (req, res) => {
  try {
    await expireOutdatedListings();

    const {
      page = 1,
      limit = 30,
      search,
      status,
      featured,
    } = req.query;

    const query: any = {};
    if (status) query.status = status;
    if (typeof featured === "string") query.featured = featured === "true";

    // Collect owner ids if searching by email/title
    let ownerIds: string[] | undefined;
    if (search) {
      const regex = new RegExp(search as string, "i");
      const owners = await User.find({ email: regex }).select("_id");
      ownerIds = owners.map((o) => o._id.toString());
      query.$or = [
        { title: regex },
        { email: regex },
        ...(ownerIds && ownerIds.length ? [{ owner: { $in: ownerIds } }] : []),
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [listings, total] = await Promise.all([
      Listing.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("owner", "name email role"),
      Listing.countDocuments(query),
    ]);

    res.json({
      success: true,
      listings,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
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

      // Send notification to listing owner
      if ((listing.owner as any)?._id) {
        createNotification(
          (listing.owner as any)._id,
          "listing_approved",
          "Listing Approved",
          `Your listing "${listing.title}" has been approved and is now live!`,
          `/dashboard/my-trainers`,
          { listingId: listing._id }
        ).catch((err) => console.error("Notification error:", err));
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

      // Send notification to listing owner
      if ((listing.owner as any)?._id) {
        createNotification(
          (listing.owner as any)._id,
          "listing_rejected",
          "Listing Rejected",
          `Your listing "${listing.title}" has been rejected. Reason: ${reason}`,
          `/dashboard/my-trainers`,
          { listingId: listing._id, reason }
        ).catch((err) => console.error("Notification error:", err));
      }
    }

    res.json({ success: true, listing });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ADMIN — Set or force expiry for a listing
router.put("/listings/:id/expire", protect, adminOnly, async (req, res) => {
  try {
    await expireOutdatedListings();

    const now = new Date();
    let expiryDate: Date | null;

    if (req.body.expiryDate === null) {
      // explicit clear removes expiry and unexpires listing
      expiryDate = null;
    } else if (req.body.expiryDate) {
      expiryDate = new Date(req.body.expiryDate);
    } else {
      // no date provided => expire immediately
      expiryDate = now;
    }

    const isExpired = expiryDate ? expiryDate <= now : false;
    const listing = await Listing.findByIdAndUpdate(
      req.params.id,
      {
        expiryDate,
        isExpired,
        isPublished: !isExpired,
      },
      { new: true }
    );

    if (!listing) {
      return res
        .status(404)
        .json({ success: false, message: "Listing not found" });
    }

    res.json({ success: true, listing });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ADMIN — Dashboard Stats
router.get("/stats", protect, adminOnly, async (req, res) => {
  try {
    const totalStart = Date.now();
    console.log("[Admin Stats] Starting /stats endpoint...");

    let start = Date.now();
    const total = await Listing.countDocuments();
    console.log(`[Admin Stats] Listing.countDocuments() took ${Date.now() - start}ms`);

    start = Date.now();
    const pending = await Listing.countDocuments({ status: "pending" });
    console.log(`[Admin Stats] Listing.countDocuments(pending) took ${Date.now() - start}ms`);

    start = Date.now();
    const approved = await Listing.countDocuments({ status: "approved" });
    console.log(`[Admin Stats] Listing.countDocuments(approved) took ${Date.now() - start}ms`);

    start = Date.now();
    const trainers = await Listing.countDocuments({ category: "trainer" });
    console.log(`[Admin Stats] Listing.countDocuments(trainer) took ${Date.now() - start}ms`);

    start = Date.now();
    const events = await Listing.countDocuments({ category: "event" });
    console.log(`[Admin Stats] Listing.countDocuments(event) took ${Date.now() - start}ms`);

    start = Date.now();
    const inperson = await Listing.countDocuments({ category: "inperson" });
    console.log(`[Admin Stats] Listing.countDocuments(inperson) took ${Date.now() - start}ms`);

    start = Date.now();
    const jobs = await Listing.countDocuments({ category: "job" });
    console.log(`[Admin Stats] Listing.countDocuments(job) took ${Date.now() - start}ms`);

    console.log(`[Admin Stats] ===== TOTAL /stats took ${Date.now() - totalStart}ms =====`);

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
    const totalStart = Date.now();
    console.log("[Admin Stats] Starting /pending-counts endpoint...");

    let start = Date.now();
    const trainers = await Listing.countDocuments({ category: "trainer", status: "pending" });
    console.log(`[Admin Stats] Listing.countDocuments(trainer, pending) took ${Date.now() - start}ms`);

    start = Date.now();
    const events = await Listing.countDocuments({ category: "event", status: "pending" });
    console.log(`[Admin Stats] Listing.countDocuments(event, pending) took ${Date.now() - start}ms`);

    start = Date.now();
    const inperson = await Listing.countDocuments({ category: "inperson", status: "pending" });
    console.log(`[Admin Stats] Listing.countDocuments(inperson, pending) took ${Date.now() - start}ms`);

    start = Date.now();
    const jobs = await Listing.countDocuments({ category: "job", status: "pending" });
    console.log(`[Admin Stats] Listing.countDocuments(job, pending) took ${Date.now() - start}ms`);

    console.log(`[Admin Stats] ===== TOTAL /pending-counts took ${Date.now() - totalStart}ms =====`);

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
