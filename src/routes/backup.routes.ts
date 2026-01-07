/**
 * Backup Routes
 * 
 * Admin-only routes for backup management.
 * All routes require authentication and admin role.
 */

import { Router } from "express";
import { protect, adminOnly } from "../middleware/auth";
import {
  adminListBackups,
  adminBackupStatus,
  adminCreateBackup,
  adminDeleteBackup,
  adminBackupLog,
  adminCleanupBackups,
} from "../controllers/backup.controller";

const router = Router();

// All routes require admin access
router.use(protect, adminOnly);

// GET /api/admin/backups - List all backups
router.get("/", adminListBackups);

// GET /api/admin/backups/status - Get backup system status
router.get("/status", adminBackupStatus);

// GET /api/admin/backups/log - Get backup log
router.get("/log", adminBackupLog);

// POST /api/admin/backups/create - Manually trigger backup
router.post("/create", adminCreateBackup);

// POST /api/admin/backups/cleanup - Manually trigger cleanup
router.post("/cleanup", adminCleanupBackups);

// DELETE /api/admin/backups/:name - Delete specific backup
router.delete("/:name", adminDeleteBackup);

export default router;





