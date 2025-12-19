import { Request, Response } from "express";
import Stripe from "stripe";
import mongoose from "mongoose";
import Order from "../models/Order";
import Product from "../models/Product";
import Coupon from "../models/Coupon";
import ProVerification from "../models/ProVerification";
import { getStripeClient } from "../services/stripeClient";
import { prepareCartPricing, CartItemInput } from "../services/cartPricing.service";
import {
  calculateShippingOptions,
  resolveShippingSelection,
  ShippingAddressInput,
  CoordinatesInput,
  ShippingSelectionInput,
} from "../services/shipping.service";

type AuthRequest = Request & { user?: any };

const FRONTEND_URL = (
  process.env.FRONTEND_URL ||
  (process.env.NODE_ENV === "production" ? "https://salontraining.com" : "http://localhost:5173")
).replace(/\/+$/, "");

interface CheckoutSessionPayload {
  items: CartItemInput[];
  shippingAddress?: ShippingAddressInput & { fullName?: string; line2?: string };
  shippingSelection?: ShippingSelectionInput;
  shippingCoordinates?: CoordinatesInput;
  contactEmail: string;
  contactPhone?: string;
  notes?: string;
  couponCode?: string;
}

// Validate coupon and calculate discount
async function validateAndCalculateCoupon(
  couponCode: string,
  cartTotal: number,
  productIds: string[],
  userId?: string
): Promise<{ valid: boolean; discount: number; coupon?: any; message?: string }> {
  const coupon = await Coupon.findOne({
    code: couponCode.toUpperCase(),
    isActive: true,
  });

  if (!coupon) {
    return { valid: false, discount: 0, message: "Invalid coupon code" };
  }

  // Check dates
  if (coupon.startDate && new Date() < coupon.startDate) {
    return { valid: false, discount: 0, message: "This coupon is not yet active" };
  }
  if (coupon.endDate && new Date() > coupon.endDate) {
    return { valid: false, discount: 0, message: "This coupon has expired" };
  }

  // Check usage limit
  if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
    return { valid: false, discount: 0, message: "This coupon has reached its usage limit" };
  }

  // Check minimum order
  if (coupon.minimumOrderAmount > 0 && cartTotal < coupon.minimumOrderAmount) {
    return {
      valid: false,
      discount: 0,
      message: `Minimum order amount of $${coupon.minimumOrderAmount} required`,
    };
  }

  // Check per-user limit
  if (userId && coupon.usageLimitPerUser) {
    const userUsageCount = coupon.usedBy.filter(
      (u) => u.user?.toString() === userId
    ).length;
    if (userUsageCount >= coupon.usageLimitPerUser) {
      return { valid: false, discount: 0, message: "You have already used this coupon" };
    }
  }

  // Check store-only restriction
  if (coupon.storeOnly && productIds.length > 0) {
    const products = await Product.find({ _id: { $in: productIds } });
    const hasNonStoreProducts = products.some((p) => p.productSource !== "store");
    if (hasNonStoreProducts) {
      return {
        valid: false,
        discount: 0,
        message: "This coupon only applies to store products",
      };
    }
  }

  // Calculate discount
  let discount = 0;
  if (coupon.discountType === "percentage") {
    discount = (cartTotal * coupon.discountValue) / 100;
    if (coupon.maximumDiscount && discount > coupon.maximumDiscount) {
      discount = coupon.maximumDiscount;
    }
  } else {
    discount = Math.min(coupon.discountValue, cartTotal);
  }

  return { valid: true, discount: Number(discount.toFixed(2)), coupon };
}

// Create Stripe Checkout Session
export const createCheckoutSession = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    // Require professional verification for store purchases (bypass for admins/managers)
    if (!["admin", "manager"].includes(req.user.role)) {
      const verification = await ProVerification.findOne({ user: req.user._id });
      if (!verification || verification.status !== "approved") {
        return res.status(403).json({
          success: false,
          message:
            "Professional verification required to purchase from the ST Shop. Please submit your name and license for approval.",
          requiresVerification: true,
          status: verification?.status || "none",
        });
      }
    }

    const {
      items,
      shippingAddress,
      shippingSelection,
      shippingCoordinates,
      contactEmail,
      contactPhone,
      notes,
      couponCode,
    } = req.body as CheckoutSessionPayload;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one item is required",
      });
    }

    // Determine frontend base URL (prefer request origin to preserve localStorage domain)
    const originHeader = req.headers.origin;
    let frontendBase = FRONTEND_URL;
    if (originHeader) {
      try {
        const originUrl = new URL(originHeader);
        if (/\.?salontraining\.com$/i.test(originUrl.hostname)) {
          frontendBase = originUrl.origin.replace(/\/+$/, "");
        }
      } catch {
        // ignore malformed origin, fall back to env FRONTEND_URL
      }
    }

    // Prepare cart pricing
    const cartSummary = await prepareCartPricing(items);
    const { normalizedItems, subtotal, requiresShipping, stockAdjustments, totalWeightKg } = cartSummary;

    // Validate shipping for physical products
    let selectedShippingOption: any = null;
    let shippingCost = 0;

    if (requiresShipping) {
      if (!shippingAddress?.fullName || !shippingAddress?.line1 || !shippingAddress?.city || !shippingAddress?.country) {
        return res.status(400).json({
          success: false,
          message: "Shipping address is required for physical items",
        });
      }

      if (!shippingSelection?.methodId) {
        return res.status(400).json({
          success: false,
          message: "Please select a shipping option",
        });
      }

      selectedShippingOption = await resolveShippingSelection({
        cart: cartSummary,
        address: shippingAddress,
        coordinates: shippingCoordinates,
        selection: shippingSelection,
      });
      shippingCost = selectedShippingOption.cost;
    }

    // Validate and apply coupon
    let discountTotal = 0;
    let appliedCoupon: any = null;

    if (couponCode) {
      const productIds = normalizedItems.map((item) => item.product.toString());
      const couponResult = await validateAndCalculateCoupon(
        couponCode,
        subtotal,
        productIds,
        req.user._id.toString()
      );

      if (!couponResult.valid) {
        return res.status(400).json({
          success: false,
          message: couponResult.message,
        });
      }

      discountTotal = couponResult.discount;
      appliedCoupon = couponResult.coupon;
    }

    // Calculate totals
    const grandTotal = Math.max(0, subtotal + shippingCost - discountTotal);

    // Create pending order in database
    const order = await Order.create({
      user: req.user._id,
      items: normalizedItems,
      itemsTotal: Number(subtotal.toFixed(2)),
      shippingCost: Number(shippingCost.toFixed(2)),
      taxTotal: 0,
      discountTotal: Number(discountTotal.toFixed(2)),
      grandTotal: Number(grandTotal.toFixed(2)),
      contactEmail: contactEmail || req.user.email,
      contactPhone,
      notes,
      couponCode: appliedCoupon?.code,
      paymentStatus: "awaiting_payment",
      fulfillmentStatus: "pending",
      shippingStatus: requiresShipping ? "pending" : "not_required",
      shippingMethod: selectedShippingOption?.methodName || (requiresShipping ? "pending" : "not_required"),
      shippingMethodId: selectedShippingOption?.methodId,
      shippingRateId: selectedShippingOption?.rateId,
      shippingOptionLabel: selectedShippingOption?.label,
      shippingQuoteSnapshot: selectedShippingOption || undefined,
      shippingAddress: requiresShipping ? shippingAddress : undefined,
      shippingTimeline: requiresShipping
        ? [{ status: "pending", note: "Awaiting payment", createdBy: req.user._id }]
        : [],
      payment: {
        method: "stripe",
        status: "pending",
      },
    });

    // Build Stripe line items
    const stripe = getStripeClient();
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

    for (const item of normalizedItems) {
      const variationDesc = item.selectedVariations?.length
        ? item.selectedVariations.map((v) => `${v.label}: ${v.optionName}`).join(", ")
        : "";

      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: {
            name: item.name,
            description: variationDesc || undefined,
            images: item.image ? [item.image] : undefined,
          },
          unit_amount: Math.round(item.unitPrice * 100),
        },
        quantity: item.quantity,
      });
    }

    // Add shipping as a line item if applicable
    if (requiresShipping && shippingCost > 0) {
      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: {
            name: `Shipping: ${selectedShippingOption?.label || "Standard"}`,
          },
          unit_amount: Math.round(shippingCost * 100),
        },
        quantity: 1,
      });
    }

    // Build Stripe checkout session params
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: contactEmail || req.user.email,
      client_reference_id: order._id.toString(),
      line_items: lineItems,
      success_url: `${frontendBase}/checkout/success`,
      cancel_url: `${frontendBase}/checkout?cancelled=1`,
      metadata: {
        orderId: order._id.toString(),
        userId: req.user._id.toString(),
        couponCode: appliedCoupon?.code || "",
      },
    };

    // Add discount if coupon applied
    if (discountTotal > 0 && appliedCoupon) {
      const couponData: Stripe.CouponCreateParams = appliedCoupon.discountType === "percentage"
        ? { percent_off: appliedCoupon.discountValue, duration: "once" }
        : { amount_off: Math.round(discountTotal * 100), currency: "usd", duration: "once" };

      const stripeCoupon = await stripe.coupons.create(couponData);
      sessionParams.discounts = [{ coupon: stripeCoupon.id }];
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create(sessionParams);

    // Store session ID on order
    order.payment = {
      ...order.payment,
      stripeSessionId: session.id,
    };
    await order.save();

    return res.json({
      success: true,
      sessionId: session.id,
      sessionUrl: session.url,
      orderId: order._id,
    });
  } catch (error: any) {
    console.error("createCheckoutSession error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create checkout session",
    });
  }
};

// Stripe Webhook Handler
export const stripeWebhook = async (req: Request & { rawBody?: Buffer }, res: Response) => {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET not configured");
    return res.status(500).send("Webhook secret not configured");
  }

  let event: Stripe.Event;

  try {
    const signature = req.headers["stripe-signature"] as string;
    // Use rawBody stored via verify option in express.json()
    const body = req.rawBody || req.body;
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleSuccessfulPayment(session);
      break;
    }
    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleExpiredSession(session);
      break;
    }
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  res.json({ received: true });
};

async function handleSuccessfulPayment(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.orderId;
  if (!orderId) {
    console.error("No orderId in session metadata");
    return;
  }

  const order = await Order.findById(orderId);
  if (!order) {
    console.error(`Order not found: ${orderId}`);
    return;
  }

  // Update order payment status
  order.paymentStatus = "paid";
  order.fulfillmentStatus = "processing";
  order.payment = {
    ...order.payment,
    status: "paid",
    stripePaymentIntentId: session.payment_intent as string,
    paidAt: new Date(),
  };

  // Update shipping timeline
  if (order.shippingStatus !== "not_required") {
    order.shippingTimeline.push({
      status: "processing",
      note: "Payment received, preparing for shipment",
      createdBy: order.user,
    });
  }

  await order.save();

  // Update stock for items
  for (const item of order.items) {
    if (item.productFormat !== "digital") {
      await Product.updateOne(
        { _id: item.product },
        {
          $inc: {
            stock: -item.quantity,
            sales: item.quantity,
          },
        }
      );
    } else {
      await Product.updateOne(
        { _id: item.product },
        { $inc: { sales: item.quantity } }
      );
    }
  }

  // Record coupon usage
  if (order.couponCode) {
    await Coupon.updateOne(
      { code: order.couponCode },
      {
        $inc: { usageCount: 1 },
        $push: {
          usedBy: {
            user: order.user,
            usedAt: new Date(),
            orderId: order._id,
          },
        },
      }
    );
  }

  console.log(`Order ${orderId} payment completed successfully`);
}

async function handleExpiredSession(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.orderId;
  if (!orderId) return;

  const order = await Order.findById(orderId);
  if (!order) return;

  // Only update if still awaiting payment
  if (order.paymentStatus === "awaiting_payment") {
    order.paymentStatus = "failed";
    order.fulfillmentStatus = "cancelled";
    order.payment = {
      ...order.payment,
      status: "failed",
    };
    await order.save();
    console.log(`Order ${orderId} session expired`);
  }
}

// Verify checkout session (for frontend confirmation)
export const verifyCheckoutSession = async (req: Request, res: Response) => {
  try {
    const { sessionId, orderId } = req.query;

    if (!sessionId || !orderId) {
      return res.status(400).json({
        success: false,
        message: "Session ID and Order ID are required",
      });
    }

    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId as string);

    if (session.metadata?.orderId !== orderId) {
      return res.status(400).json({
        success: false,
        message: "Session does not match order",
      });
    }

    const order = await Order.findById(orderId)
      .populate("user", "name email")
      .populate("items.product", "name slug images");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    return res.json({
      success: true,
      paymentStatus: session.payment_status,
      order,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to verify session",
    });
  }
};

// Preview coupon discount
export const previewCoupon = async (req: AuthRequest, res: Response) => {
  try {
    const { couponCode, items } = req.body;

    if (!couponCode) {
      return res.status(400).json({
        success: false,
        message: "Coupon code is required",
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Cart items are required",
      });
    }

    const cartSummary = await prepareCartPricing(items);
    const productIds = cartSummary.normalizedItems.map((item) => item.product.toString());
    const userId = req.user?._id?.toString();

    const result = await validateAndCalculateCoupon(
      couponCode,
      cartSummary.subtotal,
      productIds,
      userId
    );

    if (!result.valid) {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }

    return res.json({
      success: true,
      coupon: {
        code: result.coupon.code,
        discountType: result.coupon.discountType,
        discountValue: result.coupon.discountValue,
        description: result.coupon.description,
      },
      discount: result.discount,
      newSubtotal: Number((cartSummary.subtotal - result.discount).toFixed(2)),
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to validate coupon",
    });
  }
};

