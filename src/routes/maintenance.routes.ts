import express from "express";
import { protect, adminOnly } from "../middleware/auth";
import {
  getMaintenanceStatus,
  adminGetMaintenance,
  updateMaintenance,
} from "../controllers/maintenance.controller";

const router = express.Router();

router.get("/status", getMaintenanceStatus);
router.get("/", protect, adminOnly, adminGetMaintenance);
router.put("/", protect, adminOnly, updateMaintenance);

export default router;








