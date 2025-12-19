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

export interface GroupedProductSelection {
  product: mongoose.Types.ObjectId;
  name?: string;
  quantity: number;
  price?: number;
  salePrice?: number;
  productFormat?: string;
  image?: string;
}

export interface BundleGroupItemSelection extends GroupedProductSelection {
  optional?: boolean;
  discountPercent?: number;
}

export interface BundleGroupSelection {
  name?: string;
  pricingMode?: string;
  discountPercent?: number;
  items: BundleGroupItemSelection[];
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
  variationSummary?: string;
  groupedProducts?: GroupedProductSelection[];
  bundleGroups?: BundleGroupSelection[];
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
  })
    .populate("groupedProducts.product", "name slug price salePrice productFormat weight images owner")
    .populate("bundleGroups.items.product", "name slug price salePrice productFormat weight images owner")
    .lean();

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

    const variationSummary =
      normalizedSelections.length > 0
        ? normalizedSelections.map((v) => `${v.label}: ${v.optionName}`).join(" / ")
        : undefined;

    const isBundle = product.productStructure === "bundle";
    const isGrouped = product.productStructure === "grouped";

    // Compute bundle price when bundleGroups exist; otherwise use base+variations
    const computeGroupTotal = (items: any[], mode: string, groupDiscount: number) => {
      const subtotal = items.reduce((sum, item) => {
        const prod = item.product || {};
        const base = Number(prod.salePrice ?? prod.price ?? 0);
        const itemDisc = Number(item.discountPercent ?? 0);
        const qty = Number(item.quantity ?? 0);
        let price = base * (1 - itemDisc / 100);
        if (mode === "discounted") {
          price = price * (1 - Number(groupDiscount ?? 0) / 100);
        }
        return sum + price * qty;
      }, 0);
      return subtotal;
    };

    // Snapshot grouped/bundle composition for the order
    let groupedProductsSnapshot: GroupedProductSelection[] | undefined;
    let bundleGroupsSnapshot: BundleGroupSelection[] | undefined;

    let unitPrice: number;
    if (isBundle && Array.isArray(product.bundleGroups) && product.bundleGroups.length > 0) {
      const groupTotals = product.bundleGroups.map((g: any) =>
        computeGroupTotal(
          g.items || [],
          g.pricingMode || product.bundlePricingMode || "calculated",
          g.discountPercent || 0
        )
      );
      const aggregate = groupTotals.reduce((a, b) => a + b, 0);
      // Snapshot for order display
      bundleGroupsSnapshot = product.bundleGroups.map((g: any, idx: number) => ({
        name: g.name,
        pricingMode: g.pricingMode || product.bundlePricingMode || "calculated",
        discountPercent: g.discountPercent,
        items: (g.items || []).map((it: any) => {
          const prod = it.product || {};
          return {
            product: prod._id,
            name: prod.name,
            quantity: it.quantity ?? 1,
            price: prod.price,
            salePrice: prod.salePrice,
            productFormat: prod.productFormat,
            image: prod.images?.[0]?.url,
            optional: it.optional,
            discountPercent: it.discountPercent,
          };
        }),
      }));

      // If top-level bundlePricingMode is discounted, apply bundleDiscount; if fixed and price > 0, prefer that
      const topMode = product.bundlePricingMode || "calculated";
      if (topMode === "fixed" && product.price > 0) {
        unitPrice = Number(product.price);
      } else if (topMode === "discounted" && product.bundleDiscount) {
        unitPrice = Number(aggregate * (1 - Number(product.bundleDiscount || 0) / 100));
      } else {
        unitPrice = Number(aggregate);
      }
    } else if (isGrouped && Array.isArray(product.groupedProducts) && product.groupedProducts.length > 0) {
      // Grouped products: price is sum of child products with sale/price applied
      groupedProductsSnapshot = product.groupedProducts.map((g: any) => {
        const prod = g.product || {};
        const base = Number(prod.salePrice ?? prod.price ?? 0);
        return {
          product: prod._id,
          name: prod.name,
          quantity: g.quantity ?? 1,
          price: prod.price,
          salePrice: prod.salePrice,
          productFormat: prod.productFormat,
          image: prod.images?.[0]?.url,
        } as GroupedProductSelection;
      });
      const groupedTotal = groupedProductsSnapshot.reduce(
        (sum, gp) => sum + (Number(gp.salePrice ?? gp.price ?? 0) * (gp.quantity ?? 1)),
        0
      );
      unitPrice = Number(groupedTotal);
    } else {
      const basePrice =
        product.salePrice && product.salePrice < product.price ? product.salePrice : product.price;
      unitPrice = Number((basePrice + variationExtra).toFixed(2));
    }

    unitPrice = Number(unitPrice.toFixed(2));
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
      variationSummary,
      groupedProducts: groupedProductsSnapshot,
      bundleGroups: bundleGroupsSnapshot,
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













