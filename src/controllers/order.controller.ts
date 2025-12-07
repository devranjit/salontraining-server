import { Request, Response } from "express";
import mongoose from "mongoose";
import Order from "../models/Order";
import Product from "../models/Product";
import { prepareCartPricing } from "../services/cartPricing.service";
import { resolveShippingSelection } from "../services/shipping.service";

type AuthRequest = Request & { user?: any };

const PAYMENT_STATUSES = ["pending", "awaiting_payment", "paid", "failed", "refunded", "partial"] as const;
const FULFILLMENT_STATUSES = ["pending", "processing", "ready_to_ship", "shipped", "delivered", "cancelled", "refunded"] as const;
const SHIPPING_STATUSES = ["not_required", "pending", "label_created", "in_transit", "delivered", "returned", "cancelled"] as const;
const isValidObjectId = (value: string) => mongoose.Types.ObjectId.isValid(value);

const ensureAuth = (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, message: "Authentication required" });
    return false;
  }
  return true;
};

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


