import { Request, Response } from "express";
import {
  listRecycleBinItems,
  permanentlyDelete,
  restoreFromRecycleBin,
  runRecycleBinCron,
} from "../services/recycleBinService";

export const getRecycleBinItems = async (req: Request, res: Response) => {
  try {
    const items = await listRecycleBinItems({
      entityType: (req.query.entityType as any) || undefined,
    });
    res.json({ success: true, items });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to load recycle bin",
    });
  }
};

export const restoreRecycleBinItem = async (req: Request, res: Response) => {
  try {
    await restoreFromRecycleBin(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      message: err?.message || "Restore failed",
    });
  }
};

export const deleteRecycleBinItem = async (req: Request, res: Response) => {
  try {
    await permanentlyDelete(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      message: err?.message || "Delete failed",
    });
  }
};

export const recycleBinCron = async (req: Request, res: Response) => {
  const cronKey = req.headers["x-cron-key"];
  if (!process.env.CRON_SECRET || cronKey !== process.env.CRON_SECRET) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  try {
    const result = await runRecycleBinCron();
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err?.message || "Cron execution failed",
    });
  }
};


