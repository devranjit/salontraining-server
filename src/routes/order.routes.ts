import { Router } from "express";
import { protect, managerOrAdmin } from "../middleware/auth";
import {
  createOrder,
  getMyOrders,
  getOrderById,
  requestRefund,
  getAdminOrders,
  adminGetOrder,
  adminUpdateOrderStatus,
  adminAddShippingEvent,
  adminProcessRefund,
} from "../controllers/order.controller";

const router = Router();

// Customer routes
router.post("/", protect, createOrder);
router.get("/my", protect, getMyOrders);

// Admin / manager routes
router.get("/admin/list", protect, managerOrAdmin, getAdminOrders);
router.get("/admin/:id", protect, managerOrAdmin, adminGetOrder);
router.patch("/admin/:id/status", protect, managerOrAdmin, adminUpdateOrderStatus);
router.post("/admin/:id/shipping-event", protect, managerOrAdmin, adminAddShippingEvent);
router.patch("/admin/:id/refund", protect, managerOrAdmin, adminProcessRefund);

// Customer routes that rely on :id must be last
router.post("/:id/refund-request", protect, requestRefund);
router.get("/:id", protect, getOrderById);

export default router;


