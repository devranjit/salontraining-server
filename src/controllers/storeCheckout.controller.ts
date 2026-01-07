import { Request, Response } from "express";
import Stripe from "stripe";
import mongoose from "mongoose";
import Order from "../models/Order";
import Product from "../models/Product";
import Coupon from "../models/Coupon";
import ProVerification from "../models/ProVerification";
import User from "../models/User";
import { getStripeClient } from "../services/stripeClient";
import { prepareCartPricing, CartItemInput } from "../services/cartPricing.service";
import {
  calculateShippingOptions,
  resolveShippingSelection,
  ShippingAddressInput,
  CoordinatesInput,
  ShippingSelectionInput,
} from "../services/shipping.service";
import { dispatchEmailEvent } from "../services/emailService";
import { getMailClient } from "../services/mailClient";

/**
 * Send order confirmation email (fire-and-forget, non-blocking)
 * This function handles its own errors and never throws
 */
async function sendOrderConfirmationAsync(order: any): Promise<void> {
  try {
    if (order.confirmationEmailSent) return;
    const user = await User.findById(order.user).select("name email phone").maxTimeMS(5000);
    const to = order.contactEmail || user?.email;
    if (!to) return;

    const formatMoney = (n: any) => Number(n || 0).toFixed(2);
    const shippingAddress = order.shippingAddress
      ? [
          order.shippingAddress.fullName,
          order.shippingAddress.line1,
          order.shippingAddress.line2,
          [order.shippingAddress.city, order.shippingAddress.state, order.shippingAddress.postalCode]
            .filter(Boolean)
            .join(", "),
          order.shippingAddress.country,
        ]
          .filter(Boolean)
          .join("\n")
      : null;

    // Pre-render items HTML since email service doesn't support Mustache blocks
    const itemsArray = (order.items || []).map((item: any) => ({
      name: item.name,
      quantity: item.quantity,
      price: formatMoney(item.unitPrice),
      subtotal: formatMoney(item.subtotal),
      variations: item.variationSummary || undefined,
    }));

    const itemsHtml = itemsArray
      .map(
        (it: any) => `
          <tr>
            <td colspan="2" style="padding:16px 0;border-bottom:1px solid #f1f5f9;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:top;width:60px;">
                    <div style="width:56px;height:56px;background:#f8fafc;border-radius:10px;text-align:center;line-height:56px;">
                      <span style="font-size:24px;">📦</span>
                    </div>
                  </td>
                  <td style="vertical-align:top;padding-left:14px;">
                    <p style="margin:0;font-size:15px;font-weight:600;color:#0f172a;">${it.name}</p>
                    ${it.variations ? `<p style="margin:4px 0 0;font-size:12px;color:#64748b;">${it.variations}</p>` : ""}
                    <p style="margin:6px 0 0;font-size:13px;color:#64748b;">
                      <span style="background:#f1f5f9;padding:2px 8px;border-radius:4px;font-weight:500;">Qty: ${it.quantity}</span>
                      <span style="color:#94a3b8;margin:0 6px;">×</span>
                      <span>$${it.price} each</span>
                    </p>
                  </td>
                  <td style="vertical-align:top;text-align:right;width:90px;">
                    <p style="margin:0;font-size:16px;font-weight:700;color:#0f172a;">$${it.subtotal}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        `
      )
      .join("");

    const discountHtml = order.discountTotal
      ? `<tr>
          <td style="padding:6px 0;font-size:14px;color:#f97316;">Discount</td>
          <td style="padding:6px 0;font-size:14px;color:#f97316;text-align:right;font-weight:600;">−$${formatMoney(order.discountTotal)}</td>
        </tr>`
      : "";

    const orderData = {
      id: order._id.toString(),
      number: order.orderNumber || order._id.toString(),
      date: order.createdAt ? new Date(order.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : undefined,
      itemCount: Array.isArray(order.items)
        ? order.items.reduce((sum: number, i: any) => sum + (Number(i.quantity) || 0), 0)
        : 0,
      items: itemsArray,
      itemsHtml,
      discountHtml,
      totals: {
        items: formatMoney(order.itemsTotal),
        shipping: formatMoney(order.shippingCost),
        discount: order.discountTotal ? formatMoney(order.discountTotal) : undefined,
        grand: formatMoney(order.grandTotal),
      },
      shippingName: order.shippingAddress?.fullName,
      shippingAddress,
      shippingMethod:
        order.shippingOptionLabel ||
        order.shippingMethod ||
        (order.shippingStatus === "not_required" ? "Digital delivery" : "Standard"),
      contactEmail: order.contactEmail || user?.email,
      contactPhone: order.contactPhone || user?.phone,
      notes: order.notes || undefined,
    };

    let sent = false;
    try {
      const result = await dispatchEmailEvent("order.paid", {
        to,
        data: {
          user: { name: user?.name || "there" },
          order: orderData,
        },
      });
      sent = !(result as any)?.skipped;
    } catch (err) {
      console.error("Dispatch order.paid email failed, will attempt fallback:", err);
    }

    // Fallback: send directly if trigger/template is missing or disabled
    if (!sent) {
      try {
        const mailClient = getMailClient();
        const subject = `Order Confirmed #${orderData.number} - SalonTraining`;
        const html = `
          <div style="max-width:640px;margin:0 auto;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#1e293b;background:#ffffff;">
            <!-- Header -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);border-radius:16px 16px 0 0;">
              <tr>
                <td style="padding:32px 28px 28px;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td>
                        <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#94a3b8;">Order Confirmation</p>
                        <h1 style="margin:0;font-size:26px;font-weight:700;color:#ffffff;">Thanks for your order!</h1>
                      </td>
                      <td style="text-align:right;vertical-align:top;">
                        <div style="display:inline-block;background:#f97316;border-radius:24px;padding:6px 14px;">
                          <span style="color:#ffffff;font-size:12px;font-weight:600;">CONFIRMED</span>
                        </div>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:16px 0 0;color:#cbd5e1;font-size:14px;">Hi <strong style="color:#ffffff;">${orderData.shippingName || user?.name || "there"}</strong>, we've received your order.</p>
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;background:rgba(255,255,255,0.1);border-radius:10px;">
                    <tr>
                      <td style="padding:12px 16px;">
                        <table width="100%" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td style="color:#94a3b8;font-size:12px;text-transform:uppercase;">Order Number</td>
                            <td style="text-align:right;color:#94a3b8;font-size:12px;text-transform:uppercase;">Date</td>
                          </tr>
                          <tr>
                            <td style="color:#ffffff;font-size:16px;font-weight:700;padding-top:4px;">${orderData.number}</td>
                            <td style="text-align:right;color:#ffffff;font-size:14px;padding-top:4px;">${orderData.date || ""}</td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Items -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
              <tr>
                <td style="padding:28px;">
                  <h2 style="margin:0 0 20px;font-size:15px;font-weight:700;color:#0f172a;text-transform:uppercase;letter-spacing:0.08em;border-bottom:2px solid #0f172a;padding-bottom:10px;display:inline-block;">Your Items</h2>
                  <table width="100%" cellpadding="0" cellspacing="0" border="0">${orderData.itemsHtml}</table>

                  <!-- Totals -->
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;background:linear-gradient(135deg,#f8fafc 0%,#f1f5f9 100%);border-radius:12px;">
                    <tr>
                      <td style="padding:20px;">
                        <table width="100%" cellpadding="0" cellspacing="0" border="0">
                          <tr><td style="padding:6px 0;font-size:14px;color:#64748b;">Subtotal</td><td style="padding:6px 0;font-size:14px;color:#0f172a;text-align:right;font-weight:500;">$${orderData.totals.items}</td></tr>
                          <tr><td style="padding:6px 0;font-size:14px;color:#64748b;">Shipping</td><td style="padding:6px 0;font-size:14px;color:#0f172a;text-align:right;font-weight:500;">$${orderData.totals.shipping}</td></tr>
                          ${orderData.discountHtml}
                          <tr><td colspan="2" style="padding-top:12px;border-top:2px dashed #cbd5e1;"></td></tr>
                          <tr><td style="padding:8px 0;font-size:18px;font-weight:700;color:#0f172a;">Total Paid</td><td style="padding:8px 0;font-size:22px;font-weight:700;color:#0f172a;text-align:right;">$${orderData.totals.grand}</td></tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Shipping & Contact -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
              <tr>
                <td style="padding:0 28px 28px;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td width="48%" style="vertical-align:top;">
                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;">
                          <tr>
                            <td style="padding:18px;">
                              <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.1em;">📍 Shipping To</p>
                              <p style="margin:0;font-size:14px;font-weight:600;color:#0f172a;">${orderData.shippingName || ""}</p>
                              <p style="margin:6px 0 0;font-size:13px;color:#475569;line-height:1.5;white-space:pre-line;">${orderData.shippingAddress || "Digital delivery"}</p>
                              <p style="margin:10px 0 0;font-size:12px;color:#64748b;">
                                <span style="background:#dbeafe;color:#1e40af;padding:3px 8px;border-radius:4px;font-weight:500;">${orderData.shippingMethod}</span>
                              </p>
                            </td>
                          </tr>
                        </table>
                      </td>
                      <td width="4%"></td>
                      <td width="48%" style="vertical-align:top;">
                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;">
                          <tr>
                            <td style="padding:18px;">
                              <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.1em;">📧 Contact Details</p>
                              <p style="margin:0;font-size:13px;color:#475569;"><strong>Email:</strong> ${orderData.contactEmail}</p>
                              ${orderData.contactPhone ? `<p style="margin:6px 0 0;font-size:13px;color:#475569;"><strong>Phone:</strong> ${orderData.contactPhone}</p>` : ""}
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Footer -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;">
              <tr>
                <td style="padding:24px 28px;text-align:center;">
                  <p style="margin:0 0 8px;font-size:14px;color:#475569;">We'll send you shipping updates as your order progresses.</p>
                  <p style="margin:0;font-size:13px;color:#94a3b8;">Questions? Just reply to this email — we're here to help!</p>
                </td>
              </tr>
            </table>
          </div>
        `;
        await mailClient.transporter.sendMail({
          from: mailClient.from,
          to,
          subject,
          html,
        });
        sent = true;
      } catch (fallbackErr) {
        console.error("Fallback order confirmation email failed:", fallbackErr);
      }
    }

    if (sent) {
      order.confirmationEmailSent = true;
      await order.save();
    }
  } catch (err) {
    console.error("[OrderConfirmation] Failed to send:", err);
  }
}

/**
 * Fire-and-forget wrapper - schedules email without blocking
 */
function sendOrderConfirmation(order: any): void {
  // Schedule async without awaiting - response can return immediately
  setImmediate(() => {
    sendOrderConfirmationAsync(order).catch((err) => {
      console.error("[OrderConfirmation] Async handler failed:", err);
    });
  });
}

type AuthRequest = Request & { user?: any };

// Timeout constants
const STRIPE_TIMEOUT_MS = 8000;
const DB_QUERY_TIMEOUT_MS = 5000;

/**
 * Wrap a promise with a timeout
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

const FRONTEND_URL = (
  process.env.FRONTEND_URL ||
  (process.env.NODE_ENV === "development" ? "http://localhost:5173" : "https://salontraining.com")
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

// Types for coupon calculation
type CartItem = {
  product: string;
  subtotal: number;
};

type CouponResult = {
  valid: boolean;
  discount: number;
  shippingDiscount: number;
  coupon?: any;
  message?: string;
  applicableSubtotal?: number;
};

// Validate coupon and calculate discount
async function validateAndCalculateCoupon(
  couponCode: string,
  cartTotal: number,
  productIds: string[],
  userId?: string,
  shippingCost: number = 0,
  cartItems?: CartItem[]
): Promise<CouponResult> {
  const coupon = await Coupon.findOne({
    code: couponCode.toUpperCase(),
    isActive: true,
  });

  if (!coupon) {
    return { valid: false, discount: 0, shippingDiscount: 0, message: "Invalid coupon code" };
  }

  // Check dates
  if (coupon.startDate && new Date() < coupon.startDate) {
    return { valid: false, discount: 0, shippingDiscount: 0, message: "This coupon is not yet active" };
  }
  if (coupon.endDate && new Date() > coupon.endDate) {
    return { valid: false, discount: 0, shippingDiscount: 0, message: "This coupon has expired" };
  }

  // Check usage limit
  if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
    return { valid: false, discount: 0, shippingDiscount: 0, message: "This coupon has reached its usage limit" };
  }

  // Check minimum order
  if (coupon.minimumOrderAmount > 0 && cartTotal < coupon.minimumOrderAmount) {
    return {
      valid: false,
      discount: 0,
      shippingDiscount: 0,
      message: `Minimum order amount of $${coupon.minimumOrderAmount} required`,
    };
  }

  // Check per-user limit
  if (userId && coupon.usageLimitPerUser) {
    const userUsageCount = coupon.usedBy.filter(
      (u) => u.user?.toString() === userId
    ).length;
    if (userUsageCount >= coupon.usageLimitPerUser) {
      return { valid: false, discount: 0, shippingDiscount: 0, message: "You have already used this coupon" };
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
        shippingDiscount: 0,
        message: "This coupon only applies to store products",
      };
    }
  }

  // ========================================
  // PRODUCT SCOPE FILTERING
  // ========================================
  // Determine the applicable subtotal based on product scope
  let applicableSubtotal = cartTotal;
  
  if (coupon.productScope && coupon.productScope !== "all" && coupon.scopedProducts?.length > 0) {
    const scopedProductIds = coupon.scopedProducts.map((id: any) => id.toString());
    
    if (cartItems && cartItems.length > 0) {
      if (coupon.productScope === "include") {
        // Only count subtotals for products in the include list
        applicableSubtotal = cartItems
          .filter(item => scopedProductIds.includes(item.product.toString()))
          .reduce((sum, item) => sum + item.subtotal, 0);
      } else if (coupon.productScope === "exclude") {
        // Exclude subtotals for products in the exclude list
        applicableSubtotal = cartItems
          .filter(item => !scopedProductIds.includes(item.product.toString()))
          .reduce((sum, item) => sum + item.subtotal, 0);
      }
    } else {
      // Fallback: use productIds to check if any products are applicable
      if (coupon.productScope === "include") {
        const matchingProducts = productIds.filter(id => scopedProductIds.includes(id));
        if (matchingProducts.length === 0) {
          return {
            valid: false,
            discount: 0,
            shippingDiscount: 0,
            message: "This coupon does not apply to any products in your cart",
          };
        }
      } else if (coupon.productScope === "exclude") {
        const nonExcludedProducts = productIds.filter(id => !scopedProductIds.includes(id));
        if (nonExcludedProducts.length === 0) {
          return {
            valid: false,
            discount: 0,
            shippingDiscount: 0,
            message: "This coupon does not apply to any products in your cart",
          };
        }
      }
    }
  }

  // If no applicable products, return error
  if (applicableSubtotal <= 0) {
    return {
      valid: false,
      discount: 0,
      shippingDiscount: 0,
      message: "This coupon does not apply to any products in your cart",
    };
  }

  // ========================================
  // CALCULATE PRODUCT DISCOUNT
  // ========================================
  let discount = 0;
  if (coupon.discountType === "percentage") {
    discount = (applicableSubtotal * coupon.discountValue) / 100;
    if (coupon.maximumDiscount && discount > coupon.maximumDiscount) {
      discount = coupon.maximumDiscount;
    }
  } else {
    discount = Math.min(coupon.discountValue, applicableSubtotal);
  }

  // ========================================
  // CALCULATE SHIPPING DISCOUNT
  // ========================================
  let shippingDiscount = 0;
  if (coupon.applyToShipping && shippingCost > 0) {
    if (coupon.discountType === "percentage") {
      shippingDiscount = (shippingCost * coupon.discountValue) / 100;
    } else {
      // For fixed discounts, apply remaining discount to shipping after product discount
      const remainingDiscount = coupon.discountValue - discount;
      if (remainingDiscount > 0) {
        shippingDiscount = Math.min(remainingDiscount, shippingCost);
      }
    }
  }

  // ========================================
  // ENSURE TOTAL DISCOUNT DOESN'T EXCEED ORDER TOTAL
  // ========================================
  const totalOrderValue = cartTotal + shippingCost;
  const totalDiscount = discount + shippingDiscount;
  
  if (totalDiscount > totalOrderValue) {
    // Cap the discount to order total
    const ratio = totalOrderValue / totalDiscount;
    discount = discount * ratio;
    shippingDiscount = shippingDiscount * ratio;
  }

  return { 
    valid: true, 
    discount: Number(discount.toFixed(2)), 
    shippingDiscount: Number(shippingDiscount.toFixed(2)),
    coupon,
    applicableSubtotal: Number(applicableSubtotal.toFixed(2)),
  };
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
    let shippingDiscountTotal = 0;
    let appliedCoupon: any = null;

    if (couponCode) {
      const productIds = normalizedItems.map((item) => item.product.toString());
      
      // Build cart items with product IDs and subtotals for product scope filtering
      const cartItems: CartItem[] = normalizedItems.map((item) => ({
        product: item.product.toString(),
        subtotal: item.subtotal,
      }));
      
      const couponResult = await validateAndCalculateCoupon(
        couponCode,
        subtotal,
        productIds,
        req.user._id.toString(),
        shippingCost,
        cartItems
      );

      if (!couponResult.valid) {
        return res.status(400).json({
          success: false,
          message: couponResult.message,
        });
      }

      discountTotal = couponResult.discount;
      shippingDiscountTotal = couponResult.shippingDiscount || 0;
      appliedCoupon = couponResult.coupon;
    }

    // Calculate totals (shipping discount is applied to shipping cost)
    const effectiveShippingCost = Math.max(0, shippingCost - shippingDiscountTotal);
    const totalDiscount = discountTotal + shippingDiscountTotal;
    const grandTotal = Math.max(0, subtotal + effectiveShippingCost - discountTotal);
    
    // Check if this is a free order (100% discount)
    const isFreeOrder = grandTotal === 0 && (subtotal > 0 || shippingCost > 0);

    // Create pending order in database
    const order = await Order.create({
      user: req.user._id,
      items: normalizedItems,
      itemsTotal: Number(subtotal.toFixed(2)),
      shippingCost: Number(shippingCost.toFixed(2)),
      taxTotal: 0,
      discountTotal: Number(totalDiscount.toFixed(2)), // Includes product + shipping discount
      grandTotal: Number(grandTotal.toFixed(2)),
      contactEmail: contactEmail || req.user.email,
      contactPhone,
      notes,
      couponCode: appliedCoupon?.code,
      // Free order handling: mark as paid if 100% discount
      orderStatus: isFreeOrder ? "free_order" : undefined,
      paymentStatus: isFreeOrder ? "paid" : "awaiting_payment",
      fulfillmentStatus: isFreeOrder ? "processing" : "pending",
      shippingStatus: requiresShipping ? "pending" : "not_required",
      shippingMethod: selectedShippingOption?.methodName || (requiresShipping ? "pending" : "not_required"),
      shippingMethodId: selectedShippingOption?.methodId,
      shippingRateId: selectedShippingOption?.rateId,
      shippingOptionLabel: selectedShippingOption?.label,
      shippingQuoteSnapshot: selectedShippingOption || undefined,
      shippingAddress: requiresShipping ? shippingAddress : undefined,
      shippingTimeline: requiresShipping
        ? [{ status: isFreeOrder ? "processing" : "pending", note: isFreeOrder ? "Free order - no payment required" : "Awaiting payment", createdBy: req.user._id }]
        : [],
      payment: {
        method: isFreeOrder ? "free" : "stripe",
        status: isFreeOrder ? "paid" : "pending",
        paidAt: isFreeOrder ? new Date() : undefined,
      },
    });

    // ========================================
    // FREE ORDER HANDLING
    // ========================================
    // If order total is 0 (100% discount), skip Stripe checkout
    if (isFreeOrder) {
      // Record coupon usage for free orders
      if (appliedCoupon) {
        await Coupon.updateOne(
          { code: appliedCoupon.code },
          {
            $inc: { usageCount: 1 },
            $push: {
              usedBy: {
                user: req.user._id,
                usedAt: new Date(),
                orderId: order._id,
              },
            },
          }
        );
      }
      
      // Update stock for free orders
      const stockOps = normalizedItems.map((item: any) => ({
        updateOne: {
          filter: { _id: item.product },
          update: item.productFormat !== "digital"
            ? { $inc: { stock: -item.quantity, sales: item.quantity } }
            : { $inc: { sales: item.quantity } },
        },
      }));
      if (stockOps.length > 0) {
        await Product.bulkWrite(stockOps);
      }
      
      // Send order confirmation email for free orders
      sendOrderConfirmation(order);
      
      return res.json({
        success: true,
        orderId: order._id,
        isFreeOrder: true,
        message: "Free order placed successfully - no payment required",
        redirectUrl: `${frontendBase}/checkout/success/${order._id}?placed=1`,
      });
    }

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
      success_url: `${frontendBase}/checkout/success/${order._id}`,
      cancel_url: `${frontendBase}/checkout?cancelled=1`,
      metadata: {
        orderId: order._id.toString(),
        userId: req.user._id.toString(),
        couponCode: appliedCoupon?.code || "",
      },
    };

    // Add discount if coupon applied (with timeout)
    // Use totalDiscount (product + shipping discount) for Stripe
    if (totalDiscount > 0 && appliedCoupon) {
      // For Stripe, we use a fixed amount coupon with the total discount
      // This handles both product and shipping discounts correctly
      const couponData: Stripe.CouponCreateParams = {
        amount_off: Math.round(totalDiscount * 100),
        currency: "usd",
        duration: "once",
      };

      const stripeCoupon = await withTimeout(
        stripe.coupons.create(couponData),
        STRIPE_TIMEOUT_MS,
        "Stripe coupon create"
      );
      sessionParams.discounts = [{ coupon: stripeCoupon.id }];
    }

    // Create Stripe checkout session (with timeout)
    const session = await withTimeout(
      stripe.checkout.sessions.create(sessionParams),
      STRIPE_TIMEOUT_MS,
      "Stripe session create"
    );

    // Log session mode for debugging
    const isLiveSession = session.id.startsWith("cs_live_");
    console.log(`[Stripe Checkout] Created session: ${session.id.substring(0, 20)}... (${isLiveSession ? "LIVE" : "TEST"} mode)`);
    if (!isLiveSession) {
      console.warn("[Stripe Checkout] ⚠️ Session created in TEST mode - check STRIPE_SECRET_KEY");
    }

    // Store session ID on order (use updateOne for reliable subdocument update)
    await Order.updateOne(
      { _id: order._id },
      { $set: { "payment.stripeSessionId": session.id } }
    );

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
  const startTime = Date.now();
  const orderId = session.metadata?.orderId;
  
  if (!orderId) {
    console.error("[Webhook] No orderId in session metadata");
    return;
  }

  try {
    const order = await Order.findById(orderId).maxTimeMS(DB_QUERY_TIMEOUT_MS);
    if (!order) {
      console.error(`[Webhook] Order not found: ${orderId}`);
      return;
    }

    // CRITICAL: Update order payment status first
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

    // Save critical order state
    await order.save();
    console.log(`[Webhook] Order ${orderId} marked as paid in ${Date.now() - startTime}ms`);

    // NON-CRITICAL: Stock updates, coupon usage, email - fire and forget
    setImmediate(async () => {
      try {
        // Batch stock updates using bulkWrite for better performance
        const stockOps = order.items.map((item: any) => ({
          updateOne: {
            filter: { _id: item.product },
            update: item.productFormat !== "digital"
              ? { $inc: { stock: -item.quantity, sales: item.quantity } }
              : { $inc: { sales: item.quantity } },
          },
        }));
        
        if (stockOps.length > 0) {
          await Product.bulkWrite(stockOps);
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

        // Send confirmation email (already fire-and-forget)
        sendOrderConfirmation(order);
        
        console.log(`[Webhook] Order ${orderId} post-processing completed`);
      } catch (postErr) {
        console.error(`[Webhook] Order ${orderId} post-processing error:`, postErr);
      }
    });
  } catch (err) {
    console.error(`[Webhook] handleSuccessfulPayment error for ${orderId}:`, err);
  }
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
  const startTime = Date.now();
  
  try {
    // Support both old format (sessionId + orderId) and new format (just oid)
    const orderId = req.query.oid || req.query.orderId;
    let sessionId = req.query.sessionId as string | undefined;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    // Find the order with timeout
    const order = await withTimeout(
      Order.findById(orderId)
        .populate("user", "name email")
        .populate("items.product", "name slug images")
        .maxTimeMS(DB_QUERY_TIMEOUT_MS),
      DB_QUERY_TIMEOUT_MS,
      "Order lookup"
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // ========================================
    // FREE ORDER HANDLING
    // ========================================
    // Free orders (100% discount) don't have a Stripe session
    // Check if this is a free order and return success immediately
    const isFreeOrder = order.orderStatus === "free_order" || 
                       (order.payment?.method === "free" && order.grandTotal === 0);
    
    if (isFreeOrder) {
      // For free orders, the order is already marked as paid during creation
      // Just return success with the order data
      console.log(`[verifyCheckoutSession] Free order ${orderId} verified in ${Date.now() - startTime}ms`);
      
      // Send confirmation email if not already sent
      if (!order.confirmationEmailSent) {
        sendOrderConfirmation(order);
      }
      
      return res.json({
        success: true,
        paymentStatus: "paid",
        isFreeOrder: true,
        order,
      });
    }

    // ========================================
    // PAID ORDER HANDLING (Stripe verification)
    // ========================================
    // Get session ID from order if not provided in query (WAF may strip long params)
    if (!sessionId && order.payment?.stripeSessionId) {
      sessionId = order.payment.stripeSessionId;
    }

    if (!sessionId) {
      // Check if order is in a failed/pending state (Stripe session creation failed)
      if (order.paymentStatus === "awaiting_payment") {
        console.log(`[verifyCheckoutSession] Order ${orderId} has no Stripe session - likely failed checkout`);
        return res.status(400).json({
          success: false,
          message: "Payment was not completed. Please try placing your order again.",
          canRetry: true,
        });
      }
      return res.status(400).json({
        success: false,
        message: "Session information not found",
      });
    }

    // Retrieve Stripe session with timeout
    const stripe = getStripeClient();
    const session = await withTimeout(
      stripe.checkout.sessions.retrieve(sessionId),
      STRIPE_TIMEOUT_MS,
      "Stripe session retrieve"
    );

    // Verify the session belongs to this order
    if (session.metadata?.orderId !== orderId && session.client_reference_id !== orderId) {
      return res.status(400).json({
        success: false,
        message: "Session does not match order",
      });
    }

    // Prepare response data first (before any async updates)
    const responseData = {
      success: true,
      paymentStatus: session.payment_status,
      order,
    };

    // If webhook was missed, update order status (non-blocking for email)
    if (session.payment_status === "paid" && order.paymentStatus !== "paid") {
      order.paymentStatus = "paid";
      order.fulfillmentStatus = "processing";
      order.payment = {
        ...order.payment,
        status: "paid",
        stripePaymentIntentId: (session as any).payment_intent as string,
        paidAt: new Date(),
      };
      if (order.shippingStatus !== "not_required") {
        order.shippingTimeline.push({
          status: "processing",
          note: "Payment received, preparing for shipment",
          createdBy: order.user,
        });
      }
      
      // Save order state synchronously (critical)
      await withTimeout(order.save(), DB_QUERY_TIMEOUT_MS, "Order save");
      
      // Fire-and-forget email (non-blocking)
      sendOrderConfirmation(order);
    } else if (session.payment_status === "paid" && !order.confirmationEmailSent) {
      // Fire-and-forget email (non-blocking)
      sendOrderConfirmation(order);
    }

    console.log(`[verifyCheckoutSession] Completed in ${Date.now() - startTime}ms`);
    return res.json(responseData);
  } catch (error: any) {
    console.error(`[verifyCheckoutSession] Error after ${Date.now() - startTime}ms:`, error.message);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to verify session",
    });
  }
};

// Debug: Check Stripe configuration (admin only)
export const checkStripeConfig = async (req: AuthRequest, res: Response) => {
  try {
    const stripe = getStripeClient();
    
    // Get the API key prefix to determine mode
    const secretKey = process.env.STRIPE_SECRET_KEY || "";
    const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY || "";
    
    const isLiveMode = secretKey.startsWith("sk_live_");
    const publishableLive = publishableKey.startsWith("pk_live_");
    
    // Try to make a simple API call to verify the key works
    let apiWorking = false;
    let apiError = "";
    
    try {
      await stripe.balance.retrieve();
      apiWorking = true;
    } catch (err: any) {
      apiError = err.message;
    }
    
    return res.json({
      success: true,
      config: {
        mode: isLiveMode ? "LIVE" : "TEST",
        secretKeyPrefix: secretKey.substring(0, 8) + "...",
        publishableKeyPrefix: publishableKey.substring(0, 8) + "...",
        publishableMode: publishableLive ? "LIVE" : "TEST",
        keysMatch: isLiveMode === publishableLive,
        apiWorking,
        apiError: apiError || undefined,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Preview coupon discount
export const previewCoupon = async (req: AuthRequest, res: Response) => {
  try {
    const { couponCode, items, shippingCost = 0 } = req.body;

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
    
    // Build cart items with product IDs and subtotals for product scope filtering
    const cartItems: CartItem[] = cartSummary.normalizedItems.map((item) => ({
      product: item.product.toString(),
      subtotal: item.subtotal,
    }));

    const result = await validateAndCalculateCoupon(
      couponCode,
      cartSummary.subtotal,
      productIds,
      userId,
      Number(shippingCost) || 0,
      cartItems
    );

    if (!result.valid) {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }

    const totalDiscount = result.discount + (result.shippingDiscount || 0);

    return res.json({
      success: true,
      coupon: {
        code: result.coupon.code,
        discountType: result.coupon.discountType,
        discountValue: result.coupon.discountValue,
        description: result.coupon.description,
        applyToShipping: result.coupon.applyToShipping || false,
        productScope: result.coupon.productScope || "all",
      },
      discount: result.discount,
      shippingDiscount: result.shippingDiscount || 0,
      totalDiscount,
      applicableSubtotal: result.applicableSubtotal,
      newSubtotal: Number((cartSummary.subtotal - result.discount).toFixed(2)),
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to validate coupon",
    });
  }
};

