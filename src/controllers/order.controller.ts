import { Request, Response } from "express";
import mongoose from "mongoose";
import Order from "../models/Order";
import Product from "../models/Product";
import User from "../models/User";
import { prepareCartPricing } from "../services/cartPricing.service";
import { resolveShippingSelection } from "../services/shipping.service";
import { dispatchEmailEvent } from "../services/emailService";
import type { EmailEventKey } from "../constants/emailEvents";

type AuthRequest = Request & { user?: any };

const PAYMENT_STATUSES = ["pending", "awaiting_payment", "paid", "failed", "refunded", "partial"] as const;
const FULFILLMENT_STATUSES = ["pending", "processing", "ready_to_ship", "shipped", "delivered", "cancelled", "refunded"] as const;
const SHIPPING_STATUSES = ["not_required", "pending", "label_created", "in_transit", "out_for_delivery", "delivered", "returned", "cancelled"] as const;
const isValidObjectId = (value: string) => mongoose.Types.ObjectId.isValid(value);

const ensureAuth = (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, message: "Authentication required" });
    return false;
  }
  return true;
};

// Helper to format money
const formatMoney = (n: any) => Number(n || 0).toFixed(2);

// Helper to send order status update emails
async function sendOrderStatusEmail(order: any, eventKey: EmailEventKey) {
  try {
    const user = await User.findById(order.user).select("name email");
    const to = order.contactEmail || user?.email;
    if (!to) return;

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

    const orderData = {
      id: order._id.toString(),
      number: order.orderNumber || order._id.toString(),
      itemsHtml,
      shippingName: order.shippingAddress?.fullName,
      shippingAddress,
      shippingMethod: order.shippingOptionLabel || order.shippingMethod || "Standard",
      // Tracking info
      carrier: order.shippingTracking?.carrier || "Carrier TBD",
      trackingNumber: order.shippingTracking?.trackingNumber || "—",
      estimatedDelivery: order.shippingTracking?.estimatedDelivery
        ? new Date(order.shippingTracking.estimatedDelivery).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
        : "To be determined",
      // Dates
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
  } catch (err) {
    console.error(`Failed to send ${eventKey} email:`, err);
  }
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
      paymentStatus,
      fulfillmentStatus,
      shippingStatus,
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

    if (paymentStatus) {
      if (!PAYMENT_STATUSES.includes(paymentStatus)) {
        return res.status(400).json({ success: false, message: "Invalid payment status" });
      }
      order.paymentStatus = paymentStatus;
      order.payment = order.payment || { method: "manual", status: paymentStatus };
      order.payment.status = paymentStatus;
      if (paymentStatus === "paid" && !order.payment.paidAt) {
        order.payment.paidAt = new Date();
      }
      if (paymentStatus === "refunded") {
        order.fulfillmentStatus = "refunded";
      }
    }

    if (fulfillmentStatus) {
      if (!FULFILLMENT_STATUSES.includes(fulfillmentStatus)) {
        return res.status(400).json({ success: false, message: "Invalid fulfillment status" });
      }
      order.fulfillmentStatus = fulfillmentStatus;
    }

    // Track previous status for email notifications
    const previousShippingStatus = order.shippingStatus;
    const previousPaymentStatus = order.paymentStatus;

    if (shippingStatus) {
      if (!SHIPPING_STATUSES.includes(shippingStatus)) {
        return res.status(400).json({ success: false, message: "Invalid shipping status" });
      }
      order.shippingStatus = shippingStatus;
      order.shippingTimeline.push({
        status: shippingStatus,
        note: note || `Status updated to ${shippingStatus}`,
        createdBy: req.user?._id,
      });
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
      } else if (shippingStatus === "in_transit" && !order.shippingTracking.shippedAt) {
        order.shippingTracking.shippedAt = new Date();
      }
      if (deliveredAt) {
        order.shippingTracking.deliveredAt = new Date(deliveredAt);
      } else if (shippingStatus === "delivered" && !order.shippingTracking.deliveredAt) {
        order.shippingTracking.deliveredAt = new Date();
      }
    }

    await order.save();

    // Send email notifications based on status changes
    // Only send if status actually changed (not on first set or same status)
    if (shippingStatus && shippingStatus !== previousShippingStatus) {
      if (shippingStatus === "in_transit" || shippingStatus === "label_created") {
        // Order shipped
        sendOrderStatusEmail(order, "order.shipped");
      } else if (shippingStatus === "out_for_delivery") {
        // Order out for delivery
        sendOrderStatusEmail(order, "order.out-for-delivery");
      } else if (shippingStatus === "delivered") {
        // Order delivered
        sendOrderStatusEmail(order, "order.delivered");
      }
    }

    // Check for shipped in fulfillment status (alternative way to mark as shipped)
    if (fulfillmentStatus === "shipped" && fulfillmentStatus !== order.fulfillmentStatus && previousShippingStatus !== "in_transit") {
      sendOrderStatusEmail(order, "order.shipped");
    }

    // Check for refund
    if (paymentStatus === "refunded" && paymentStatus !== previousPaymentStatus) {
      sendOrderStatusEmail(order, "order.refunded");
    }

    return res.json({
      success: true,
      message: "Order status updated",
      order,
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

// Delete a single order
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

    // Prevent deletion of paid orders that haven't been refunded
    if (order.paymentStatus === "paid" && order.fulfillmentStatus !== "refunded") {
      return res.status(400).json({
        success: false,
        message: "Cannot delete paid orders. Please process a refund first.",
      });
    }

    await Order.findByIdAndDelete(id);

    return res.json({
      success: true,
      message: "Order deleted successfully",
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete order",
    });
  }
};

// Bulk delete orders
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

    // Check for paid orders that haven't been refunded (unless force is true)
    if (!force) {
      const paidOrders = orders.filter(
        (o) => o.paymentStatus === "paid" && o.fulfillmentStatus !== "refunded"
      );
      
      if (paidOrders.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Cannot delete ${paidOrders.length} paid order(s). Process refunds first or use force=true to override.`,
          paidOrderIds: paidOrders.map((o) => o._id),
        });
      }
    }

    // Delete orders
    const result = await Order.deleteMany({ _id: { $in: orderIds } });

    return res.json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} order(s)`,
      deletedCount: result.deletedCount,
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


