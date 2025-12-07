import Stripe from "stripe";
import { getStripeClient } from "./stripeClient";

type Interval = "month" | "year";

type EnsureStripePriceParams = {
  planId?: string;
  name: string;
  price: number;
  interval: string;
  stripePriceId?: string;
  stripeProductId?: string;
};

const isStripeId = (value: string | undefined, prefix: string) =>
  Boolean(value && value.startsWith(prefix));

const normalizeInterval = (value?: string): Interval =>
  value === "year" ? "year" : "month";

export const ensureStripePriceForPlan = async (params: EnsureStripePriceParams) => {
  const stripe = getStripeClient();

  if (isStripeId(params.stripePriceId, "price_")) {
    try {
      const price = await stripe.prices.retrieve(params.stripePriceId!);
      return {
        stripePriceId: price.id,
        stripeProductId:
          typeof price.product === "string" ? price.product : price.product?.id,
      };
    } catch (err: any) {
      console.warn("Failed to reuse Stripe price", err?.message || err);
    }
  }

  let productId = isStripeId(params.stripeProductId, "prod_")
    ? params.stripeProductId
    : undefined;
  let product: Stripe.Product | null = null;

  if (productId) {
    try {
      product = await stripe.products.retrieve(productId);
    } catch (err: any) {
      console.warn("Failed to reuse Stripe product", err?.message || err);
      product = null;
    }
  }

  if (!product) {
    const metadata = params.planId ? { planId: params.planId } : undefined;
    product = await stripe.products.create({
      name: params.name,
      ...(metadata ? { metadata } : {}),
    });
    productId = product.id;
  }

  const numericPrice = Number(params.price);
  if (!numericPrice || Number.isNaN(numericPrice) || numericPrice <= 0) {
    throw new Error("Price must be greater than zero to create Stripe price.");
  }

  const unitAmount = Math.round(numericPrice * 100);
  const interval = normalizeInterval(params.interval);

  const price = await stripe.prices.create({
    currency: "usd",
    unit_amount: unitAmount,
    recurring: { interval },
    product: productId!,
  });

  return {
    stripePriceId: price.id,
    stripeProductId: productId!,
  };
};


