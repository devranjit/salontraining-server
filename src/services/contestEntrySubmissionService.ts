import { Request } from "express";
import mongoose from "mongoose";
import Contest from "../models/Contest";
import ContestEntry from "../models/ContestEntry";
import { resolveContestState } from "../utils/resolveContestState";
import { uploadToCloudinary } from "../utils/uploadToCloudinary";

type SubmissionResult =
  | { success: true; pendingCount: number; remainingSlots: number }
  | { success: false; message: string };

export async function submitContestEntries(
  contestId: string,
  req: Request & { user?: { _id?: string } }
): Promise<SubmissionResult> {
  const userId = req.user?._id;
  if (!userId) {
    return { success: false, message: "Authentication required" };
  }

  const contest = await Contest.findById(contestId).select(
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
  if (state !== "SUBMISSION_OPEN") {
    return { success: false, message: "Submission is not open" };
  }

  const files =
    ((req.files as Express.Multer.File[] | undefined) || (req.file ? [req.file as Express.Multer.File] : []));
  if (!files.length) {
    return { success: false, message: "At least one image is required" };
  }

  const incomingCount = files.length;

  const uploadedUrls = await Promise.all(
    files.map((file) => uploadToCloudinary(file.buffer, file.mimetype, file.originalname).then((r) => r.url))
  );

  const docs = uploadedUrls.map((imageUrl) => ({
    contestId,
    userId,
    imageUrl,
    approvalStatus: "pending" as const,
    voteCount: 0,
  }));

  let existingCount = 0;
  let pendingCount = 0;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      existingCount = await ContestEntry.countDocuments({ contestId, userId }).session(session);
      if (existingCount + incomingCount > 10) {
        throw new Error("ENTRY_LIMIT_EXCEEDED");
      }

      await ContestEntry.insertMany(docs, { ordered: true, session });

      pendingCount = await ContestEntry.countDocuments({
        contestId,
        userId,
        approvalStatus: "pending",
      }).session(session);
    });
  } catch (err: any) {
    session.endSession();
    if (err?.message === "ENTRY_LIMIT_EXCEEDED") {
      return { success: false, message: "Entry limit exceeded" };
    }
    return { success: false, message: "Failed to submit entries" };
  }
  session.endSession();

  return {
    success: true,
    pendingCount,
    remainingSlots: Math.max(0, 10 - (existingCount + incomingCount)),
  };
}
