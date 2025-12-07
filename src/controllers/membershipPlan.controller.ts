import { Request, Response } from "express";
import MembershipPlan from "../models/MembershipPlan";
import MembershipLog from "../models/MembershipLog";
import UserMembership from "../models/UserMembership";
import { ensureStripePriceForPlan } from "../services/membershipStripe";

const normalizeFeatures = (value: any): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

export const listActivePlans = async (_req: Request, res: Response) => {
  try {
    const plans = await MembershipPlan.find({ isActive: true }).sort({ price: 1 });
    return res.json({ success: true, plans });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const adminListPlans = async (_req: Request, res: Response) => {
  try {
    const plans = await MembershipPlan.find().sort({ createdAt: -1 });
    return res.json({ success: true, plans });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const createPlan = async (req: Request, res: Response) => {
  try {
    const {
      name,
      description,
      price,
      interval,
      stripePriceId,
      stripeProductId,
      features,
      badge,
      isActive = true,
    } = req.body;

    if (!name || price === undefined || price === null || !interval) {
      return res.status(400).json({ success: false, message: "Name, price, and interval are required" });
    }

    const numericPrice = Number(price);
    if (!numericPrice || Number.isNaN(numericPrice) || numericPrice <= 0) {
      return res.status(400).json({ success: false, message: "Price must be a positive number" });
    }

    const normalizedInterval = interval === "year" ? "year" : "month";
    const normalizedFeatures = normalizeFeatures(features);

    const { stripePriceId: ensuredPriceId, stripeProductId: ensuredProductId } = await ensureStripePriceForPlan({
      name,
      price: numericPrice,
      interval: normalizedInterval,
      stripePriceId,
      stripeProductId,
    });

    const plan = await MembershipPlan.create({
      name,
      description,
      price: numericPrice,
      interval: normalizedInterval,
      stripePriceId: ensuredPriceId,
      stripeProductId: ensuredProductId,
      features: normalizedFeatures,
      badge: typeof badge === "string" ? badge.trim() : undefined,
      isActive,
    });

    await MembershipLog.create({
      type: "plan_edit",
      message: `Plan ${plan.name} created`,
      plan: plan._id,
      data: { plan },
    });

    return res.json({ success: true, plan });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const updatePlan = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const plan = await MembershipPlan.findById(id);

    if (!plan) {
      return res.status(404).json({ success: false, message: "Plan not found" });
    }

    const normalizedInterval = updates.interval ? (updates.interval === "year" ? "year" : "month") : plan.interval;

    const resolvedPrice =
      updates.price !== undefined && updates.price !== null ? Number(updates.price) : plan.price;

    if (updates.price !== undefined && (Number.isNaN(resolvedPrice) || resolvedPrice <= 0)) {
      return res.status(400).json({ success: false, message: "Price must be a positive number" });
    }

    const normalizedFeatures =
      updates.features !== undefined ? normalizeFeatures(updates.features) : plan.features || [];

    const nextData: any = {
      name: updates.name ?? plan.name,
      description: updates.description ?? plan.description,
      price: resolvedPrice,
      interval: normalizedInterval,
      isActive: typeof updates.isActive === "boolean" ? updates.isActive : plan.isActive,
      features: normalizedFeatures,
      badge:
        updates.badge !== undefined
          ? typeof updates.badge === "string"
            ? updates.badge.trim()
            : undefined
          : plan.badge,
    };

    const needsStripeSync =
      updates.stripePriceId ||
      updates.stripeProductId ||
      updates.price !== undefined ||
      updates.interval ||
      !plan.stripePriceId?.startsWith("price_");

    if (needsStripeSync) {
      const { stripePriceId: ensuredPriceId, stripeProductId: ensuredProductId } = await ensureStripePriceForPlan({
        planId: plan._id.toString(),
        name: nextData.name,
        price: resolvedPrice,
        interval: nextData.interval,
        stripePriceId: updates.stripePriceId || plan.stripePriceId,
        stripeProductId: updates.stripeProductId || plan.stripeProductId,
      });
      nextData.stripePriceId = ensuredPriceId;
      nextData.stripeProductId = ensuredProductId;
    }

    plan.set({ ...nextData });
    await plan.save();

    await MembershipLog.create({
      type: "plan_edit",
      message: `Plan ${plan.name} updated`,
      plan: plan._id,
      data: { updates: nextData },
    });

    return res.json({ success: true, plan });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const togglePlan = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const plan = await MembershipPlan.findById(id);
    if (!plan) {
      return res.status(404).json({ success: false, message: "Plan not found" });
    }

    plan.isActive = !plan.isActive;
    await plan.save();

    await MembershipLog.create({
      type: "plan_edit",
      message: `${plan.name} ${plan.isActive ? "enabled" : "disabled"}`,
      plan: plan._id,
    });

    return res.json({ success: true, plan });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const deletePlan = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const plan = await MembershipPlan.findById(id);
    if (!plan) {
      return res.status(404).json({ success: false, message: "Plan not found" });
    }

    const membershipCount = await UserMembership.countDocuments({ plan: id });
    if (membershipCount > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete a plan that is assigned to existing memberships",
      });
    }

    await plan.deleteOne();

    await MembershipLog.create({
      type: "plan_edit",
      message: `${plan.name} deleted`,
      plan: plan._id,
    });

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};


