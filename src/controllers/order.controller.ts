import { Request, Response } from "express";
import mongoose from "mongoose";
import Order from "../models/Order";
import Product from "../models/Product";
import User from "../models/User";
import { prepareCartPricing } from "../services/cartPricing.service";
import { resolveShippingSelection } from "../services/shipping.service";
import { dispatchEmailEvent } from "../services/emailService";
import type { EmailEventKey } from "../constants/emailEvents";
import { getStripeClient } from "../services/stripeClient";
import { getMailClient } from "../services/mailClient";
import { moveToRecycleBin } from "../services/recycleBinService";

type AuthRequest = Request & { user?: any };

const PAYMENT_STATUSES = ["pending", "awaiting_payment", "paid", "failed", "refunded", "partial"] as const;
const FULFILLMENT_STATUSES = ["pending", "processing", "ready_to_ship", "shipped", "delivered", "cancelled", "refunded"] as const;
const SHIPPING_STATUSES = ["not_required", "pending", "label_created", "in_transit", "out_for_delivery", "delivered", "returned", "cancelled"] as const;
const ORDER_STATUSES = ["pending", "free_order", "processing", "shipped", "delivered", "cancelled", "refunded"] as const;
const isValidObjectId = (value: string) => mongoose.Types.ObjectId.isValid(value);

// Map unified orderStatus to the 3 underlying statuses
type StatusMapping = {
  paymentStatus: typeof PAYMENT_STATUSES[number];
  fulfillmentStatus: typeof FULFILLMENT_STATUSES[number];
  shippingStatus: typeof SHIPPING_STATUSES[number];
};

function mapOrderStatusToUnderlyingStatuses(
  orderStatus: string,
  currentOrder: { grandTotal?: number; shippingStatus?: string; paymentStatus?: string }
): StatusMapping {
  const isFreeOrder = currentOrder.grandTotal === 0;
  const requiresShipping = currentOrder.shippingStatus !== "not_required";
  
  switch (orderStatus) {
    case "pending":
      return {
        paymentStatus: "pending",
        fulfillmentStatus: "pending",
        shippingStatus: requiresShipping ? "pending" : "not_required",
      };
    
    case "free_order":
      return {
        paymentStatus: "paid", // Free orders are considered "paid" (no payment needed)
        fulfillmentStatus: "processing",
        shippingStatus: requiresShipping ? "pending" : "not_required",
      };
    
    case "processing":
      return {
        paymentStatus: isFreeOrder ? "paid" : (currentOrder.paymentStatus === "paid" ? "paid" : "paid"),
        fulfillmentStatus: "processing",
        shippingStatus: requiresShipping ? "pending" : "not_required",
      };
    
    case "shipped":
      return {
        paymentStatus: isFreeOrder ? "paid" : "paid",
        fulfillmentStatus: "shipped",
        shippingStatus: "in_transit",
      };
    
    case "delivered":
      return {
        paymentStatus: isFreeOrder ? "paid" : "paid",
        fulfillmentStatus: "delivered",
        shippingStatus: "delivered",
      };
    
    case "cancelled":
      return {
        paymentStatus: "failed",
        fulfillmentStatus: "cancelled",
        shippingStatus: requiresShipping ? "cancelled" : "not_required",
      };
    
    case "refunded":
      return {
        paymentStatus: "refunded",
        fulfillmentStatus: "refunded",
        shippingStatus: requiresShipping ? "returned" : "not_required",
      };
    
    default:
      return {
        paymentStatus: "pending",
        fulfillmentStatus: "pending",
        shippingStatus: requiresShipping ? "pending" : "not_required",
      };
  }
}

const ensureAuth = (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, message: "Authentication required" });
    return false;
  }
  return true;
};

const FRONTEND_URL = (
  process.env.FRONTEND_URL ||
  (process.env.NODE_ENV === "development"
    ? "http://localhost:5173"
    : "https://salontraining.com")
).replace(/\/+$/, "");

// Helper to format money
const formatMoney = (n: any) => Number(n || 0).toFixed(2);

// Map unified order status to email event key
function getEmailEventForOrderStatus(orderStatus: string): EmailEventKey | null {
  const statusToEventMap: Record<string, EmailEventKey> = {
    pending: "order.pending",
    free_order: "order.free-order",
    processing: "order.processing",
    shipped: "order.shipped",
    delivered: "order.delivered",
    cancelled: "order.cancelled",
    refunded: "order.refunded",
  };
  return statusToEventMap[orderStatus] || null;
}

// Get status color for email templates
function getStatusColor(orderStatus: string): string {
  const colorMap: Record<string, string> = {
    pending: "#f59e0b",
    free_order: "#8b5cf6",
    processing: "#0ea5e9",
    shipped: "#1e40af",
    delivered: "#ea580c",
    cancelled: "#dc2626",
    refunded: "#475569",
  };
  return colorMap[orderStatus] || "#6b7280";
}

// Get human-readable status label
function getStatusLabel(orderStatus: string): string {
  const labelMap: Record<string, string> = {
    pending: "PENDING",
    free_order: "FREE ORDER",
    processing: "PROCESSING",
    shipped: "SHIPPED",
    delivered: "DELIVERED",
    cancelled: "CANCELLED",
    refunded: "REFUNDED",
  };
  return labelMap[orderStatus] || orderStatus.toUpperCase();
}

// Helper to send order status update emails
async function sendOrderStatusEmail(order: any, eventKey: EmailEventKey) {
  try {
    const user = await User.findById(order.user).select("name email");
    const to = order.contactEmail || user?.email;
    if (!to) return { sent: false, reason: "no_email" };

    // Prepare shipping address string
    const shippingAddress = order.shippingAddress
      ? [
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

    // Pre-render items HTML
    const itemsHtml = (order.items || [])
      .map((item: any) => `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #f1f5f9;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="vertical-align:top;">
                  <p style="margin:0;font-size:14px;font-weight:600;color:#0f172a;">${item.name}</p>
                  ${item.variationSummary ? `<p style="margin:4px 0 0;font-size:12px;color:#64748b;">${item.variationSummary}</p>` : ""}
                  <p style="margin:4px 0 0;font-size:13px;color:#64748b;">Qty: ${item.quantity}</p>
                </td>
                <td style="vertical-align:top;text-align:right;width:80px;">
                  <p style="margin:0;font-size:14px;font-weight:600;color:#0f172a;">$${formatMoney(item.subtotal)}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      `)
      .join("");

    // Discount HTML (if applicable)
    const discountHtml = order.discountTotal > 0 
      ? `<tr>
          <td style="padding:6px 0;font-size:14px;color:#059669;">Discount</td>
          <td style="padding:6px 0;font-size:14px;color:#059669;text-align:right;font-weight:500;">-$${formatMoney(order.discountTotal)}</td>
        </tr>`
      : "";
    
    // Free order note for invoice
    const isFreeOrder = order.grandTotal === 0 || order.orderStatus === "free_order";
    const freeOrderNote = isFreeOrder
      ? `<div style="background:#f3e8ff;border:1px solid #d8b4fe;border-radius:12px;padding:16px;margin-bottom:20px;">
          <p style="margin:0;font-size:14px;color:#7c3aed;font-weight:600;">✨ No payment was required for this order.</p>
          <p style="margin:8px 0 0;font-size:13px;color:#6b7280;">This order was placed with a 100% discount.</p>
        </div>`
      : "";

    const orderData = {
      id: order._id.toString(),
      number: order.orderNumber || order._id.toString(),
      itemsHtml,
      shippingName: order.shippingAddress?.fullName || "Customer",
      shippingAddress: shippingAddress || "Digital delivery",
      shippingMethod: order.shippingOptionLabel || order.shippingMethod || "Standard",
      contactEmail: order.contactEmail || user?.email || "",
      contactPhone: order.contactPhone || "—",
      // Status info for invoice
      status: getStatusLabel(order.orderStatus || order.fulfillmentStatus || "pending"),
      statusColor: getStatusColor(order.orderStatus || order.fulfillmentStatus || "pending"),
      freeOrderNote,
      // Totals for invoice
      totals: {
        items: formatMoney(order.itemsTotal),
        shipping: formatMoney(order.shippingCost || 0),
        discount: formatMoney(order.discountTotal || 0),
        grand: formatMoney(order.grandTotal),
      },
      discountHtml,
      // Tracking info
      carrier: order.shippingTracking?.carrier || "Carrier TBD",
      trackingNumber: order.shippingTracking?.trackingNumber || "—",
      estimatedDelivery: order.shippingTracking?.estimatedDelivery
        ? new Date(order.shippingTracking.estimatedDelivery).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
        : "To be determined",
      // Dates
      date: new Date(order.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
      shippedDate: order.shippingTracking?.shippedAt
        ? new Date(order.shippingTracking.shippedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
        : new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
      deliveryDate: new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
      deliveredDate: order.shippingTracking?.deliveredAt
        ? new Date(order.shippingTracking.deliveredAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
        : new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
      // Refund info
      refundAmount: formatMoney(order.grandTotal),
      refundDate: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
    };

    await dispatchEmailEvent(eventKey, {
      to,
      data: {
        user: { name: user?.name || order.shippingAddress?.fullName || "there" },
        order: orderData,
      },
    });
    return { sent: true };
  } catch (err) {
    console.error(`Failed to send ${eventKey} email:`, err);
    return { sent: false, error: err };
  }
}

// Send order status change email based on unified orderStatus
async function sendOrderStatusChangeEmail(order: any, newOrderStatus: string, previousOrderStatus?: string) {
  // Don't send if status hasn't changed
  if (previousOrderStatus && newOrderStatus === previousOrderStatus) {
    return { sent: false, reason: "status_unchanged" };
  }
  
  const eventKey = getEmailEventForOrderStatus(newOrderStatus);
  if (!eventKey) {
    console.log(`No email event defined for order status: ${newOrderStatus}`);
    return { sent: false, reason: "no_event_defined" };
  }
  
  return sendOrderStatusEmail(order, eventKey);
}

export const createOrder = async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureAuth(req, res)) return;

    const {
      items,
      shippingAddress,
      shippingSelection,
      shippingCoordinates,
      taxTotal = 0,
      discountTotal = 0,
      contactEmail,
      contactPhone,
      notes,
      couponCode,
      paymentMethod = "manual",
    } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one item is required to place an order",
      });
    }

    if (items.length > 30) {
      return res.status(400).json({
        success: false,
        message: "Orders cannot contain more than 30 different items",
      });
    }

    const cartSummary = await prepareCartPricing(items);
    const { normalizedItems, subtotal: itemsTotal, requiresShipping, stockAdjustments } = cartSummary;

    if (requiresShipping) {
      if (
        !shippingAddress?.fullName ||
        !shippingAddress?.line1 ||
        !shippingAddress?.city ||
        !shippingAddress?.country
      ) {
        return res.status(400).json({
          success: false,
          message: "A full shipping address is required for physical items",
        });
      }

      if (!shippingSelection?.methodId) {
        return res.status(400).json({
          success: false,
          message: "Please select a shipping option",
        });
      }
    }

    let selectedShippingOption: any = null;
    let shippingCostNumber = 0;
    let shippingMethodLabel = requiresShipping ? "pending" : "not_required";

    if (requiresShipping) {
      selectedShippingOption = await resolveShippingSelection({
        cart: cartSummary,
        address: shippingAddress,
        coordinates: shippingCoordinates,
        selection: shippingSelection,
      });
      shippingCostNumber = selectedShippingOption.cost;
      shippingMethodLabel = selectedShippingOption.methodName;
    }

    const taxNumber = Number(taxTotal || 0);
    const discountNumber = Math.max(0, Math.min(Number(discountTotal || 0), itemsTotal));
    const grandTotal = Number(
      Math.max(0, itemsTotal + shippingCostNumber + taxNumber - discountNumber).toFixed(2)
    );

    const order = await Order.create({
      user: req.user._id,
      items: normalizedItems,
      itemsTotal: Number(itemsTotal.toFixed(2)),
      shippingCost: Number(shippingCostNumber.toFixed(2)),
      taxTotal: Number(taxNumber.toFixed(2)),
      discountTotal: Number(discountNumber.toFixed(2)),
      grandTotal,
      contactEmail: contactEmail || req.user.email,
      contactPhone,
      notes,
      couponCode,
      paymentStatus: "pending",
      fulfillmentStatus: "pending",
      shippingStatus: requiresShipping ? "pending" : "not_required",
      shippingMethod: shippingMethodLabel,
      shippingMethodId: selectedShippingOption?.methodId,
      shippingRateId: selectedShippingOption?.rateId,
      shippingOptionLabel: selectedShippingOption?.label,
      shippingQuoteSnapshot: selectedShippingOption || undefined,
      shippingAddress: requiresShipping ? shippingAddress : undefined,
      shippingTimeline: requiresShipping
        ? [
            {
              status: "pending",
              note: "Awaiting fulfillment",
              createdBy: req.user._id,
            },
          ]
        : [],
      payment: {
        method: paymentMethod,
        status: "pending",
      },
    });

    await Promise.all(
      stockAdjustments.map((update) =>
        Product.updateOne(
          { _id: update.productId },
          {
            $inc: {
              stock: update.decrementStock ? -update.decrementStock : 0,
              sales: update.incrementSales,
            },
          }
        )
      )
    );

    return res.json({
      success: true,
      message: "Order placed successfully",
      order,
    });
  } catch (error: any) {
    console.error("createOrder error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to place order",
    });
  }
};

export const getMyOrders = async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureAuth(req, res)) return;
    const { page = 1, limit = 10 } = req.query;

    const query = { user: req.user._id };
    const skip = (Number(page) - 1) * Number(limit);

    const [orders, total] = await Promise.all([
      Order.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Order.countDocuments(query),
    ]);

    return res.json({
      success: true,
      orders,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load orders",
    });
  }
};

export const getOrderById = async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureAuth(req, res)) return;
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid order ID" });
    }

    const order = await Order.findById(id)
      .populate("user", "name email role")
      .populate("items.product", "name slug images owner");

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const userId = req.user._id.toString();
    const isAdmin = ["admin", "manager"].includes(req.user.role);
    const orderOwnerId =
      typeof order.user === "object" && (order.user as any)._id
        ? (order.user as any)._id.toString()
        : order.user?.toString?.();
    const isBuyer = orderOwnerId === userId;
    const isSeller = order.items.some((item: any) => item.owner?.toString() === userId);

    if (!isAdmin && !isBuyer && !isSeller) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    if (isSeller && !isBuyer && !isAdmin) {
      const leanOrder = order.toObject();
      leanOrder.items = leanOrder.items.filter((item: any) => item.owner?.toString() === userId);
      return res.json({ success: true, order: leanOrder });
    }

    return res.json({ success: true, order });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load order",
    });
  }
};

export const requestRefund = async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureAuth(req, res)) return;
    const { id } = req.params;
    const { reason, amount, details } = req.body || {};

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid order ID" });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (order.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "You can only request refunds for your own orders" });
    }

    if (!reason) {
      return res.status(400).json({ success: false, message: "Refund reason is required" });
    }

    if (order.refund?.status && order.refund.status !== "none") {
      return res.status(400).json({
        success: false,
        message: "A refund request already exists for this order",
      });
    }

    order.refund = {
      status: "requested",
      reason,
      amount: Number(amount) || order.grandTotal,
      requestedAt: new Date(),
      resolutionNote: details,
    };
    await order.save();

    return res.json({
      success: true,
      message: "Refund request submitted",
      order,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to submit refund request",
    });
  }
};

export const getAdminOrders = async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureAuth(req, res)) return;
    const { page = 1, limit = 20, search, paymentStatus, fulfillmentStatus, shippingStatus, refundStatus } =
      req.query;

    const query: any = {};

    if (paymentStatus && PAYMENT_STATUSES.includes(paymentStatus as any)) {
      query.paymentStatus = paymentStatus;
    }
    if (fulfillmentStatus && FULFILLMENT_STATUSES.includes(fulfillmentStatus as any)) {
      query.fulfillmentStatus = fulfillmentStatus;
    }
    if (shippingStatus && SHIPPING_STATUSES.includes(shippingStatus as any)) {
      query.shippingStatus = shippingStatus;
    }
    if (refundStatus) {
      query["refund.status"] = refundStatus;
    }
    if (search) {
      const regex = new RegExp(search as string, "i");
      query.$or = [{ orderNumber: regex }, { contactEmail: regex }];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate("user", "name email role")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Order.countDocuments(query),
    ]);

    return res.json({
      success: true,
      orders,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load orders",
    });
  }
};

export const adminGetOrder = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid order ID" });
    }

    const order = await Order.findById(id)
      .populate("user", "name email role")
      .populate("items.product", "name slug images owner");

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    return res.json({ success: true, order });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load order",
    });
  }
};

export const adminUpdateOrderStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid order ID" });
    }

    const {
      orderStatus,
      // Legacy fields for backward compatibility
      paymentStatus: legacyPaymentStatus,
      fulfillmentStatus: legacyFulfillmentStatus,
      shippingStatus: legacyShippingStatus,
      trackingNumber,
      carrier,
      estimatedDelivery,
      shippedAt,
      deliveredAt,
      note,
    } = req.body;

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // Store previous statuses for comparison and logging
    const previousOrderStatus = order.orderStatus;
    const previousPaymentStatus = order.paymentStatus;
    const previousFulfillmentStatus = order.fulfillmentStatus;
    const previousShippingStatus = order.shippingStatus;

    // Determine if we're using the new unified status or legacy approach
    if (orderStatus && ORDER_STATUSES.includes(orderStatus)) {
      // NEW UNIFIED STATUS APPROACH
      
      // Validation: Shipped status requires tracking info
      if (orderStatus === "shipped") {
        if (!trackingNumber?.trim()) {
          return res.status(400).json({ 
            success: false, 
            message: "Tracking number is required for Shipped status" 
          });
        }
        if (!carrier?.trim()) {
          return res.status(400).json({ 
            success: false, 
            message: "Carrier is required for Shipped status" 
          });
        }
      }
      
      // Validation: Prevent conflicting states for free orders
      if (order.grandTotal === 0 && orderStatus === "cancelled") {
        // Free orders can't have payment "failed" - adjust to just cancel fulfillment
        // This is acceptable, we'll handle it in the mapping
      }
      
      // Map the unified status to the 3 underlying statuses
      const mappedStatuses = mapOrderStatusToUnderlyingStatuses(orderStatus, {
        grandTotal: order.grandTotal,
        shippingStatus: order.shippingStatus,
        paymentStatus: order.paymentStatus,
      });
      
      // Apply the mapped statuses
      order.orderStatus = orderStatus;
      order.paymentStatus = mappedStatuses.paymentStatus;
      order.fulfillmentStatus = mappedStatuses.fulfillmentStatus;
      order.shippingStatus = mappedStatuses.shippingStatus;
      
      // Update payment object
      order.payment = order.payment || { method: "manual", status: mappedStatuses.paymentStatus };
      order.payment.status = mappedStatuses.paymentStatus;
      
      if (mappedStatuses.paymentStatus === "paid" && !order.payment.paidAt) {
        order.payment.paidAt = new Date();
      }
      
      // Add to shipping timeline for relevant status changes
      if (mappedStatuses.shippingStatus !== previousShippingStatus) {
        order.shippingTimeline.push({
          status: mappedStatuses.shippingStatus,
          note: note || `Order status changed to ${orderStatus}`,
          createdBy: req.user?._id,
        });
      }
      
      // Log the status change with timestamp and admin identifier
      if (!order.statusHistory) {
        order.statusHistory = [];
      }
      order.statusHistory.push({
        previousStatus: previousOrderStatus || previousFulfillmentStatus,
        newStatus: orderStatus,
        orderStatus: orderStatus,
        changedBy: req.user?._id,
        changedAt: new Date(),
        note: note || undefined,
      });
      
    } else {
      // LEGACY APPROACH - Support old 3-field updates for backward compatibility
      if (legacyPaymentStatus) {
        if (!PAYMENT_STATUSES.includes(legacyPaymentStatus)) {
          return res.status(400).json({ success: false, message: "Invalid payment status" });
        }
        order.paymentStatus = legacyPaymentStatus;
        order.payment = order.payment || { method: "manual", status: legacyPaymentStatus };
        order.payment.status = legacyPaymentStatus;
        if (legacyPaymentStatus === "paid" && !order.payment.paidAt) {
          order.payment.paidAt = new Date();
        }
        if (legacyPaymentStatus === "refunded") {
          order.fulfillmentStatus = "refunded";
        }
      }

      if (legacyFulfillmentStatus) {
        if (!FULFILLMENT_STATUSES.includes(legacyFulfillmentStatus)) {
          return res.status(400).json({ success: false, message: "Invalid fulfillment status" });
        }
        order.fulfillmentStatus = legacyFulfillmentStatus;
      }

      if (legacyShippingStatus) {
        if (!SHIPPING_STATUSES.includes(legacyShippingStatus)) {
          return res.status(400).json({ success: false, message: "Invalid shipping status" });
        }
        order.shippingStatus = legacyShippingStatus;
        order.shippingTimeline.push({
          status: legacyShippingStatus,
          note: note || `Status updated to ${legacyShippingStatus}`,
          createdBy: req.user?._id,
        });
      }
    }
    
    // Update shipping tracking info (applies to both approaches)
    if (trackingNumber || carrier || estimatedDelivery || shippedAt || deliveredAt) {
      order.shippingTracking = order.shippingTracking || {};
      
      if (trackingNumber) {
        order.shippingTracking.trackingNumber = trackingNumber;
      }
      if (carrier) {
        order.shippingTracking.carrier = carrier;
      }
      if (estimatedDelivery) {
        order.shippingTracking.estimatedDelivery = new Date(estimatedDelivery);
      }
      if (shippedAt) {
        order.shippingTracking.shippedAt = new Date(shippedAt);
      } else if (order.shippingStatus === "in_transit" && !order.shippingTracking.shippedAt) {
        order.shippingTracking.shippedAt = new Date();
      }
      if (deliveredAt) {
        order.shippingTracking.deliveredAt = new Date(deliveredAt);
      } else if (order.shippingStatus === "delivered" && !order.shippingTracking.deliveredAt) {
        order.shippingTracking.deliveredAt = new Date();
      }
    }

    await order.save();

    // Send email notifications based on status changes
    let emailResult: { sent: boolean; reason?: string; error?: unknown } = { sent: false, reason: "no_status_change" };
    
    // Use the unified orderStatus for email notifications when available
    if (orderStatus && orderStatus !== previousOrderStatus) {
      emailResult = await sendOrderStatusChangeEmail(order, orderStatus, previousOrderStatus);
    } else {
      // Legacy: Check individual status changes for backward compatibility
      const newShippingStatus = order.shippingStatus;
      const newPaymentStatus = order.paymentStatus;
      const newFulfillmentStatus = order.fulfillmentStatus;
      
      if (newShippingStatus !== previousShippingStatus) {
        if (newShippingStatus === "in_transit" || newShippingStatus === "label_created") {
          emailResult = await sendOrderStatusEmail(order, "order.shipped");
        } else if (newShippingStatus === "out_for_delivery") {
          emailResult = await sendOrderStatusEmail(order, "order.out-for-delivery");
        } else if (newShippingStatus === "delivered") {
          emailResult = await sendOrderStatusEmail(order, "order.delivered");
        }
      }

      // Check for shipped in fulfillment status
      if (newFulfillmentStatus === "shipped" && previousFulfillmentStatus !== "shipped" && previousShippingStatus !== "in_transit") {
        emailResult = await sendOrderStatusEmail(order, "order.shipped");
      }

      // Check for refund
      if (newPaymentStatus === "refunded" && previousPaymentStatus !== "refunded") {
        emailResult = await sendOrderStatusEmail(order, "order.refunded");
      }
    }

    return res.json({
      success: true,
      message: "Order status updated",
      order,
      emailSent: emailResult.sent,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update order",
    });
  }
};

export const adminAddShippingEvent = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status, note } = req.body || {};

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid order ID" });
    }
    if (!status) {
      return res.status(400).json({ success: false, message: "Status is required" });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    order.shippingTimeline.push({
      status,
      note,
      createdBy: req.user?._id,
    });
    await order.save();

    return res.json({
      success: true,
      message: "Shipping event added",
      shippingTimeline: order.shippingTimeline,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to add shipping event",
    });
  }
};

export const adminProcessRefund = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status, amount, resolutionNote } = req.body || {};

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid order ID" });
    }

    if (!status || !["approved", "rejected", "processed"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid refund status" });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (!order.refund || order.refund.status === "none") {
      order.refund = { status: "requested" };
    }

    const refundAmount = Number(amount) || order.refund.amount || order.grandTotal;
    order.refund.status = status === "processed" ? "processed" : status;
    order.refund.amount = refundAmount;
    order.refund.resolutionNote = resolutionNote;
    order.refund.processedBy = req.user?._id;

    if (status === "processed") {
      order.refund.processedAt = new Date();
      order.paymentStatus = "refunded";
      order.payment = order.payment || { method: "manual", status: "refunded" };
      order.payment.status = "refunded";
      order.fulfillmentStatus = "refunded";
      if (order.shippingStatus === "delivered") {
        order.shippingStatus = "returned";
      }
    }

    await order.save();

    return res.json({
      success: true,
      message: "Refund updated",
      order,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to process refund",
    });
  }
};

// ===============================
// ADMIN — Send Invoice Email
// ===============================
export const adminSendInvoice = async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureAuth(req, res)) return;
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid order ID" });
    }

    const order = await Order.findById(id).populate("user", "name email");
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const customerEmail = order.contactEmail || (order.user as any)?.email;
    if (!customerEmail) {
      return res.status(400).json({ 
        success: false, 
        message: "No customer email found for this order" 
      });
    }

    // Send the invoice email
    const emailResult = await sendOrderStatusEmail(order, "order.invoice");
    
    if (emailResult.sent) {
      // Log the invoice send in status history
      if (!order.statusHistory) {
        order.statusHistory = [];
      }
      order.statusHistory.push({
        previousStatus: order.orderStatus || order.fulfillmentStatus,
        newStatus: order.orderStatus || order.fulfillmentStatus,
        orderStatus: order.orderStatus,
        changedBy: req.user?._id,
        changedAt: new Date(),
        note: `Invoice email sent to ${customerEmail}`,
      });
      await order.save();

      return res.json({
        success: true,
        message: `Invoice sent successfully to ${customerEmail}`,
        emailSent: true,
      });
    } else {
      return res.status(500).json({
        success: false,
        message: "Failed to send invoice email. Please try again.",
        emailSent: false,
        error: emailResult.error,
      });
    }
  } catch (error: any) {
    console.error("Failed to send invoice:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to send invoice",
    });
  }
};

// ===============================
// ADMIN — Create payment recovery link
// ===============================
export const adminCreateRecoveryLink = async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureAuth(req, res)) return;
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid order ID" });
    }

    const order = await Order.findById(id).populate("user", "name email");
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const derivedTotal =
      Math.max(
        Number(order.grandTotal || 0),
        Number(order.itemsTotal || 0) +
          Number(order.shippingCost || 0) +
          Number(order.taxTotal || 0) -
          Number(order.discountTotal || 0)
      );

    const totalCents = Math.round(derivedTotal * 100);
    if (totalCents <= 0) {
      return res.status(400).json({ success: false, message: "Payment recovery not available for $0 orders" });
    }

    if (!["failed", "awaiting_payment", "pending", "partial"].includes(order.paymentStatus)) {
      return res.status(400).json({ success: false, message: "Payment recovery is not allowed for this order status" });
    }

    const stripe = getStripeClient();
    const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24; // 24 hours

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: order.contactEmail || (order as any)?.user?.email || undefined,
      client_reference_id: order._id.toString(),
      expires_at: expiresAt,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Pay Order ${order.orderNumber || order._id}`,
            },
            unit_amount: Math.max(1, totalCents),
          },
          quantity: 1,
        },
      ],
      success_url: `${FRONTEND_URL}/checkout/success/${order._id}?source=recover`,
      cancel_url: `${FRONTEND_URL}/checkout?cancelled=1`,
      metadata: {
        orderId: order._id.toString(),
        recovery: "true",
        orderNumber: order.orderNumber || order._id.toString(),
      },
    });

    // Log session mode for debugging
    const isLiveSession = session.id.startsWith("cs_live_");
    console.log(`[Stripe Recovery] Created session: ${session.id.substring(0, 20)}... (${isLiveSession ? "LIVE" : "TEST"} mode)`);

    order.paymentStatus = "awaiting_payment";
    order.payment = {
      ...order.payment,
      status: "awaiting_payment",
      stripeSessionId: session.id,
      recoverySessionId: session.id,
      recoveryLinkExpiresAt: new Date(expiresAt * 1000),
    };

    await order.save();

    // Best-effort email notification to customer
    if (session.url) {
      const to = order.contactEmail || (order as any)?.user?.email;
      if (to) {
        try {
          const mailClient = getMailClient();
          await mailClient.transporter.sendMail({
            from: mailClient.from,
            to,
            subject: `Complete payment for order ${order.orderNumber || order._id}`,
            html: `
              <p>Hello ${order.shippingAddress?.fullName || (order as any)?.user?.name || "there"},</p>
              <p>You can securely complete payment for order <strong>${order.orderNumber || order._id}</strong> using the link below. This link expires on ${new Date(expiresAt * 1000).toLocaleString()}.</p>
              <p><a href="${session.url}">Pay now</a></p>
              <p>If you have already paid, please ignore this message.</p>
            `,
          });
        } catch (mailErr) {
          console.error("Failed to send payment recovery email:", mailErr);
        }
      }
    }

    return res.json({
      success: true,
      sessionUrl: session.url,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create payment recovery link",
    });
  }
};

// Delete a single order (moves to recycle bin)
export const adminDeleteOrder = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid order ID" });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // Allow deletion for: delivered, refunded, cancelled orders OR unpaid orders
    const allowedForDeletion = 
      order.fulfillmentStatus === "delivered" ||
      order.fulfillmentStatus === "refunded" ||
      order.fulfillmentStatus === "cancelled" ||
      order.paymentStatus !== "paid";

    if (!allowedForDeletion) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete this order. Orders can only be deleted when Delivered, Refunded, Cancelled, or unpaid.",
      });
    }

    // Move to recycle bin instead of permanent deletion
    await moveToRecycleBin("order", order, { deletedBy: req.user?.id });

    return res.json({
      success: true,
      message: "Order moved to recycle bin",
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete order",
    });
  }
};

// Bulk delete orders (moves to recycle bin)
export const adminBulkDeleteOrders = async (req: AuthRequest, res: Response) => {
  try {
    const { orderIds, force } = req.body;

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide an array of order IDs to delete",
      });
    }

    // Validate all IDs
    const invalidIds = orderIds.filter((id) => !isValidObjectId(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid order IDs: ${invalidIds.join(", ")}`,
      });
    }

    // Find all orders
    const orders = await Order.find({ _id: { $in: orderIds } });
    
    if (orders.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No orders found with the provided IDs",
      });
    }

    // Check for orders that cannot be deleted (unless force is true)
    // Allow deletion for: delivered, refunded, cancelled orders OR unpaid orders
    if (!force) {
      const restrictedOrders = orders.filter((o) => {
        const allowedForDeletion = 
          o.fulfillmentStatus === "delivered" ||
          o.fulfillmentStatus === "refunded" ||
          o.fulfillmentStatus === "cancelled" ||
          o.paymentStatus !== "paid";
        return !allowedForDeletion;
      });
      
      if (restrictedOrders.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Cannot delete ${restrictedOrders.length} order(s). Orders can only be deleted when Delivered, Refunded, Cancelled, or unpaid. Use force=true to override.`,
          restrictedOrderIds: restrictedOrders.map((o) => o._id),
        });
      }
    }

    // Move orders to recycle bin instead of permanent deletion
    let deletedCount = 0;
    for (const order of orders) {
      await moveToRecycleBin("order", order, { deletedBy: req.user?.id });
      deletedCount++;
    }

    return res.json({
      success: true,
      message: `Successfully moved ${deletedCount} order(s) to recycle bin`,
      deletedCount,
      requestedCount: orderIds.length,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete orders",
    });
  }
};

// Bulk update order status
export const adminBulkUpdateStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { orderIds, paymentStatus, fulfillmentStatus, shippingStatus } = req.body;

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide an array of order IDs to update",
      });
    }

    if (!paymentStatus && !fulfillmentStatus && !shippingStatus) {
      return res.status(400).json({
        success: false,
        message: "Please provide at least one status to update",
      });
    }

    // Validate statuses
    if (paymentStatus && !PAYMENT_STATUSES.includes(paymentStatus)) {
      return res.status(400).json({ success: false, message: "Invalid payment status" });
    }
    if (fulfillmentStatus && !FULFILLMENT_STATUSES.includes(fulfillmentStatus)) {
      return res.status(400).json({ success: false, message: "Invalid fulfillment status" });
    }
    if (shippingStatus && !SHIPPING_STATUSES.includes(shippingStatus)) {
      return res.status(400).json({ success: false, message: "Invalid shipping status" });
    }

    // Validate all IDs
    const invalidIds = orderIds.filter((id) => !isValidObjectId(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid order IDs: ${invalidIds.join(", ")}`,
      });
    }

    // Build update object
    const updateObj: any = {};
    if (paymentStatus) {
      updateObj.paymentStatus = paymentStatus;
      updateObj["payment.status"] = paymentStatus;
    }
    if (fulfillmentStatus) {
      updateObj.fulfillmentStatus = fulfillmentStatus;
    }
    if (shippingStatus) {
      updateObj.shippingStatus = shippingStatus;
    }

    const result = await Order.updateMany(
      { _id: { $in: orderIds } },
      { $set: updateObj }
    );

    return res.json({
      success: true,
      message: `Successfully updated ${result.modifiedCount} order(s)`,
      modifiedCount: result.modifiedCount,
      matchedCount: result.matchedCount,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update orders",
    });
  }
};


