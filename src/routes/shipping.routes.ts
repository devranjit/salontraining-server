import { Router } from "express";
import { protect, managerOrAdmin } from "../middleware/auth";
import {
  calculateShippingQuote,
  createShippingMethod,
  createShippingZone,
  deleteShippingMethod,
  deleteShippingZone,
  getShippingMethods,
  getShippingZones,
  updateShippingMethod,
  updateShippingZone,
} from "../controllers/shipping.controller";

const router = Router();

router.post("/quote", protect, calculateShippingQuote);

router.get("/zones", protect, managerOrAdmin, getShippingZones);
router.post("/zones", protect, managerOrAdmin, createShippingZone);
router.put("/zones/:id", protect, managerOrAdmin, updateShippingZone);
router.delete("/zones/:id", protect, managerOrAdmin, deleteShippingZone);

router.get("/methods", protect, managerOrAdmin, getShippingMethods);
router.post("/methods", protect, managerOrAdmin, createShippingMethod);
router.put("/methods/:id", protect, managerOrAdmin, updateShippingMethod);
router.delete("/methods/:id", protect, managerOrAdmin, deleteShippingMethod);

export default router;













































