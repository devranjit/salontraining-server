import { Request, Response } from "express";
import { SeekingEmployment } from "../models/SeekingEmployment";

// Public submit
export const submitSeekingEmployment = async (req: Request, res: Response) => {
  try {
    const {
      preferredContacts,
      contactDetails,
      position,
      licensed,
      student,
      workPreference,
      compensation,
      availability,
      punctuality,
      transportation,
      retailComfort,
      rebookingComfort,
      profileImage,
    } = req.body;

    // Minimal validation
    if (!Array.isArray(preferredContacts) || preferredContacts.length === 0) {
      return res.status(400).json({ success: false, message: "Preferred contact method is required" });
    }
    if (!contactDetails) {
      return res.status(400).json({ success: false, message: "Contact details are required" });
    }
    if (!position) {
      return res.status(400).json({ success: false, message: "Position is required" });
    }
    if (!licensed) {
      return res.status(400).json({ success: false, message: "Licensed flag is required" });
    }
    if (!student) {
      return res.status(400).json({ success: false, message: "Student flag is required" });
    }
    if (!workPreference) {
      return res.status(400).json({ success: false, message: "Work preference is required" });
    }
    if (!compensation) {
      return res.status(400).json({ success: false, message: "Compensation preference is required" });
    }
    if (!availability || (!availability.fullTime && !availability.partTime)) {
      return res.status(400).json({ success: false, message: "Availability is required" });
    }
    if (!punctuality) {
      return res.status(400).json({ success: false, message: "Punctuality is required" });
    }
    if (!transportation) {
      return res.status(400).json({ success: false, message: "Transportation flag is required" });
    }
    if (!retailComfort) {
      return res.status(400).json({ success: false, message: "Retail comfort is required" });
    }
    if (!rebookingComfort) {
      return res.status(400).json({ success: false, message: "Rebooking comfort is required" });
    }

    const submission = await SeekingEmployment.create({
      ...req.body,
      status: "pending",
      profileImage,
      owner: (req as any)?.user?._id,
    });

    return res.status(201).json({ success: true, submission });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Admin: list with filters
export const adminGetSeekingEmployment = async (req: Request, res: Response) => {
  try {
    const { status, search, sort = "newest", page = 1, limit = 20 } = req.query;

    const query: any = {};
    if (status && status !== "all") {
      query.status = status;
    }
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { position: { $regex: search, $options: "i" } },
        { contactDetails: { $regex: search, $options: "i" } },
        { marketing: { $regex: search, $options: "i" } },
      ];
    }

    let sortOption: any = { createdAt: -1 };
    if (sort === "oldest") sortOption = { createdAt: 1 };
    if (sort === "status") sortOption = { status: 1, createdAt: -1 };

    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 20;
    const skip = (pageNum - 1) * limitNum;

    const [submissions, total] = await Promise.all([
      SeekingEmployment.find(query).sort(sortOption).skip(skip).limit(limitNum),
      SeekingEmployment.countDocuments(query),
    ]);

    return res.json({
      success: true,
      submissions,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Admin: get single
export const adminGetSeekingEmploymentById = async (req: Request, res: Response) => {
  try {
    const submission = await SeekingEmployment.findById(req.params.id);
    if (!submission) {
      return res.status(404).json({ success: false, message: "Submission not found" });
    }
    return res.json({ success: true, submission });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Admin: update (status or notes or any field)
export const adminUpdateSeekingEmployment = async (req: Request, res: Response) => {
  try {
    const submission = await SeekingEmployment.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });

    if (!submission) {
      return res.status(404).json({ success: false, message: "Submission not found" });
    }

    return res.json({ success: true, submission });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Admin: delete
export const adminDeleteSeekingEmployment = async (req: Request, res: Response) => {
  try {
    const submission = await SeekingEmployment.findByIdAndDelete(req.params.id);

    if (!submission) {
      return res.status(404).json({ success: false, message: "Submission not found" });
    }

    return res.json({ success: true, message: "Submission deleted" });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Admin: pending counts
export const getSeekingEmploymentPendingCounts = async (_req: Request, res: Response) => {
  try {
    const pending = await SeekingEmployment.countDocuments({ status: "pending" });
    return res.json({ success: true, counts: { seekingEmployment: pending } });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Admin actions
export const adminApproveSeeking = async (req: Request, res: Response) => {
  try {
    const submission = await SeekingEmployment.findByIdAndUpdate(
      req.params.id,
      { status: "approved", adminNotes: req.body?.adminNotes || "" },
      { new: true }
    );
    if (!submission) return res.status(404).json({ success: false, message: "Submission not found" });
    return res.json({ success: true, submission });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const adminPublishSeeking = async (req: Request, res: Response) => {
  try {
    const submission = await SeekingEmployment.findByIdAndUpdate(
      req.params.id,
      { status: "published", adminNotes: req.body?.adminNotes || "" },
      { new: true }
    );
    if (!submission) return res.status(404).json({ success: false, message: "Submission not found" });
    return res.json({ success: true, submission });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const adminRejectSeeking = async (req: Request, res: Response) => {
  try {
    const submission = await SeekingEmployment.findByIdAndUpdate(
      req.params.id,
      { status: "rejected", adminNotes: req.body?.adminNotes || "" },
      { new: true }
    );
    if (!submission) return res.status(404).json({ success: false, message: "Submission not found" });
    return res.json({ success: true, submission });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const adminRequestChangesSeeking = async (req: Request, res: Response) => {
  try {
    const submission = await SeekingEmployment.findByIdAndUpdate(
      req.params.id,
      { status: "changes_requested", adminNotes: req.body?.adminNotes || "" },
      { new: true }
    );
    if (!submission) return res.status(404).json({ success: false, message: "Submission not found" });
    return res.json({ success: true, submission });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Public — list published/approved stylists
export const getPublishedSeeking = async (_req: Request, res: Response) => {
  try {
    const submissions = await SeekingEmployment.find({
      status: { $in: ["approved", "published"] },
    })
      .sort({ createdAt: -1 })
      .select("-adminNotes -owner");

    return res.json({ success: true, submissions });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getPublishedSeekingById = async (req: Request, res: Response) => {
  try {
    const submission = await SeekingEmployment.findOne({
      _id: req.params.id,
      status: { $in: ["approved", "published"] },
    }).select("-adminNotes -owner");

    if (!submission) {
      return res.status(404).json({ success: false, message: "Stylist not found" });
    }

    return res.json({ success: true, submission });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// User: get my submissions
export const getMySeekingSubmissions = async (req: any, res: Response) => {
  try {
    const submissions = await SeekingEmployment.find({ owner: req.user._id }).sort({ createdAt: -1 });
    return res.json({ success: true, submissions });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// User: get single submission by ID
export const getMySeekingSubmissionById = async (req: any, res: Response) => {
  try {
    const submission = await SeekingEmployment.findOne({
      _id: req.params.id,
      owner: req.user._id,
    });
    if (!submission) {
      return res.status(404).json({ success: false, message: "Submission not found" });
    }
    return res.json({ success: true, listing: submission });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// User: update my submission -> status goes back to pending
export const updateMySeekingSubmission = async (req: any, res: Response) => {
  try {
    const submission = await SeekingEmployment.findOne({
      _id: req.params.id,
      owner: req.user._id,
    });
    if (!submission) {
      return res.status(404).json({ success: false, message: "Submission not found" });
    }

    Object.assign(submission, req.body);
    submission.status = "pending";
    await submission.save();

    return res.json({ success: true, submission });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// User: delete my submission
export const deleteMySeekingSubmission = async (req: any, res: Response) => {
  try {
    const submission = await SeekingEmployment.findOneAndDelete({
      _id: req.params.id,
      owner: req.user._id,
    });
    if (!submission) {
      return res.status(404).json({ success: false, message: "Submission not found" });
    }
    return res.json({ success: true, message: "Submission deleted successfully" });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

