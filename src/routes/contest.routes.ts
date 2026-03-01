import express from "express";
import { protect, adminOnly } from "../middleware/auth";
import { upload } from "../middleware/upload";
import {
  adminConfigureContestPrizes,
  adminCreateContest,
  adminDeleteContestComment,
  adminEditContestComment,
  adminGetContest,
  adminGetContestComments,
  adminGetContestEntries,
  adminGetContestPendingCount,
  adminGetContestPrizes,
  adminListContests,
  adminModerateContestEntry,
  adminUpdateContestCommentStatus,
  adminUpdateContestStatus,
  adminUpdateContest,
  createContestEntryCommentPublic,
  createContestEntry,
  getApprovedContestCommentsPublic,
  getPublishedContestsPublic,
  getApprovedContestEntriesPublic,
  getContestPrizesPublic,
  getContestResultsPublic,
  getContestStatePublic,
  voteContestEntryPublic,
} from "../controllers/contest.controller";

const router = express.Router();

router.get("/:contestId/state", getContestStatePublic);
router.get("/:contestId/entries", getApprovedContestEntriesPublic);
router.get("/:contestId/comments", getApprovedContestCommentsPublic);
router.get("/:contestId/prizes", getContestPrizesPublic);
router.post("/:contestId/entries", protect, upload.array("images", 10), createContestEntry);
router.post("/:contestId/entries/:entryId/comments", createContestEntryCommentPublic);
router.post("/entries/:entryId/vote", voteContestEntryPublic);
router.get("/:id/results", getContestResultsPublic);
router.get("/", getPublishedContestsPublic);
router.post("/admin/contest", protect, adminOnly, adminCreateContest);
router.get("/admin/contest", protect, adminOnly, adminListContests);
router.get("/admin/contest/:id", protect, adminOnly, adminGetContest);
router.get("/admin/contest/:contestId/entries", protect, adminOnly, adminGetContestEntries);
router.get("/admin/contest/:contestId/comments", protect, adminOnly, adminGetContestComments);
router.get("/admin/contest/:contestId/pending-count", protect, adminOnly, adminGetContestPendingCount);
router.put("/admin/contest/:id", protect, adminOnly, adminUpdateContest);
router.patch("/admin/contest/:id/status", protect, adminOnly, adminUpdateContestStatus);
router.get("/admin/contest/:id/prizes", protect, adminOnly, adminGetContestPrizes);
router.post("/admin/contest/:id/prizes", protect, adminOnly, adminConfigureContestPrizes);
router.patch("/admin/entries/:contestEntryId/moderation", protect, adminOnly, adminModerateContestEntry);
router.patch("/admin/comments/:commentId/status", protect, adminOnly, adminUpdateContestCommentStatus);
router.put("/admin/comments/:commentId", protect, adminOnly, adminEditContestComment);
router.delete("/admin/comments/:commentId", protect, adminOnly, adminDeleteContestComment);

export default router;
