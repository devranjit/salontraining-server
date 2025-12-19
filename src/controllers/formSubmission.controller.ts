import { Request, Response } from "express";
import { FormSubmission } from "../models/FormSubmission";

// ===============================
// PUBLIC — Submit Contact Form
// ===============================
export const submitContactForm = async (req: Request, res: Response) => {
  try {
    const { name, email, phone, subject, category, message } = req.body;

    // Basic validation
    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and message are required",
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address",
      });
    }

    const submission = await FormSubmission.create({
      type: "contact",
      name,
      email,
      phone,
      subject,
      category: category || "general",
      message,
      status: "new",
      ipAddress: req.ip || req.headers["x-forwarded-for"] || "unknown",
      userAgent: req.headers["user-agent"] || "unknown",
      source: "contact-page",
    });

    return res.status(201).json({
      success: true,
      message: "Your message has been sent successfully! We'll get back to you soon.",
      submissionId: submission._id,
    });
  } catch (error: any) {
    console.error("Contact form submission error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send message. Please try again later.",
    });
  }
};

// ===============================
// PUBLIC — Subscribe to Newsletter
// ===============================
export const subscribeNewsletter = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    // Basic validation
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address",
      });
    }

    // Check if email already exists for newsletter
    const existingSubscription = await FormSubmission.findOne({
      type: "newsletter",
      email: email.toLowerCase(),
      subscribed: true,
    });

    if (existingSubscription) {
      return res.status(200).json({
        success: true,
        message: "You're already subscribed! Stay tuned for updates.",
        alreadySubscribed: true,
      });
    }

    // Check if previously unsubscribed
    const previousSubscription = await FormSubmission.findOne({
      type: "newsletter",
      email: email.toLowerCase(),
      subscribed: false,
    });

    if (previousSubscription) {
      // Re-subscribe
      previousSubscription.subscribed = true;
      previousSubscription.unsubscribedAt = undefined;
      previousSubscription.status = "new";
      await previousSubscription.save();

      return res.status(200).json({
        success: true,
        message: "Welcome back! You've been re-subscribed to our newsletter.",
      });
    }

    await FormSubmission.create({
      type: "newsletter",
      email: email.toLowerCase(),
      status: "new",
      subscribed: true,
      ipAddress: req.ip || req.headers["x-forwarded-for"] || "unknown",
      userAgent: req.headers["user-agent"] || "unknown",
      source: "footer-newsletter",
    });

    return res.status(201).json({
      success: true,
      message: "You've been subscribed! Check your inbox for updates.",
    });
  } catch (error: any) {
    console.error("Newsletter subscription error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to subscribe. Please try again later.",
    });
  }
};

// ===============================
// PUBLIC — Unsubscribe from Newsletter
// ===============================
export const unsubscribeNewsletter = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const subscription = await FormSubmission.findOne({
      type: "newsletter",
      email: email.toLowerCase(),
      subscribed: true,
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: "Email not found in our mailing list",
      });
    }

    subscription.subscribed = false;
    subscription.unsubscribedAt = new Date();
    subscription.status = "archived";
    await subscription.save();

    return res.json({
      success: true,
      message: "You've been unsubscribed from our newsletter.",
    });
  } catch (error: any) {
    console.error("Newsletter unsubscribe error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to unsubscribe. Please try again later.",
    });
  }
};

// ===============================
// ADMIN — Get All Submissions
// ===============================
export const getSubmissions = async (req: Request, res: Response) => {
  try {
    const {
      type,
      status,
      search,
      sort = "newest",
      page = 1,
      limit = 20,
    } = req.query;

    // Build query
    const query: any = {};

    if (type && type !== "all") {
      query.type = type;
    }

    if (status && status !== "all") {
      query.status = status;
    }

    // For newsletter, optionally filter by subscribed status
    if (type === "newsletter" && status === "subscribed") {
      delete query.status;
      query.subscribed = true;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { subject: { $regex: search, $options: "i" } },
        { message: { $regex: search, $options: "i" } },
      ];
    }

    // Sort options
    let sortOption: any = { createdAt: -1 }; // newest
    if (sort === "oldest") sortOption = { createdAt: 1 };
    if (sort === "status") sortOption = { status: 1, createdAt: -1 };

    // Pagination
    const skip = (Number(page) - 1) * Number(limit);

    const [submissions, total] = await Promise.all([
      FormSubmission.find(query)
        .populate("repliedBy", "name email")
        .sort(sortOption)
        .skip(skip)
        .limit(Number(limit)),
      FormSubmission.countDocuments(query),
    ]);

    // Get counts by type and status
    const counts = await FormSubmission.aggregate([
      {
        $group: {
          _id: { type: "$type", status: "$status" },
          count: { $sum: 1 },
        },
      },
    ]);

    return res.json({
      success: true,
      submissions,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
      counts,
    });
  } catch (error: any) {
    console.error("Get submissions error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ===============================
// ADMIN — Get Single Submission
// ===============================
export const getSubmission = async (req: Request, res: Response) => {
  try {
    const submission = await FormSubmission.findById(req.params.id)
      .populate("repliedBy", "name email");

    if (!submission) {
      return res.status(404).json({
        success: false,
        message: "Submission not found",
      });
    }

    // Mark as read if new
    if (submission.status === "new") {
      submission.status = "read";
      await submission.save();
    }

    return res.json({ success: true, submission });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ===============================
// ADMIN — Update Submission
// ===============================
export const updateSubmission = async (req: Request, res: Response) => {
  try {
    const { status, adminNotes } = req.body;
    const userId = (req as any).user?._id;

    const submission = await FormSubmission.findById(req.params.id);

    if (!submission) {
      return res.status(404).json({
        success: false,
        message: "Submission not found",
      });
    }

    if (status) {
      submission.status = status;
      if (status === "replied") {
        submission.repliedAt = new Date();
        submission.repliedBy = userId;
      }
    }

    if (adminNotes !== undefined) {
      submission.adminNotes = adminNotes;
    }

    await submission.save();

    return res.json({
      success: true,
      message: "Submission updated successfully",
      submission,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ===============================
// ADMIN — Delete Submission
// ===============================
export const deleteSubmission = async (req: Request, res: Response) => {
  try {
    const submission = await FormSubmission.findByIdAndDelete(req.params.id);

    if (!submission) {
      return res.status(404).json({
        success: false,
        message: "Submission not found",
      });
    }

    return res.json({
      success: true,
      message: "Submission deleted successfully",
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ===============================
// ADMIN — Bulk Delete Submissions
// ===============================
export const bulkDeleteSubmissions = async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide submission IDs to delete",
      });
    }

    const result = await FormSubmission.deleteMany({ _id: { $in: ids } });

    return res.json({
      success: true,
      message: `${result.deletedCount} submission(s) deleted successfully`,
      deletedCount: result.deletedCount,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ===============================
// ADMIN — Bulk Update Status
// ===============================
export const bulkUpdateStatus = async (req: Request, res: Response) => {
  try {
    const { ids, status } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide submission IDs to update",
      });
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Please provide a status",
      });
    }

    const result = await FormSubmission.updateMany(
      { _id: { $in: ids } },
      { $set: { status } }
    );

    return res.json({
      success: true,
      message: `${result.modifiedCount} submission(s) updated successfully`,
      modifiedCount: result.modifiedCount,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ===============================
// ADMIN — Get Stats
// ===============================
export const getSubmissionStats = async (req: Request, res: Response) => {
  try {
    const stats = await FormSubmission.aggregate([
      {
        $facet: {
          byType: [
            { $group: { _id: "$type", count: { $sum: 1 } } },
          ],
          byStatus: [
            { $group: { _id: { type: "$type", status: "$status" }, count: { $sum: 1 } } },
          ],
          newCount: [
            { $match: { status: "new" } },
            { $count: "count" },
          ],
          todayCount: [
            {
              $match: {
                createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
              },
            },
            { $count: "count" },
          ],
          weekCount: [
            {
              $match: {
                createdAt: {
                  $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                },
              },
            },
            { $count: "count" },
          ],
          newsletterSubscribers: [
            { $match: { type: "newsletter", subscribed: true } },
            { $count: "count" },
          ],
        },
      },
    ]);

    const result = stats[0];

    return res.json({
      success: true,
      stats: {
        byType: result.byType,
        byStatus: result.byStatus,
        new: result.newCount[0]?.count || 0,
        today: result.todayCount[0]?.count || 0,
        thisWeek: result.weekCount[0]?.count || 0,
        newsletterSubscribers: result.newsletterSubscribers[0]?.count || 0,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ===============================
// ADMIN — Export Emails (for newsletter)
// ===============================
export const exportNewsletterEmails = async (req: Request, res: Response) => {
  try {
    const subscribers = await FormSubmission.find({
      type: "newsletter",
      subscribed: true,
    }).select("email createdAt -_id");

    return res.json({
      success: true,
      emails: subscribers.map((s) => s.email),
      count: subscribers.length,
      subscribers,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ===============================
// ADMIN — Get Pending Counts (for sidebar badge)
// ===============================
export const getPendingCounts = async (req: Request, res: Response) => {
  try {
    const [contactNew, newsletterNew] = await Promise.all([
      FormSubmission.countDocuments({ type: "contact", status: "new" }),
      FormSubmission.countDocuments({ type: "newsletter", status: "new" }),
    ]);

    return res.json({
      success: true,
      counts: {
        contact: contactNew,
        newsletter: newsletterNew,
        total: contactNew + newsletterNew,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

















