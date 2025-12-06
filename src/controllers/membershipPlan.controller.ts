import { Request, Response } from "express";
import MembershipPlan from "../models/MembershipPlan";
import MembershipLog from "../models/MembershipLog";

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
    const { name, description, price, interval, stripePriceId, stripeProductId, isActive = true } = req.body;

    if (!name || !price || !interval || !stripePriceId) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const plan = await MembershipPlan.create({
      name,
      description,
      price,
      interval,
      stripePriceId,
      stripeProductId,
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
    const plan = await MembershipPlan.findByIdAndUpdate(id, updates, { new: true });

    if (!plan) {
      return res.status(404).json({ success: false, message: "Plan not found" });
    }

    await MembershipLog.create({
      type: "plan_edit",
      message: `Plan ${plan.name} updated`,
      plan: plan._id,
      data: { updates },
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


