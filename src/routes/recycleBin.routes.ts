import { Router } from "express";
import { protect } from "../middleware/auth";
import { adminOnly } from "../middleware/admin";
import {
  deleteRecycleBinItem,
  getRecycleBinItems,
  recycleBinCron,
  restoreRecycleBinItem,
} from "../controllers/recycleBin.controller";

const router = Router();

// Cron endpoint (uses secret header instead of auth middleware)
router.post("/cron/run", recycleBinCron);

router.use(protect, adminOnly);

router.get("/", getRecycleBinItems);
router.post("/:id/restore", restoreRecycleBinItem);
router.delete("/:id", deleteRecycleBinItem);

export default router;

