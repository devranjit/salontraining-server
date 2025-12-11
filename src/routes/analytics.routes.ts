import { Router } from "express";
import { protect } from "../middleware/auth";
import { adminOnly } from "../middleware/admin";
import { getAnalyticsSummary } from "../controllers/analytics.controller";

const router = Router();

router.get("/summary", protect, adminOnly, getAnalyticsSummary);

export default router;














