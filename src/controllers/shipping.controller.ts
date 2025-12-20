import { Request, Response } from "express";
import ShippingZone from "../models/ShippingZone";
import ShippingMethod from "../models/ShippingMethod";
import { prepareCartPricing } from "../services/cartPricing.service";
import {
  calculateShippingOptions,
  resolveShippingSelection,
  ShippingAddressInput,
  CoordinatesInput,
  ShippingSelectionInput,
} from "../services/shipping.service";

export const calculateShippingQuote = async (req: Request, res: Response) => {
  try {
    const { items, address, coordinates } = req.body;

    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ success: false, message: "Cart items are required" });
    }

    const cart = await prepareCartPricing(items);
    const options = await calculateShippingOptions({
      cart,
      address,
      coordinates,
    });

    return res.json({
      success: true,
      options,
      summary: {
        subtotal: cart.subtotal,
        requiresShipping: cart.requiresShipping,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to calculate shipping";
    const knownIssues = [
      "One or more products are no longer available",
      "Invalid product selections",
      "Invalid variation selection",
      "Invalid option",
      "Insufficient stock",
    ];
    const isKnown = knownIssues.some((k) => message.toLowerCase().includes(k.toLowerCase()));
    if (!isKnown) {
      console.error("calculateShippingQuote error:", error);
    }
    return res.status(isKnown ? 400 : 500).json({
      success: false,
      message,
    });
  }
};

export const getShippingZones = async (_req: Request, res: Response) => {
  try {
    const zones = await ShippingZone.find().sort({ priority: -1, createdAt: 1 });
    return res.json({ success: true, zones });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to load zones",
    });
  }
};

export const createShippingZone = async (req: Request, res: Response) => {
  try {
    const zone = await ShippingZone.create(req.body);
    return res.json({ success: true, zone });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to create zone",
    });
  }
};

export const updateShippingZone = async (req: Request, res: Response) => {
  try {
    const zone = await ShippingZone.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!zone) {
      return res.status(404).json({ success: false, message: "Zone not found" });
    }
    return res.json({ success: true, zone });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to update zone",
    });
  }
};

export const deleteShippingZone = async (req: Request, res: Response) => {
  try {
    const zone = await ShippingZone.findByIdAndDelete(req.params.id);
    if (!zone) {
      return res.status(404).json({ success: false, message: "Zone not found" });
    }
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to delete zone",
    });
  }
};

export const getShippingMethods = async (_req: Request, res: Response) => {
  try {
    const methods = await ShippingMethod.find().sort({ displayOrder: 1, createdAt: 1 }).populate("rates.zone", "name");
    return res.json({ success: true, methods });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to load methods",
    });
  }
};

export const createShippingMethod = async (req: Request, res: Response) => {
  try {
    const method = await ShippingMethod.create(req.body);
    return res.json({ success: true, method });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to create method",
    });
  }
};

export const updateShippingMethod = async (req: Request, res: Response) => {
  try {
    const method = await ShippingMethod.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!method) {
      return res.status(404).json({ success: false, message: "Method not found" });
    }
    return res.json({ success: true, method });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to update method",
    });
  }
};

export const deleteShippingMethod = async (req: Request, res: Response) => {
  try {
    const method = await ShippingMethod.findByIdAndDelete(req.params.id);
    if (!method) {
      return res.status(404).json({ success: false, message: "Method not found" });
    }
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to delete method",
    });
  }
};

export const validateShippingSelectionController = async (req: Request, res: Response) => {
  try {
    const { items, address, coordinates, selection } = req.body as {
      items: any[];
      address?: ShippingAddressInput;
      coordinates?: CoordinatesInput;
      selection: ShippingSelectionInput;
    };

    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ success: false, message: "Cart items required" });
    }

    const cart = await prepareCartPricing(items);
    const option = await resolveShippingSelection({
      cart,
      address,
      coordinates,
      selection,
    });

    return res.json({ success: true, option });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to validate shipping selection",
    });
  }
};























