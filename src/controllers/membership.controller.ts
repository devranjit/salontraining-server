import { Request, Response } from "express";
import Stripe from "stripe";
import MembershipPlan from "../models/MembershipPlan";
import UserMembership from "../models/UserMembership";
import MembershipLog, { MembershipLogType } from "../models/MembershipLog";
import { User } from "../models/User";
import { getStripeClient } from "../services/stripeClient";
import { ensureStripePriceForPlan } from "../services/membershipStripe";
import { dispatchEmailEvent } from "../services/emailService";
import MembershipCoupon, { CouponDiscountType, IMembershipCoupon } from "../models/MembershipCoupon";

const stripe = () => getStripeClient();

const FRONTEND_URL =
  process.env.FRONTEND_URL ||
  (process.env.NODE_ENV === "development" ? "http://localhost:5173" : "https://salontraining.com");

const buildSuccessUrl = (planId: string) =>
  `${FRONTEND_URL}/dashboard/membership?status=success&plan=${planId}`;
const buildCancelUrl = () => `${FRONTEND_URL}/dashboard/membership?status=cancelled`;

const ensureMembership = async (userId: string, planId: string) => {
  let membership = await UserMembership.findOne({ user: userId });
  if (!membership) {
    membership = await UserMembership.create({ user: userId, plan: planId, status: "pending" });
  } else if (membership.plan.toString() !== planId) {
    membership.plan = planId as any;
  }
  return membership;
};

const setUserRoleForMembership = async (userId: string, active: boolean) => {
  const user = await User.findById(userId);
  if (!user) return;

  if (active) {
    if (!["admin", "manager", "st-member"].includes(user.role)) {
      user.role = "member";
      await user.save();
    }
  } else if (user.role === "member") {
    user.role = "user";
    await user.save();
  }
};

const logEvent = (payload: {
  user?: string;
  plan?: string;
  membership?: string;
  type: MembershipLogType;
  message: string;
  data?: Record<string, any>;
  createdBy?: string;
  stripeEventId?: string;
  stripePaymentIntentId?: string;
  stripeInvoiceId?: string;
  amount?: number;
  currency?: string;
}) => MembershipLog.create(payload);

const normalizeCouponCode = (code?: string) => code?.trim().toUpperCase();

const calculateDiscountedAmount = (priceInCents: number, coupon: IMembershipCoupon) => {
  const discountCents =
    coupon.discountType === "percent"
      ? Math.floor(priceInCents * (coupon.amount / 100))
      : Math.round(coupon.amount * 100);

  const discountedCents = Math.max(priceInCents - discountCents, 0);
  return { discountCents, discountedCents };
};

const validateCouponForPlan = async (code: string, planPriceCents: number) => {
  const normalized = normalizeCouponCode(code);
  if (!normalized) {
    throw new Error("Coupon code is required");
  }

  const coupon = await MembershipCoupon.findOne({ code: normalized });
  if (!coupon) {
    throw new Error("Invalid coupon code");
  }
  if (!coupon.isActive) {
    throw new Error("Coupon is not active");
  }

  const now = new Date();
  if (coupon.startDate && now < coupon.startDate) {
    throw new Error("Coupon is not yet active");
  }
  if (coupon.endDate && now > coupon.endDate) {
    throw new Error("Coupon has expired");
  }
  if (coupon.maxRedemptions && coupon.usedCount >= coupon.maxRedemptions) {
    throw new Error("Coupon redemption limit reached");
  }

  const { discountCents, discountedCents } = calculateDiscountedAmount(planPriceCents, coupon);
  if (discountedCents < 50) {
    throw new Error("Discounted amount must be at least $0.50");
  }

  return {
    coupon,
    discountCents,
    discountedCents,
    originalCents: planPriceCents,
  };
};

type CouponMetadata = {
  couponId?: string;
  couponCode?: string;
  couponDiscountType?: CouponDiscountType;
  couponAmount?: number;
  discountedAmount?: number;
  originalAmount?: number;
};

const extractCouponMetadata = (metadata?: Stripe.Metadata | null): CouponMetadata | undefined => {
  if (!metadata) return undefined;
  const code = metadata.couponCode || metadata.coupon;
  if (!code) return undefined;

  const toNumber = (value?: string | null) => {
    if (value === undefined || value === null) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  return {
    couponId: metadata.couponId || metadata.couponID,
    couponCode: String(code),
    couponDiscountType: metadata.couponDiscountType as CouponDiscountType,
    couponAmount: toNumber(metadata.couponAmount),
    discountedAmount: toNumber(metadata.discountedAmount),
    originalAmount: toNumber(metadata.originalAmount),
  };
};

const formatDateDisplay = (value?: Date | string | null) => {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

const buildInvoiceCta = (invoiceUrl?: string, invoicePdf?: string) => {
  if (invoiceUrl) {
    const downloadLink = invoicePdf
      ? `<span style="display:block;margin-top:8px;"><a href="${invoicePdf}" style="color:#d57a2c;">Download PDF invoice</a></span>`
      : "";
    return `<a href="${invoiceUrl}" style="background:#d57a2c;color:#fff;padding:12px 28px;border-radius:999px;text-decoration:none;font-weight:bold;">View invoice</a>${downloadLink}`;
  }
  if (invoicePdf) {
    return `<a href="${invoicePdf}" style="color:#d57a2c;">Download PDF invoice</a>`;
  }
  return "";
};

const sendMembershipActivationEmail = async ({
  membershipId,
  invoiceUrl,
  invoicePdf,
  amountPaid,
  currency,
}: {
  membershipId: string;
  invoiceUrl?: string;
  invoicePdf?: string;
  amountPaid?: number;
  currency?: string;
}) => {
  try {
    const membership = await UserMembership.findById(membershipId)
      .populate("user", "name email")
      .populate("plan");

    if (!membership || !membership.user || !membership.plan) return;

    const userDoc: any = membership.user;
    const planDoc: any = membership.plan;
    const recipient = userDoc.email;
    if (!recipient) return;

    const normalizedCurrency = currency ? currency.toUpperCase() : undefined;
    const amountFormatted =
      typeof amountPaid === "number"
        ? `${(amountPaid / 100).toFixed(2)}${normalizedCurrency ? ` ${normalizedCurrency}` : ""}`
        : undefined;

    await dispatchEmailEvent("membership.activated", {
      to: recipient,
      data: {
        user: userDoc,
        plan: planDoc,
        membership: {
          status: membership.status,
          startDate: formatDateDisplay(membership.startDate),
          expiryDate: formatDateDisplay(membership.expiryDate),
          nextBillingDate: formatDateDisplay(membership.nextBillingDate),
          invoiceUrl,
          invoicePdf,
          invoiceCta: buildInvoiceCta(invoiceUrl, invoicePdf),
          amountPaid,
          amountFormatted,
          currency: normalizedCurrency,
        },
      },
    });
  } catch (err) {
    console.error("Failed to send membership activation email", err);
  }
};

const getInvoiceDetails = async (invoiceInput: string | Stripe.Invoice | null | undefined) => {
  if (!invoiceInput) {
    return {};
  }
  try {
    const invoice =
      typeof invoiceInput === "string"
        ? await stripe().invoices.retrieve(invoiceInput)
        : invoiceInput;

    return {
      invoiceUrl: invoice.hosted_invoice_url || undefined,
      invoicePdf: invoice.invoice_pdf || undefined,
      amountPaid:
        typeof invoice.amount_paid === "number"
          ? invoice.amount_paid
          : typeof invoice.amount_due === "number"
          ? invoice.amount_due
          : undefined,
      currency: invoice.currency || undefined,
    };
  } catch (err) {
    console.warn("Unable to retrieve invoice details", err);
    return {};
  }
};

// Extended payment details for tracking
interface PaymentDetails {
  stripePaymentIntentId?: string;
  stripeInvoiceId?: string;
  invoiceUrl?: string;
  invoicePdf?: string;
  invoiceNumber?: string;
  amountPaid?: number; // in cents
  originalAmount?: number; // in cents
  currency?: string;
  paymentMethodType?: string;
  paymentMethodLast4?: string;
  paymentMethodBrand?: string;
  stripeEventId?: string;
}

const activateMembership = async ({
  userId,
  planId,
  stripeCustomerId,
  stripeSubscriptionId,
  stripePriceId,
  periodEnd,
  periodStart,
  autoRenew = true,
  invoiceUrl,
  invoicePdf,
  amountPaid,
  currency,
  coupon,
  paymentDetails,
}: {
  userId: string;
  planId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripePriceId?: string;
  periodEnd: Date;
  periodStart: Date;
  autoRenew?: boolean;
  invoiceUrl?: string;
  invoicePdf?: string;
  amountPaid?: number;
  currency?: string;
  coupon?: CouponMetadata;
  paymentDetails?: PaymentDetails;
}) => {
  const membership = await ensureMembership(userId, planId);
  membership.status = "active";
  membership.startDate = periodStart;
  membership.expiryDate = periodEnd;
  membership.nextBillingDate = periodEnd;
  membership.autoRenew = autoRenew;
  membership.cancelAtPeriodEnd = !autoRenew;
  membership.stripeCustomerId = stripeCustomerId;
  membership.stripeSubscriptionId = stripeSubscriptionId;
  membership.stripePriceId = stripePriceId;

  // Payment tracking
  membership.paymentStatus = "success";
  membership.lastPaymentDate = new Date();
  membership.lastPaymentAmount = amountPaid || paymentDetails?.amountPaid;
  membership.currency = currency || paymentDetails?.currency;
  
  // Clear any previous failure info
  membership.failureReason = undefined;
  membership.failureCode = undefined;
  membership.failureCount = 0;
  
  // Payment method details
  if (paymentDetails) {
    if (paymentDetails.stripePaymentIntentId) {
      membership.stripePaymentIntentId = paymentDetails.stripePaymentIntentId;
    }
    if (paymentDetails.stripeInvoiceId) {
      membership.stripeInvoiceId = paymentDetails.stripeInvoiceId;
    }
    if (paymentDetails.invoiceUrl) {
      membership.invoiceUrl = paymentDetails.invoiceUrl;
    }
    if (paymentDetails.invoicePdf) {
      membership.invoicePdf = paymentDetails.invoicePdf;
    }
    if (paymentDetails.invoiceNumber) {
      membership.invoiceNumber = paymentDetails.invoiceNumber;
    }
    if (paymentDetails.paymentMethodType) {
      membership.paymentMethodType = paymentDetails.paymentMethodType;
    }
    if (paymentDetails.paymentMethodLast4) {
      membership.paymentMethodLast4 = paymentDetails.paymentMethodLast4;
    }
    if (paymentDetails.paymentMethodBrand) {
      membership.paymentMethodBrand = paymentDetails.paymentMethodBrand;
    }
    if (paymentDetails.originalAmount) {
      membership.originalPrice = paymentDetails.originalAmount;
    }
  }

  // Coupon / Discount tracking
  const hadCouponAlready = Boolean(membership.couponCode);
  if (coupon?.couponCode) {
    membership.couponId = coupon.couponId as any;
    membership.couponCode = coupon.couponCode;
    membership.couponDiscountType = coupon.couponDiscountType;
    membership.couponAmount = coupon.couponAmount;
    membership.couponAppliedAt = membership.couponAppliedAt || new Date();
    
    // Calculate discount amounts
    if (coupon.originalAmount && coupon.discountedAmount) {
      membership.originalPrice = coupon.originalAmount;
      membership.finalPrice = coupon.discountedAmount;
      membership.discountAmount = coupon.originalAmount - coupon.discountedAmount;
    }
  } else {
    // No coupon - final price equals original
    if (amountPaid) {
      membership.originalPrice = amountPaid;
      membership.finalPrice = amountPaid;
      membership.discountAmount = 0;
    }
  }
  
  await membership.save();

  if (coupon?.couponCode && coupon.couponId && !hadCouponAlready) {
    await MembershipCoupon.findOneAndUpdate(
      { _id: coupon.couponId },
      { $inc: { usedCount: 1 } },
      { new: true }
    );
    
    // Log coupon applied
    await logEvent({
      user: membership.user as any,
      plan: membership.plan as any,
      type: "coupon_applied",
      message: `Coupon ${coupon.couponCode} applied`,
      data: {
        couponCode: coupon.couponCode,
        discountType: coupon.couponDiscountType,
        amount: coupon.couponAmount,
        originalAmount: coupon.originalAmount,
        discountedAmount: coupon.discountedAmount,
      },
    });
  }

  await setUserRoleForMembership(userId, true);
  
  // Log payment success
  await logEvent({
    user: membership.user as any,
    plan: membership.plan as any,
    type: "payment_success",
    message: "Payment successful - membership activated",
    data: {
      expiry: periodEnd,
      subscriptionId: stripeSubscriptionId,
      amount: amountPaid,
      currency,
      paymentIntentId: paymentDetails?.stripePaymentIntentId,
      invoiceId: paymentDetails?.stripeInvoiceId,
    },
    stripeEventId: paymentDetails?.stripeEventId,
    stripePaymentIntentId: paymentDetails?.stripePaymentIntentId,
    stripeInvoiceId: paymentDetails?.stripeInvoiceId,
    amount: amountPaid,
    currency,
  });

  await sendMembershipActivationEmail({
    membershipId: membership._id.toString(),
    invoiceUrl: invoiceUrl || paymentDetails?.invoiceUrl,
    invoicePdf: invoicePdf || paymentDetails?.invoicePdf,
    amountPaid,
    currency,
  });
};

const expireMembership = async (membership: any, reason = "expired") => {
  membership.status = reason === "canceled" ? "canceled" : "expired";
  membership.autoRenew = false;
  membership.cancelAtPeriodEnd = true;
  await membership.save();
  await setUserRoleForMembership(membership.user.toString(), false);
  await logEvent({
    user: membership.user as any,
    plan: membership.plan as any,
    type: reason === "canceled" ? "cancellation" : "expiry",
    message: `Membership ${reason}`,
  });
};

// Handle payment failures
const handlePaymentFailure = async ({
  membership,
  failureReason,
  failureCode,
  stripeEventId,
  stripePaymentIntentId,
  stripeInvoiceId,
}: {
  membership: any;
  failureReason?: string;
  failureCode?: string;
  stripeEventId?: string;
  stripePaymentIntentId?: string;
  stripeInvoiceId?: string;
}) => {
  membership.paymentStatus = "failed";
  membership.failureReason = failureReason || "Payment failed";
  membership.failureCode = failureCode;
  membership.lastFailedAt = new Date();
  membership.failureCount = (membership.failureCount || 0) + 1;
  
  // After 3 failures, mark as past_due
  if (membership.failureCount >= 3) {
    membership.status = "past_due";
    await setUserRoleForMembership(membership.user.toString(), false);
  }
  
  await membership.save();
  
  await logEvent({
    user: membership.user as any,
    plan: membership.plan as any,
    type: "payment_failed",
    message: `Payment failed: ${failureReason || "Unknown reason"}`,
    data: {
      failureCode,
      failureCount: membership.failureCount,
      newStatus: membership.status,
    },
    stripeEventId,
    stripePaymentIntentId,
    stripeInvoiceId,
  });
};

// Extract payment method details from Stripe
const extractPaymentMethodDetails = async (paymentMethodId?: string | null) => {
  if (!paymentMethodId) return {};
  
  try {
    const paymentMethod = await stripe().paymentMethods.retrieve(paymentMethodId);
    
    const details: {
      paymentMethodType?: string;
      paymentMethodLast4?: string;
      paymentMethodBrand?: string;
    } = {
      paymentMethodType: paymentMethod.type,
    };
    
    if (paymentMethod.card) {
      details.paymentMethodLast4 = paymentMethod.card.last4;
      details.paymentMethodBrand = paymentMethod.card.brand;
    } else if ((paymentMethod as any).us_bank_account) {
      details.paymentMethodLast4 = (paymentMethod as any).us_bank_account.last4;
      details.paymentMethodBrand = (paymentMethod as any).us_bank_account.bank_name;
    }
    
    return details;
  } catch (err) {
    console.warn("Could not retrieve payment method details:", err);
    return {};
  }
};

// Get extended invoice details including payment method
const getExtendedInvoiceDetails = async (invoiceInput: string | Stripe.Invoice | null | undefined) => {
  if (!invoiceInput) return {};
  
  try {
    const invoice =
      typeof invoiceInput === "string"
        ? await stripe().invoices.retrieve(invoiceInput, { expand: ["payment_intent"] })
        : invoiceInput;

    const details: PaymentDetails = {
      stripeInvoiceId: invoice.id,
      invoiceUrl: invoice.hosted_invoice_url || undefined,
      invoicePdf: invoice.invoice_pdf || undefined,
      invoiceNumber: invoice.number || undefined,
      amountPaid:
        typeof invoice.amount_paid === "number"
          ? invoice.amount_paid
          : typeof invoice.amount_due === "number"
          ? invoice.amount_due
          : undefined,
      currency: invoice.currency || undefined,
    };
    
    // Get payment intent details
    const paymentIntent = invoice.payment_intent;
    if (paymentIntent) {
      const pi = typeof paymentIntent === "string" 
        ? await stripe().paymentIntents.retrieve(paymentIntent)
        : paymentIntent;
      
      details.stripePaymentIntentId = pi.id;
      
      // Get payment method details
      if (pi.payment_method) {
        const pmId = typeof pi.payment_method === "string" ? pi.payment_method : pi.payment_method.id;
        const pmDetails = await extractPaymentMethodDetails(pmId);
        Object.assign(details, pmDetails);
      }
    }
    
    return details;
  } catch (err) {
    console.warn("Unable to retrieve extended invoice details:", err);
    return {};
  }
};

export const getMyMembership = async (req: any, res: Response) => {
  try {
    const membership = await UserMembership.findOne({ user: req.user.id }).populate("plan");
    return res.json({
      success: true,
      membership,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const previewCheckout = async (req: any, res: Response) => {
  try {
    const { planId, couponCode } = req.body;
    if (!planId) {
      return res.status(400).json({ success: false, message: "planId is required" });
    }

    const plan = await MembershipPlan.findById(planId);
    if (!plan || !plan.isActive) {
      return res.status(404).json({ success: false, message: "Plan not found or inactive" });
    }

    const planPriceCents = Math.round(Number(plan.price) * 100);
    if (!planPriceCents || Number.isNaN(planPriceCents) || planPriceCents <= 0) {
      return res.status(400).json({ success: false, message: "Invalid plan price" });
    }

    let discountedCents = planPriceCents;
    let couponApplied: {
      code: string;
      discountType: CouponDiscountType;
      amount: number;
    } | undefined;

    if (couponCode) {
      try {
        const validated = await validateCouponForPlan(couponCode, planPriceCents);
        discountedCents = validated.discountedCents;
        couponApplied = {
          code: validated.coupon.code,
          discountType: validated.coupon.discountType,
          amount: validated.coupon.amount,
        };
      } catch (couponErr: any) {
        return res.status(400).json({
          success: false,
          message: couponErr?.message || "Invalid coupon",
        });
      }
    }

    const toDollars = (cents: number) => Number((cents / 100).toFixed(2));

    return res.json({
      success: true,
      pricing: {
        originalPrice: toDollars(planPriceCents),
        discountedPrice: toDollars(discountedCents),
        renewalPrice: toDollars(planPriceCents),
        isFree: discountedCents === 0,
        ...(couponApplied ? { coupon: couponApplied } : {}),
      },
    });
  } catch (err: any) {
    console.error("preview checkout error", err);
    return res.status(500).json({ success: false, message: err.message || "Failed to preview checkout" });
  }
};

export const createCheckoutSession = async (req: any, res: Response) => {
  try {
    const { planId, couponCode } = req.body;
    if (!planId) {
      return res.status(400).json({ success: false, message: "planId is required" });
    }

    const plan = await MembershipPlan.findById(planId);
    if (!plan || !plan.isActive) {
      return res.status(404).json({ success: false, message: "Plan not found or inactive" });
    }

    const { stripePriceId, stripeProductId } = await ensureStripePriceForPlan({
      planId: plan._id.toString(),
      name: plan.name,
      price: plan.price,
      interval: plan.interval,
      stripePriceId: plan.stripePriceId,
      stripeProductId: plan.stripeProductId,
    });

    if (plan.stripePriceId !== stripePriceId || plan.stripeProductId !== stripeProductId) {
      plan.stripePriceId = stripePriceId;
      plan.stripeProductId = stripeProductId;
      await plan.save();
    }

    const planPriceCents = Math.round(Number(plan.price) * 100);
    if (!planPriceCents || Number.isNaN(planPriceCents) || planPriceCents <= 0) {
      return res.status(400).json({ success: false, message: "Invalid plan price" });
    }

    let validatedCoupon:
      | {
          coupon: IMembershipCoupon;
          discountCents: number;
          discountedCents: number;
          originalCents: number;
        }
      | undefined;

    if (couponCode) {
      try {
        validatedCoupon = await validateCouponForPlan(couponCode, planPriceCents);
      } catch (couponErr: any) {
        return res.status(400).json({
          success: false,
          message: couponErr?.message || "Invalid coupon",
        });
      }
    }

    const membership = await ensureMembership(req.user.id, planId);
    membership.plan = plan._id;
    await membership.save();

    const baseMetadata: Record<string, any> = {
      userId: req.user.id,
      planId: plan._id.toString(),
    };

    const couponMetadata = validatedCoupon
      ? {
          couponId: validatedCoupon.coupon._id.toString(),
          couponCode: validatedCoupon.coupon.code,
          couponDiscountType: validatedCoupon.coupon.discountType,
          couponAmount: validatedCoupon.coupon.amount.toString(),
          originalAmount: validatedCoupon.originalCents.toString(),
          discountedAmount: validatedCoupon.discountedCents.toString(),
        }
      : undefined;

    const lineItem = validatedCoupon
      ? {
          price_data: {
            currency: "usd",
            unit_amount: validatedCoupon.discountedCents,
            recurring: { interval: plan.interval === "year" ? "year" : "month" },
            product: stripeProductId,
          },
          quantity: 1,
        }
      : { price: stripePriceId, quantity: 1 };

    const params: any = {
      mode: "subscription",
      line_items: [lineItem],
      success_url: buildSuccessUrl(planId),
      cancel_url: buildCancelUrl(),
      metadata: { ...baseMetadata, ...(couponMetadata || {}) },
    };

    if (membership.stripeCustomerId) {
      params.customer = membership.stripeCustomerId;
    } else if (req.user.email) {
      params.customer_email = req.user.email;
    }

    if (couponMetadata) {
      params.subscription_data = {
        ...(params.subscription_data || {}),
        metadata: { ...(params.subscription_data?.metadata || {}), ...baseMetadata, ...couponMetadata },
      };
    }

    const session = await stripe().checkout.sessions.create(params);
    
    // Log session mode for debugging
    const isLiveSession = session.id.startsWith("cs_live_");
    console.log(`[Stripe Membership] Created session: ${session.id.substring(0, 20)}... (${isLiveSession ? "LIVE" : "TEST"} mode)`);
    
    return res.json({ success: true, sessionId: session.id, url: session.url });
  } catch (err: any) {
    console.error("checkout error", err);
    return res.status(500).json({ success: false, message: err.message || "Failed to create checkout session" });
  }
};

export const cancelAutoRenew = async (req: any, res: Response) => {
  try {
    const membership = await UserMembership.findOne({ user: req.user.id });
    if (!membership || !membership.stripeSubscriptionId) {
      return res.status(404).json({ success: false, message: "Membership not found" });
    }

    await stripe().subscriptions.update(membership.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    membership.cancelAtPeriodEnd = true;
    membership.autoRenew = false;
    await membership.save();

    await logEvent({
      user: membership.user as any,
      plan: membership.plan as any,
      type: "cancellation",
      message: "Auto-renew disabled by user",
    });

    return res.json({ success: true, membership });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const adminListMemberships = async (req: Request, res: Response) => {
  try {
    const { includeArchived, archivedOnly } = req.query;
    
    let filter: any = {};
    
    if (archivedOnly === "true") {
      // Only show archived members
      filter.isArchived = true;
    } else if (includeArchived !== "true") {
      // By default, exclude archived members
      filter.$or = [{ isArchived: { $exists: false } }, { isArchived: false }];
    }
    // If includeArchived is true, don't filter by isArchived at all
    
    const memberships = await UserMembership.find(filter)
      .populate("user", "name email role")
      .populate("plan")
      .populate("archivedBy", "name email")
      .sort({ updatedAt: -1 });
    
    // Filter out memberships where the user no longer exists (orphaned records)
    const validMemberships = memberships.filter((m) => m.user != null);
    
    return res.json({ success: true, memberships: validMemberships });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const adminUpdateMembership = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const membership = await UserMembership.findById(id);

    if (!membership) {
      return res.status(404).json({ success: false, message: "Membership not found" });
    }

    const previousStatus = membership.status;
    const userIdString = membership.user.toString();

    if (updates.plan) {
      membership.plan = updates.plan;
    }

    if (updates.status) {
      membership.status = updates.status;
      if (updates.status === "active") {
        membership.cancelAtPeriodEnd = false;
      } else if (["expired", "canceled", "hold"].includes(updates.status)) {
        membership.autoRenew = false;
        membership.cancelAtPeriodEnd = true;
      }
    }

    if (updates.expiryDate) {
      membership.expiryDate = new Date(updates.expiryDate);
    }
    if (updates.startDate) {
      membership.startDate = new Date(updates.startDate);
    }
    if (updates.nextBillingDate) {
      membership.nextBillingDate = new Date(updates.nextBillingDate);
    }
    if (typeof updates.autoRenew === "boolean") {
      membership.autoRenew = updates.autoRenew;
    }
    if (typeof updates.cancelAtPeriodEnd === "boolean") {
      membership.cancelAtPeriodEnd = updates.cancelAtPeriodEnd;
    }
    if (updates.metadata && typeof updates.metadata === "object") {
      membership.metadata = { ...(membership.metadata || {}), ...updates.metadata };
    }

    await membership.save();

    const populated = await UserMembership.findById(membership._id)
      .populate("user", "name email role")
      .populate("plan");

    if (!populated) {
      return res.status(500).json({ success: false, message: "Unable to load membership" });
    }

    if (populated.status === "active") {
      await setUserRoleForMembership(userIdString, true);
    } else {
      await setUserRoleForMembership(userIdString, false);
    }

    if (previousStatus !== "active" && populated.status === "active") {
      await sendMembershipActivationEmail({ membershipId: populated._id.toString() });
    }

    await logEvent({
      user: populated.user as any,
      plan: populated.plan as any,
      type: "status_change",
      message: "Membership updated by admin",
      data: updates,
    });

    return res.json({ success: true, membership: populated });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const adminExtendMembership = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { extraDays = 30 } = req.body;
    const membership = await UserMembership.findById(id);

    if (!membership) {
      return res.status(404).json({ success: false, message: "Membership not found" });
    }

    const previousStatus = membership.status;
    const userIdString = membership.user.toString();

    const daysToAdd = Number(extraDays);
    if (Number.isNaN(daysToAdd) || daysToAdd <= 0) {
      return res.status(400).json({ success: false, message: "extraDays must be a positive number" });
    }

    const newExpiry = new Date(membership.expiryDate || new Date());
    newExpiry.setDate(newExpiry.getDate() + daysToAdd);
    membership.expiryDate = newExpiry;
    membership.status = "active";
    membership.autoRenew = false;
    membership.cancelAtPeriodEnd = true;
    await membership.save();

    const populated = await UserMembership.findById(membership._id)
      .populate("user", "name email role")
      .populate("plan");

    if (!populated) {
      return res.status(500).json({ success: false, message: "Unable to load membership" });
    }

    await setUserRoleForMembership(userIdString, true);

    if (previousStatus !== "active") {
      await sendMembershipActivationEmail({ membershipId: populated._id.toString() });
    }

    await logEvent({
      user: populated.user as any,
      plan: populated.plan as any,
      type: "status_change",
      message: `Membership manually extended by ${daysToAdd} days`,
    });

    return res.json({ success: true, membership: populated });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Clean up orphaned memberships (where user no longer exists)
export const adminCleanupOrphanedMemberships = async (_req: Request, res: Response) => {
  try {
    // Find all memberships
    const allMemberships = await UserMembership.find().populate("user");
    
    // Find orphaned ones (where user is null after populate)
    const orphanedIds = allMemberships
      .filter((m) => m.user == null)
      .map((m) => m._id);
    
    if (orphanedIds.length === 0) {
      return res.json({ 
        success: true, 
        message: "No orphaned memberships found",
        deletedCount: 0,
      });
    }
    
    // Delete orphaned memberships
    const result = await UserMembership.deleteMany({ _id: { $in: orphanedIds } });
    
    await logEvent({
      type: "status_change",
      message: `Cleaned up ${result.deletedCount} orphaned membership records`,
      data: { orphanedIds: orphanedIds.map(id => id.toString()) },
    });
    
    return res.json({ 
      success: true, 
      message: `Deleted ${result.deletedCount} orphaned membership records`,
      deletedCount: result.deletedCount,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Archive a membership (soft delete)
export const adminArchiveMembership = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.user?._id || req.user?.id;
    
    const membership = await UserMembership.findById(id);

    if (!membership) {
      return res.status(404).json({ success: false, message: "Membership not found" });
    }

    if (membership.isArchived) {
      return res.status(400).json({ success: false, message: "Membership is already archived" });
    }

    // Safety check: Don't allow archiving active members without explicit confirmation
    if (membership.status === "active") {
      const forceArchive = req.body.forceArchive;
      if (!forceArchive) {
        return res.status(400).json({ 
          success: false, 
          message: "Cannot archive active members. Change status first or set forceArchive: true",
          requiresConfirmation: true,
        });
      }
    }

    const userIdString = membership.user.toString();

    // Cancel Stripe subscription if exists to stop future billing
    if (membership.stripeSubscriptionId) {
      try {
        await stripe().subscriptions.cancel(membership.stripeSubscriptionId);
      } catch (stripeErr: any) {
        // Log but don't fail - subscription might already be cancelled
        console.warn("Could not cancel Stripe subscription during archive:", stripeErr.message);
      }
    }

    // Archive the membership
    membership.isArchived = true;
    membership.archivedAt = new Date();
    membership.archivedBy = adminId;
    membership.archivedReason = reason || "Archived by admin";
    membership.autoRenew = false;
    membership.cancelAtPeriodEnd = true;
    
    // Keep the original status for reference, but ensure no access
    await membership.save();

    // Revoke member access
    await setUserRoleForMembership(userIdString, false);

    // Log the archive action
    await logEvent({
      user: membership.user as any,
      plan: membership.plan as any,
      type: "status_change",
      message: `Membership archived by admin`,
      data: {
        archivedBy: adminId,
        reason: reason || "No reason provided",
        previousStatus: membership.status,
      },
    });

    const populated = await UserMembership.findById(membership._id)
      .populate("user", "name email role")
      .populate("plan")
      .populate("archivedBy", "name email");

    return res.json({ 
      success: true, 
      message: "Membership archived successfully",
      membership: populated,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Restore an archived membership
export const adminRestoreMembership = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { restoreToStatus } = req.body;
    const adminId = req.user?._id || req.user?.id;
    
    const membership = await UserMembership.findById(id);

    if (!membership) {
      return res.status(404).json({ success: false, message: "Membership not found" });
    }

    if (!membership.isArchived) {
      return res.status(400).json({ success: false, message: "Membership is not archived" });
    }

    // Restore the membership
    membership.isArchived = false;
    membership.archivedAt = undefined;
    membership.archivedBy = undefined;
    membership.archivedReason = undefined;
    
    // Optionally restore to a specific status
    if (restoreToStatus && ["active", "expired", "canceled", "pending", "past_due", "hold"].includes(restoreToStatus)) {
      membership.status = restoreToStatus;
    }
    // Otherwise keep the status it had when archived
    
    await membership.save();

    // If restoring to active, grant access
    const userIdString = membership.user.toString();
    if (membership.status === "active") {
      await setUserRoleForMembership(userIdString, true);
    }

    // Log the restore action
    await logEvent({
      user: membership.user as any,
      plan: membership.plan as any,
      type: "status_change",
      message: `Membership restored from archive by admin`,
      data: {
        restoredBy: adminId,
        restoredToStatus: membership.status,
      },
    });

    const populated = await UserMembership.findById(membership._id)
      .populate("user", "name email role")
      .populate("plan");

    return res.json({ 
      success: true, 
      message: "Membership restored successfully",
      membership: populated,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const handleStripeWebhook = async (req: any, res: Response) => {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: Stripe.Event;

  try {
    if (!webhookSecret) {
      throw new Error("STRIPE_WEBHOOK_SECRET not configured");
    }
    const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
    event = stripe().webhooks.constructEvent(rawBody, sig as string, webhookSecret);
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const object = event.data.object;
  console.log(`[Stripe Webhook] Received event: ${event.type} (${event.id})`);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.subscription) {
          const subscriptionId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription.id;
          const subscription = await stripe().subscriptions.retrieve(subscriptionId);
          const paymentDetails = await getExtendedInvoiceDetails(session.invoice);
          paymentDetails.stripeEventId = event.id;
          
          const metadata = session.metadata || {};
          const couponMetadata = extractCouponMetadata(session.metadata);
          
          await activateMembership({
            userId: metadata.userId,
            planId: metadata.planId,
            stripeCustomerId: subscription.customer as string,
            stripeSubscriptionId: subscription.id,
            stripePriceId: subscription.items.data[0]?.price?.id,
            periodStart: new Date(subscription.current_period_start * 1000),
            periodEnd: new Date(subscription.current_period_end * 1000),
            autoRenew: !subscription.cancel_at_period_end,
            invoiceUrl: paymentDetails.invoiceUrl,
            invoicePdf: paymentDetails.invoicePdf,
            amountPaid: paymentDetails.amountPaid,
            currency: paymentDetails.currency,
            coupon: couponMetadata,
            paymentDetails,
          });
        }
        break;
      }
      
      case "invoice.payment_succeeded": {
        const invoice = object as Stripe.Invoice;
        const subscriptionId =
          typeof invoice.subscription === "string"
            ? invoice.subscription
            : invoice.subscription?.id;
        if (subscriptionId) {
          const subscription = await stripe().subscriptions.retrieve(subscriptionId);
          const membership = await UserMembership.findOne({ stripeSubscriptionId: subscriptionId });
          const couponMetadata =
            extractCouponMetadata(invoice.metadata) ||
            extractCouponMetadata(subscription.metadata as Stripe.Metadata);
          
          const paymentDetails = await getExtendedInvoiceDetails(invoice);
          paymentDetails.stripeEventId = event.id;
          
          if (membership) {
            await activateMembership({
              userId: membership.user.toString(),
              planId: membership.plan.toString(),
              stripeCustomerId: subscription.customer as string,
              stripeSubscriptionId: subscription.id,
              stripePriceId: subscription.items.data[0]?.price?.id,
              periodStart: new Date(subscription.current_period_start * 1000),
              periodEnd: new Date(subscription.current_period_end * 1000),
              autoRenew: !subscription.cancel_at_period_end,
              invoiceUrl: paymentDetails.invoiceUrl,
              invoicePdf: paymentDetails.invoicePdf,
              amountPaid: paymentDetails.amountPaid,
              currency: paymentDetails.currency,
              coupon: couponMetadata,
              paymentDetails,
            });
          }
        }
        break;
      }
      
      case "invoice.payment_failed": {
        const invoice = object as Stripe.Invoice;
        const subscriptionId =
          typeof invoice.subscription === "string"
            ? invoice.subscription
            : invoice.subscription?.id;
        
        if (subscriptionId) {
          const membership = await UserMembership.findOne({ stripeSubscriptionId: subscriptionId });
          if (membership) {
            // Extract failure reason from the invoice
            const lastError = invoice.last_finalization_error;
            const failureReason = lastError?.message || 
              (invoice as any).payment_intent?.last_payment_error?.message ||
              "Payment was declined";
            const failureCode = lastError?.code || 
              (invoice as any).payment_intent?.last_payment_error?.code;
            
            await handlePaymentFailure({
              membership,
              failureReason,
              failureCode,
              stripeEventId: event.id,
              stripeInvoiceId: invoice.id,
              stripePaymentIntentId: typeof invoice.payment_intent === "string" 
                ? invoice.payment_intent 
                : invoice.payment_intent?.id,
            });
            
            console.log(`[Stripe Webhook] Payment failed for subscription ${subscriptionId}: ${failureReason}`);
          }
        }
        break;
      }
      
      case "customer.subscription.updated": {
        const subscription = object as Stripe.Subscription;
        const membership = await UserMembership.findOne({ stripeSubscriptionId: subscription.id });
        
        if (membership) {
          // Update membership based on subscription status
          const stripeStatus = subscription.status;
          
          if (stripeStatus === "past_due") {
            membership.status = "past_due";
            membership.paymentStatus = "failed";
            await membership.save();
            await setUserRoleForMembership(membership.user.toString(), false);
            
            await logEvent({
              user: membership.user as any,
              plan: membership.plan as any,
              type: "status_change",
              message: "Subscription marked as past due",
              data: { stripeStatus },
              stripeEventId: event.id,
            });
          } else if (stripeStatus === "active" && membership.status !== "active") {
            // Subscription recovered
            membership.status = "active";
            membership.paymentStatus = "success";
            membership.failureCount = 0;
            membership.failureReason = undefined;
            membership.failureCode = undefined;
            await membership.save();
            await setUserRoleForMembership(membership.user.toString(), true);
            
            await logEvent({
              user: membership.user as any,
              plan: membership.plan as any,
              type: "status_change",
              message: "Subscription recovered and activated",
              data: { stripeStatus },
              stripeEventId: event.id,
            });
          }
          
          // Update period end if changed
          if (subscription.current_period_end) {
            membership.expiryDate = new Date(subscription.current_period_end * 1000);
            membership.nextBillingDate = new Date(subscription.current_period_end * 1000);
            membership.cancelAtPeriodEnd = subscription.cancel_at_period_end;
            membership.autoRenew = !subscription.cancel_at_period_end;
            await membership.save();
          }
        }
        break;
      }
      
      case "customer.subscription.deleted": {
        const subscription = object as Stripe.Subscription;
        const subscriptionId = subscription.id;
        const membership = await UserMembership.findOne({ stripeSubscriptionId: subscriptionId });
        if (membership) {
          await expireMembership(membership, "canceled");
          
          await logEvent({
            user: membership.user as any,
            plan: membership.plan as any,
            type: "cancellation",
            message: "Subscription canceled in Stripe",
            stripeEventId: event.id,
          });
        }
        break;
      }
      
      case "charge.refunded": {
        const charge = object as Stripe.Charge;
        // Find membership by payment intent
        const paymentIntentId = typeof charge.payment_intent === "string" 
          ? charge.payment_intent 
          : charge.payment_intent?.id;
        
        if (paymentIntentId) {
          const membership = await UserMembership.findOne({ stripePaymentIntentId: paymentIntentId });
          if (membership) {
            membership.paymentStatus = "refunded";
            await membership.save();
            
            await logEvent({
              user: membership.user as any,
              plan: membership.plan as any,
              type: "payment_refunded",
              message: `Payment refunded: $${(charge.amount_refunded / 100).toFixed(2)}`,
              data: {
                amountRefunded: charge.amount_refunded,
                refundReason: charge.refunds?.data?.[0]?.reason,
              },
              stripeEventId: event.id,
              stripePaymentIntentId: paymentIntentId,
              amount: charge.amount_refunded,
              currency: charge.currency,
            });
          }
        }
        break;
      }
      
      default:
        // Log unhandled events for debugging
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
        break;
    }
  } catch (err) {
    console.error("Webhook handling error", err);
    return res.status(500).send("Webhook handler error");
  }

  res.json({ received: true });
};

export const getStripeConfig = (_req: Request, res: Response) => {
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;

  if (!publishableKey) {
    return res.status(500).json({
      success: false,
      message: "Stripe publishable key (STRIPE_PUBLISHABLE_KEY) is not configured.",
    });
  }

  return res.json({
    success: true,
    publishableKey,
  });
};

// ============================================
// ADMIN: Get detailed member info with payment data
// ============================================
export const adminGetMemberDetails = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const membership = await UserMembership.findById(id)
      .populate("user", "name email role phone createdAt")
      .populate("plan")
      .populate("couponId")
      .populate("archivedBy", "name email");
    
    if (!membership) {
      return res.status(404).json({ success: false, message: "Membership not found" });
    }
    
    // Get Stripe subscription details if available
    let stripeSubscription = null;
    let stripeCustomer = null;
    let upcomingInvoice = null;
    
    if (membership.stripeSubscriptionId) {
      try {
        stripeSubscription = await stripe().subscriptions.retrieve(membership.stripeSubscriptionId, {
          expand: ["default_payment_method", "latest_invoice"],
        });
        
        // Get upcoming invoice for next billing info
        try {
          upcomingInvoice = await stripe().invoices.retrieveUpcoming({
            subscription: membership.stripeSubscriptionId,
          });
        } catch {
          // No upcoming invoice (subscription may be canceled)
        }
      } catch (err) {
        console.warn("Could not retrieve Stripe subscription:", err);
      }
    }
    
    if (membership.stripeCustomerId) {
      try {
        stripeCustomer = await stripe().customers.retrieve(membership.stripeCustomerId);
      } catch (err) {
        console.warn("Could not retrieve Stripe customer:", err);
      }
    }
    
    return res.json({
      success: true,
      membership,
      stripe: {
        subscription: stripeSubscription ? {
          id: stripeSubscription.id,
          status: stripeSubscription.status,
          cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
          currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
          currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
          defaultPaymentMethod: stripeSubscription.default_payment_method,
        } : null,
        customer: stripeCustomer && !("deleted" in stripeCustomer) ? {
          id: stripeCustomer.id,
          email: stripeCustomer.email,
          name: stripeCustomer.name,
          created: new Date(stripeCustomer.created * 1000),
        } : null,
        upcomingInvoice: upcomingInvoice ? {
          amountDue: upcomingInvoice.amount_due,
          currency: upcomingInvoice.currency,
          dueDate: upcomingInvoice.due_date ? new Date(upcomingInvoice.due_date * 1000) : null,
        } : null,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ============================================
// ADMIN: Get membership timeline / audit log
// ============================================
export const adminGetMemberTimeline = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { limit = 50 } = req.query;
    
    const membership = await UserMembership.findById(id);
    if (!membership) {
      return res.status(404).json({ success: false, message: "Membership not found" });
    }
    
    // Get logs for this user
    const logs = await MembershipLog.find({
      $or: [
        { user: membership.user },
        { membership: membership._id },
      ],
    })
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 })
      .limit(Number(limit));
    
    return res.json({
      success: true,
      timeline: logs,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ============================================
// ADMIN: Resend invoice email
// ============================================
export const adminResendInvoice = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const adminId = req.user?._id || req.user?.id;
    
    const membership = await UserMembership.findById(id)
      .populate("user", "name email")
      .populate("plan");
    
    if (!membership) {
      return res.status(404).json({ success: false, message: "Membership not found" });
    }
    
    if (!membership.stripeInvoiceId) {
      return res.status(400).json({ success: false, message: "No invoice found for this membership" });
    }
    
    // Send invoice via Stripe
    try {
      await stripe().invoices.sendInvoice(membership.stripeInvoiceId);
    } catch (stripeErr: any) {
      // If Stripe fails, try to send via our email system
      if (membership.invoiceUrl) {
        const userDoc: any = membership.user;
        await dispatchEmailEvent("membership.invoice", {
          to: userDoc.email,
          data: {
            user: userDoc,
            plan: membership.plan,
            membership: {
              invoiceUrl: membership.invoiceUrl,
              invoicePdf: membership.invoicePdf,
            },
          },
        });
      } else {
        return res.status(400).json({ success: false, message: `Unable to send invoice: ${stripeErr.message}` });
      }
    }
    
    await logEvent({
      user: membership.user as any,
      plan: membership.plan as any,
      type: "invoice_sent",
      message: "Invoice resent by admin",
      createdBy: adminId,
    });
    
    return res.json({ success: true, message: "Invoice sent successfully" });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ============================================
// ADMIN: Send payment failed notice
// ============================================
export const adminSendPaymentFailedNotice = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const adminId = req.user?._id || req.user?.id;
    
    const membership = await UserMembership.findById(id)
      .populate("user", "name email")
      .populate("plan");
    
    if (!membership) {
      return res.status(404).json({ success: false, message: "Membership not found" });
    }
    
    const userDoc: any = membership.user;
    const planDoc: any = membership.plan;
    
    // Create a new payment link if possible
    let paymentLink = null;
    if (membership.stripeSubscriptionId) {
      try {
        const subscription = await stripe().subscriptions.retrieve(membership.stripeSubscriptionId);
        if (subscription.latest_invoice) {
          const invoice = await stripe().invoices.retrieve(
            typeof subscription.latest_invoice === "string" 
              ? subscription.latest_invoice 
              : subscription.latest_invoice.id
          );
          paymentLink = invoice.hosted_invoice_url;
        }
      } catch {
        // Could not get payment link
      }
    }
    
    await dispatchEmailEvent("membership.payment_failed", {
      to: userDoc.email,
      data: {
        user: userDoc,
        plan: planDoc,
        membership: {
          failureReason: membership.failureReason || "Your payment could not be processed",
          paymentLink,
        },
      },
    });
    
    await logEvent({
      user: membership.user as any,
      plan: membership.plan as any,
      type: "email_sent",
      message: "Payment failed notice sent by admin",
      createdBy: adminId,
    });
    
    return res.json({ success: true, message: "Payment failed notice sent" });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ============================================
// ADMIN: Generate new payment link
// ============================================
export const adminGeneratePaymentLink = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const adminId = req.user?._id || req.user?.id;
    
    const membership = await UserMembership.findById(id)
      .populate("user", "name email")
      .populate("plan");
    
    if (!membership) {
      return res.status(404).json({ success: false, message: "Membership not found" });
    }
    
    let paymentLink = null;
    
    // Try to get payment link from latest invoice
    if (membership.stripeSubscriptionId) {
      try {
        const subscription = await stripe().subscriptions.retrieve(membership.stripeSubscriptionId);
        if (subscription.latest_invoice) {
          const invoiceId = typeof subscription.latest_invoice === "string" 
            ? subscription.latest_invoice 
            : subscription.latest_invoice.id;
          
          // Try to finalize and get hosted URL
          const invoice = await stripe().invoices.retrieve(invoiceId);
          if (invoice.status === "draft") {
            const finalized = await stripe().invoices.finalizeInvoice(invoiceId);
            paymentLink = finalized.hosted_invoice_url;
          } else {
            paymentLink = invoice.hosted_invoice_url;
          }
        }
      } catch (err: any) {
        console.warn("Could not get invoice payment link:", err.message);
      }
    }
    
    if (!paymentLink) {
      return res.status(400).json({ 
        success: false, 
        message: "Unable to generate payment link. The subscription may not have a pending invoice." 
      });
    }
    
    await logEvent({
      user: membership.user as any,
      plan: membership.plan as any,
      type: "admin_action",
      message: "Payment link generated by admin",
      data: { paymentLink },
      createdBy: adminId,
    });
    
    return res.json({ success: true, paymentLink });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ============================================
// ADMIN: Get invoices for a membership
// ============================================
export const adminGetMemberInvoices = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { limit = 10 } = req.query;
    
    const membership = await UserMembership.findById(id);
    if (!membership) {
      return res.status(404).json({ success: false, message: "Membership not found" });
    }
    
    if (!membership.stripeCustomerId) {
      return res.json({ success: true, invoices: [] });
    }
    
    const invoices = await stripe().invoices.list({
      customer: membership.stripeCustomerId,
      limit: Number(limit),
    });
    
    const formattedInvoices = invoices.data.map(inv => ({
      id: inv.id,
      number: inv.number,
      status: inv.status,
      amountDue: inv.amount_due,
      amountPaid: inv.amount_paid,
      currency: inv.currency,
      created: new Date(inv.created * 1000),
      dueDate: inv.due_date ? new Date(inv.due_date * 1000) : null,
      paidAt: inv.status_transitions?.paid_at 
        ? new Date(inv.status_transitions.paid_at * 1000) 
        : null,
      hostedInvoiceUrl: inv.hosted_invoice_url,
      invoicePdf: inv.invoice_pdf,
      periodStart: inv.period_start ? new Date(inv.period_start * 1000) : null,
      periodEnd: inv.period_end ? new Date(inv.period_end * 1000) : null,
    }));
    
    return res.json({ success: true, invoices: formattedInvoices });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ============================================
// ADMIN: Manually refresh payment info from Stripe
// ============================================
export const adminRefreshPaymentInfo = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    
    const membership = await UserMembership.findById(id);
    if (!membership) {
      return res.status(404).json({ success: false, message: "Membership not found" });
    }
    
    if (!membership.stripeSubscriptionId) {
      return res.status(400).json({ success: false, message: "No Stripe subscription linked" });
    }
    
    // Fetch latest subscription info
    const subscription = await stripe().subscriptions.retrieve(membership.stripeSubscriptionId, {
      expand: ["default_payment_method", "latest_invoice.payment_intent"],
    });
    
    // Update membership with latest info
    membership.status = subscription.status === "active" ? "active" 
      : subscription.status === "past_due" ? "past_due"
      : subscription.status === "canceled" ? "canceled"
      : membership.status;
    
    membership.cancelAtPeriodEnd = subscription.cancel_at_period_end;
    membership.autoRenew = !subscription.cancel_at_period_end;
    membership.expiryDate = new Date(subscription.current_period_end * 1000);
    membership.nextBillingDate = new Date(subscription.current_period_end * 1000);
    
    // Get payment method details
    if (subscription.default_payment_method) {
      const pm = subscription.default_payment_method as Stripe.PaymentMethod;
      membership.paymentMethodType = pm.type;
      if (pm.card) {
        membership.paymentMethodLast4 = pm.card.last4;
        membership.paymentMethodBrand = pm.card.brand;
      }
    }
    
    // Get latest invoice info
    if (subscription.latest_invoice) {
      const invoice = subscription.latest_invoice as Stripe.Invoice;
      membership.stripeInvoiceId = invoice.id;
      membership.invoiceUrl = invoice.hosted_invoice_url || undefined;
      membership.invoicePdf = invoice.invoice_pdf || undefined;
      membership.invoiceNumber = invoice.number || undefined;
      membership.lastPaymentAmount = invoice.amount_paid;
      membership.currency = invoice.currency;
      
      if (invoice.status === "paid") {
        membership.paymentStatus = "success";
        membership.lastPaymentDate = invoice.status_transitions?.paid_at 
          ? new Date(invoice.status_transitions.paid_at * 1000) 
          : new Date();
      }
    }
    
    await membership.save();
    
    const populated = await UserMembership.findById(membership._id)
      .populate("user", "name email role")
      .populate("plan");
    
    return res.json({ success: true, membership: populated, message: "Payment info refreshed from Stripe" });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};


