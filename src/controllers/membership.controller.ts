import { Request, Response } from "express";
import Stripe from "stripe";
import MembershipPlan from "../models/MembershipPlan";
import UserMembership from "../models/UserMembership";
import MembershipLog, { MembershipLogType } from "../models/MembershipLog";
import { User } from "../models/User";
import { getStripeClient } from "../services/stripeClient";
import { ensureStripePriceForPlan } from "../services/membershipStripe";
import { dispatchEmailEvent } from "../services/emailService";

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
  type: MembershipLogType;
  message: string;
  data?: Record<string, any>;
}) => MembershipLog.create(payload);

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
  await membership.save();

  await setUserRoleForMembership(userId, true);
  await logEvent({
    user: membership.user as any,
    plan: membership.plan as any,
    type: "renewal",
    message: "Membership activated or renewed",
    data: {
      expiry: periodEnd,
      subscriptionId: stripeSubscriptionId,
    },
  });

  await sendMembershipActivationEmail({
    membershipId: membership._id.toString(),
    invoiceUrl,
    invoicePdf,
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

export const createCheckoutSession = async (req: any, res: Response) => {
  try {
    const { planId } = req.body;
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

    const membership = await ensureMembership(req.user.id, planId);
    membership.plan = plan._id;
    await membership.save();

    const params: any = {
      mode: "subscription",
      line_items: [{ price: stripePriceId, quantity: 1 }],
      success_url: buildSuccessUrl(planId),
      cancel_url: buildCancelUrl(),
      metadata: {
        userId: req.user.id,
        planId: plan._id.toString(),
      },
    };

    if (membership.stripeCustomerId) {
      params.customer = membership.stripeCustomerId;
    } else if (req.user.email) {
      params.customer_email = req.user.email;
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
          const invoiceDetails = await getInvoiceDetails(session.invoice);
          const metadata = session.metadata || {};
          await activateMembership({
            userId: metadata.userId,
            planId: metadata.planId,
            stripeCustomerId: subscription.customer as string,
            stripeSubscriptionId: subscription.id,
            stripePriceId: subscription.items.data[0]?.price?.id,
            periodStart: new Date(subscription.current_period_start * 1000),
            periodEnd: new Date(subscription.current_period_end * 1000),
            autoRenew: !subscription.cancel_at_period_end,
            invoiceUrl: invoiceDetails.invoiceUrl,
            invoicePdf: invoiceDetails.invoicePdf,
            amountPaid: invoiceDetails.amountPaid,
            currency: invoiceDetails.currency,
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
              invoiceUrl: invoice.hosted_invoice_url || undefined,
              invoicePdf: invoice.invoice_pdf || undefined,
              amountPaid:
                typeof invoice.amount_paid === "number"
                  ? invoice.amount_paid
                  : typeof invoice.amount_due === "number"
                  ? invoice.amount_due
                  : undefined,
              currency: invoice.currency || undefined,
            });
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
        }
        break;
      }
      default:
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


