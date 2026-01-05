import mongoose, { Model } from "mongoose";
import { VersionHistory, EntityType } from "../models/VersionHistory";
import { Listing } from "../models/Listing";
import { Event } from "../models/Event";
import Product from "../models/Product";
import Job from "../models/Job";
import { Blog } from "../models/Blog";
import { Education } from "../models/Education";
import { EducationCategory } from "../models/EducationCategory";
import MemberVideo from "../models/MemberVideo";
import User from "../models/User";
import Category from "../models/Category";
import { TrainerListing } from "../models/TrainerListing";
import { SeekingEmployment } from "../models/SeekingEmployment";
import Coupon from "../models/Coupon";
import { MembershipPlan } from "../models/MembershipPlan";
import ShippingZone from "../models/ShippingZone";
import ShippingMethod from "../models/ShippingMethod";
import { EmailTemplate } from "../models/EmailTemplate";

// Maximum versions to keep per entity (older ones will be pruned)
const MAX_VERSIONS_PER_ENTITY = 30;

// Entity registry mapping entity types to their models
const ENTITY_REGISTRY: Record<string, Model<any>> = {
  listing: Listing,
  trainer: TrainerListing,
  event: Event,
  product: Product,
  "store-product": Product,
  job: Job,
  blog: Blog,
  education: Education,
  "education-category": EducationCategory,
  memberVideo: MemberVideo,
  user: User,
  category: Category,
  seekingEmployment: SeekingEmployment,
  coupon: Coupon,
  "membership-plan": MembershipPlan,
  "shipping-zone": ShippingZone,
  "shipping-method": ShippingMethod,
  "email-template": EmailTemplate,
};

// Helper to build metadata for quick display
function buildMetadata(entityType: string, snapshot: any): Record<string, string> {
  const metadata: Record<string, string> = {};
  
  if (snapshot.title) metadata.title = snapshot.title;
  if (snapshot.name) metadata.name = snapshot.name;
  if (snapshot.email) metadata.email = snapshot.email;
  if (snapshot.status) metadata.status = snapshot.status;
  if (snapshot.slug) metadata.title = metadata.title || snapshot.slug;
  
  return metadata;
}

// Helper to generate change summary by comparing old and new values
function generateChangeSummary(oldSnapshot: any, newData: any): string[] {
  const changes: string[] = [];
  const importantFields = [
    "title", "name", "description", "status", "email", "phone",
    "address", "price", "category", "featured", "isPublished"
  ];
  
  for (const field of importantFields) {
    if (newData[field] !== undefined && oldSnapshot[field] !== newData[field]) {
      if (field === "status") {
        changes.push(`Status: ${oldSnapshot[field] || "none"} → ${newData[field]}`);
      } else if (field === "featured") {
        changes.push(`Featured: ${newData[field] ? "Yes" : "No"}`);
      } else if (field === "isPublished") {
        changes.push(`Published: ${newData[field] ? "Yes" : "No"}`);
      } else {
        changes.push(`${field.charAt(0).toUpperCase() + field.slice(1)} updated`);
      }
    }
  }
  
  if (changes.length === 0) {
    changes.push("General update");
  }
  
  return changes;
}

/**
 * Create a version snapshot before updating an entity
 */
export async function createVersionSnapshot(
  entityType: string,
  doc: any,
  options?: {
    changedBy?: string;
    changedByName?: string;
    changedByEmail?: string;
    changeType?: "create" | "update" | "status_change" | "restore";
    newData?: any;
    restoredFromVersion?: number;
  }
): Promise<void> {
  console.log(`[VersionHistory] Creating snapshot for ${entityType}, docId: ${doc?._id}`);
  try {
    const model = ENTITY_REGISTRY[entityType];
    if (!model) {
      console.warn(`[VersionHistory] Unknown entity type: ${entityType}`);
      return;
    }

    // Get the current highest version number for this entity
    const lastVersion = await VersionHistory.findOne({
      entityType,
      entityId: doc._id,
    }).sort({ version: -1 }).select("version").lean();

    const newVersion = (lastVersion?.version || 0) + 1;
    
    // Create snapshot from the document
    const snapshot = doc.toObject ? doc.toObject({ depopulate: true }) : { ...doc };
    
    // Remove fields we don't want to store
    delete snapshot.__v;
    
    const metadata = buildMetadata(entityType, snapshot);
    const changeSummary = options?.newData 
      ? generateChangeSummary(snapshot, options.newData)
      : [options?.changeType === "create" ? "Created" : "Updated"];

    const created = await VersionHistory.create({
      entityType,
      entityId: doc._id,
      collectionName: model.collection.name,
      version: newVersion,
      snapshot,
      changeSummary,
      metadata,
      changedBy: options?.changedBy,
      changedByName: options?.changedByName,
      changedByEmail: options?.changedByEmail,
      changeType: options?.changeType || "update",
      restoredFromVersion: options?.restoredFromVersion,
    });

    console.log(`[VersionHistory] ✓ Created version ${newVersion} for ${entityType}:${doc._id}, id: ${created._id}`);

    // Prune old versions if we exceed the limit
    await pruneOldVersions(entityType, doc._id.toString());
  } catch (err) {
    console.error("[VersionHistory] ✗ Failed to create version snapshot:", err);
    // Don't throw - version history should not block the main operation
  }
}

/**
 * Remove old versions beyond the limit
 */
async function pruneOldVersions(entityType: string, entityId: string): Promise<void> {
  // Convert string entityId to ObjectId for query
  let entityIdQuery: any = entityId;
  if (mongoose.Types.ObjectId.isValid(entityId)) {
    entityIdQuery = new mongoose.Types.ObjectId(entityId);
  }

  const count = await VersionHistory.countDocuments({ entityType, entityId: entityIdQuery });
  
  if (count > MAX_VERSIONS_PER_ENTITY) {
    // Find versions to delete (oldest ones beyond the limit)
    const versionsToKeep = await VersionHistory.find({ entityType, entityId: entityIdQuery })
      .sort({ version: -1 })
      .limit(MAX_VERSIONS_PER_ENTITY)
      .select("_id")
      .lean();
    
    const keepIds = versionsToKeep.map((v) => v._id);
    
    await VersionHistory.deleteMany({
      entityType,
      entityId: entityIdQuery,
      _id: { $nin: keepIds },
    });
  }
}

/**
 * Get version history for an entity
 */
export async function getVersionHistory(
  entityType: string,
  entityId: string,
  options?: { page?: number; limit?: number }
): Promise<{
  versions: any[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}> {
  const page = options?.page || 1;
  const limit = options?.limit || 20;
  const skip = (page - 1) * limit;

  // Convert string entityId to ObjectId for query (entityId is stored as ObjectId)
  let entityIdQuery: any = entityId;
  if (mongoose.Types.ObjectId.isValid(entityId)) {
    entityIdQuery = new mongoose.Types.ObjectId(entityId);
  }

  const [versions, total] = await Promise.all([
    VersionHistory.find({ entityType, entityId: entityIdQuery })
      .populate("changedBy", "name email")
      .sort({ version: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    VersionHistory.countDocuments({ entityType, entityId: entityIdQuery }),
  ]);

  return {
    versions,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  };
}

/**
 * Get a specific version
 */
export async function getVersion(versionId: string): Promise<any> {
  return VersionHistory.findById(versionId)
    .populate("changedBy", "name email")
    .lean();
}

/**
 * Restore an entity to a specific version
 */
export async function restoreToVersion(
  versionId: string,
  options?: {
    restoredBy?: string;
    restoredByName?: string;
    restoredByEmail?: string;
  }
): Promise<{ success: boolean; message: string; entity?: any }> {
  const version = await VersionHistory.findById(versionId);
  
  if (!version) {
    return { success: false, message: "Version not found" };
  }

  const model = ENTITY_REGISTRY[version.entityType];
  if (!model) {
    return { success: false, message: `Unknown entity type: ${version.entityType}` };
  }

  // Find the current entity
  const currentEntity = await model.findById(version.entityId);
  if (!currentEntity) {
    return { success: false, message: "Entity no longer exists" };
  }

  // Create a snapshot of current state before restoring
  await createVersionSnapshot(version.entityType, currentEntity, {
    changedBy: options?.restoredBy,
    changedByName: options?.restoredByName,
    changedByEmail: options?.restoredByEmail,
    changeType: "restore",
    restoredFromVersion: version.version,
  });

  // Prepare the snapshot for restoration
  const restoreData = { ...version.snapshot };
  
  // Remove fields that should not be overwritten
  delete restoreData._id;
  delete restoreData.createdAt;
  delete restoreData.updatedAt;
  delete restoreData.__v;
  
  // For certain fields, we might want to preserve the current value
  // e.g., don't restore owner, keep current timestamps
  delete restoreData.owner;

  // Apply the restoration
  Object.assign(currentEntity, restoreData);
  await currentEntity.save();

  return {
    success: true,
    message: `Restored to version ${version.version}`,
    entity: currentEntity,
  };
}

/**
 * Compare two versions and return the differences
 */
export async function compareVersions(
  versionId1: string,
  versionId2: string
): Promise<{ differences: any[]; version1: any; version2: any } | null> {
  const [v1, v2] = await Promise.all([
    VersionHistory.findById(versionId1).lean(),
    VersionHistory.findById(versionId2).lean(),
  ]);

  if (!v1 || !v2) {
    return null;
  }

  const differences: any[] = [];
  const snapshot1 = v1.snapshot || {};
  const snapshot2 = v2.snapshot || {};

  // Get all unique keys from both snapshots
  const allKeys = new Set([
    ...Object.keys(snapshot1),
    ...Object.keys(snapshot2),
  ]);

  // Skip internal/system fields
  const skipFields = ["_id", "__v", "createdAt", "updatedAt"];

  for (const key of allKeys) {
    if (skipFields.includes(key)) continue;
    
    const val1 = JSON.stringify(snapshot1[key]);
    const val2 = JSON.stringify(snapshot2[key]);
    
    if (val1 !== val2) {
      differences.push({
        field: key,
        oldValue: snapshot1[key],
        newValue: snapshot2[key],
      });
    }
  }

  return {
    differences,
    version1: v1,
    version2: v2,
  };
}

/**
 * Get recent version history across all entities (for admin overview)
 */
export async function getRecentVersionHistory(options?: {
  entityType?: string;
  changedBy?: string;
  page?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
}): Promise<{
  versions: any[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}> {
  const filter: Record<string, any> = {};
  
  if (options?.entityType) {
    filter.entityType = options.entityType;
  }
  if (options?.changedBy) {
    filter.changedBy = options.changedBy;
  }
  if (options?.startDate || options?.endDate) {
    filter.createdAt = {};
    if (options.startDate) filter.createdAt.$gte = new Date(options.startDate);
    if (options.endDate) filter.createdAt.$lte = new Date(options.endDate);
  }

  const page = options?.page || 1;
  const limit = options?.limit || 50;
  const skip = (page - 1) * limit;

  const [versions, total] = await Promise.all([
    VersionHistory.find(filter)
      .populate("changedBy", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    VersionHistory.countDocuments(filter),
  ]);

  return {
    versions,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  };
}

/**
 * Get statistics about version history
 */
export async function getVersionHistoryStats(): Promise<{
  totalVersions: number;
  byEntityType: Record<string, number>;
  recentActivity: number;
}> {
  const [totalVersions, byEntityType, recentActivity] = await Promise.all([
    VersionHistory.countDocuments(),
    VersionHistory.aggregate([
      { $group: { _id: "$entityType", count: { $sum: 1 } } },
    ]),
    VersionHistory.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    }),
  ]);

  const byType: Record<string, number> = {};
  for (const item of byEntityType) {
    byType[item._id] = item.count;
  }

  return {
    totalVersions,
    byEntityType: byType,
    recentActivity,
  };
}

/**
 * Delete all version history for an entity (used when entity is permanently deleted)
 */
export async function deleteVersionHistory(
  entityType: string,
  entityId: string
): Promise<number> {
  // Convert string entityId to ObjectId for query
  let entityIdQuery: any = entityId;
  if (mongoose.Types.ObjectId.isValid(entityId)) {
    entityIdQuery = new mongoose.Types.ObjectId(entityId);
  }
  
  const result = await VersionHistory.deleteMany({ entityType, entityId: entityIdQuery });
  return result.deletedCount;
}

