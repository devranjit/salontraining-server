import { Request, Response } from "express";
import MembershipCoupon from "../models/MembershipCoupon";

const normalizeCode = (code: string) => code?.trim().toUpperCase();

const validatePayload = (payload: any) => {
  if (!payload.code) {
    throw new Error("Coupon code is required");
  }

  const discountType = payload.discountType === "amount" ? "amount" : "percent";
  const amount = Number(payload.amount);
  if (!amount || Number.isNaN(amount) || amount <= 0) {
    throw new Error("Amount must be a positive number");
  }
  if (discountType === "percent" && amount > 100) {
    throw new Error("Percent discount cannot exceed 100%");
  }

  let maxRedemptions;
  if (payload.maxRedemptions !== undefined) {
    maxRedemptions = Number(payload.maxRedemptions);
    if (Number.isNaN(maxRedemptions) || maxRedemptions <= 0) {
      throw new Error("Max redemptions must be a positive number");
    }
  }

  return {
    code: normalizeCode(payload.code),
    description: payload.description,
    discountType,
    amount,
    maxRedemptions,
    startDate: payload.startDate ? new Date(payload.startDate) : undefined,
    endDate: payload.endDate ? new Date(payload.endDate) : undefined,
  };
};

export const adminListCoupons = async (_req: Request, res: Response) => {
  try {
    const coupons = await MembershipCoupon.find().sort({ createdAt: -1 });
    return res.json({ success: true, coupons });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const adminCreateCoupon = async (req: Request, res: Response) => {
  try {
    const data = validatePayload(req.body);

    const existing = await MembershipCoupon.findOne({ code: data.code });
    if (existing) {
      return res.status(400).json({ success: false, message: "Coupon code already exists" });
    }

    const coupon = await MembershipCoupon.create(data);
    return res.json({ success: true, coupon });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

export const adminUpdateCoupon = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = validatePayload(req.body);

    const existing = await MembershipCoupon.findOne({ _id: { $ne: id }, code: data.code });
    if (existing) {
      return res.status(400).json({ success: false, message: "Coupon code already exists" });
    }

    const coupon = await MembershipCoupon.findByIdAndUpdate(
      id,
      { ...data, isActive: req.body.isActive ?? true },
      { new: true }
    );

    if (!coupon) {
      return res.status(404).json({ success: false, message: "Coupon not found" });
    }

    return res.json({ success: true, coupon });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

export const adminToggleCoupon = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const coupon = await MembershipCoupon.findById(id);
    if (!coupon) {
      return res.status(404).json({ success: false, message: "Coupon not found" });
    }
    coupon.isActive = !coupon.isActive;
    await coupon.save();
    return res.json({ success: true, coupon });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const adminDeleteCoupon = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const coupon = await MembershipCoupon.findById(id);
    if (!coupon) {
      return res.status(404).json({ success: false, message: "Coupon not found" });
    }
    await coupon.deleteOne();
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};























