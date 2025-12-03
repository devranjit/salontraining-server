import { Request, Response } from "express";
import { Job } from "../models/Job";

// ===============================
// PUBLIC — Get Jobs (with filters)
// ===============================
export const getJobs = async (req: Request, res: Response) => {
  try {
    const {
      search,
      category,
      jobType,
      city,
      state,
      remote,
      sort = "newest",
      page = 1,
      limit = 12,
      featured,
    } = req.query;

    // Build query - only show published/approved jobs
    const query: any = {
      status: { $in: ["approved", "published"] },
    };

    // Search filter
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { companyName: { $regex: search, $options: "i" } },
        { city: { $regex: search, $options: "i" } },
      ];
    }

    // Category filter
    if (category && category !== "all") {
      query.category = category;
    }

    // Job type filter
    if (jobType && jobType !== "all") {
      query.jobType = jobType;
    }

    // Location filters
    if (city) query.city = { $regex: city, $options: "i" };
    if (state) query.state = { $regex: state, $options: "i" };

    // Remote filter
    if (remote === "true") {
      query.remote = true;
    }

    // Featured only filter
    if (featured === "true") {
      query.featured = true;
    }

    // Sort options
    let sortOption: any = { createdAt: -1 }; // newest
    if (sort === "oldest") sortOption = { createdAt: 1 };
    if (sort === "salary-high") sortOption = { salaryMax: -1 };
    if (sort === "salary-low") sortOption = { salaryMin: 1 };
    if (sort === "deadline") sortOption = { deadline: 1 };

    // Pagination
    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 12;
    const skip = (pageNum - 1) * limitNum;

    // Execute query
    const [jobs, total] = await Promise.all([
      Job.find(query)
        .sort(sortOption)
        .skip(skip)
        .limit(limitNum)
        .select("-adminNotes"),
      Job.countDocuments(query)
    ]);

    return res.json({
      success: true,
      jobs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// PUBLIC — Get Featured Jobs
// ===============================
export const getFeaturedJobs = async (req: Request, res: Response) => {
  try {
    const { limit = 6 } = req.query;

    const jobs = await Job.find({
      status: { $in: ["approved", "published"] },
      featured: true,
    })
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .select("-adminNotes");

    return res.json({ success: true, jobs });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// PUBLIC — Get Single Job
// ===============================
export const getSingleJob = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const job = await Job.findById(id)
      .populate("owner", "name email");

    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    // Increment views
    job.views += 1;
    await job.save();

    return res.json({ success: true, job });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// USER — Create Job
// ===============================
export const createJob = async (req: Request, res: Response) => {
  try {
    const job = await Job.create({
      ...req.body,
      owner: (req as any).user._id,
      status: "pending",
    });

    return res.status(201).json({ success: true, job });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// USER — Get My Jobs
// ===============================
export const getMyJobs = async (req: Request, res: Response) => {
  try {
    const jobs = await Job.find({ owner: (req as any).user._id })
      .sort({ createdAt: -1 });

    return res.json({ success: true, jobs });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// USER — Update My Job
// ===============================
export const updateMyJob = async (req: Request, res: Response) => {
  try {
    const job = await Job.findOne({
      _id: req.params.id,
      owner: (req as any).user._id,
    });

    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    // User can update most fields, but status goes back to pending
    const updates = { ...req.body };
    if (job.status === "changes_requested") {
      updates.status = "pending"; // Resubmit for review
    }

    Object.assign(job, updates);
    await job.save();

    return res.json({ success: true, job });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// USER — Delete My Job
// ===============================
export const deleteMyJob = async (req: Request, res: Response) => {
  try {
    const job = await Job.findOneAndDelete({
      _id: req.params.id,
      owner: (req as any).user._id,
    });

    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    return res.json({ success: true, message: "Job deleted" });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Get All Jobs
// ===============================
export const adminGetAllJobs = async (req: Request, res: Response) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;

    const query: any = {};
    if (status && status !== "all") {
      query.status = status;
    }

    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 50;
    const skip = (pageNum - 1) * limitNum;

    const [jobs, total] = await Promise.all([
      Job.find(query)
        .populate("owner", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Job.countDocuments(query)
    ]);

    return res.json({
      success: true,
      jobs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Get Single Job
// ===============================
export const adminGetJobById = async (req: Request, res: Response) => {
  try {
    const job = await Job.findById(req.params.id)
      .populate("owner", "name email");

    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    return res.json({ success: true, job });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Update Job
// ===============================
export const adminUpdateJob = async (req: Request, res: Response) => {
  try {
    const job = await Job.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    return res.json({ success: true, job });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Delete Job
// ===============================
export const adminDeleteJob = async (req: Request, res: Response) => {
  try {
    const job = await Job.findByIdAndDelete(req.params.id);

    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    return res.json({ success: true, message: "Job deleted" });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Approve Job
// ===============================
export const approveJob = async (req: Request, res: Response) => {
  try {
    const job = await Job.findByIdAndUpdate(
      req.params.id,
      { status: "approved", adminNotes: req.body.adminNotes || "" },
      { new: true }
    );

    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    return res.json({ success: true, message: "Job approved", job });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Publish Job
// ===============================
export const publishJob = async (req: Request, res: Response) => {
  try {
    const updateData: any = {
      status: "published",
      publishDate: req.body.publishDate || new Date(),
    };

    if (req.body.expiryDate) {
      updateData.expiryDate = req.body.expiryDate;
    }

    const job = await Job.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    return res.json({ success: true, message: "Job published", job });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Reject Job
// ===============================
export const rejectJob = async (req: Request, res: Response) => {
  try {
    const job = await Job.findByIdAndUpdate(
      req.params.id,
      { status: "rejected", adminNotes: req.body.adminNotes || "" },
      { new: true }
    );

    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    return res.json({ success: true, message: "Job rejected", job });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Request Changes
// ===============================
export const requestJobChanges = async (req: Request, res: Response) => {
  try {
    const job = await Job.findByIdAndUpdate(
      req.params.id,
      { status: "changes_requested", adminNotes: req.body.adminNotes || "" },
      { new: true }
    );

    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    return res.json({ success: true, message: "Changes requested", job });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Set to Pending
// ===============================
export const setPendingJob = async (req: Request, res: Response) => {
  try {
    const job = await Job.findByIdAndUpdate(
      req.params.id,
      { status: "pending" },
      { new: true }
    );

    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    return res.json({ success: true, message: "Job set to pending", job });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Mark as Filled
// ===============================
export const markJobFilled = async (req: Request, res: Response) => {
  try {
    const job = await Job.findByIdAndUpdate(
      req.params.id,
      { status: "filled" },
      { new: true }
    );

    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    return res.json({ success: true, message: "Job marked as filled", job });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Toggle Featured
// ===============================
export const toggleJobFeatured = async (req: Request, res: Response) => {
  try {
    const job = await Job.findById(req.params.id);

    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    job.featured = !job.featured;
    await job.save();

    return res.json({
      success: true,
      message: job.featured ? "Job marked as featured" : "Job removed from featured",
      job,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Get Pending Counts
// ===============================
export const getJobPendingCounts = async (req: Request, res: Response) => {
  try {
    const jobs = await Job.countDocuments({ status: "pending" });

    return res.json({
      success: true,
      counts: { jobs },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};


