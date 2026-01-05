import { Request, Response } from "express";
import {
  getVersionHistory,
  getVersion,
  restoreToVersion,
  compareVersions,
  getRecentVersionHistory,
  getVersionHistoryStats,
} from "../services/versionHistoryService";

// Valid entity types for version history
const VALID_ENTITY_TYPES = [
  "trainer",
  "event",
  "product",
  "store-product",
  "job",
  "blog",
  "education",
  "education-category",
  "memberVideo",
  "user",
  "category",
  "seekingEmployment",
  "coupon",
  "membership-plan",
  "shipping-zone",
  "shipping-method",
  "email-template",
];

/**
 * Get version history for a specific entity
 * GET /api/version-history/:entityType/:entityId
 */
export async function getEntityVersionHistory(req: Request, res: Response) {
  try {
    const { entityType, entityId } = req.params;
    const { page, limit } = req.query;

    console.log(`[VersionHistory API] GET /${entityType}/${entityId}`);

    if (!VALID_ENTITY_TYPES.includes(entityType)) {
      console.log(`[VersionHistory API] Invalid entity type: ${entityType}`);
      return res.status(400).json({
        success: false,
        message: `Invalid entity type. Valid types: ${VALID_ENTITY_TYPES.join(", ")}`,
      });
    }

    const result = await getVersionHistory(entityType, entityId, {
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 20,
    });

    console.log(`[VersionHistory API] Found ${result.versions.length} versions for ${entityType}:${entityId}`);

    return res.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    console.error("[VersionHistory API] Error getting version history:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to get version history",
    });
  }
}

/**
 * Get a specific version's full snapshot
 * GET /api/version-history/version/:versionId
 */
export async function getVersionDetails(req: Request, res: Response) {
  try {
    const { versionId } = req.params;

    const version = await getVersion(versionId);

    if (!version) {
      return res.status(404).json({
        success: false,
        message: "Version not found",
      });
    }

    return res.json({
      success: true,
      version,
    });
  } catch (err: any) {
    console.error("Error getting version details:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to get version details",
    });
  }
}

/**
 * Restore an entity to a specific version
 * POST /api/version-history/restore/:versionId
 */
export async function restoreVersion(req: any, res: Response) {
  try {
    const { versionId } = req.params;

    const result = await restoreToVersion(versionId, {
      restoredBy: req.user?._id?.toString(),
      restoredByName: req.user?.name,
      restoredByEmail: req.user?.email,
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (err: any) {
    console.error("Error restoring version:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to restore version",
    });
  }
}

/**
 * Compare two versions
 * GET /api/version-history/compare/:versionId1/:versionId2
 */
export async function compareVersionsHandler(req: Request, res: Response) {
  try {
    const { versionId1, versionId2 } = req.params;

    const result = await compareVersions(versionId1, versionId2);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "One or both versions not found",
      });
    }

    return res.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    console.error("Error comparing versions:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to compare versions",
    });
  }
}

/**
 * Get recent version history across all entities (admin overview)
 * GET /api/version-history/recent
 */
export async function getRecentHistory(req: Request, res: Response) {
  try {
    const { entityType, changedBy, page, limit, startDate, endDate } = req.query;

    const result = await getRecentVersionHistory({
      entityType: entityType as string,
      changedBy: changedBy as string,
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 50,
      startDate: startDate as string,
      endDate: endDate as string,
    });

    return res.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    console.error("Error getting recent history:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to get recent history",
    });
  }
}

/**
 * Get version history statistics
 * GET /api/version-history/stats
 */
export async function getStats(req: Request, res: Response) {
  try {
    const stats = await getVersionHistoryStats();

    return res.json({
      success: true,
      stats,
    });
  } catch (err: any) {
    console.error("Error getting version history stats:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to get stats",
    });
  }
}

/**
 * Get entity type options for filter dropdown
 * GET /api/version-history/entity-types
 */
export async function getEntityTypes(req: Request, res: Response) {
  const entityTypes = VALID_ENTITY_TYPES.map((type) => ({
    value: type,
    label: type
      .replace(/-/g, " ")
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase())
      .trim(),
  }));

  return res.json({
    success: true,
    entityTypes,
  });
}

