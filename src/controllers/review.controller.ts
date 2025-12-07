import { Request, Response } from "express";
import mongoose from "mongoose";
import Review, { REVIEW_TARGETS } from "../models/Review";
import Product from "../models/Product";

const allowedTypes = new Set<string>(REVIEW_TARGETS as unknown as string[]);

const sanitizeString = (val?: string | null) =>
  typeof val === "string" ? val.trim() : "";

const cleanText = (val?: string | null) =>
  sanitizeString(val).replace(/<[^>]+>/g, "");

const normalizeListingId = (value: any) => sanitizeString(String(value || ""));

const isValidType = (value: any): value is string =>
  typeof value === "string" && allowedTypes.has(value as string);

type ReviewStats = {
  totalReviews: number;
  averageRating: number;
  breakdown: Record<1 | 2 | 3 | 4 | 5, number>;
};

const EMPTY_STATS: ReviewStats = {
  totalReviews: 0,
  averageRating: 0,
  breakdown: {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  },
};

async function computeStats(listingType: string, listingId: string): Promise<ReviewStats> {
  const [stats] = await Review.aggregate([
    {
      $match: {
        listingType,
        listingId,
        status: "approved",
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        average: { $avg: "$rating" },
        one: {
          $sum: {
            $cond: [{ $eq: ["$rating", 1] }, 1, 0],
          },
        },
        two: {
          $sum: {
            $cond: [{ $eq: ["$rating", 2] }, 1, 0],
          },
        },
        three: {
          $sum: {
            $cond: [{ $eq: ["$rating", 3] }, 1, 0],
          },
        },
        four: {
          $sum: {
            $cond: [{ $eq: ["$rating", 4] }, 1, 0],
          },
        },
        five: {
          $sum: {
            $cond: [{ $eq: ["$rating", 5] }, 1, 0],
          },
        },
      },
    },
  ]);

  if (!stats) return { ...EMPTY_STATS };

  return {
    totalReviews: stats.total || 0,
    averageRating: stats.average ? Number(stats.average.toFixed(2)) : 0,
    breakdown: {
      1: stats.one || 0,
      2: stats.two || 0,
      3: stats.three || 0,
      4: stats.four || 0,
      5: stats.five || 0,
    },
  };
}

async function syncListingStats(listingType: string, listingId: string) {
  const stats = await computeStats(listingType, listingId);

  if (listingType === "product" && mongoose.Types.ObjectId.isValid(listingId)) {
    await Product.findByIdAndUpdate(
      listingId,
      {
        reviewCount: stats.totalReviews,
        averageRating: stats.averageRating,
      },
      { new: false }
    ).catch(() => null);
  }

  return stats;
}

function getDisplayName(name?: string | null, email?: string | null) {
  if (name && name.trim()) return name.trim();

  if (email && email.includes("@")) {
    const [local] = email.split("@");
    if (local) {
      return `${local.charAt(0).toUpperCase()}${"*".repeat(Math.max(2, Math.min(6, local.length - 1)))}`;
    }
  }

  return "SalonTraining Member";
}

export const listReviewsForListing = async (req: Request, res: Response) => {
  try {
    const listingType = sanitizeString(req.params.listingType).toLowerCase();
    const listingId = normalizeListingId(req.params.listingId);

    if (!isValidType(listingType)) {
      return res.status(400).json({ success: false, message: "Invalid listing type" });
    }

    if (!listingId) {
      return res.status(400).json({ success: false, message: "Listing ID is required" });
    }

    const [reviews, stats] = await Promise.all([
      Review.find({
        listingType,
        listingId,
        status: "approved",
      })
        .sort({ approvedAt: -1, createdAt: -1 })
        .lean(),
      computeStats(listingType, listingId),
    ]);

    const serialized = reviews.map((review) => ({
      id: review._id,
      rating: review.rating,
      review: review.review,
      approvedAt: review.approvedAt,
      createdAt: review.createdAt,
      listingTitle: review.listingTitleSnapshot,
      authorName: getDisplayName(review.userSnapshot?.name, review.userSnapshot?.email),
    }));

    return res.json({ success: true, reviews: serialized, stats });
  } catch (err: any) {
    console.error("listReviewsForListing error:", err);
    return res.status(500).json({ success: false, message: "Failed to load reviews" });
  }
};

export const getMyReviews = async (req: any, res: Response) => {
  try {
    const listingType = sanitizeString(req.query.listingType).toLowerCase();
    const listingId = normalizeListingId(req.query.listingId);

    const filter: Record<string, any> = { user: req.user._id };

    if (listingType) {
      if (!isValidType(listingType)) {
        return res.status(400).json({ success: false, message: "Invalid listing type" });
      }
      filter.listingType = listingType;
    }

    if (listingId) {
      filter.listingId = listingId;
    }

    const reviews = await Review.find(filter)
      .sort({ updatedAt: -1 })
      .lean();

    const summary = reviews.reduce(
      (acc, review) => {
        acc.byStatus[review.status] = (acc.byStatus[review.status] || 0) + 1;
        acc.total += 1;
        return acc;
      },
      { total: 0, byStatus: {} as Record<string, number> }
    );

    return res.json({
      success: true,
      reviews,
      summary,
    });
  } catch (err: any) {
    console.error("getMyReviews error:", err);
    return res.status(500).json({ success: false, message: "Failed to load reviews" });
  }
};

export const createReview = async (req: any, res: Response) => {
  try {
    const listingType = sanitizeString(req.body.listingType).toLowerCase();
    const listingId = normalizeListingId(req.body.listingId);
    const rating = Number(req.body.rating);
    const reviewText = sanitizeString(req.body.review);

    if (!isValidType(listingType)) {
      return res.status(400).json({ success: false, message: "Invalid listing type" });
    }

    if (!listingId) {
      return res.status(400).json({ success: false, message: "Listing ID is required" });
    }

    if (!reviewText || reviewText.length < 10) {
      return res.status(400).json({ success: false, message: "Please share at least 10 characters" });
    }

    if (Number.isNaN(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: "Rating must be between 1 and 5" });
    }

    const listingTitleSnapshot = cleanText(req.body.listingTitle);
    const listingUrl = sanitizeString(req.body.listingUrl);

    const review = await Review.create({
      user: req.user._id,
      listingType,
      listingId,
      rating,
      review: reviewText,
      listingTitleSnapshot,
      listingUrl,
      listingOwner: req.body.listingOwnerId && mongoose.Types.ObjectId.isValid(req.body.listingOwnerId)
        ? req.body.listingOwnerId
        : undefined,
      userSnapshot: {
        name: req.user.name,
        email: req.user.email,
      },
      status: "pending",
      lastSubmittedAt: new Date(),
    });

    return res.json({ success: true, review });
  } catch (err: any) {
    if (err?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "You already submitted a review for this listing. Please edit your existing review.",
      });
    }

    console.error("createReview error:", err);
    return res.status(500).json({ success: false, message: "Failed to submit review" });
  }
};

export const updateReview = async (req: any, res: Response) => {
  try {
    const reviewId = req.params.id;
    const rating = req.body.rating != null ? Number(req.body.rating) : undefined;
    const reviewText = req.body.review != null ? sanitizeString(req.body.review) : undefined;
    const listingTitleSnapshot = cleanText(req.body.listingTitle);

    const review = await Review.findOne({ _id: reviewId, user: req.user._id });

    if (!review) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }

    if (rating !== undefined) {
      if (Number.isNaN(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({ success: false, message: "Rating must be between 1 and 5" });
      }
      review.rating = rating;
    }

    if (reviewText !== undefined) {
      if (reviewText.length < 10) {
        return res.status(400).json({ success: false, message: "Please share at least 10 characters" });
      }
      review.review = reviewText;
    }

    if (listingTitleSnapshot) {
      review.listingTitleSnapshot = listingTitleSnapshot;
    }

    const wasApproved = review.status === "approved";

    review.status = "pending";
    review.approvedAt = undefined;
    review.adminNotes = undefined;
    review.changeRequestMessage = undefined;
    review.adminDecisionBy = undefined;
    review.lastSubmittedAt = new Date();
    review.userSnapshot = {
      name: req.user.name,
      email: req.user.email,
    };

    await review.save();

    if (wasApproved) {
      await syncListingStats(review.listingType, review.listingId);
    }

    return res.json({ success: true, review });
  } catch (err: any) {
    console.error("updateReview error:", err);
    return res.status(500).json({ success: false, message: "Failed to update review" });
  }
};

export const deleteReview = async (req: any, res: Response) => {
  try {
    const review = await Review.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    }) as unknown as { status: string; listingType: string; listingId: string } | null;

    if (!review) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }

    if (review.status === "approved") {
      await syncListingStats(review.listingType, review.listingId);
    }

    return res.json({ success: true });
  } catch (err: any) {
    console.error("deleteReview error:", err);
    return res.status(500).json({ success: false, message: "Failed to delete review" });
  }
};

export const adminListReviews = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const skip = (page - 1) * limit;
    const status = sanitizeString(req.query.status as string).toLowerCase();
    const listingType = sanitizeString(req.query.listingType as string).toLowerCase();
    const search = sanitizeString(req.query.q as string);

    const filter: Record<string, any> = {};

    if (status) {
      filter.status = status;
    }

    if (listingType) {
      if (!isValidType(listingType)) {
        return res.status(400).json({ success: false, message: "Invalid listing type filter" });
      }
      filter.listingType = listingType;
    }

    if (search) {
      const regex = new RegExp(search, "i");
      filter.$or = [
        { listingTitleSnapshot: regex },
        { review: regex },
        { "userSnapshot.name": regex },
        { "userSnapshot.email": regex },
      ];
    }

    const [total, reviews] = await Promise.all([
      Review.countDocuments(filter),
      Review.find(filter)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("user", "name email role")
        .populate("adminDecisionBy", "name email")
        .lean(),
    ]);

    return res.json({
      success: true,
      reviews,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error("adminListReviews error:", err);
    return res.status(500).json({ success: false, message: "Failed to load reviews" });
  }
};

export const adminUpdateReviewStatus = async (req: any, res: Response) => {
  try {
    const reviewId = req.params.id;
    const nextStatus = sanitizeString(req.body.status).toLowerCase();
    const adminNotes = sanitizeString(req.body.adminNotes);
    const changeRequestMessage = sanitizeString(req.body.changeRequestMessage);

    const allowedStatuses = ["pending", "approved", "changes_requested", "rejected"];
    if (!allowedStatuses.includes(nextStatus)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    const review = await Review.findById(reviewId);
    if (!review) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }

    const prevStatus = review.status;
    review.status = nextStatus;
    review.adminNotes = adminNotes || undefined;
    review.adminDecisionBy = req.user._id;

    if (nextStatus === "approved") {
      review.approvedAt = new Date();
      review.changeRequestMessage = undefined;
    } else {
      review.approvedAt = undefined;
    }

    if (nextStatus === "changes_requested") {
      review.changeRequestMessage = changeRequestMessage || adminNotes || "Please update your review.";
    } else {
      review.changeRequestMessage = undefined;
    }

    await review.save();

    if (prevStatus !== nextStatus && (prevStatus === "approved" || nextStatus === "approved")) {
      await syncListingStats(review.listingType, review.listingId);
    }

    return res.json({ success: true, review });
  } catch (err: any) {
    console.error("adminUpdateReviewStatus error:", err);
    return res.status(500).json({ success: false, message: "Failed to update review status" });
  }
};

export const adminUpdateReview = async (req: any, res: Response) => {
  try {
    const reviewId = req.params.id;
    const rating = req.body.rating != null ? Number(req.body.rating) : undefined;
    const reviewText = req.body.review != null ? sanitizeString(req.body.review) : undefined;
    const listingTitleSnapshot = cleanText(req.body.listingTitle);
    const listingUrl = sanitizeString(req.body.listingUrl);
    const adminNotes = sanitizeString(req.body.adminNotes);
    const status = sanitizeString(req.body.status).toLowerCase();

    const review = await Review.findById(reviewId);
    if (!review) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }

    const prevStatus = review.status;

    if (rating !== undefined) {
      if (Number.isNaN(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({ success: false, message: "Rating must be between 1 and 5" });
      }
      review.rating = rating;
    }

    if (reviewText !== undefined) {
      if (reviewText.length < 10) {
        return res.status(400).json({ success: false, message: "Review must be at least 10 characters" });
      }
      review.review = reviewText;
    }

    if (listingTitleSnapshot) {
      review.listingTitleSnapshot = listingTitleSnapshot;
    }

    if (listingUrl) {
      review.listingUrl = listingUrl;
    }

    if (adminNotes) {
      review.adminNotes = adminNotes;
    }

    if (status) {
      const allowedStatuses = ["pending", "approved", "changes_requested", "rejected"];
      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({ success: false, message: "Invalid status" });
      }
      review.status = status;
      review.adminDecisionBy = req.user._id;
      review.changeRequestMessage = undefined;
      if (status === "approved") {
        review.approvedAt = new Date();
      } else {
        review.approvedAt = undefined;
      }
    }

    await review.save();

    if (
      prevStatus !== review.status ||
      (review.status === "approved" && (rating !== undefined || reviewText !== undefined))
    ) {
      await syncListingStats(review.listingType, review.listingId);
    }

    return res.json({ success: true, review });
  } catch (err: any) {
    console.error("adminUpdateReview error:", err);
    return res.status(500).json({ success: false, message: "Failed to update review" });
  }
};

export const adminDeleteReview = async (req: any, res: Response) => {
  try {
    const review = await Review.findByIdAndDelete(req.params.id);

    if (!review) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }

    if (review.status === "approved") {
      await syncListingStats(review.listingType, review.listingId);
    }

    return res.json({ success: true });
  } catch (err: any) {
    console.error("adminDeleteReview error:", err);
    return res.status(500).json({ success: false, message: "Failed to delete review" });
  }
};

export const pendingReviewCounts = async (_req: Request, res: Response) => {
  try {
    const [pending, changesRequested] = await Promise.all([
      Review.countDocuments({ status: "pending" }),
      Review.countDocuments({ status: "changes_requested" }),
    ]);

    return res.json({
      success: true,
      counts: {
        pending,
        changesRequested,
      },
    });
  } catch (err: any) {
    console.error("pendingReviewCounts error:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch counts" });
  }
};

