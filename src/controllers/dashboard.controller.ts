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

// ---------------------------------------------
// ADMIN DASHBOARD STATS
// ---------------------------------------------
export const getAdminDashboardStats = async (req: Request, res: Response) => {
  try {
    const totalStart = Date.now();
    console.log("[Dashboard Stats] Starting admin dashboard stats...");

    // Get date ranges
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    // ===== USER STATS =====
    let start = Date.now();
    const totalUsers = await User.countDocuments();
    console.log(`[Dashboard Stats] User.countDocuments() took ${Date.now() - start}ms`);

    start = Date.now();
    const newUsersThisMonth = await User.countDocuments({
      createdAt: { $gte: thirtyDaysAgo },
    });
    console.log(`[Dashboard Stats] User.countDocuments(newThisMonth) took ${Date.now() - start}ms`);

    start = Date.now();
    const newUsersPrevMonth = await User.countDocuments({
      createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo },
    });
    console.log(`[Dashboard Stats] User.countDocuments(prevMonth) took ${Date.now() - start}ms`);

    const usersTrend = newUsersPrevMonth > 0 
      ? Math.round(((newUsersThisMonth - newUsersPrevMonth) / newUsersPrevMonth) * 100)
      : newUsersThisMonth > 0 ? 100 : 0;

    // ===== TRAINER STATS =====
    start = Date.now();
    const totalTrainers = await TrainerListing.countDocuments();
    console.log(`[Dashboard Stats] TrainerListing.countDocuments() took ${Date.now() - start}ms`);

    start = Date.now();
    const pendingTrainers = await TrainerListing.countDocuments({ status: "pending" });
    console.log(`[Dashboard Stats] TrainerListing.countDocuments(pending) took ${Date.now() - start}ms`);

    start = Date.now();
    const approvedTrainers = await TrainerListing.countDocuments({ status: "approved" });
    console.log(`[Dashboard Stats] TrainerListing.countDocuments(approved) took ${Date.now() - start}ms`);

    start = Date.now();
    const featuredTrainers = await TrainerListing.countDocuments({ featured: true });
    console.log(`[Dashboard Stats] TrainerListing.countDocuments(featured) took ${Date.now() - start}ms`);

    start = Date.now();
    const newTrainersThisMonth = await TrainerListing.countDocuments({
      createdAt: { $gte: thirtyDaysAgo },
    });
    console.log(`[Dashboard Stats] TrainerListing.countDocuments(newThisMonth) took ${Date.now() - start}ms`);

    start = Date.now();
    const newTrainersPrevMonth = await TrainerListing.countDocuments({
      createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo },
    });
    console.log(`[Dashboard Stats] TrainerListing.countDocuments(prevMonth) took ${Date.now() - start}ms`);

    const trainersTrend = newTrainersPrevMonth > 0
      ? Math.round(((newTrainersThisMonth - newTrainersPrevMonth) / newTrainersPrevMonth) * 100)
      : newTrainersThisMonth > 0 ? 100 : 0;

    // ===== EVENT STATS =====
    start = Date.now();
    const totalEvents = await Event.countDocuments();
    console.log(`[Dashboard Stats] Event.countDocuments() took ${Date.now() - start}ms`);

    start = Date.now();
    const pendingEvents = await Event.countDocuments({ status: "pending" });
    console.log(`[Dashboard Stats] Event.countDocuments(pending) took ${Date.now() - start}ms`);

    start = Date.now();
    const approvedEvents = await Event.countDocuments({ status: "approved" });
    console.log(`[Dashboard Stats] Event.countDocuments(approved) took ${Date.now() - start}ms`);

    // ===== PRODUCT STATS =====
    start = Date.now();
    const totalProducts = await Product.countDocuments();
    console.log(`[Dashboard Stats] Product.countDocuments() took ${Date.now() - start}ms`);

    start = Date.now();
    const pendingProducts = await Product.countDocuments({ status: "pending" });
    console.log(`[Dashboard Stats] Product.countDocuments(pending) took ${Date.now() - start}ms`);

    start = Date.now();
    const approvedProducts = await Product.countDocuments({ status: "approved" });
    console.log(`[Dashboard Stats] Product.countDocuments(approved) took ${Date.now() - start}ms`);

    // ===== BLOG STATS =====
    start = Date.now();
    const totalBlogs = await Blog.countDocuments();
    console.log(`[Dashboard Stats] Blog.countDocuments() took ${Date.now() - start}ms`);

    start = Date.now();
    const pendingBlogs = await Blog.countDocuments({ status: "pending" });
    console.log(`[Dashboard Stats] Blog.countDocuments(pending) took ${Date.now() - start}ms`);

    start = Date.now();
    const publishedBlogs = await Blog.countDocuments({ status: "published" });
    console.log(`[Dashboard Stats] Blog.countDocuments(published) took ${Date.now() - start}ms`);

    // ===== JOB STATS =====
    start = Date.now();
    const totalJobs = await Job.countDocuments();
    console.log(`[Dashboard Stats] Job.countDocuments() took ${Date.now() - start}ms`);

    start = Date.now();
    const pendingJobs = await Job.countDocuments({ status: "pending" });
    console.log(`[Dashboard Stats] Job.countDocuments(pending) took ${Date.now() - start}ms`);

    start = Date.now();
    const activeJobs = await Job.countDocuments({ status: "approved" });
    console.log(`[Dashboard Stats] Job.countDocuments(approved) took ${Date.now() - start}ms`);

    // ===== EDUCATION STATS =====
    start = Date.now();
    const totalEducation = await Education.countDocuments();
    console.log(`[Dashboard Stats] Education.countDocuments() took ${Date.now() - start}ms`);

    start = Date.now();
    const pendingEducation = await Education.countDocuments({ status: "pending" });
    console.log(`[Dashboard Stats] Education.countDocuments(pending) took ${Date.now() - start}ms`);

    start = Date.now();
    const approvedEducation = await Education.countDocuments({ status: "approved" });
    console.log(`[Dashboard Stats] Education.countDocuments(approved) took ${Date.now() - start}ms`);

    // ===== MEMBER VIDEO STATS =====
    start = Date.now();
    const totalMemberVideos = await MemberVideo.countDocuments();
    console.log(`[Dashboard Stats] MemberVideo.countDocuments() took ${Date.now() - start}ms`);

    start = Date.now();
    const publishedVideos = await MemberVideo.countDocuments({ status: "published" });
    console.log(`[Dashboard Stats] MemberVideo.countDocuments(published) took ${Date.now() - start}ms`);

    // ===== RECENT ACTIVITY =====
    // Fetch recent items from various collections
    start = Date.now();
    const [
      recentTrainers,
      recentUsers,
      recentEvents,
      recentProducts,
      recentBlogs,
      reviewStats,
    ] = await Promise.all([
      TrainerListing.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select("businessName status createdAt")
        .lean(),
      User.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select("name email createdAt")
        .lean(),
      Event.find()
        .sort({ createdAt: -1 })
        .limit(3)
        .select("title status createdAt")
        .lean(),
      Product.find()
        .sort({ createdAt: -1 })
        .limit(3)
        .select("name status createdAt")
        .lean(),
      Blog.find()
        .sort({ createdAt: -1 })
        .limit(3)
        .select("title status createdAt")
        .lean(),
      (async () => {
        const reviewStart = Date.now();
        const [totalReviews, pendingReviews, approvedReviews, changesRequested, rejectedReviews] = await Promise.all([
          Review.countDocuments(),
          Review.countDocuments({ status: "pending" }),
          Review.countDocuments({ status: "approved" }),
          Review.countDocuments({ status: "changes_requested" }),
          Review.countDocuments({ status: "rejected" }),
        ]);
        console.log(`[Dashboard Stats] Review stats (5 queries in parallel) took ${Date.now() - reviewStart}ms`);
        return {
          total: totalReviews,
          pending: pendingReviews,
          approved: approvedReviews,
          changesRequested,
          rejected: rejectedReviews,
        };
      })(),
    ]);
    console.log(`[Dashboard Stats] Recent activity + reviews (Promise.all) took ${Date.now() - start}ms`);

    // Combine and sort recent activity
    const recentActivity = [
      ...recentTrainers.map((t: any) => ({
        id: t._id,
        type: "trainer" as const,
        title: t.status === "pending" ? "New Trainer Submission" : "Trainer Updated",
        action: `${t.businessName || "Trainer"} - ${t.status}`,
        time: t.createdAt,
      })),
      ...recentUsers.map((u: any) => ({
        id: u._id,
        type: "user" as const,
        title: "New User Registration",
        action: `${u.name || u.email} joined`,
        time: u.createdAt,
      })),
      ...recentEvents.map((e: any) => ({
        id: e._id,
        type: "event" as const,
        title: e.status === "pending" ? "New Event Submission" : "Event Updated",
        action: `${e.title || "Event"} - ${e.status}`,
        time: e.createdAt,
      })),
      ...recentProducts.map((p: any) => ({
        id: p._id,
        type: "product" as const,
        title: p.status === "pending" ? "New Product Submission" : "Product Updated",
        action: `${p.name || "Product"} - ${p.status}`,
        time: p.createdAt,
      })),
      ...recentBlogs.map((b: any) => ({
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

    // Total pending across all
    const totalPending =
      pendingTrainers + pendingEvents + pendingProducts + pendingBlogs + pendingJobs + pendingEducation + reviewStats.pending;

    console.log(`[Dashboard Stats] ===== TOTAL admin dashboard stats took ${Date.now() - totalStart}ms =====`);

    return res.json({
      success: true,
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
  } catch (err) {
    console.error("Dashboard stats error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard stats",
    });
  }
};

// ---------------------------------------------
// USER DASHBOARD STATS
// ---------------------------------------------
export const getUserDashboardStats = async (req: any, res: Response) => {
  try {
    const totalStart = Date.now();
    console.log("[Dashboard Stats] Starting user dashboard stats...");

    const userId = req.user.id;

    // User's trainers
    let start = Date.now();
    const myTrainers = await TrainerListing.countDocuments({ createdBy: userId });
    console.log(`[Dashboard Stats] TrainerListing.countDocuments(userId) took ${Date.now() - start}ms`);

    start = Date.now();
    const pendingTrainers = await TrainerListing.countDocuments({ createdBy: userId, status: "pending" });
    console.log(`[Dashboard Stats] TrainerListing.countDocuments(userId, pending) took ${Date.now() - start}ms`);

    start = Date.now();
    const approvedTrainers = await TrainerListing.countDocuments({ createdBy: userId, status: "approved" });
    console.log(`[Dashboard Stats] TrainerListing.countDocuments(userId, approved) took ${Date.now() - start}ms`);

    // User's events
    start = Date.now();
    const myEvents = await Event.countDocuments({ createdBy: userId });
    console.log(`[Dashboard Stats] Event.countDocuments(userId) took ${Date.now() - start}ms`);

    start = Date.now();
    const pendingEvents = await Event.countDocuments({ createdBy: userId, status: "pending" });
    console.log(`[Dashboard Stats] Event.countDocuments(userId, pending) took ${Date.now() - start}ms`);

    start = Date.now();
    const approvedEvents = await Event.countDocuments({ createdBy: userId, status: "approved" });
    console.log(`[Dashboard Stats] Event.countDocuments(userId, approved) took ${Date.now() - start}ms`);

    // User's products
    start = Date.now();
    const myProducts = await Product.countDocuments({ createdBy: userId });
    console.log(`[Dashboard Stats] Product.countDocuments(userId) took ${Date.now() - start}ms`);

    start = Date.now();
    const pendingProducts = await Product.countDocuments({ createdBy: userId, status: "pending" });
    console.log(`[Dashboard Stats] Product.countDocuments(userId, pending) took ${Date.now() - start}ms`);

    start = Date.now();
    const approvedProducts = await Product.countDocuments({ createdBy: userId, status: "approved" });
    console.log(`[Dashboard Stats] Product.countDocuments(userId, approved) took ${Date.now() - start}ms`);

    // User's blogs
    start = Date.now();
    const myBlogs = await Blog.countDocuments({ createdBy: userId });
    console.log(`[Dashboard Stats] Blog.countDocuments(userId) took ${Date.now() - start}ms`);

    start = Date.now();
    const pendingBlogs = await Blog.countDocuments({ createdBy: userId, status: "pending" });
    console.log(`[Dashboard Stats] Blog.countDocuments(userId, pending) took ${Date.now() - start}ms`);

    start = Date.now();
    const publishedBlogs = await Blog.countDocuments({ createdBy: userId, status: "published" });
    console.log(`[Dashboard Stats] Blog.countDocuments(userId, published) took ${Date.now() - start}ms`);

    // User's jobs
    start = Date.now();
    const myJobs = await Job.countDocuments({ createdBy: userId });
    console.log(`[Dashboard Stats] Job.countDocuments(userId) took ${Date.now() - start}ms`);

    start = Date.now();
    const pendingJobs = await Job.countDocuments({ createdBy: userId, status: "pending" });
    console.log(`[Dashboard Stats] Job.countDocuments(userId, pending) took ${Date.now() - start}ms`);

    start = Date.now();
    const activeJobs = await Job.countDocuments({ createdBy: userId, status: "approved" });
    console.log(`[Dashboard Stats] Job.countDocuments(userId, approved) took ${Date.now() - start}ms`);

    // User's education
    start = Date.now();
    const myEducation = await Education.countDocuments({ createdBy: userId });
    console.log(`[Dashboard Stats] Education.countDocuments(userId) took ${Date.now() - start}ms`);

    start = Date.now();
    const pendingEducation = await Education.countDocuments({ createdBy: userId, status: "pending" });
    console.log(`[Dashboard Stats] Education.countDocuments(userId, pending) took ${Date.now() - start}ms`);

    start = Date.now();
    const approvedEducation = await Education.countDocuments({ createdBy: userId, status: "approved" });
    console.log(`[Dashboard Stats] Education.countDocuments(userId, approved) took ${Date.now() - start}ms`);

    // Total listings
    const totalListings = myTrainers + myEvents + myProducts + myBlogs + myJobs + myEducation;
    const totalPending = pendingTrainers + pendingEvents + pendingProducts + pendingBlogs + pendingJobs + pendingEducation;
    const totalApproved = approvedTrainers + approvedEvents + approvedProducts + publishedBlogs + activeJobs + approvedEducation;

    // Recent user activity
    start = Date.now();
    const [recentTrainers, recentEvents, recentProducts] = await Promise.all([
      TrainerListing.find({ createdBy: userId })
        .sort({ createdAt: -1 })
        .limit(3)
        .select("businessName status createdAt")
        .lean(),
      Event.find({ createdBy: userId })
        .sort({ createdAt: -1 })
        .limit(3)
        .select("title status createdAt")
        .lean(),
      Product.find({ createdBy: userId })
        .sort({ createdAt: -1 })
        .limit(3)
        .select("name status createdAt")
        .lean(),
    ]);
    console.log(`[Dashboard Stats] Recent user activity (Promise.all) took ${Date.now() - start}ms`);

    const recentActivity = [
      ...recentTrainers.map((t: any) => ({
        id: t._id,
        type: "trainer" as const,
        title: t.businessName || "Trainer Listing",
        status: t.status,
        time: t.createdAt,
      })),
      ...recentEvents.map((e: any) => ({
        id: e._id,
        type: "event" as const,
        title: e.title || "Event",
        status: e.status,
        time: e.createdAt,
      })),
      ...recentProducts.map((p: any) => ({
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

    console.log(`[Dashboard Stats] ===== TOTAL user dashboard stats took ${Date.now() - totalStart}ms =====`);

    return res.json({
      success: true,
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
  } catch (err) {
    console.error("User dashboard stats error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard stats",
    });
  }
};

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

