import express from "express";
import { getPublicHeroBadgeStats } from "../controllers/dashboard.controller";

const router = express.Router();

// Public hero badge totals for homepage (read-only, counts only)
router.get("/hero-badges", getPublicHeroBadgeStats);

export default router;

