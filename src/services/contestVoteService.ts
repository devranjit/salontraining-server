import { Request } from "express";
import crypto from "crypto";
import Contest from "../models/Contest";
import ContestEntry from "../models/ContestEntry";
import ContestVote from "../models/ContestVote";
import { resolveContestState } from "../utils/resolveContestState";

type VoteResult =
  | { success: true; voteCount: number }
  | { success: false; alreadyVoted: true; message: string; votedEntryId?: string }
  | { success: false; message: string };

function getClientIp(req: Request): string {
  const forwarded = (req.headers["x-forwarded-for"] as string | undefined) || "";
  const realIp = (req.headers["x-real-ip"] as string | undefined) || "";
  return forwarded.split(",")[0]?.trim() || realIp.trim() || req.ip || "";
}

function getVoterDeviceHash(req: Request): string {
  const ip = getClientIp(req);
  const userAgent = String(req.headers["user-agent"] || "");
  const secret = process.env.JWT_SECRET || "";
  return crypto.createHash("sha256").update(`${secret}:${ip}:${userAgent}`).digest("hex");
}

export async function processContestVote(
  contestEntryId: string,
  req: Request,
  providedDeviceId?: string
): Promise<VoteResult> {
  const entry = await ContestEntry.findById(contestEntryId).select("_id contestId approvalStatus voteCount");
  if (!entry) {
    return { success: false, message: "Entry not found" };
  }

  if (entry.approvalStatus !== "approved") {
    return { success: false, message: "Entry is not approved" };
  }

  const contest = await Contest.findById(entry.contestId).select(
    "submissionStartTime submissionEndTime votingStartTime votingEndTime resultTime"
  );
  if (!contest) {
    return { success: false, message: "Contest not found" };
  }

  const { state } = resolveContestState({
    submissionStartTime: contest.submissionStartTime,
    submissionEndTime: contest.submissionEndTime,
    votingStartTime: contest.votingStartTime,
    votingEndTime: contest.votingEndTime,
    resultTime: contest.resultTime,
  });

  if (state !== "VOTING_OPEN") {
    return { success: false, message: "Voting is not open" };
  }

  const deviceId = (providedDeviceId || "").trim() || getVoterDeviceHash(req);
  const voterDeviceHash = getVoterDeviceHash(req);
  const existingContestVote = await ContestVote.findOne({
    contestId: entry.contestId,
    $or: [{ deviceId }, { voterDeviceHash }],
  }).select("contestEntryId");
  if (existingContestVote) {
    return {
      success: false,
      alreadyVoted: true,
      message: "You have already voted in this contest.",
      votedEntryId: String(existingContestVote.contestEntryId || ""),
    };
  }

  try {
    await ContestVote.create({
      contestId: entry.contestId,
      contestEntryId: entry._id,
      voterDeviceHash,
      deviceId,
    });
  } catch (err: any) {
    if (err?.code === 11000) {
      const lockedVote = await ContestVote.findOne({
        contestId: entry.contestId,
        $or: [{ deviceId }, { voterDeviceHash }],
      }).select("contestEntryId");
      return {
        success: false,
        alreadyVoted: true,
        message: "You have already voted in this contest.",
        votedEntryId: lockedVote?.contestEntryId ? String(lockedVote.contestEntryId) : undefined,
      };
    }
    return { success: false, message: "Failed to process vote" };
  }

  const updated = await ContestEntry.findByIdAndUpdate(
    entry._id,
    { $inc: { voteCount: 1 } },
    { new: true, select: "voteCount" }
  );

  if (!updated) {
    return { success: false, message: "Entry not found" };
  }

  return {
    success: true,
    voteCount: Number(updated.voteCount || 0),
  };
}
