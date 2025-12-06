import { Request, Response } from "express";
import Stripe from "stripe";
import MembershipPlan from "../models/MembershipPlan";
import UserMembership from "../models/UserMembership";
import MembershipLog, { MembershipLogType } from "../models/MembershipLog";
import { User } from "../models/User";
import { getStripeClient } from "../services/stripeClient";

const stripe = () => getStripeClient();

const FRONTEND_URL =
  process.env.FRONTEND_URL ||
  (process.env.NODE_ENV === "production" ? "https://salontraining.com" : "http://localhost:5173");

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

const activateMembership = async ({
  userId,
  planId,
  stripeCustomerId,
  stripeSubscriptionId,
  stripePriceId,
  periodEnd,
  periodStart,
  autoRenew = true,
}: {
  userId: string;
  planId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripePriceId?: string;
  periodEnd: Date;
  periodStart: Date;
  autoRenew?: boolean;
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

    const membership = await ensureMembership(req.user.id, planId);
    membership.plan = plan._id;
    await membership.save();

    const params: any = {
      mode: "subscription",
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
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

export const adminListMemberships = async (_req: Request, res: Response) => {
  try {
    const memberships = await UserMembership.find()
      .populate("user", "name email role")
      .populate("plan")
      .sort({ updatedAt: -1 });
    return res.json({ success: true, memberships });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const adminUpdateMembership = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const membership = await UserMembership.findByIdAndUpdate(id, updates, { new: true });

    if (!membership) {
      return res.status(404).json({ success: false, message: "Membership not found" });
    }

    if (updates.status && ["expired", "canceled"].includes(updates.status)) {
      await setUserRoleForMembership(membership.user.toString(), false);
    }

    await logEvent({
      user: membership.user as any,
      plan: membership.plan as any,
      type: "status_change",
      message: "Membership updated by admin",
      data: updates,
    });

    return res.json({ success: true, membership });
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

    const newExpiry = new Date(membership.expiryDate || new Date());
    newExpiry.setDate(newExpiry.getDate() + Number(extraDays));
    membership.expiryDate = newExpiry;
    membership.status = "active";
    membership.autoRenew = false;
    membership.cancelAtPeriodEnd = true;
    await membership.save();

    await logEvent({
      user: membership.user as any,
      plan: membership.plan as any,
      type: "status_change",
      message: `Membership manually extended by ${extraDays} days`,
    });

    return res.json({ success: true, membership });
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


