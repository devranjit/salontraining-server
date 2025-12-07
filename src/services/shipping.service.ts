import mongoose from "mongoose";
import ShippingZone from "../models/ShippingZone";
import ShippingMethod from "../models/ShippingMethod";
import { CartPricingSummary } from "./cartPricing.service";

type ShippingRateInput = {
  _id?: mongoose.Types.ObjectId | string;
  label: string;
  code?: string;
  zone?: mongoose.Types.ObjectId | string;
  type?: string;
  baseCost?: number;
  perItemCost?: number;
  perWeightKgCost?: number;
  handlingFee?: number;
  minSubtotal?: number;
  maxSubtotal?: number;
  freeAbove?: number;
  minDistanceKm?: number;
  maxDistanceKm?: number;
  enableForDigital?: boolean;
  allowPickup?: boolean;
};

export interface ShippingAddressInput {
  fullName?: string;
  line1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface CoordinatesInput {
  lat?: number;
  lng?: number;
}

export interface ShippingQuoteInput {
  cart: CartPricingSummary;
  address?: ShippingAddressInput;
  coordinates?: CoordinatesInput;
}

export interface ShippingOption {
  optionId: string;
  methodId: string;
  rateId?: string;
  label: string;
  description?: string;
  cost: number;
  currency: string;
  type: string;
  methodName: string;
  estimatedDays?: { min?: number; max?: number };
  zone?: { id: string; name: string };
  metadata?: Record<string, any>;
}

export interface ShippingSelectionInput {
  optionId?: string;
  methodId: string;
  rateId?: string;
}

const toNumberOrUndefined = (value?: number | null) =>
  typeof value === "number" && !Number.isNaN(value) ? value : undefined;

const haversineDistanceKm = (a: CoordinatesInput, b: CoordinatesInput) => {
  if (
    typeof a.lat !== "number" ||
    typeof a.lng !== "number" ||
    typeof b.lat !== "number" ||
    typeof b.lng !== "number"
  ) {
    return undefined;
  }

  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371; // Earth radius km
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const c =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const d = 2 * Math.atan2(Math.sqrt(c), Math.sqrt(1 - c));
  return R * d;
};

function zoneMatches(
  zone: any,
  address?: ShippingAddressInput,
  coordinates?: CoordinatesInput
): { match: boolean; distanceKm?: number } {
  const addr = address || {};

  const matchList = (zoneList?: string[], value?: string) => {
    if (!zoneList || zoneList.length === 0) return true;
    if (!value) return false;
    return zoneList.map((entry) => entry.toLowerCase()).includes(value.toLowerCase());
  };

  const matchPrefix = (prefixes?: string[], value?: string) => {
    if (!prefixes || prefixes.length === 0) return true;
    if (!value) return false;
    return prefixes.some((prefix) => value.toLowerCase().startsWith(prefix.toLowerCase()));
  };

  if (!matchList(zone.countries, addr.country)) return { match: false };
  if (!matchList(zone.states, addr.state)) return { match: false };
  if (!matchList(zone.cities, addr.city)) return { match: false };
  if (!matchList(zone.postalCodes, addr.postalCode)) return { match: false };
  if (!matchPrefix(zone.zipPrefixes, addr.postalCode)) return { match: false };

  if (zone.geoFence?.center && zone.geoFence?.radiusKm) {
    if (!coordinates || typeof coordinates.lat !== "number" || typeof coordinates.lng !== "number") {
      return { match: false };
    }
    const distanceKm = haversineDistanceKm(
      { lat: zone.geoFence.center.lat, lng: zone.geoFence.center.lng },
      coordinates
    );
    if (distanceKm === undefined || distanceKm > zone.geoFence.radiusKm) {
      return { match: false };
    }
    return { match: true, distanceKm };
  }

  return { match: true };
}

function buildDefaultDigitalOption(cart: CartPricingSummary): ShippingOption {
  return {
    optionId: "digital:auto",
    methodId: "digital",
    label: cart.requiresShipping ? "Pickup / Arrange Later" : "Instant Delivery",
    methodName: cart.requiresShipping ? "Pickup" : "Digital Delivery",
    cost: 0,
    currency: "USD",
    type: cart.requiresShipping ? "local_pickup" : "digital",
    description: cart.requiresShipping
      ? "No carrier selected yet. The seller will coordinate fulfillment."
      : "Digital items are delivered instantly after payment.",
  };
}

export async function calculateShippingOptions(input: ShippingQuoteInput): Promise<ShippingOption[]> {
  const { cart, address, coordinates } = input;

  if (cart.requiresShipping && !address?.country) {
    throw new Error("Shipping address is required to fetch rates");
  }

  if (!cart.requiresShipping) {
    return [buildDefaultDigitalOption(cart)];
  }

  const zones = await ShippingZone.find().sort({ priority: -1, createdAt: 1 }).lean();
  const methods = await ShippingMethod.find({ status: "active" })
    .sort({ displayOrder: 1, createdAt: 1 })
    .lean();

  const matchedZones = zones
    .map((zone) => ({
      zone,
      ...zoneMatches(zone, address, coordinates),
    }))
    .filter((entry) => entry.match)
    .sort((a, b) => b.zone.priority - a.zone.priority);

  const defaultZones = zones.filter((zone) => zone.isDefault);
  const matchedZoneMap = new Map<string, { distanceKm?: number }>();
  matchedZones.forEach((entry) => matchedZoneMap.set(entry.zone._id.toString(), { distanceKm: entry.distanceKm }));

  const options: ShippingOption[] = [];

  for (const method of methods) {
    if (!method.allowPhysicalProducts) continue;

    const methodRates: ShippingRateInput[] =
      method.rates && method.rates.length > 0
        ? method.rates.map((rate: any) => (typeof rate.toObject === "function" ? rate.toObject() : rate))
        : [];

    const rates: ShippingRateInput[] =
      methodRates.length > 0
        ? methodRates
        : [
            {
              _id: undefined,
              label: method.name,
              type: method.type === "local_pickup" ? "local_pickup" : "flat",
              baseCost: method.defaultCost || 0,
              perItemCost: 0,
              perWeightKgCost: 0,
              handlingFee: 0,
              allowPickup: method.type === "local_pickup",
              enableForDigital: method.allowDigitalProducts,
              minSubtotal: undefined,
              maxSubtotal: undefined,
              freeAbove: undefined,
              minDistanceKm: undefined,
              maxDistanceKm: undefined,
              zone: undefined,
            },
          ];

    for (const r of rates) {
      const rate = r as ShippingRateInput;
      const zoneId = rate.zone ? rate.zone.toString() : undefined;
      let zoneInfo: { id: string; name: string } | undefined;
      let distanceKm: number | undefined;
      if (zoneId) {
        if (matchedZoneMap.has(zoneId)) {
          const meta = matchedZoneMap.get(zoneId);
          distanceKm = meta?.distanceKm;
          const zone = zones.find((z) => z._id.toString() === zoneId);
          if (zone) {
            zoneInfo = { id: zone._id.toString(), name: zone.name };
          }
        } else {
          // fallback to default zone match?
          const defaultZone = defaultZones.find((z) => z._id.toString() === zoneId);
          if (defaultZone) {
            zoneInfo = { id: defaultZone._id.toString(), name: defaultZone.name };
          } else {
            continue;
          }
        }
      }

      if (typeof rate.minSubtotal === "number" && cart.subtotal < rate.minSubtotal) continue;
      if (typeof rate.maxSubtotal === "number" && cart.subtotal > rate.maxSubtotal) continue;

      if (typeof rate.freeAbove === "number" && cart.subtotal >= rate.freeAbove) {
        rate.baseCost = 0;
      }

      if (typeof rate.minDistanceKm === "number" && distanceKm !== undefined && distanceKm < rate.minDistanceKm) {
        continue;
      }

      if (typeof rate.maxDistanceKm === "number" && distanceKm !== undefined && distanceKm > rate.maxDistanceKm) {
        continue;
      }

      let cost =
        (typeof rate.baseCost === "number" ? rate.baseCost : method.defaultCost || 0) +
        (rate.perItemCost || 0) * cart.totalPhysicalItems +
        (rate.perWeightKgCost || 0) * cart.totalWeightKg +
        (rate.handlingFee || 0) +
        (method.handlingFee || 0);

      if (cost < 0) cost = 0;

      const estimatedDays = {
        min: toNumberOrUndefined(method.estimatedDaysMin),
        max: toNumberOrUndefined(method.estimatedDaysMax),
      };

      options.push({
        optionId: `${method._id.toString()}:${rate._id ? rate._id.toString() : "base"}`,
        methodId: method._id.toString(),
        rateId: rate._id ? rate._id.toString() : undefined,
        label: rate.label || method.name,
        description: method.description,
        cost: Number(cost.toFixed(2)),
        currency: method.currency || "USD",
        type: rate.type || method.type,
        methodName: method.name,
        estimatedDays,
        zone: zoneInfo,
        metadata: {
          distanceKm,
          type: rate.type || method.type,
        },
      });
    }
  }

  if (!options.length) {
    options.push({
      optionId: "fallback:standard",
      methodId: "fallback",
      label: "Standard Shipping",
      methodName: "Standard Shipping",
      description: "Default fallback rate",
      cost: 12,
      currency: "USD",
      type: "flat",
    });
  }

  return options.sort((a, b) => a.cost - b.cost);
}

export async function resolveShippingSelection(
  input: ShippingQuoteInput & { selection: ShippingSelectionInput }
): Promise<ShippingOption> {
  const { selection } = input;
  if (!selection?.methodId) {
    throw new Error("Shipping method selection required");
  }

  const options = await calculateShippingOptions(input);
  const match = options.find((option) => {
    if (selection.optionId) {
      return option.optionId === selection.optionId;
    }
    if (selection.rateId) {
      return option.methodId === selection.methodId && option.rateId === selection.rateId;
    }
    return option.methodId === selection.methodId;
  });

  if (!match) {
    throw new Error("Selected shipping option is no longer available. Please refresh rates.");
  }

  return match;
}


