import { Router } from "express";
import {
  createSystemLog,
  getSystemLogStats,
  getSystemLogs,
  getSystemLogTasks,
} from "../controllers/systemLog.controller";
import { protect } from "../middleware/auth";
import { adminOnly } from "../middleware/admin";

const router = Router();

router.post("/", createSystemLog);
router.get("/admin", protect, adminOnly, getSystemLogs);
router.get("/admin/stats", protect, adminOnly, getSystemLogStats);
router.get("/admin/tasks", protect, adminOnly, getSystemLogTasks);

export default router;

