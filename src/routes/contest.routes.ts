import express from "express";
import { protect, adminOnly } from "../middleware/auth";
import { upload } from "../middleware/upload";
import {
  adminConfigureContestPrizes,
  adminCreateContest,
  adminGetContest,
  adminGetContestEntries,
  adminGetContestPrizes,
  adminListContests,
  adminModerateContestEntry,
  adminUpdateContestStatus,
  adminUpdateContest,
  createContestEntry,
  getPublishedContestsPublic,
  getApprovedContestEntriesPublic,
  getContestResultsPublic,
  getContestStatePublic,
} from "../controllers/contest.controller";

const router = express.Router();

router.get("/:contestId/state", getContestStatePublic);
router.get("/:contestId/entries", getApprovedContestEntriesPublic);
router.post("/:contestId/entries", protect, upload.array("images", 10), createContestEntry);
router.get("/:id/results", getContestResultsPublic);
router.get("/", getPublishedContestsPublic);
router.post("/admin/contest", protect, adminOnly, adminCreateContest);
router.get("/admin/contest", protect, adminOnly, adminListContests);
router.get("/admin/contest/:id", protect, adminOnly, adminGetContest);
router.get("/admin/contest/:contestId/entries", protect, adminOnly, adminGetContestEntries);
router.put("/admin/contest/:id", protect, adminOnly, adminUpdateContest);
router.patch("/admin/contest/:id/status", protect, adminOnly, adminUpdateContestStatus);
router.get("/admin/contest/:id/prizes", protect, adminOnly, adminGetContestPrizes);
router.post("/admin/contest/:id/prizes", protect, adminOnly, adminConfigureContestPrizes);
router.patch("/admin/entries/:contestEntryId/moderation", protect, adminOnly, adminModerateContestEntry);

export default router;
