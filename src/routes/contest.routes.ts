import express from "express";
import { protect, adminOnly } from "../middleware/auth";
import {
  adminConfigureContestPrizes,
  adminCreateContest,
  adminGetContest,
  adminGetContestPrizes,
  adminListContests,
  adminModerateContestEntry,
  adminUpdateContestStatus,
  adminUpdateContest,
  getPublishedContestsPublic,
  getApprovedContestEntriesPublic,
  getContestResultsPublic,
  getContestStatePublic,
} from "../controllers/contest.controller";

const router = express.Router();

router.get("/:contestId/state", getContestStatePublic);
router.get("/:contestId/entries", getApprovedContestEntriesPublic);
router.get("/:id/results", getContestResultsPublic);
router.get("/", getPublishedContestsPublic);
router.post("/admin/contest", protect, adminOnly, adminCreateContest);
router.get("/admin/contest", protect, adminOnly, adminListContests);
router.get("/admin/contest/:id", protect, adminOnly, adminGetContest);
router.put("/admin/contest/:id", protect, adminOnly, adminUpdateContest);
router.patch("/admin/contest/:id/status", protect, adminOnly, adminUpdateContestStatus);
router.get("/admin/contest/:id/prizes", protect, adminOnly, adminGetContestPrizes);
router.post("/admin/contest/:id/prizes", protect, adminOnly, adminConfigureContestPrizes);
router.patch("/admin/entries/:contestEntryId/moderation", protect, adminOnly, adminModerateContestEntry);

export default router;
