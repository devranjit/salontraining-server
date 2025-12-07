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
  inheritMethodDefaultCost?: boolean;
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

const hasNumericValue = (value?: number | null): value is number =>
  typeof value === "number" && !Number.isNaN(value);

const isPlaceholderRate = (rate: ShippingRateInput, method: any) => {
  const label = rate.label?.trim().toLowerCase();
  const methodLabel = typeof method.name === "string" ? method.name.trim().toLowerCase() : "";
  const defaultLabel = !label || label === "default" || (methodLabel && label === methodLabel);

  const noZone = !rate.zone;
  const noThresholds =
    !hasNumericValue(rate.minSubtotal) &&
    !hasNumericValue(rate.maxSubtotal) &&
    !hasNumericValue(rate.minDistanceKm) &&
    !hasNumericValue(rate.maxDistanceKm) &&
    !hasNumericValue(rate.freeAbove);
  const noAdjustments =
    !hasNumericValue(rate.perItemCost) &&
    !hasNumericValue(rate.perWeightKgCost) &&
    !hasNumericValue(rate.handlingFee);

  return defaultLabel && noZone && noThresholds && noAdjustments;
};

const normalizeBasic = (value?: string) =>
  typeof value === "string" ? value.trim().toLowerCase() : undefined;

const normalizeAlphanumeric = (value?: string) =>
  typeof value === "string" ? value.replace(/[^a-z0-9]/gi, "").toLowerCase() : undefined;

const normalizePostalCode = (value?: string) => normalizeAlphanumeric(value);

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

// List of accepted US country variations
const US_COUNTRY_VARIANTS = [
  "usa",
  "us",
  "united states",
  "united states of america",
  "america",
];

const US_COUNTRY_VARIANTS_NORMALIZED = new Set(
  US_COUNTRY_VARIANTS.map((entry) => normalizeAlphanumeric(entry)).filter(
    (entry): entry is string => Boolean(entry)
  )
);

const US_STATE_NAME_MAP: Record<string, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
  DC: "District of Columbia",
};

const US_STATE_NORMALIZED_MAP: Record<string, string> = Object.entries(US_STATE_NAME_MAP).reduce(
  (acc, [abbr, name]) => {
    const key = name.replace(/[^a-z]/gi, "").toLowerCase();
    acc[key] = abbr;
    return acc;
  },
  {} as Record<string, string>
);

const normalizeCountryValue = (value?: string) => {
  const normalized = normalizeAlphanumeric(value);
  if (!normalized) return undefined;
  if (US_COUNTRY_VARIANTS_NORMALIZED.has(normalized)) {
    return "us";
  }
  return normalized;
};

const normalizeUSStateValue = (value?: string) => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const alphaOnly = trimmed.replace(/[^a-z]/gi, "").toLowerCase();
  if (!alphaOnly) return undefined;

  if (alphaOnly.length === 2) {
    return alphaOnly.toUpperCase();
  }

  const abbreviation = US_STATE_NORMALIZED_MAP[alphaOnly];
  if (abbreviation) {
    return abbreviation.toUpperCase();
  }

  return trimmed.toLowerCase();
};

const matchList = (
  zoneList?: string[],
  value?: string,
  normalizer: (input?: string) => string | undefined = normalizeBasic
) => {
  if (!zoneList || zoneList.length === 0) return true;
  const normalizedValue = normalizer(value);
  if (!normalizedValue) return false;
  return zoneList.some((entry) => normalizer(entry) === normalizedValue);
};

const matchPrefix = (
  prefixes?: string[],
  value?: string,
  normalizer: (input?: string) => string | undefined = normalizeBasic
) => {
  if (!prefixes || prefixes.length === 0) return true;
  const normalizedValue = normalizer(value);
  if (!normalizedValue) return false;
  return prefixes.some((prefix) => {
    const normalizedPrefix = normalizer(prefix);
    return normalizedPrefix ? normalizedValue.startsWith(normalizedPrefix) : false;
  });
};

function zoneMatches(
  zone: any,
  address?: ShippingAddressInput,
  coordinates?: CoordinatesInput
): { match: boolean; distanceKm?: number } {
  const addr = address || {};

  if (!matchList(zone.countries, addr.country, normalizeCountryValue)) return { match: false };
  if (!matchList(zone.states, addr.state, normalizeUSStateValue)) return { match: false };
  if (!matchList(zone.cities, addr.city, normalizeAlphanumeric)) return { match: false };
  if (!matchList(zone.postalCodes, addr.postalCode, normalizePostalCode)) return { match: false };
  if (!matchPrefix(zone.zipPrefixes, addr.postalCode, normalizePostalCode)) return { match: false };

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

function isUSAddress(country?: string): boolean {
  return normalizeCountryValue(country) === "us";
}

export async function calculateShippingOptions(input: ShippingQuoteInput): Promise<ShippingOption[]> {
  const { cart, address, coordinates } = input;

  if (cart.requiresShipping && !address?.country) {
    throw new Error("Shipping address is required to fetch rates");
  }

  if (!cart.requiresShipping) {
    return [buildDefaultDigitalOption(cart)];
  }

  // Restrict shipping to USA only
  if (!isUSAddress(address?.country)) {
    throw new Error("We currently only ship within the United States. International shipping coming soon!");
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

      const explicitInherit = rate.inheritMethodDefaultCost === true;
      const fallbackInherit =
        // Legacy records (or current blank inputs) rely on the method-level default cost
        rate.inheritMethodDefaultCost === undefined &&
        method.type !== "local_pickup" &&
        rate.type !== "local_pickup" &&
        hasNumericValue(method.defaultCost) &&
        (!hasNumericValue(rate.baseCost) || (rate.baseCost === 0 && isPlaceholderRate(rate, method)));

      const shouldInheritDefaultCost = explicitInherit || fallbackInherit;

      let baseCost = shouldInheritDefaultCost
        ? method.defaultCost || 0
        : hasNumericValue(rate.baseCost)
        ? rate.baseCost
        : method.defaultCost || 0;

      if (hasNumericValue(rate.freeAbove) && cart.subtotal >= rate.freeAbove) {
        baseCost = 0;
      }

      if (typeof rate.minDistanceKm === "number" && distanceKm !== undefined && distanceKm < rate.minDistanceKm) {
        continue;
      }

      if (typeof rate.maxDistanceKm === "number" && distanceKm !== undefined && distanceKm > rate.maxDistanceKm) {
        continue;
      }

      let cost =
        baseCost +
        (hasNumericValue(rate.perItemCost) ? rate.perItemCost : 0) * cart.totalPhysicalItems +
        (hasNumericValue(rate.perWeightKgCost) ? rate.perWeightKgCost : 0) * cart.totalWeightKg +
        (hasNumericValue(rate.handlingFee) ? rate.handlingFee : 0) +
        (hasNumericValue(method.handlingFee) ? method.handlingFee : 0);

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
    if (!methods.length) {
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
    } else {
      return [];
    }
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


