import express from "express";
import { protect, adminOnly } from "../middleware/auth";
import {
  getMaintenanceStatus,
  adminGetMaintenance,
  updateMaintenance,
} from "../controllers/maintenance.controller";
import { runSystemHealthCheck } from "../controllers/systemHealth.controller";

const router = express.Router();

router.get("/status", getMaintenanceStatus);
router.get("/", protect, adminOnly, adminGetMaintenance);
router.put("/", protect, adminOnly, updateMaintenance);
router.post("/health-check", protect, adminOnly, runSystemHealthCheck);

export default router;












