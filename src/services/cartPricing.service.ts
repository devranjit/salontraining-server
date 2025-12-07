import mongoose from "mongoose";
import Product from "../models/Product";

export interface VariationSelectionInput {
  label: string;
  optionId?: string;
  optionName?: string;
}

export interface CartItemInput {
  productId: string;
  quantity: number;
  selectedOptions?: VariationSelectionInput[];
}

export interface NormalizedCartItem {
  product: mongoose.Types.ObjectId;
  owner: mongoose.Types.ObjectId;
  name: string;
  slug?: string;
  sku?: string;
  image?: string;
  productType?: string;
  productFormat: "physical" | "digital";
  quantity: number;
  unitPrice: number;
  subtotal: number;
  selectedVariations?: Array<{ label: string; optionName: string; priceAdjustment: number }>;
  downloadUrl?: string;
  weightKg?: number;
}

export interface StockAdjustment {
  productId: mongoose.Types.ObjectId;
  decrementStock: number;
  incrementSales: number;
}

export interface CartPricingSummary {
  normalizedItems: NormalizedCartItem[];
  subtotal: number;
  requiresShipping: boolean;
  totalPhysicalItems: number;
  totalWeightKg: number;
  stockAdjustments: StockAdjustment[];
}

const isValidObjectId = (value?: string) => !!(value && mongoose.Types.ObjectId.isValid(value));

export async function prepareCartPricing(items: CartItemInput[]): Promise<CartPricingSummary> {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Cart items are required");
  }

  const productIds = items
    .map((item) => item?.productId)
    .filter((id): id is string => Boolean(id && isValidObjectId(id)));

  if (!productIds.length) {
    throw new Error("Invalid product selections");
  }

  const products = await Product.find({
    _id: { $in: productIds },
    status: { $in: ["approved", "published"] },
  }).lean();

  const normalizedItems: NormalizedCartItem[] = [];
  const stockAdjustments: StockAdjustment[] = [];
  let subtotal = 0;
  let requiresShipping = false;
  let totalPhysicalItems = 0;
  let totalWeightKg = 0;

  for (const cartItem of items) {
    const product = products.find((p) => p._id.toString() === cartItem.productId);
    if (!product) {
      throw new Error("One or more products are no longer available");
    }

    const quantity = Math.max(1, Math.min(Number(cartItem.quantity) || 1, 99));

    if (product.productFormat !== "digital") {
      requiresShipping = true;
      totalPhysicalItems += quantity;
      if (product.stock < quantity) {
        throw new Error(`Insufficient stock for ${product.name}`);
      }
    }

    const selectedOptions = Array.isArray(cartItem.selectedOptions) ? cartItem.selectedOptions : [];
    let variationExtra = 0;
    const normalizedSelections: Array<{ label: string; optionName: string; priceAdjustment: number }> = [];

    for (const selection of selectedOptions) {
      const variation = product.variations?.find((v: any) => v.label === selection.label);
      if (!variation) {
        throw new Error(`Invalid variation selection for ${product.name}`);
      }
      const option = variation.options?.find((opt: any) =>
        selection.optionId ? opt._id?.toString() === selection.optionId : opt.name === selection.optionName
      );
      if (!option) {
        throw new Error(`Invalid option for ${variation.label}`);
      }
      variationExtra += option.price || 0;
      normalizedSelections.push({
        label: variation.label,
        optionName: option.name,
        priceAdjustment: option.price || 0,
      });
    }

    const basePrice =
      product.salePrice && product.salePrice < product.price ? product.salePrice : product.price;
    const unitPrice = Number((basePrice + variationExtra).toFixed(2));
    const itemSubtotal = Number((unitPrice * quantity).toFixed(2));
    subtotal += itemSubtotal;

    const weightKg = product.weight ? Number(product.weight) / 1000 : 0;
    if (weightKg > 0 && product.productFormat !== "digital") {
      totalWeightKg += weightKg * quantity;
    }

    normalizedItems.push({
      product: product._id as mongoose.Types.ObjectId,
      owner: product.owner,
      name: product.name,
      slug: product.slug,
      sku: product.sku,
      image: product.images?.[0]?.url,
      productType: product.productType,
      productFormat: product.productFormat || "physical",
      quantity,
      unitPrice,
      subtotal: itemSubtotal,
      selectedVariations: normalizedSelections,
      downloadUrl: product.productFormat === "digital" ? product.downloadUrl : undefined,
      weightKg,
    });

    stockAdjustments.push({
      productId: product._id as mongoose.Types.ObjectId,
      decrementStock: product.productFormat === "digital" ? 0 : quantity,
      incrementSales: quantity,
    });
  }

  return {
    normalizedItems,
    subtotal: Number(subtotal.toFixed(2)),
    requiresShipping,
    totalPhysicalItems,
    totalWeightKg: Number(totalWeightKg.toFixed(3)),
    stockAdjustments,
  };
}




