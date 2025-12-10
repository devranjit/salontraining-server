import { Model } from "mongoose";
import { Listing } from "../models/Listing";
import { Event } from "../models/Event";
import Product from "../models/Product";
import Job from "../models/Job";
import { Blog } from "../models/Blog";
import { Education } from "../models/Education";
import MemberVideo from "../models/MemberVideo";
import User from "../models/User";
import Category from "../models/Category";
import { RecycleBinItem } from "../models/RecycleBinItem";
import { TrainerListing } from "../models/TrainerListing";
import { dispatchEmailEvent } from "./emailService";

// Keep items for 15 days, then show a 5-day final warning window before purge.
const RETENTION_DAYS = 20;
const WARNING_DAYS = 5;
const MS_IN_DAY = 24 * 60 * 60 * 1000;

type EntityKey =
  | "listing"
  | "trainer"
  | "event"
  | "product"
  | "job"
  | "blog"
  | "education"
  | "memberVideo"
  | "user"
  | "category";

type Metadata = Record<string, any>;

const ENTITY_REGISTRY: Record<EntityKey, Model<any>> = {
  listing: Listing,
  trainer: TrainerListing,
  event: Event,
  product: Product,
  job: Job,
  blog: Blog,
  education: Education,
  memberVideo: MemberVideo,
  user: User,
  category: Category,
};

const buildMetadata = (entityType: EntityKey, snapshot: any): Metadata => {
  switch (entityType) {
    case "listing":
    case "trainer":
    case "event":
    case "product":
    case "job":
    case "blog":
    case "education":
      return {
        title: snapshot.title || snapshot.name || snapshot.slug,
        owner: snapshot.owner,
        email: snapshot.email,
      };
    case "memberVideo":
      return {
        title: snapshot.title,
        trainer: snapshot.trainer,
      };
    case "user":
      return {
        name: snapshot.name,
        email: snapshot.email,
      };
    case "category":
      return {
        name: snapshot.name,
        slug: snapshot.slug,
      };
    default:
      return {};
  }
};

export async function moveToRecycleBin(
  entityType: EntityKey,
  doc: any,
  options?: { deletedBy?: string; metadata?: Metadata }
) {
  const model = ENTITY_REGISTRY[entityType];
  if (!model) {
    throw new Error(`Unknown entity type: ${entityType}`);
  }

  const snapshot = doc.toObject({ depopulate: true });
  const metadata = options?.metadata || buildMetadata(entityType, snapshot);
  const deletedAt = new Date();

  await RecycleBinItem.create({
    entityType,
    entityId: doc._id,
    collectionName: model.collection.name,
    snapshot,
    metadata,
    deletedBy: options?.deletedBy,
    deletedAt,
    expiresAt: new Date(deletedAt.getTime() + RETENTION_DAYS * MS_IN_DAY),
  });

  await model.deleteOne({ _id: doc._id });
}

export async function listRecycleBinItems(query: {
  entityType?: EntityKey;
  search?: string;
  page?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
}) {
  const filter: Record<string, any> = {};
  if (query.entityType) {
    filter.entityType = query.entityType;
  }
  if (query.search) {
    const regex = new RegExp(query.search, "i");
    filter.$or = [
      { "metadata.title": regex },
      { "metadata.name": regex },
      { "metadata.slug": regex },
      { "metadata.email": regex },
      { "metadata.owner": regex },
    ];
  }
  if (query.startDate || query.endDate) {
    filter.deletedAt = {};
    if (query.startDate) filter.deletedAt.$gte = new Date(query.startDate);
    if (query.endDate) filter.deletedAt.$lte = new Date(query.endDate);
  }

  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 30;
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    RecycleBinItem.find(filter)
      .populate("deletedBy", "name email")
      .sort({ deletedAt: -1 })
      .skip(skip)
      .limit(limit),
    RecycleBinItem.countDocuments(filter),
  ]);

  return { items, total, page, limit, pages: Math.ceil(total / limit) };
}

export async function restoreFromRecycleBin(itemId: string) {
  const item = await RecycleBinItem.findById(itemId);
  if (!item) {
    throw new Error("Recycle bin item not found");
  }
  if (item.permanentlyDeletedAt) {
    throw new Error("Item already permanently deleted");
  }

  const model = ENTITY_REGISTRY[item.entityType as EntityKey];
  if (!model) {
    throw new Error(`Unknown entity type: ${item.entityType}`);
  }

  const snapshot = { ...item.snapshot, _id: item.entityId };
  await model.create(snapshot);

  item.restoredAt = new Date();
  await item.deleteOne();
}

export async function permanentlyDelete(itemId: string) {
  const item = await RecycleBinItem.findById(itemId);
  if (!item) {
    throw new Error("Recycle bin item not found");
  }

  item.permanentlyDeletedAt = new Date();
  await item.deleteOne();
}

export async function purgeExpiredItems() {
  const now = new Date();
  const expiredItems = await RecycleBinItem.find({
    expiresAt: { $lte: now },
  });

  for (const item of expiredItems) {
    await permanentlyDelete(item._id.toString());
  }

  return expiredItems.length;
}

export async function getExpiringSoonItems() {
  const now = new Date();
  const warningDate = new Date(now.getTime() + WARNING_DAYS * MS_IN_DAY);
  return RecycleBinItem.find({
    expiresAt: { $gt: now, $lte: warningDate },
  });
}

export async function sendExpiryWarning(items: any[]) {
  if (!items.length) return;

  const recipient =
    process.env.ADMIN_ALERT_EMAIL || process.env.SMTP_FROM || null;
  if (!recipient) return;

  const summary = items.map((item) => ({
    entityType: item.entityType,
    metadata: item.metadata,
    deletedAt: item.deletedAt,
    expiresAt: item.expiresAt,
  }));

  try {
    await dispatchEmailEvent("admin.recycle-bin-warning", {
      to: recipient,
      data: { items: summary },
    });
  } catch (err) {
    console.error("Failed to send recycle bin warning email:", err);
  }
}

export async function runRecycleBinCron() {
  const expiringSoon = await getExpiringSoonItems();
  await sendExpiryWarning(expiringSoon);
  const purged = await purgeExpiredItems();
  return { warningCount: expiringSoon.length, purged };
}

