import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import MaintenanceSetting from "../models/MaintenanceSetting";
import { User } from "../models/User";

async function getOrCreateSetting() {
  let setting = await MaintenanceSetting.findOne();
  if (!setting) {
    setting = await MaintenanceSetting.create({});
  }
  return setting;
}

async function getRequestUser(req: Request) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) return null;

    const token = authHeader.replace("Bearer ", "");
    const decoded: any = jwt.verify(token, process.env.JWT_SECRET as string);
    if (!decoded?.id) return null;

    const user = await User.findById(decoded.id).select("role email name");
    return user;
  } catch (err) {
    return null;
  }
}

function getClientIP(req: Request) {
  const forwarded = (req.headers["x-forwarded-for"] as string) || "";
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return (req.socket && req.socket.remoteAddress) || req.ip || "";
}

export const getMaintenanceStatus = async (req: Request, res: Response) => {
  try {
    const setting = await getOrCreateSetting();
    const user = await getRequestUser(req);
    const clientIP = getClientIP(req);

    let bypass = false;

    if (!setting.isEnabled) {
      return res.json({
        success: true,
        isEnabled: false,
        bypass: true,
        setting,
      });
    }

    if (user && user.role === "admin") {
      bypass = true;
    }

    if (setting.allowedIPs.includes(clientIP)) {
      bypass = true;
    }

    // Auto disable if timer passed
    if (setting.resumeAt && setting.resumeAt < new Date()) {
      setting.isEnabled = false;
      await setting.save();
      return res.json({
        success: true,
        isEnabled: false,
        bypass: true,
        setting,
      });
    }

    return res.json({
      success: true,
      isEnabled: setting.isEnabled,
      bypass,
      setting,
    });
  } catch (err) {
    console.error("Maintenance status error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch maintenance status",
    });
  }
};

export const adminGetMaintenance = async (req: Request, res: Response) => {
  try {
    const setting = await getOrCreateSetting();
    return res.json({ success: true, setting });
  } catch (err) {
    console.error("Maintenance get error:", err);
    return res.status(500).json({ success: false, message: "Failed to load" });
  }
};

export const updateMaintenance = async (req: any, res: Response) => {
  try {
    const {
      isEnabled,
      allowedIPs,
      resumeAt,
      showCountdown,
      title,
      subtitle,
      description,
      ctaText,
      ctaLink,
      backgroundImage,
    } = req.body;

    const setting = await getOrCreateSetting();

    if (typeof isEnabled === "boolean") setting.isEnabled = isEnabled;
    if (Array.isArray(allowedIPs)) setting.allowedIPs = allowedIPs;
    setting.resumeAt = resumeAt ? new Date(resumeAt) : undefined;
    if (typeof showCountdown === "boolean") setting.showCountdown = showCountdown;
    if (typeof title === "string") setting.title = title;
    if (typeof subtitle === "string") setting.subtitle = subtitle;
    if (typeof description === "string") setting.description = description;
    if (typeof ctaText === "string") setting.ctaText = ctaText;
    if (typeof ctaLink === "string") setting.ctaLink = ctaLink;
    if (typeof backgroundImage === "string")
      setting.backgroundImage = backgroundImage;

    setting.updatedBy = req.user?.id;

    await setting.save();

    return res.json({
      success: true,
      message: "Maintenance settings updated",
      setting,
    });
  } catch (err) {
    console.error("Maintenance update error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to update settings" });
  }
};






