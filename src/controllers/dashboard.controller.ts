import { Request, Response } from "express";
import { User } from "../models/User";
import { TrainerListing } from "../models/TrainerListing";
import { Event } from "../models/Event";
import Product from "../models/Product";
import { Blog } from "../models/Blog";
import { Job } from "../models/Job";
import { Education } from "../models/Education";
import MemberVideo from "../models/MemberVideo";

// ---------------------------------------------
// ADMIN DASHBOARD STATS
// ---------------------------------------------
export const getAdminDashboardStats = async (req: Request, res: Response) => {
  try {
    // Get date ranges
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    // ===== USER STATS =====
    const totalUsers = await User.countDocuments();
    const newUsersThisMonth = await User.countDocuments({
      createdAt: { $gte: thirtyDaysAgo },
    });
    const newUsersPrevMonth = await User.countDocuments({
      createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo },
    });
    const usersTrend = newUsersPrevMonth > 0 
      ? Math.round(((newUsersThisMonth - newUsersPrevMonth) / newUsersPrevMonth) * 100)
      : newUsersThisMonth > 0 ? 100 : 0;

    // ===== TRAINER STATS =====
    const totalTrainers = await TrainerListing.countDocuments();
    const pendingTrainers = await TrainerListing.countDocuments({ status: "pending" });
    const approvedTrainers = await TrainerListing.countDocuments({ status: "approved" });
    const featuredTrainers = await TrainerListing.countDocuments({ featured: true });
    const newTrainersThisMonth = await TrainerListing.countDocuments({
      createdAt: { $gte: thirtyDaysAgo },
    });
    const newTrainersPrevMonth = await TrainerListing.countDocuments({
      createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo },
    });
    const trainersTrend = newTrainersPrevMonth > 0
      ? Math.round(((newTrainersThisMonth - newTrainersPrevMonth) / newTrainersPrevMonth) * 100)
      : newTrainersThisMonth > 0 ? 100 : 0;

    // ===== EVENT STATS =====
    const totalEvents = await Event.countDocuments();
    const pendingEvents = await Event.countDocuments({ status: "pending" });
    const approvedEvents = await Event.countDocuments({ status: "approved" });

    // ===== PRODUCT STATS =====
    const totalProducts = await Product.countDocuments();
    const pendingProducts = await Product.countDocuments({ status: "pending" });
    const approvedProducts = await Product.countDocuments({ status: "approved" });

    // ===== BLOG STATS =====
    const totalBlogs = await Blog.countDocuments();
    const pendingBlogs = await Blog.countDocuments({ status: "pending" });
    const publishedBlogs = await Blog.countDocuments({ status: "published" });

    // ===== JOB STATS =====
    const totalJobs = await Job.countDocuments();
    const pendingJobs = await Job.countDocuments({ status: "pending" });
    const activeJobs = await Job.countDocuments({ status: "approved" });

    // ===== EDUCATION STATS =====
    const totalEducation = await Education.countDocuments();
    const pendingEducation = await Education.countDocuments({ status: "pending" });
    const approvedEducation = await Education.countDocuments({ status: "approved" });

    // ===== MEMBER VIDEO STATS =====
    const totalMemberVideos = await MemberVideo.countDocuments();
    const publishedVideos = await MemberVideo.countDocuments({ status: "published" });

    // ===== RECENT ACTIVITY =====
    // Fetch recent items from various collections
    const [recentTrainers, recentUsers, recentEvents, recentProducts, recentBlogs] = await Promise.all([
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
    ]);

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
    const totalPending = pendingTrainers + pendingEvents + pendingProducts + pendingBlogs + pendingJobs + pendingEducation;

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
    const userId = req.user.id;

    // User's trainers
    const myTrainers = await TrainerListing.countDocuments({ createdBy: userId });
    const pendingTrainers = await TrainerListing.countDocuments({ createdBy: userId, status: "pending" });
    const approvedTrainers = await TrainerListing.countDocuments({ createdBy: userId, status: "approved" });

    // User's events
    const myEvents = await Event.countDocuments({ createdBy: userId });
    const pendingEvents = await Event.countDocuments({ createdBy: userId, status: "pending" });
    const approvedEvents = await Event.countDocuments({ createdBy: userId, status: "approved" });

    // User's products
    const myProducts = await Product.countDocuments({ createdBy: userId });
    const pendingProducts = await Product.countDocuments({ createdBy: userId, status: "pending" });
    const approvedProducts = await Product.countDocuments({ createdBy: userId, status: "approved" });

    // User's blogs
    const myBlogs = await Blog.countDocuments({ createdBy: userId });
    const pendingBlogs = await Blog.countDocuments({ createdBy: userId, status: "pending" });
    const publishedBlogs = await Blog.countDocuments({ createdBy: userId, status: "published" });

    // User's jobs
    const myJobs = await Job.countDocuments({ createdBy: userId });
    const pendingJobs = await Job.countDocuments({ createdBy: userId, status: "pending" });
    const activeJobs = await Job.countDocuments({ createdBy: userId, status: "approved" });

    // User's education
    const myEducation = await Education.countDocuments({ createdBy: userId });
    const pendingEducation = await Education.countDocuments({ createdBy: userId, status: "pending" });
    const approvedEducation = await Education.countDocuments({ createdBy: userId, status: "approved" });

    // Total listings
    const totalListings = myTrainers + myEvents + myProducts + myBlogs + myJobs + myEducation;
    const totalPending = pendingTrainers + pendingEvents + pendingProducts + pendingBlogs + pendingJobs + pendingEducation;
    const totalApproved = approvedTrainers + approvedEvents + approvedProducts + publishedBlogs + activeJobs + approvedEducation;

    // Recent user activity
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

