import { Request, Response } from "express";
import SystemLog from "../models/SystemLog";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;

export async function createSystemLog(req: Request, res: Response) {
  try {
    const {
      task,
      action,
      message,
      status,
      level,
      route,
      component,
      payload,
      meta,
      sessionId,
      tags = [],
      source = "frontend",
    } = req.body || {};

    if (!task || !action) {
      return res
        .status(400)
        .json({ success: false, message: "task and action are required" });
    }

    // Limit payload size to avoid large writes
    const sanitize = (value: any) => {
      const str = JSON.stringify(value ?? {});
      if (str.length > 8000) {
        return {
          truncated: true,
          preview: str.slice(0, 8000),
        };
      }
      return value;
    };

    // User is now guaranteed from protect middleware
    const user = (req as any).user;
    const ipHeader = (req.headers["x-forwarded-for"] ||
      req.headers["x-real-ip"]) as string | undefined;

    const normalizedTags = Array.isArray(tags)
      ? tags
      : typeof tags === "string"
      ? tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
      : [];

    await SystemLog.create({
      source,
      task: String(task).slice(0, 120),
      action: String(action).slice(0, 160),
      level: level || "info",
      status: status || "info",
      message,
      route,
      component,
      sessionId,
      tags: normalizedTags,
      payload: sanitize(payload),
      meta: sanitize(meta),
      userId: user?._id,
      userEmail: user?.email,
      userName: user?.name,
      userRole: user?.role,
      ip: ipHeader ? ipHeader.split(",")[0].trim() : req.ip,
      userAgent: req.headers["user-agent"],
    });

    return res.json({ success: true });
  } catch (error) {
    console.error("Failed to create system log:", error);
    return res.status(500).json({ success: false, message: "Failed to log event" });
  }
}

export async function getSystemLogs(req: Request, res: Response) {
  try {
    const {
      page = "1",
      limit = DEFAULT_PAGE_SIZE.toString(),
      task,
      user,
      status,
      level,
      source,
      route,
      component,
      search,
      dateFrom,
      dateTo,
    } = req.query as Record<string, string>;

    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.min(
      Math.max(Number(limit) || DEFAULT_PAGE_SIZE, 1),
      MAX_PAGE_SIZE
    );

    const filters: Record<string, any> = {};

    if (task) filters.task = task;
    if (status) filters.status = status;
    if (level) filters.level = level;
    if (source) filters.source = source;
    if (route) filters.route = route;
    if (component) filters.component = component;

    if (user) {
      const regex = new RegExp(user, "i");
      filters.$or = [
        { userEmail: regex },
        { userName: regex },
        { userRole: regex },
      ];
    }

    if (search) {
      const regex = new RegExp(search, "i");
      filters.$or = [
        ...(filters.$or as any[] | undefined) || [],
        { message: regex },
        { action: regex },
        { task: regex },
        { tags: regex },
        { route: regex },
      ];
    }

    if (dateFrom || dateTo) {
      filters.createdAt = {};
      if (dateFrom) {
        (filters.createdAt as any).$gte = new Date(dateFrom);
      }
      if (dateTo) {
        (filters.createdAt as any).$lte = new Date(dateTo);
      }
    }

    const query = SystemLog.find(filters)
      .sort({ createdAt: -1 })
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize);

    const [logs, total] = await Promise.all([
      query.lean(),
      SystemLog.countDocuments(filters),
    ]);

    return res.json({
      success: true,
      data: logs,
      pagination: {
        total,
        page: pageNumber,
        limit: pageSize,
        pages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error("Failed to fetch system logs:", error);
    return res.status(500).json({ success: false, message: "Failed to load logs" });
  }
}

export async function getSystemLogStats(_req: Request, res: Response) {
  try {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [totals, lastDay, perTask, perLevel] = await Promise.all([
      SystemLog.countDocuments(),
      SystemLog.countDocuments({ createdAt: { $gte: last24h } }),
      SystemLog.aggregate([
        { $group: { _id: "$task", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      SystemLog.aggregate([
        { $group: { _id: "$level", count: { $sum: 1 } } },
      ]),
    ]);

    return res.json({
      success: true,
      stats: {
        total: totals,
        last24h: lastDay,
        topTasks: perTask,
        byLevel: perLevel,
      },
    });
  } catch (error) {
    console.error("Failed to get log stats:", error);
    return res.status(500).json({ success: false, message: "Failed to load stats" });
  }
}

export async function getSystemLogTasks(_req: Request, res: Response) {
  try {
    const tasks = await SystemLog.distinct("task");
    return res.json({ success: true, tasks });
  } catch (error) {
    console.error("Failed to get log tasks:", error);
    return res.status(500).json({ success: false, message: "Failed to load tasks" });
  }
}

