import { Request, Response } from "express";
import mongoose from "mongoose";
import { SortOrder } from "mongoose";
import Contest from "../models/Contest";
import ContestEntry from "../models/ContestEntry";
import ContestPrize from "../models/ContestPrize";
import { resolveContestState } from "../utils/resolveContestState";

type AuthRequest = Request & { user?: any };
type ContestDoc = {
  _id: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  submissionStartTime: Date;
  submissionEndTime: Date;
  votingStartTime: Date;
  votingEndTime: Date;
  resultTime: Date;
};
type ContestTimeDoc = Pick<
  ContestDoc,
  "submissionStartTime" | "submissionEndTime" | "votingStartTime" | "votingEndTime" | "resultTime"
> & {
  _id: mongoose.Types.ObjectId;
};
type ContestEntryDoc = {
  _id: mongoose.Types.ObjectId;
  imageUrl: string;
  voteCount: number;
  userId?: { name?: string; first_name?: string; last_name?: string } | null;
};
type ContestPrizeDoc = {
  rank: number;
  prizeTitle: string;
  prizeDescription: string;
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

    const contest = await Contest.create({
      title: String(title).trim(),
      description: String(description || ""),
      ...times,
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
      .select("title submissionStartTime submissionEndTime votingStartTime votingEndTime resultTime")
      .lean<ContestDoc[]>()
      .exec();

    return res.json({
      success: true,
      contests: contests.map((contest) => ({
        contestId: contest._id,
        title: contest.title,
        submissionStartTime: contest.submissionStartTime,
        submissionEndTime: contest.submissionEndTime,
        votingStartTime: contest.votingStartTime,
        votingEndTime: contest.votingEndTime,
        resultTime: contest.resultTime,
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
      .select("title submissionStartTime submissionEndTime votingStartTime votingEndTime resultTime")
      .lean<ContestDoc[]>()
      .exec();

    return res.json({
      success: true,
      contests: contests.map((contest) => ({
        contestId: contest._id,
        title: contest.title,
        submissionStartTime: contest.submissionStartTime,
        submissionEndTime: contest.submissionEndTime,
        votingStartTime: contest.votingStartTime,
        votingEndTime: contest.votingEndTime,
        resultTime: contest.resultTime,
      })),
    });
  } catch (_error) {
    return res.status(500).json({ success: false, message: "Failed to load contests" });
  }
};

export const adminGetContest = async (req: Request, res: Response) => {
  try {
    const contest = await Contest.findById(req.params.id)
      .select("title description submissionStartTime submissionEndTime votingStartTime votingEndTime resultTime")
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
        submissionStartTime: contest.submissionStartTime,
        submissionEndTime: contest.submissionEndTime,
        votingStartTime: contest.votingStartTime,
        votingEndTime: contest.votingEndTime,
        resultTime: contest.resultTime,
      },
    });
  } catch (_error) {
    return res.status(500).json({ success: false, message: "Failed to load contest" });
  }
};

export const adminUpdateContest = async (req: Request, res: Response) => {
  try {
    const { title, description } = req.body as { title?: string; description?: string };
    if (!title || !String(title).trim()) {
      return res.status(400).json({ success: false, message: "Title is required" });
    }

    const times = parseContestTimes(req.body);
    if (!isValidTimeOrder(times)) {
      return res.status(400).json({ success: false, message: "Invalid contest time order" });
    }

    const updated = await Contest.findByIdAndUpdate(
      req.params.id,
      {
        title: String(title).trim(),
        description: String(description || ""),
        ...times,
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

export const adminModerateContestEntry = async (req: AuthRequest, res: Response) => {
  try {
    const { contestEntryId } = req.params;
    const { action } = req.body as { action?: string };

    if (!action || !["approve", "reject"].includes(action)) {
      return res.status(400).json({ success: false, message: "Invalid action" });
    }

    const entry = await ContestEntry.findById(contestEntryId).select("approvalStatus");
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

    entry.approvalStatus = nextStatus;
    await entry.save();

    return res.json({
      success: true,
      approvalStatus: entry.approvalStatus,
    });
  } catch (_error) {
    return res.status(500).json({ success: false, message: "Failed to update contest entry" });
  }
};

export const getContestStatePublic = async (req: Request, res: Response) => {
  try {
    const { contestId } = req.params;
    const contest = await Contest.findById(contestId).select(
      "submissionStartTime submissionEndTime votingStartTime votingEndTime resultTime"
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
    });
  } catch (_error) {
    return res.status(500).json({ success: false, message: "Failed to load contest state" });
  }
};

export const getApprovedContestEntriesPublic = async (req: Request, res: Response) => {
  try {
    const { contestId } = req.params;
    const contest = await Contest.findById(contestId).select(
      "submissionStartTime submissionEndTime votingStartTime votingEndTime resultTime"
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
      .populate("userId", "name first_name last_name")
      .select("_id imageUrl voteCount userId")
      .lean<ContestEntryDoc[]>();

    return res.json({
      success: true,
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
    const contest = await Contest.findById(contestId).select(
      "submissionStartTime submissionEndTime votingStartTime votingEndTime resultTime"
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
