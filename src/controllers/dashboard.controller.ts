import { Request, Response } from "express";
import { User } from "../models/User";
import { TrainerListing } from "../models/TrainerListing";
import { Event } from "../models/Event";
import Product from "../models/Product";
import { Blog } from "../models/Blog";
import { Job } from "../models/Job";
import { Education } from "../models/Education";
import MemberVideo from "../models/MemberVideo";
import Review from "../models/Review";
import { getHeroBadgeStats } from "../services/heroStats.service";

// ---------------------------------------------
// TIMEOUT UTILITIES
// ---------------------------------------------
const QUERY_TIMEOUT = 3000; // 3 seconds per individual query
const ENDPOINT_TIMEOUT = 8000; // 8 seconds max for entire endpoint (under frontend's 10s)

// Wrap a promise with a timeout - returns default value on timeout
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  defaultValue: T,
  label: string
): Promise<{ value: T; timedOut: boolean; duration: number }> {
  const start = Date.now();
  
  return Promise.race([
    promise.then((value) => ({
      value,
      timedOut: false,
      duration: Date.now() - start,
    })),
    new Promise<{ value: T; timedOut: boolean; duration: number }>((resolve) =>
      setTimeout(() => {
        console.warn(`[Dashboard Stats] TIMEOUT: ${label} exceeded ${timeoutMs}ms`);
        resolve({
          value: defaultValue,
          timedOut: true,
          duration: timeoutMs,
        });
      }, timeoutMs)
    ),
  ]);
}

// ---------------------------------------------
// ADMIN DASHBOARD STATS (Parallel with Timeouts)
// ---------------------------------------------
export const getAdminDashboardStats = async (req: Request, res: Response) => {
  const totalStart = Date.now();
  console.log("[Dashboard Stats] Starting admin dashboard stats (parallel mode)...");

  // Set up endpoint-level timeout
  let responseSent = false;
  const endpointTimeout = setTimeout(() => {
    if (!responseSent) {
      responseSent = true;
      console.warn(`[Dashboard Stats] ENDPOINT TIMEOUT: Returning partial results after ${ENDPOINT_TIMEOUT}ms`);
      return res.json({
        success: true,
        partial: true,
        message: "Some stats may be incomplete due to timeout",
        stats: getDefaultAdminStats(),
        recentActivity: [],
      });
    }
  }, ENDPOINT_TIMEOUT);

  try {
    // Get date ranges
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    // Run ALL queries in parallel with individual timeouts
    const [
      // User stats
      totalUsersResult,
      newUsersThisMonthResult,
      newUsersPrevMonthResult,
      // Trainer stats
      totalTrainersResult,
      pendingTrainersResult,
      approvedTrainersResult,
      featuredTrainersResult,
      newTrainersThisMonthResult,
      newTrainersPrevMonthResult,
      // Event stats
      totalEventsResult,
      pendingEventsResult,
      approvedEventsResult,
      // Product stats
      totalProductsResult,
      pendingProductsResult,
      approvedProductsResult,
      // Blog stats
      totalBlogsResult,
      pendingBlogsResult,
      publishedBlogsResult,
      // Job stats
      totalJobsResult,
      pendingJobsResult,
      activeJobsResult,
      // Education stats
      totalEducationResult,
      pendingEducationResult,
      approvedEducationResult,
      // Member Video stats
      totalMemberVideosResult,
      publishedVideosResult,
      // Review stats
      totalReviewsResult,
      pendingReviewsResult,
      approvedReviewsResult,
      changesRequestedResult,
      rejectedReviewsResult,
      // Recent activity
      recentTrainersResult,
      recentUsersResult,
      recentEventsResult,
      recentProductsResult,
      recentBlogsResult,
    ] = await Promise.all([
      // User stats
      withTimeout(User.countDocuments(), QUERY_TIMEOUT, 0, "User.total"),
      withTimeout(User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }), QUERY_TIMEOUT, 0, "User.newThisMonth"),
      withTimeout(User.countDocuments({ createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo } }), QUERY_TIMEOUT, 0, "User.prevMonth"),
      // Trainer stats
      withTimeout(TrainerListing.countDocuments(), QUERY_TIMEOUT, 0, "Trainer.total"),
      withTimeout(TrainerListing.countDocuments({ status: "pending" }), QUERY_TIMEOUT, 0, "Trainer.pending"),
      withTimeout(TrainerListing.countDocuments({ status: "approved" }), QUERY_TIMEOUT, 0, "Trainer.approved"),
      withTimeout(TrainerListing.countDocuments({ featured: true }), QUERY_TIMEOUT, 0, "Trainer.featured"),
      withTimeout(TrainerListing.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }), QUERY_TIMEOUT, 0, "Trainer.newThisMonth"),
      withTimeout(TrainerListing.countDocuments({ createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo } }), QUERY_TIMEOUT, 0, "Trainer.prevMonth"),
      // Event stats
      withTimeout(Event.countDocuments(), QUERY_TIMEOUT, 0, "Event.total"),
      withTimeout(Event.countDocuments({ status: "pending" }), QUERY_TIMEOUT, 0, "Event.pending"),
      withTimeout(Event.countDocuments({ status: "approved" }), QUERY_TIMEOUT, 0, "Event.approved"),
      // Product stats
      withTimeout(Product.countDocuments(), QUERY_TIMEOUT, 0, "Product.total"),
      withTimeout(Product.countDocuments({ status: "pending" }), QUERY_TIMEOUT, 0, "Product.pending"),
      withTimeout(Product.countDocuments({ status: "approved" }), QUERY_TIMEOUT, 0, "Product.approved"),
      // Blog stats
      withTimeout(Blog.countDocuments(), QUERY_TIMEOUT, 0, "Blog.total"),
      withTimeout(Blog.countDocuments({ status: "pending" }), QUERY_TIMEOUT, 0, "Blog.pending"),
      withTimeout(Blog.countDocuments({ status: "published" }), QUERY_TIMEOUT, 0, "Blog.published"),
      // Job stats
      withTimeout(Job.countDocuments(), QUERY_TIMEOUT, 0, "Job.total"),
      withTimeout(Job.countDocuments({ status: "pending" }), QUERY_TIMEOUT, 0, "Job.pending"),
      withTimeout(Job.countDocuments({ status: "approved" }), QUERY_TIMEOUT, 0, "Job.active"),
      // Education stats
      withTimeout(Education.countDocuments(), QUERY_TIMEOUT, 0, "Education.total"),
      withTimeout(Education.countDocuments({ status: "pending" }), QUERY_TIMEOUT, 0, "Education.pending"),
      withTimeout(Education.countDocuments({ status: "approved" }), QUERY_TIMEOUT, 0, "Education.approved"),
      // Member Video stats
      withTimeout(MemberVideo.countDocuments(), QUERY_TIMEOUT, 0, "MemberVideo.total"),
      withTimeout(MemberVideo.countDocuments({ status: "published" }), QUERY_TIMEOUT, 0, "MemberVideo.published"),
      // Review stats
      withTimeout(Review.countDocuments(), QUERY_TIMEOUT, 0, "Review.total"),
      withTimeout(Review.countDocuments({ status: "pending" }), QUERY_TIMEOUT, 0, "Review.pending"),
      withTimeout(Review.countDocuments({ status: "approved" }), QUERY_TIMEOUT, 0, "Review.approved"),
      withTimeout(Review.countDocuments({ status: "changes_requested" }), QUERY_TIMEOUT, 0, "Review.changesRequested"),
      withTimeout(Review.countDocuments({ status: "rejected" }), QUERY_TIMEOUT, 0, "Review.rejected"),
      // Recent activity
      withTimeout(
        TrainerListing.find().sort({ createdAt: -1 }).limit(5).select("businessName status createdAt").lean(),
        QUERY_TIMEOUT,
        [],
        "RecentTrainers"
      ),
      withTimeout(
        User.find().sort({ createdAt: -1 }).limit(5).select("name email createdAt").lean(),
        QUERY_TIMEOUT,
        [],
        "RecentUsers"
      ),
      withTimeout(
        Event.find().sort({ createdAt: -1 }).limit(3).select("title status createdAt").lean(),
        QUERY_TIMEOUT,
        [],
        "RecentEvents"
      ),
      withTimeout(
        Product.find().sort({ createdAt: -1 }).limit(3).select("name status createdAt").lean(),
        QUERY_TIMEOUT,
        [],
        "RecentProducts"
      ),
      withTimeout(
        Blog.find().sort({ createdAt: -1 }).limit(3).select("title status createdAt").lean(),
        QUERY_TIMEOUT,
        [],
        "RecentBlogs"
      ),
    ]);

    // Check if already timed out at endpoint level
    if (responseSent) {
      clearTimeout(endpointTimeout);
      return;
    }

    // Extract values
    const totalUsers = totalUsersResult.value;
    const newUsersThisMonth = newUsersThisMonthResult.value;
    const newUsersPrevMonth = newUsersPrevMonthResult.value;
    const totalTrainers = totalTrainersResult.value;
    const pendingTrainers = pendingTrainersResult.value;
    const approvedTrainers = approvedTrainersResult.value;
    const featuredTrainers = featuredTrainersResult.value;
    const newTrainersThisMonth = newTrainersThisMonthResult.value;
    const newTrainersPrevMonth = newTrainersPrevMonthResult.value;
    const totalEvents = totalEventsResult.value;
    const pendingEvents = pendingEventsResult.value;
    const approvedEvents = approvedEventsResult.value;
    const totalProducts = totalProductsResult.value;
    const pendingProducts = pendingProductsResult.value;
    const approvedProducts = approvedProductsResult.value;
    const totalBlogs = totalBlogsResult.value;
    const pendingBlogs = pendingBlogsResult.value;
    const publishedBlogs = publishedBlogsResult.value;
    const totalJobs = totalJobsResult.value;
    const pendingJobs = pendingJobsResult.value;
    const activeJobs = activeJobsResult.value;
    const totalEducation = totalEducationResult.value;
    const pendingEducation = pendingEducationResult.value;
    const approvedEducation = approvedEducationResult.value;
    const totalMemberVideos = totalMemberVideosResult.value;
    const publishedVideos = publishedVideosResult.value;

    // Calculate trends
    const usersTrend = newUsersPrevMonth > 0
      ? Math.round(((newUsersThisMonth - newUsersPrevMonth) / newUsersPrevMonth) * 100)
      : newUsersThisMonth > 0 ? 100 : 0;
    const trainersTrend = newTrainersPrevMonth > 0
      ? Math.round(((newTrainersThisMonth - newTrainersPrevMonth) / newTrainersPrevMonth) * 100)
      : newTrainersThisMonth > 0 ? 100 : 0;

    // Review stats
    const reviewStats = {
      total: totalReviewsResult.value,
      pending: pendingReviewsResult.value,
      approved: approvedReviewsResult.value,
      changesRequested: changesRequestedResult.value,
      rejected: rejectedReviewsResult.value,
    };

    // Total pending
    const totalPending =
      pendingTrainers + pendingEvents + pendingProducts + pendingBlogs + pendingJobs + pendingEducation + reviewStats.pending;

    // Build recent activity
    const recentActivity = [
      ...(recentTrainersResult.value as any[]).map((t: any) => ({
        id: t._id,
        type: "trainer" as const,
        title: t.status === "pending" ? "New Trainer Submission" : "Trainer Updated",
        action: `${t.businessName || "Trainer"} - ${t.status}`,
        time: t.createdAt,
      })),
      ...(recentUsersResult.value as any[]).map((u: any) => ({
        id: u._id,
        type: "user" as const,
        title: "New User Registration",
        action: `${u.name || u.email} joined`,
        time: u.createdAt,
      })),
      ...(recentEventsResult.value as any[]).map((e: any) => ({
        id: e._id,
        type: "event" as const,
        title: e.status === "pending" ? "New Event Submission" : "Event Updated",
        action: `${e.title || "Event"} - ${e.status}`,
        time: e.createdAt,
      })),
      ...(recentProductsResult.value as any[]).map((p: any) => ({
        id: p._id,
        type: "product" as const,
        title: p.status === "pending" ? "New Product Submission" : "Product Updated",
        action: `${p.name || "Product"} - ${p.status}`,
        time: p.createdAt,
      })),
      ...(recentBlogsResult.value as any[]).map((b: any) => ({
        id: b._id,
        type: "blog" as const,
        title: b.status === "pending" ? "New Blog Submission" : "Blog Updated",
        action: `${b.title || "Blog"} - ${b.status}`,
        time: b.createdAt,
      })),
    ]
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 10)
      .map((item) => ({
        ...item,
        time: formatTimeAgo(item.time),
      }));

    // Check for any timeouts and log them
    const timedOutQueries = [
      totalUsersResult, newUsersThisMonthResult, newUsersPrevMonthResult,
      totalTrainersResult, pendingTrainersResult, approvedTrainersResult, featuredTrainersResult,
      newTrainersThisMonthResult, newTrainersPrevMonthResult,
      totalEventsResult, pendingEventsResult, approvedEventsResult,
      totalProductsResult, pendingProductsResult, approvedProductsResult,
      totalBlogsResult, pendingBlogsResult, publishedBlogsResult,
      totalJobsResult, pendingJobsResult, activeJobsResult,
      totalEducationResult, pendingEducationResult, approvedEducationResult,
      totalMemberVideosResult, publishedVideosResult,
      totalReviewsResult, pendingReviewsResult, approvedReviewsResult, changesRequestedResult, rejectedReviewsResult,
      recentTrainersResult, recentUsersResult, recentEventsResult, recentProductsResult, recentBlogsResult,
    ].filter((r) => r.timedOut);

    const hasPartialData = timedOutQueries.length > 0;
    const totalDuration = Date.now() - totalStart;

    console.log(`[Dashboard Stats] ===== TOTAL: ${totalDuration}ms | Timeouts: ${timedOutQueries.length} =====`);

    // Clear endpoint timeout and send response
    clearTimeout(endpointTimeout);
    if (!responseSent) {
      responseSent = true;
      return res.json({
        success: true,
        partial: hasPartialData,
        stats: {
          users: {
            total: totalUsers,
            newThisMonth: newUsersThisMonth,
            trend: usersTrend,
          },
          trainers: {
            total: totalTrainers,
            pending: pendingTrainers,
            approved: approvedTrainers,
            featured: featuredTrainers,
            newThisMonth: newTrainersThisMonth,
            trend: trainersTrend,
          },
          events: {
            total: totalEvents,
            pending: pendingEvents,
            approved: approvedEvents,
          },
          products: {
            total: totalProducts,
            pending: pendingProducts,
            approved: approvedProducts,
          },
          blogs: {
            total: totalBlogs,
            pending: pendingBlogs,
            published: publishedBlogs,
          },
          jobs: {
            total: totalJobs,
            pending: pendingJobs,
            active: activeJobs,
          },
          education: {
            total: totalEducation,
            pending: pendingEducation,
            approved: approvedEducation,
          },
          memberVideos: {
            total: totalMemberVideos,
            published: publishedVideos,
          },
          reviews: reviewStats,
          totalPending,
        },
        recentActivity,
      });
    }
  } catch (err) {
    clearTimeout(endpointTimeout);
    console.error("Dashboard stats error:", err);
    if (!responseSent) {
      responseSent = true;
      return res.status(500).json({
        success: false,
        message: "Failed to fetch dashboard stats",
      });
    }
  }
};

// Default stats structure for timeout fallback
function getDefaultAdminStats() {
  return {
    users: { total: 0, newThisMonth: 0, trend: 0 },
    trainers: { total: 0, pending: 0, approved: 0, featured: 0, newThisMonth: 0, trend: 0 },
    events: { total: 0, pending: 0, approved: 0 },
    products: { total: 0, pending: 0, approved: 0 },
    blogs: { total: 0, pending: 0, published: 0 },
    jobs: { total: 0, pending: 0, active: 0 },
    education: { total: 0, pending: 0, approved: 0 },
    memberVideos: { total: 0, published: 0 },
    reviews: { total: 0, pending: 0, approved: 0, changesRequested: 0, rejected: 0 },
    totalPending: 0,
  };
}

// ---------------------------------------------
// USER DASHBOARD STATS (Parallel with Timeouts)
// ---------------------------------------------
export const getUserDashboardStats = async (req: any, res: Response) => {
  const totalStart = Date.now();
  console.log("[Dashboard Stats] Starting user dashboard stats (parallel mode)...");

  const userId = req.user.id;

  // Set up endpoint-level timeout
  let responseSent = false;
  const endpointTimeout = setTimeout(() => {
    if (!responseSent) {
      responseSent = true;
      console.warn(`[Dashboard Stats] USER ENDPOINT TIMEOUT: Returning partial results after ${ENDPOINT_TIMEOUT}ms`);
      return res.json({
        success: true,
        partial: true,
        message: "Some stats may be incomplete due to timeout",
        stats: getDefaultUserStats(),
        recentActivity: [],
      });
    }
  }, ENDPOINT_TIMEOUT);

  try {
    // Run ALL queries in parallel with individual timeouts
    const [
      // Trainer stats
      myTrainersResult,
      pendingTrainersResult,
      approvedTrainersResult,
      // Event stats
      myEventsResult,
      pendingEventsResult,
      approvedEventsResult,
      // Product stats
      myProductsResult,
      pendingProductsResult,
      approvedProductsResult,
      // Blog stats
      myBlogsResult,
      pendingBlogsResult,
      publishedBlogsResult,
      // Job stats
      myJobsResult,
      pendingJobsResult,
      activeJobsResult,
      // Education stats
      myEducationResult,
      pendingEducationResult,
      approvedEducationResult,
      // Recent activity
      recentTrainersResult,
      recentEventsResult,
      recentProductsResult,
    ] = await Promise.all([
      // Trainer stats
      withTimeout(TrainerListing.countDocuments({ createdBy: userId }), QUERY_TIMEOUT, 0, "MyTrainers.total"),
      withTimeout(TrainerListing.countDocuments({ createdBy: userId, status: "pending" }), QUERY_TIMEOUT, 0, "MyTrainers.pending"),
      withTimeout(TrainerListing.countDocuments({ createdBy: userId, status: "approved" }), QUERY_TIMEOUT, 0, "MyTrainers.approved"),
      // Event stats
      withTimeout(Event.countDocuments({ createdBy: userId }), QUERY_TIMEOUT, 0, "MyEvents.total"),
      withTimeout(Event.countDocuments({ createdBy: userId, status: "pending" }), QUERY_TIMEOUT, 0, "MyEvents.pending"),
      withTimeout(Event.countDocuments({ createdBy: userId, status: "approved" }), QUERY_TIMEOUT, 0, "MyEvents.approved"),
      // Product stats
      withTimeout(Product.countDocuments({ createdBy: userId }), QUERY_TIMEOUT, 0, "MyProducts.total"),
      withTimeout(Product.countDocuments({ createdBy: userId, status: "pending" }), QUERY_TIMEOUT, 0, "MyProducts.pending"),
      withTimeout(Product.countDocuments({ createdBy: userId, status: "approved" }), QUERY_TIMEOUT, 0, "MyProducts.approved"),
      // Blog stats
      withTimeout(Blog.countDocuments({ createdBy: userId }), QUERY_TIMEOUT, 0, "MyBlogs.total"),
      withTimeout(Blog.countDocuments({ createdBy: userId, status: "pending" }), QUERY_TIMEOUT, 0, "MyBlogs.pending"),
      withTimeout(Blog.countDocuments({ createdBy: userId, status: "published" }), QUERY_TIMEOUT, 0, "MyBlogs.published"),
      // Job stats
      withTimeout(Job.countDocuments({ createdBy: userId }), QUERY_TIMEOUT, 0, "MyJobs.total"),
      withTimeout(Job.countDocuments({ createdBy: userId, status: "pending" }), QUERY_TIMEOUT, 0, "MyJobs.pending"),
      withTimeout(Job.countDocuments({ createdBy: userId, status: "approved" }), QUERY_TIMEOUT, 0, "MyJobs.active"),
      // Education stats
      withTimeout(Education.countDocuments({ createdBy: userId }), QUERY_TIMEOUT, 0, "MyEducation.total"),
      withTimeout(Education.countDocuments({ createdBy: userId, status: "pending" }), QUERY_TIMEOUT, 0, "MyEducation.pending"),
      withTimeout(Education.countDocuments({ createdBy: userId, status: "approved" }), QUERY_TIMEOUT, 0, "MyEducation.approved"),
      // Recent activity
      withTimeout(
        TrainerListing.find({ createdBy: userId }).sort({ createdAt: -1 }).limit(3).select("businessName status createdAt").lean(),
        QUERY_TIMEOUT,
        [],
        "MyRecentTrainers"
      ),
      withTimeout(
        Event.find({ createdBy: userId }).sort({ createdAt: -1 }).limit(3).select("title status createdAt").lean(),
        QUERY_TIMEOUT,
        [],
        "MyRecentEvents"
      ),
      withTimeout(
        Product.find({ createdBy: userId }).sort({ createdAt: -1 }).limit(3).select("name status createdAt").lean(),
        QUERY_TIMEOUT,
        [],
        "MyRecentProducts"
      ),
    ]);

    // Check if already timed out at endpoint level
    if (responseSent) {
      clearTimeout(endpointTimeout);
      return;
    }

    // Extract values
    const myTrainers = myTrainersResult.value;
    const pendingTrainers = pendingTrainersResult.value;
    const approvedTrainers = approvedTrainersResult.value;
    const myEvents = myEventsResult.value;
    const pendingEvents = pendingEventsResult.value;
    const approvedEvents = approvedEventsResult.value;
    const myProducts = myProductsResult.value;
    const pendingProducts = pendingProductsResult.value;
    const approvedProducts = approvedProductsResult.value;
    const myBlogs = myBlogsResult.value;
    const pendingBlogs = pendingBlogsResult.value;
    const publishedBlogs = publishedBlogsResult.value;
    const myJobs = myJobsResult.value;
    const pendingJobs = pendingJobsResult.value;
    const activeJobs = activeJobsResult.value;
    const myEducation = myEducationResult.value;
    const pendingEducation = pendingEducationResult.value;
    const approvedEducation = approvedEducationResult.value;

    // Calculate totals
    const totalListings = myTrainers + myEvents + myProducts + myBlogs + myJobs + myEducation;
    const totalPending = pendingTrainers + pendingEvents + pendingProducts + pendingBlogs + pendingJobs + pendingEducation;
    const totalApproved = approvedTrainers + approvedEvents + approvedProducts + publishedBlogs + activeJobs + approvedEducation;

    // Build recent activity
    const recentActivity = [
      ...(recentTrainersResult.value as any[]).map((t: any) => ({
        id: t._id,
        type: "trainer" as const,
        title: t.businessName || "Trainer Listing",
        status: t.status,
        time: t.createdAt,
      })),
      ...(recentEventsResult.value as any[]).map((e: any) => ({
        id: e._id,
        type: "event" as const,
        title: e.title || "Event",
        status: e.status,
        time: e.createdAt,
      })),
      ...(recentProductsResult.value as any[]).map((p: any) => ({
        id: p._id,
        type: "product" as const,
        title: p.name || "Product",
        status: p.status,
        time: p.createdAt,
      })),
    ]
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 5)
      .map((item) => ({
        ...item,
        time: formatTimeAgo(item.time),
      }));

    // Check for any timeouts
    const timedOutQueries = [
      myTrainersResult, pendingTrainersResult, approvedTrainersResult,
      myEventsResult, pendingEventsResult, approvedEventsResult,
      myProductsResult, pendingProductsResult, approvedProductsResult,
      myBlogsResult, pendingBlogsResult, publishedBlogsResult,
      myJobsResult, pendingJobsResult, activeJobsResult,
      myEducationResult, pendingEducationResult, approvedEducationResult,
      recentTrainersResult, recentEventsResult, recentProductsResult,
    ].filter((r) => r.timedOut);

    const hasPartialData = timedOutQueries.length > 0;
    const totalDuration = Date.now() - totalStart;

    console.log(`[Dashboard Stats] ===== USER TOTAL: ${totalDuration}ms | Timeouts: ${timedOutQueries.length} =====`);

    // Clear endpoint timeout and send response
    clearTimeout(endpointTimeout);
    if (!responseSent) {
      responseSent = true;
      return res.json({
        success: true,
        partial: hasPartialData,
        stats: {
          totalListings,
          totalPending,
          totalApproved,
          trainers: {
            total: myTrainers,
            pending: pendingTrainers,
            approved: approvedTrainers,
          },
          events: {
            total: myEvents,
            pending: pendingEvents,
            approved: approvedEvents,
          },
          products: {
            total: myProducts,
            pending: pendingProducts,
            approved: approvedProducts,
          },
          blogs: {
            total: myBlogs,
            pending: pendingBlogs,
            published: publishedBlogs,
          },
          jobs: {
            total: myJobs,
            pending: pendingJobs,
            active: activeJobs,
          },
          education: {
            total: myEducation,
            pending: pendingEducation,
            approved: approvedEducation,
          },
        },
        recentActivity,
      });
    }
  } catch (err) {
    clearTimeout(endpointTimeout);
    console.error("User dashboard stats error:", err);
    if (!responseSent) {
      responseSent = true;
      return res.status(500).json({
        success: false,
        message: "Failed to fetch dashboard stats",
      });
    }
  }
};

export const getPublicHeroBadgeStats = async (_req: Request, res: Response) => {
  try {
    const stats = await getHeroBadgeStats();
    return res.json({
      success: true,
      stats,
    });
  } catch (err) {
    console.error("Public hero badge stats error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch hero badge stats",
    });
  }
};

// Default stats structure for user timeout fallback
function getDefaultUserStats() {
  return {
    totalListings: 0,
    totalPending: 0,
    totalApproved: 0,
    trainers: { total: 0, pending: 0, approved: 0 },
    events: { total: 0, pending: 0, approved: 0 },
    products: { total: 0, pending: 0, approved: 0 },
    blogs: { total: 0, pending: 0, published: 0 },
    jobs: { total: 0, pending: 0, active: 0 },
    education: { total: 0, pending: 0, approved: 0 },
  };
}

// Helper function to format time ago
function formatTimeAgo(date: Date | string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "Just now";
  if (diffMin < 60) return `${diffMin} minute${diffMin > 1 ? "s" : ""} ago`;
  if (diffHour < 24) return `${diffHour} hour${diffHour > 1 ? "s" : ""} ago`;
  if (diffDay < 7) return `${diffDay} day${diffDay > 1 ? "s" : ""} ago`;

  return then.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
