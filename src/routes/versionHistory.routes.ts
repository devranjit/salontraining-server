import { Router } from "express";
import { protect, adminOnly } from "../middleware/auth";
import {
  getEntityVersionHistory,
  getVersionDetails,
  restoreVersion,
  compareVersionsHandler,
  getRecentHistory,
  getStats,
  getEntityTypes,
} from "../controllers/versionHistory.controller";

const router = Router();

// All routes require admin authentication
router.use(protect);
router.use(adminOnly);

// Get entity type options for filters
router.get("/entity-types", getEntityTypes);

// Get version history statistics
router.get("/stats", getStats);

// Get recent version history across all entities
router.get("/recent", getRecentHistory);

// Get a specific version's full details
router.get("/version/:versionId", getVersionDetails);

// Compare two versions
router.get("/compare/:versionId1/:versionId2", compareVersionsHandler);

// Restore an entity to a specific version
router.post("/restore/:versionId", restoreVersion);

// Get version history for a specific entity
router.get("/:entityType/:entityId", getEntityVersionHistory);

export default router;

