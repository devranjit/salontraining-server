import { Request, Response } from "express";
import mongoose from "mongoose";
import { SortOrder } from "mongoose";
import Contest from "../models/Contest";
import ContestEntry from "../models/ContestEntry";
import ContestPrize from "../models/ContestPrize";
import { resolveContestState } from "../utils/resolveContestState";
import { uploadToCloudinary } from "../utils/uploadToCloudinary";

type AuthRequest = Request & { user?: any };
type ContestDoc = {
  _id: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  status?: "draft" | "published";
  submissionStartTime: Date;
  submissionEndTime: Date;
  votingStartTime: Date;
  votingEndTime: Date;
  resultTime: Date;
  showSubmissionTimer?: boolean;
  showVotingTimer?: boolean;
  showResultTimer?: boolean;
};
type ContestTimeDoc = Pick<
  ContestDoc,
  | "submissionStartTime"
  | "submissionEndTime"
  | "votingStartTime"
  | "votingEndTime"
  | "resultTime"
  | "showSubmissionTimer"
  | "showVotingTimer"
  | "showResultTimer"
> & {
  _id: mongoose.Types.ObjectId;
};
type ContestEntryDoc = {
  _id: mongoose.Types.ObjectId;
  imageUrl: string;
  voteCount: number;
  userId?: { name?: string; first_name?: string; last_name?: string; role?: string } | null;
};
type ContestPrizeDoc = {
  rank: number;
  prizeTitle: string;
  prizeDescription: string;
  image?: string;
};

function parseContestTimes(body: any) {
  const submissionStartTime = new Date(body.submissionStartTime);
  const submissionEndTime = new Date(body.submissionEndTime);
  const votingStartTime = new Date(body.votingStartTime);
  const votingEndTime = new Date(body.votingEndTime);
  const resultTime = new Date(body.resultTime);
  return {
    submissionStartTime,
    submissionEndTime,
    votingStartTime,
    votingEndTime,
    resultTime,
  };
}

function parseContestTimerVisibility(body: any) {
  return {
    showSubmissionTimer:
      typeof body?.showSubmissionTimer === "boolean" ? body.showSubmissionTimer : true,
    showVotingTimer: typeof body?.showVotingTimer === "boolean" ? body.showVotingTimer : true,
    showResultTimer: typeof body?.showResultTimer === "boolean" ? body.showResultTimer : true,
  };
}

function isValidTimeOrder(times: {
  submissionStartTime: Date;
  submissionEndTime: Date;
  votingStartTime: Date;
  votingEndTime: Date;
  resultTime: Date;
}) {
  const {
    submissionStartTime,
    submissionEndTime,
    votingStartTime,
    votingEndTime,
    resultTime,
  } = times;

  if (
    Number.isNaN(submissionStartTime.getTime()) ||
    Number.isNaN(submissionEndTime.getTime()) ||
    Number.isNaN(votingStartTime.getTime()) ||
    Number.isNaN(votingEndTime.getTime()) ||
    Number.isNaN(resultTime.getTime())
  ) {
    return false;
  }

  return (
    submissionStartTime < submissionEndTime &&
    submissionEndTime < votingStartTime &&
    votingStartTime < votingEndTime &&
    votingEndTime < resultTime
  );
}

export const adminCreateContest = async (req: Request, res: Response) => {
  try {
    const { title, description } = req.body as { title?: string; description?: string };
    if (!title || !String(title).trim()) {
      return res.status(400).json({ success: false, message: "Title is required" });
    }

    const times = parseContestTimes(req.body);
    if (!isValidTimeOrder(times)) {
      return res.status(400).json({ success: false, message: "Invalid contest time order" });
    }

    const timerVisibility = parseContestTimerVisibility(req.body);

    const contest = await Contest.create({
      title: String(title).trim(),
      description: String(description || ""),
      status: "draft",
      ...times,
      ...timerVisibility,
    });

    return res.json({
      success: true,
      contestId: contest._id,
    });
  } catch (_error) {
    return res.status(500).json({ success: false, message: "Failed to create contest" });
  }
};

export const adminListContests = async (_req: Request, res: Response) => {
  try {
    const listSort: { createdAt: SortOrder } = { createdAt: -1 };
    const contests = await Contest.find()
      .sort(listSort)
      .select("title status submissionStartTime submissionEndTime votingStartTime votingEndTime resultTime showSubmissionTimer showVotingTimer showResultTimer")
      .lean<ContestDoc[]>()
      .exec();

    return res.json({
      success: true,
      contests: contests.map((contest) => ({
        contestId: contest._id,
        title: contest.title,
        status: contest.status || "published",
        submissionStartTime: contest.submissionStartTime,
        submissionEndTime: contest.submissionEndTime,
        votingStartTime: contest.votingStartTime,
        votingEndTime: contest.votingEndTime,
        resultTime: contest.resultTime,
        showSubmissionTimer: contest.showSubmissionTimer !== false,
        showVotingTimer: contest.showVotingTimer !== false,
        showResultTimer: contest.showResultTimer !== false,
      })),
    });
  } catch (_error) {
    return res.status(500).json({ success: false, message: "Failed to load contests" });
  }
};

export const adminGetAllContests = async (_req: Request, res: Response) => {
  try {
    const listSort: { createdAt: SortOrder } = { createdAt: -1 };
    const contests = await Contest.find()
      .sort(listSort)
      .select("title status submissionStartTime submissionEndTime votingStartTime votingEndTime resultTime showSubmissionTimer showVotingTimer showResultTimer")
      .lean<ContestDoc[]>()
      .exec();

    return res.json({
      success: true,
      contests: contests.map((contest) => ({
        contestId: contest._id,
        title: contest.title,
        status: contest.status || "published",
        submissionStartTime: contest.submissionStartTime,
        submissionEndTime: contest.submissionEndTime,
        votingStartTime: contest.votingStartTime,
        votingEndTime: contest.votingEndTime,
        resultTime: contest.resultTime,
        showSubmissionTimer: contest.showSubmissionTimer !== false,
        showVotingTimer: contest.showVotingTimer !== false,
        showResultTimer: contest.showResultTimer !== false,
      })),
    });
  } catch (_error) {
    return res.status(500).json({ success: false, message: "Failed to load contests" });
  }
};

export const adminGetContest = async (req: Request, res: Response) => {
  try {
    const contest = await Contest.findById(req.params.id)
      .select("title description status submissionStartTime submissionEndTime votingStartTime votingEndTime resultTime showSubmissionTimer showVotingTimer showResultTimer")
      .lean<ContestDoc>()
      .exec();
    if (!contest) {
      return res.status(404).json({ success: false, message: "Contest not found" });
    }

    return res.json({
      success: true,
      contest: {
        contestId: contest._id,
        title: contest.title,
        description: contest.description || "",
        status: contest.status || "published",
        submissionStartTime: contest.submissionStartTime,
        submissionEndTime: contest.submissionEndTime,
        votingStartTime: contest.votingStartTime,
        votingEndTime: contest.votingEndTime,
        resultTime: contest.resultTime,
        showSubmissionTimer: contest.showSubmissionTimer !== false,
        showVotingTimer: contest.showVotingTimer !== false,
        showResultTimer: contest.showResultTimer !== false,
      },
    });
  } catch (_error) {
    return res.status(500).json({ success: false, message: "Failed to load contest" });
  }
};

export const adminGetContestEntries = async (req: Request, res: Response) => {
  try {
    const { contestId } = req.params;

    const entries = await ContestEntry.find({ contestId })
      .sort({ createdAt: -1 })
      .populate("userId", "name first_name last_name email")
      .select("_id contestId userId imageUrl images caption status approvalStatus voteCount createdAt updatedAt")
      .lean<any[]>();

    return res.status(200).json({
      entries: entries.map((entry) => ({
        entryId: entry._id,
        contestId: entry.contestId,
        userId: entry.userId,
        imageUrl: entry.imageUrl || "",
        images: Array.isArray(entry.images) && entry.images.length > 0 ? entry.images : (entry.imageUrl ? [entry.imageUrl] : []),
        caption: entry.caption || "",
        status: entry.status || entry.approvalStatus || "pending",
        approvalStatus: entry.approvalStatus || entry.status || "pending",
        voteCount: Number(entry.voteCount || 0),
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      })),
    });
  } catch (_error) {
    return res.status(500).json({ message: "Failed to load contest entries" });
  }
};

export const adminUpdateContest = async (req: Request, res: Response) => {
  try {
    const { title, description } = req.body as { title?: string; description?: string };
    if (!title || !String(title).trim()) {
      return res.status(400).json({ success: false, message: "Title is required" });
    }

    const times = parseContestTimes(req.body);
    const timerVisibility = parseContestTimerVisibility(req.body);
    if (!isValidTimeOrder(times)) {
      return res.status(400).json({ success: false, message: "Invalid contest time order" });
    }

    const updated = await Contest.findByIdAndUpdate(
      req.params.id,
      {
        title: String(title).trim(),
        description: String(description || ""),
        ...times,
        ...timerVisibility,
      },
      { new: true }
    ).select("_id");

    if (!updated) {
      return res.status(404).json({ success: false, message: "Contest not found" });
    }

    return res.json({ success: true });
  } catch (_error) {
    return res.status(500).json({ success: false, message: "Failed to update contest" });
  }
};

export const adminUpdateContestStatus = async (req: Request, res: Response) => {
  try {
    const nextStatus = String(req.body?.status || "").trim().toLowerCase();
    if (nextStatus !== "draft" && nextStatus !== "published") {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    const updated = await Contest.findByIdAndUpdate(
      req.params.id,
      { status: nextStatus },
      { new: true }
    ).select("_id status");

    if (!updated) {
      return res.status(404).json({ success: false, message: "Contest not found" });
    }

    return res.json({
      success: true,
      status: (updated as any).status || "published",
    });
  } catch (_error) {
    return res.status(500).json({ success: false, message: "Failed to update contest status" });
  }
};

export const adminModerateContestEntry = async (req: AuthRequest, res: Response) => {
  try {
    const { contestEntryId } = req.params;
    const { action } = req.body as { action?: string };

    if (!action || !["approve", "reject"].includes(action)) {
      return res.status(400).json({ success: false, message: "Invalid action" });
    }

    const entry = await ContestEntry.findById(contestEntryId).select("approvalStatus status");
    if (!entry) {
      return res.status(404).json({ success: false, message: "Entry not found" });
    }

    if (!["pending", "approved", "rejected"].includes(entry.approvalStatus)) {
      return res.status(400).json({ success: false, message: "Invalid approval status" });
    }

    const nextStatus = action === "approve" ? "approved" : "rejected";
    if (entry.approvalStatus === nextStatus) {
      return res.json({
        success: true,
        approvalStatus: entry.approvalStatus,
      });
    }

    // Keep both moderation fields aligned for admin/public consistency.
    entry.approvalStatus = nextStatus;
    entry.status = nextStatus;
    await entry.save();

    return res.json({
      success: true,
      approvalStatus: entry.approvalStatus,
      status: entry.status,
    });
  } catch (_error) {
    return res.status(500).json({ success: false, message: "Failed to update contest entry" });
  }
};

export const getContestStatePublic = async (req: Request, res: Response) => {
  try {
    const { contestId } = req.params;
    const contest = await Contest.findOne({
      _id: contestId,
      $or: [{ status: "published" }, { status: { $exists: false } }],
    }).select(
      "submissionStartTime submissionEndTime votingStartTime votingEndTime resultTime showSubmissionTimer showVotingTimer showResultTimer"
    ).lean<ContestTimeDoc>().exec();
    if (!contest) {
      return res.status(404).json({ success: false, message: "Contest not found" });
    }

    const resolved = resolveContestState({
      submissionStartTime: contest.submissionStartTime,
      submissionEndTime: contest.submissionEndTime,
      votingStartTime: contest.votingStartTime,
      votingEndTime: contest.votingEndTime,
      resultTime: contest.resultTime,
    });

    return res.json({
      success: true,
      state: resolved.state,
      countdownLabel: resolved.countdownLabel,
      timeRemainingSeconds: resolved.timeRemainingSeconds,
      serverTime: resolved.serverTime,
      showSubmissionTimer: contest.showSubmissionTimer !== false,
      showVotingTimer: contest.showVotingTimer !== false,
      showResultTimer: contest.showResultTimer !== false,
    });
  } catch (_error) {
    return res.status(500).json({ success: false, message: "Failed to load contest state" });
  }
};

export const getApprovedContestEntriesPublic = async (req: Request, res: Response) => {
  try {
    const { contestId } = req.params;
    const contest = await Contest.findOne({
      _id: contestId,
      $or: [{ status: "published" }, { status: { $exists: false } }],
    }).select(
      "submissionStartTime submissionEndTime votingStartTime votingEndTime resultTime showSubmissionTimer showVotingTimer showResultTimer"
    ).lean<ContestTimeDoc>().exec();
    if (!contest) {
      return res.status(404).json({ success: false, message: "Contest not found" });
    }

    const { state } = resolveContestState({
      submissionStartTime: contest.submissionStartTime,
      submissionEndTime: contest.submissionEndTime,
      votingStartTime: contest.votingStartTime,
      votingEndTime: contest.votingEndTime,
      resultTime: contest.resultTime,
    });

    const sortOption: { voteCount?: SortOrder; createdAt: SortOrder } =
      state === "VOTING_OPEN" || state === "VOTING_CLOSED" || state === "RESULTS_LIVE"
        ? { voteCount: -1 as SortOrder, createdAt: 1 as SortOrder }
        : { createdAt: -1 as SortOrder };

    const entries = await ContestEntry.find({
      contestId,
      approvalStatus: "approved",
    })
      .sort(sortOption)
      .populate("userId", "name first_name last_name role")
      .select("_id imageUrl voteCount userId")
      .lean<ContestEntryDoc[]>();

    return res.json({
      success: true,
      showSubmissionTimer: contest.showSubmissionTimer !== false,
      showVotingTimer: contest.showVotingTimer !== false,
      showResultTimer: contest.showResultTimer !== false,
      entries: entries.map((entry) => {
        const user = entry.userId || {};
        const displayName =
          user.name ||
          `${user.first_name || ""} ${user.last_name || ""}`.trim() ||
          "Participant";
        return {
          entryId: entry._id,
          imageUrl: entry.imageUrl,
          participantDisplayName: displayName,
          participantRole: typeof user.role === "string" ? user.role : null,
          voteCount: Number(entry.voteCount || 0),
        };
      }),
    });
  } catch (_error) {
    return res.status(500).json({ success: false, message: "Failed to load approved entries" });
  }
};

export const getContestResultsPublic = async (req: Request, res: Response) => {
  try {
    const contestId = req.params.contestId || req.params.id;
    const contest = await Contest.findOne({
      _id: contestId,
      $or: [{ status: "published" }, { status: { $exists: false } }],
    }).select(
      "submissionStartTime submissionEndTime votingStartTime votingEndTime resultTime showSubmissionTimer showVotingTimer showResultTimer"
    ).lean<ContestTimeDoc>().exec();
    if (!contest) {
      return res.status(404).json({ success: false, message: "Contest not found" });
    }

    const resolved = resolveContestState({
      submissionStartTime: contest.submissionStartTime,
      submissionEndTime: contest.submissionEndTime,
      votingStartTime: contest.votingStartTime,
      votingEndTime: contest.votingEndTime,
      resultTime: contest.resultTime,
    });

    if (resolved.state !== "RESULTS_LIVE") {
      return res.status(400).json({ success: false, message: "Results not available yet" });
    }

    const resultSort: { voteCount: SortOrder; createdAt: SortOrder } = {
      voteCount: -1 as SortOrder,
      createdAt: 1 as SortOrder,
    };
    const entries = await ContestEntry.find({
      contestId,
      approvalStatus: "approved",
    })
      .sort(resultSort)
      .limit(10)
      .populate("userId", "name first_name last_name")
      .select("_id imageUrl voteCount userId")
      .lean<ContestEntryDoc[]>();

    const prizes = await ContestPrize.find({ contestId })
      .select("rank prizeTitle prizeDescription")
      .lean<ContestPrizeDoc[]>();
    const prizeByRank = new Map<number, { prizeTitle: string; prizeDescription: string }>();
    for (const prize of prizes) {
      prizeByRank.set(Number(prize.rank), {
        prizeTitle: prize.prizeTitle,
        prizeDescription: prize.prizeDescription,
      });
    }

    const rankedEntries = entries.map((entry, index: number) => {
      const rank = index + 1;
      const prize = prizeByRank.get(rank);
      const user = entry.userId || {};
      const participantName =
        user.name ||
        `${user.first_name || ""} ${user.last_name || ""}`.trim() ||
        "Participant";

      return {
        entryId: entry._id,
        imageUrl: entry.imageUrl,
        participantName,
        voteCount: Number(entry.voteCount || 0),
        rank,
        prizeTitle: prize?.prizeTitle ?? null,
        prizeDescription: prize?.prizeDescription ?? null,
      };
    });

    return res.json({
      success: true,
      showSubmissionTimer: contest.showSubmissionTimer !== false,
      showVotingTimer: contest.showVotingTimer !== false,
      showResultTimer: contest.showResultTimer !== false,
      rankedEntries,
    });
  } catch (_error) {
    return res.status(500).json({ success: false, message: "Failed to load contest results" });
  }
};

export const adminConfigureContestPrizes = async (req: Request, res: Response) => {
  try {
    const contestId = req.params.id;
    const contest = await Contest.findById(contestId)
      .select("_id")
      .lean<{ _id: mongoose.Types.ObjectId }>()
      .exec();
    if (!contest) {
      return res.status(404).json({ success: false, message: "Contest not found" });
    }

    const prizes = (req.body?.prizes || []) as Array<{
      rank: number;
      prizeTitle: string;
      prizeDescription: string;
    }>;

    if (!Array.isArray(prizes) || prizes.length === 0) {
      return res.status(400).json({ success: false, message: "Invalid prize payload" });
    }

    const normalized = prizes.map((p) => ({
      rank: Number(p.rank),
      prizeTitle: String(p.prizeTitle || ""),
      prizeDescription: String(p.prizeDescription || ""),
    }));

    for (const prize of normalized) {
      if (!Number.isInteger(prize.rank) || prize.rank < 1 || prize.rank > 10) {
        return res.status(400).json({ success: false, message: "Invalid prize rank" });
      }
      if (!prize.prizeTitle || !prize.prizeDescription) {
        return res.status(400).json({ success: false, message: "Invalid prize payload" });
      }
    }

    const ranks = normalized.map((p) => p.rank);
    if (new Set(ranks).size !== ranks.length) {
      return res.status(400).json({ success: false, message: "Duplicate prize ranks are not allowed" });
    }

    const docs = normalized.map((p) => ({
      contestId,
      rank: p.rank,
      prizeTitle: p.prizeTitle,
      prizeDescription: p.prizeDescription,
    }));

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await ContestPrize.deleteMany({ contestId }).session(session);
        await ContestPrize.insertMany(docs, { ordered: true, session });
      });
    } catch (_error) {
      session.endSession();
      return res.status(500).json({ success: false, message: "Failed to save contest prizes" });
    }
    session.endSession();

    return res.json({ success: true });
  } catch (_error) {
    return res.status(500).json({ success: false, message: "Failed to save contest prizes" });
  }
};

export const createContestEntry = async (req: AuthRequest, res: Response) => {
  try {
    const { contestId } = req.params;
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const contest = await Contest.findById(contestId).select("_id").lean<{ _id: mongoose.Types.ObjectId }>().exec();
    if (!contest) {
      return res.status(404).json({ success: false, message: "Contest not found" });
    }

    const files = ((req.files as Express.Multer.File[] | undefined) || []).filter(Boolean);
    if (!files.length) {
      return res.status(400).json({ success: false, message: "At least one image is required" });
    }

    const uploadedUrls = await Promise.all(
      files.map((file) =>
        uploadToCloudinary(file.buffer, file.mimetype, file.originalname).then((result) => String(result.url))
      )
    );

    const caption = typeof req.body?.caption === "string" ? req.body.caption.trim() : "";

    const entry = await ContestEntry.create({
      contestId,
      userId,
      imageUrl: uploadedUrls[0],
      images: uploadedUrls,
      caption,
      approvalStatus: "pending",
      status: "pending",
      voteCount: 0,
    });

    return res.status(201).json({
      success: true,
      entryId: entry._id,
      status: "pending",
      imageCount: uploadedUrls.length,
    });
  } catch (_error) {
    return res.status(500).json({ success: false, message: "Failed to submit contest entry" });
  }
};

export const adminGetContestPrizes = async (req: Request, res: Response) => {
  try {
    const contestId = req.params.id;
    const prizes = await ContestPrize.find({ contestId })
      .sort({ rank: 1 })
      .select("rank prizeTitle prizeDescription image")
      .lean<ContestPrizeDoc[]>();

    return res.json({
      prizes: prizes.map((prize) => ({
        rank: Number(prize.rank),
        title: prize.prizeTitle,
        description: prize.prizeDescription,
        image: prize.image || "",
      })),
    });
  } catch (_error) {
    return res.status(500).json({ success: false, message: "Failed to load contest prizes" });
  }
};

export const getPublishedContestsPublic = async (_req: Request, res: Response) => {
  try {
    const listSort: { createdAt: SortOrder } = { createdAt: -1 };
    const contests = await Contest.find({
      $or: [{ status: "published" }, { status: { $exists: false } }],
    })
      .sort(listSort)
      .select("title description status submissionStartTime submissionEndTime votingStartTime votingEndTime resultTime thumbnail showSubmissionTimer showVotingTimer showResultTimer")
      .lean<any[]>()
      .exec();

    return res.json({
      success: true,
      contests: contests.map((contest) => ({
        contestId: contest._id,
        title: contest.title,
        description: contest.description || "",
        status: contest.status || "published",
        state: resolveContestState({
          submissionStartTime: contest.submissionStartTime,
          submissionEndTime: contest.submissionEndTime,
          votingStartTime: contest.votingStartTime,
          votingEndTime: contest.votingEndTime,
          resultTime: contest.resultTime,
        }).state,
        thumbnail: contest.thumbnail || null,
        submissionStartTime: contest.submissionStartTime,
        submissionEndTime: contest.submissionEndTime,
        votingStartTime: contest.votingStartTime,
        votingEndTime: contest.votingEndTime,
        resultTime: contest.resultTime,
        showSubmissionTimer: contest.showSubmissionTimer !== false,
        showVotingTimer: contest.showVotingTimer !== false,
        showResultTimer: contest.showResultTimer !== false,
      })),
    });
  } catch (_error) {
    return res.status(500).json({ success: false, message: "Failed to load contests" });
  }
};
