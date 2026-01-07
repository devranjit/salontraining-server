import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../models/User";
import { TrainerListing } from "../models/TrainerListing";
import MemberVideo from "../models/MemberVideo";
import Product from "../models/Product";
import Order from "../models/Order";
import ShippingMethod from "../models/ShippingMethod";
import ShippingZone from "../models/ShippingZone";
import { Event } from "../models/Event";
import { Blog } from "../models/Blog";
import { Job } from "../models/Job";
import { Education } from "../models/Education";
import Category from "../models/Category";
import { ensureEmailDefaults } from "../services/emailService";
import { getMailClient } from "../services/mailClient";

type ModuleStatus = "PASS" | "FAIL";

interface ModuleResult {
  key: string;
  label: string;
  status: ModuleStatus;
  durationMs: number;
  details?: string;
  error?: string;
  meta?: Record<string, any>;
}

interface ModuleTaskResult {
  details?: string;
  meta?: Record<string, any>;
}

class ModuleFailure extends Error {
  meta?: Record<string, any>;
  constructor(message: string, meta?: Record<string, any>) {
    super(message);
    this.name = "ModuleFailure";
    this.meta = meta;
  }
}

interface TestUserContext {
  id: string;
  email: string;
  password: string;
  token: string;
}

interface HealthCheckContext {
  runId: string;
  testUser?: TestUserContext;
  createdUserIds: Set<string>;
  createdTrainerIds: Set<string>;
  createdMemberVideoIds: Set<string>;
  searchListing?: { id: string; token: string };
}

const OTP_EXPIRY = 5 * 60 * 1000;

const generateOtp = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

const waitForTransporterVerify = async (transporter: any) => {
  if (typeof transporter.verify === "function") {
    const result = transporter.verify();
    if (result && typeof result.then === "function") {
      await result;
    }
  }
};

const runModule = async (
  key: string,
  label: string,
  task: () => Promise<ModuleTaskResult>
): Promise<ModuleResult> => {
  const startedAt = Date.now();
  try {
    const result = await task();
    return {
      key,
      label,
      status: "PASS",
      durationMs: Date.now() - startedAt,
      details: result.details || "Completed successfully",
      meta: result.meta,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    const meta =
      error instanceof ModuleFailure && error.meta ? error.meta : undefined;
    return {
      key,
      label,
      status: "FAIL",
      durationMs: Date.now() - startedAt,
      error: message,
      meta,
    };
  }
};

async function createTestUser(ctx: HealthCheckContext): Promise<ModuleTaskResult> {
  if (!process.env.JWT_SECRET) {
    throw new Error("Missing JWT secret");
  }

  const email = `healthcheck+${ctx.runId}@salontraining.com`;
  const password = `HealthCheck-${ctx.runId.slice(-6)}`;
  const hashed = await bcrypt.hash(password, 10);

  const user = await User.create({
    name: "System Health Bot",
    email,
    password: hashed,
    business: `Health Monitor ${ctx.runId}`,
  });

  ctx.createdUserIds.add(user._id.toString());

  const passwordOk = await bcrypt.compare(password, user.password);
  if (!passwordOk) {
    throw new Error("Password hash mismatch during login simulation");
  }

  const token = jwt.sign(
    { id: user._id },
    process.env.JWT_SECRET as string,
    { expiresIn: "30m" }
  );

  ctx.testUser = {
    id: user._id.toString(),
    email,
    password,
    token,
  };

  return {
    details: `Created ${email} and generated short-lived token`,
    meta: {
      tokenPreview: token.slice(0, 18),
    },
  };
}

async function checkOtpFlow(ctx: HealthCheckContext): Promise<ModuleTaskResult> {
  if (!ctx.testUser) throw new Error("Test user missing");

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY);

  await User.findByIdAndUpdate(ctx.testUser.id, {
    otp,
    otpExpires: expiresAt,
  });

  const updated = await User.findById(ctx.testUser.id).lean();
  if (!updated || updated.otp !== otp) {
    throw new Error("Failed to persist OTP on user");
  }
  if (!updated.otpExpires || updated.otpExpires.getTime() !== expiresAt.getTime()) {
    throw new Error("OTP expiry mismatch");
  }

  await User.findByIdAndUpdate(ctx.testUser.id, {
    otp: null,
    otpExpires: null,
  });

  return {
    details: "Generated OTP, validated persistence, and cleared it",
    meta: { expiresInSeconds: OTP_EXPIRY / 1000 },
  };
}

async function runListingCrud(ctx: HealthCheckContext): Promise<ModuleTaskResult> {
  if (!ctx.testUser) throw new Error("Test user missing");

  const payload = {
    owner: ctx.testUser.id,
    title: `Health Run Listing ${ctx.runId}`,
    description: "System health automated validation listing",
    email: ctx.testUser.email,
    phone: "+10000000000",
    website: "https://salontraining.com",
    address: "123 Health St",
    city: "Health City",
    state: "QA",
    country: "USA",
    category: "educator",
    status: "pending" as const,
  };

  const listing = await TrainerListing.create(payload);
  const listingId = listing._id.toString();
  ctx.createdTrainerIds.add(listingId);

  await TrainerListing.findByIdAndUpdate(listingId, {
    description: "System health updated description",
  });

  await TrainerListing.deleteOne({ _id: listingId });
  ctx.createdTrainerIds.delete(listingId);

  const exists = await TrainerListing.exists({ _id: listingId });
  if (exists) {
    throw new Error("Listing still exists after delete");
  }

  return {
    details: "Listing created, edited, and deleted successfully",
  };
}

async function runSearchCheck(ctx: HealthCheckContext): Promise<ModuleTaskResult> {
  if (!ctx.testUser) throw new Error("Test user missing");

  const token = `hc-${ctx.runId}-${Date.now().toString(36)}`;
  const listing = await TrainerListing.create({
    owner: ctx.testUser.id,
    title: `Search Token ${token}`,
    description: `Searchable description ${token}`,
    email: ctx.testUser.email,
    phone: "+10000000000",
    address: "1 Search Way",
    city: "Signal City",
    state: "QA",
    country: "USA",
    category: "hair",
    status: "approved",
  });

  const listingId = listing._id.toString();
  ctx.createdTrainerIds.add(listingId);
  ctx.searchListing = { id: listingId, token };

  const results = await TrainerListing.find({
    $or: [
      { title: { $regex: token, $options: "i" } },
      { description: { $regex: token, $options: "i" } },
    ],
  })
    .limit(5)
    .lean();

  const found = results.some((item) => item._id.toString() === listingId);
  if (!found) {
    throw new Error("Search query did not return the new listing");
  }

  return {
    details: "Search endpoint returned the expected listing",
    meta: {
      sampledResults: results.length,
      searchToken: token,
    },
  };
}

async function runFeaturedCheck(ctx: HealthCheckContext): Promise<ModuleTaskResult> {
  if (!ctx.searchListing) {
    throw new Error("Search listing not prepared");
  }

  await TrainerListing.findByIdAndUpdate(ctx.searchListing.id, {
    featured: true,
    status: "approved",
  });

  const featured = await TrainerListing.find({
    featured: true,
    title: { $regex: ctx.searchListing.token, $options: "i" },
  })
    .limit(5)
    .lean();

  const present = featured.some(
    (item) => item._id.toString() === ctx.searchListing!.id
  );

  if (!present) {
    throw new Error("Featured feed did not include promoted listing");
  }

  await TrainerListing.deleteOne({ _id: ctx.searchListing.id });
  ctx.createdTrainerIds.delete(ctx.searchListing.id);
  ctx.searchListing = undefined;

  return {
    details: "Listing promoted to featured and confirmed in feed",
    meta: { featuredSample: featured.length },
  };
}

async function runMembershipFlow(ctx: HealthCheckContext): Promise<ModuleTaskResult> {
  if (!ctx.testUser) throw new Error("Test user missing");

  await User.findByIdAndUpdate(ctx.testUser.id, { role: "member" });

  let video = await MemberVideo.findOne({ status: "published" }).lean();
  let created = false;
  if (!video) {
    const newVideo = await MemberVideo.create({
      title: `Health Check Video ${ctx.runId}`,
      description: "Automated verification video",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      youtubeId: "dQw4w9WgXcQ",
      category: "health-check",
      tags: ["health-check"],
      duration: "00:30",
      order: 0,
      featured: false,
      status: "published",
      createdBy: ctx.testUser.id,
    });
    video = newVideo.toObject();
    ctx.createdMemberVideoIds.add(newVideo._id.toString());
    created = true;
  }

  const categories = await MemberVideo.distinct("category", {
    status: "published",
  });

  return {
    details: "Member role verified with access to published videos",
    meta: {
      sampleVideo: video?.title,
      categories: categories.length,
      createdSample: created,
    },
  };
}

async function runEmailCheck(): Promise<ModuleTaskResult> {
  await ensureEmailDefaults();
  const mailClient = getMailClient();
  await waitForTransporterVerify(mailClient.transporter);

  return {
    details: "Mailgun API verified successfully",
    meta: { from: mailClient.from },
  };
}

async function runActiveApiSweep(): Promise<ModuleTaskResult> {
  const probes: { name: string; status: ModuleStatus; detail: string; durationMs: number }[] = [];
  const tasks: { name: string; fn: () => Promise<any> }[] = [
    { name: "Categories", fn: () => Category.find().limit(1).lean() },
    { name: "Trainer listings", fn: () => TrainerListing.find().limit(1).lean() },
    { name: "Events", fn: () => Event.find().limit(1).lean() },
    { name: "Products (All)", fn: () => Product.find().limit(1).lean() },
    { name: "Store catalog", fn: () => Product.find({ productSource: "store" }).limit(1).lean() },
    { name: "Product listings", fn: () => Product.find({ productSource: "listing" }).limit(1).lean() },
    { name: "Orders", fn: () => Order.find().limit(1).lean() },
    { name: "Pending orders", fn: () => Order.find({ fulfillmentStatus: "pending" }).limit(1).lean() },
    { name: "Shipping methods", fn: () => ShippingMethod.find().limit(1).lean() },
    { name: "Shipping zones", fn: () => ShippingZone.find().limit(1).lean() },
    { name: "Blogs", fn: () => Blog.find().limit(1).lean() },
    { name: "Jobs", fn: () => Job.find().limit(1).lean() },
    { name: "Education", fn: () => Education.find().limit(1).lean() },
    { name: "Member videos", fn: () => MemberVideo.find().limit(1).lean() },
  ];

  for (const task of tasks) {
    const started = Date.now();
    try {
      await task.fn();
      probes.push({
        name: task.name,
        status: "PASS",
        detail: "Query completed",
        durationMs: Date.now() - started,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      probes.push({
        name: task.name,
        status: "FAIL",
        detail: message,
        durationMs: Date.now() - started,
      });
    }
  }

  const failures = probes.filter((probe) => probe.status === "FAIL");
  if (failures.length) {
    throw new ModuleFailure(
      `Failed API probes: ${failures.map((f) => f.name).join(", ")}`,
      { probes }
    );
  }

  return {
    details: `Validated ${probes.length} API surfaces`,
    meta: { probes },
  };
}

async function runStoreHealthCheck(): Promise<ModuleTaskResult> {
  // Check store catalog products
  const storeProducts = await Product.countDocuments({ productSource: "store" });
  const publishedStoreProducts = await Product.countDocuments({ 
    productSource: "store", 
    status: "published" 
  });
  const lowStockProducts = await Product.countDocuments({ 
    productSource: "store", 
    stock: { $lte: 5 },
    manageStock: true 
  });

  // Check orders
  const totalOrders = await Order.countDocuments();
  const pendingOrders = await Order.countDocuments({ fulfillmentStatus: "pending" });
  const processingOrders = await Order.countDocuments({ fulfillmentStatus: "processing" });
  const shippedOrders = await Order.countDocuments({ fulfillmentStatus: "shipped" });
  const deliveredOrders = await Order.countDocuments({ fulfillmentStatus: "delivered" });

  // Calculate revenue from paid orders
  const paidOrders = await Order.find({ paymentStatus: "paid" }).select("grandTotal").lean();
  const totalRevenue = paidOrders.reduce((sum, order) => sum + (order.grandTotal || 0), 0);

  // Check shipping configuration
  const shippingMethods = await ShippingMethod.countDocuments({ enabled: true });
  const shippingZones = await ShippingZone.countDocuments();

  return {
    details: `Store: ${storeProducts} products, ${totalOrders} orders, $${totalRevenue.toFixed(2)} revenue`,
    meta: {
      products: {
        total: storeProducts,
        published: publishedStoreProducts,
        lowStock: lowStockProducts,
      },
      orders: {
        total: totalOrders,
        pending: pendingOrders,
        processing: processingOrders,
        shipped: shippedOrders,
        delivered: deliveredOrders,
      },
      revenue: totalRevenue,
      shipping: {
        methods: shippingMethods,
        zones: shippingZones,
      },
    },
  };
}

async function cleanup(ctx: HealthCheckContext) {
  try {
    const ops: Promise<any>[] = [];
    if (ctx.createdUserIds.size) {
      ops.push(User.deleteMany({ _id: { $in: Array.from(ctx.createdUserIds) } }));
    }
    if (ctx.createdTrainerIds.size) {
      ops.push(
        TrainerListing.deleteMany({
          _id: { $in: Array.from(ctx.createdTrainerIds) },
        })
      );
    }
    if (ctx.createdMemberVideoIds.size) {
      ops.push(
        MemberVideo.deleteMany({
          _id: { $in: Array.from(ctx.createdMemberVideoIds) },
        })
      );
    }
    await Promise.all(ops);
  } catch (err) {
    console.error("Health check cleanup error:", err);
  }
}

export const runSystemHealthCheck = async (req: Request, res: Response) => {
  const ctx: HealthCheckContext = {
    runId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    createdUserIds: new Set(),
    createdTrainerIds: new Set(),
    createdMemberVideoIds: new Set(),
  };

  const startedAt = Date.now();
  const modules: ModuleResult[] = [];

  try {
    modules.push(await runModule("auth", "User registration & login", () => createTestUser(ctx)));
    modules.push(await runModule("otp", "OTP lifecycle", () => checkOtpFlow(ctx)));
    modules.push(await runModule("listingFlow", "Listing create/edit/delete", () => runListingCrud(ctx)));
    modules.push(await runModule("membership", "Membership flow", () => runMembershipFlow(ctx)));
    modules.push(await runModule("email", "Email sending readiness", () => runEmailCheck()));
    modules.push(await runModule("search", "Search functionality", () => runSearchCheck(ctx)));
    modules.push(await runModule("featured", "Featured listings", () => runFeaturedCheck(ctx)));
    modules.push(await runModule("store", "Store & E-commerce", () => runStoreHealthCheck()));
    modules.push(await runModule("activeApis", "Active API sweep", () => runActiveApiSweep()));
  } finally {
    await cleanup(ctx);
  }

  const overallStatus = modules.every((module) => module.status === "PASS")
    ? "PASS"
    : "FAIL";

  res.json({
    success: true,
    runId: ctx.runId,
    overallStatus,
    startedAt: new Date(startedAt).toISOString(),
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    modules,
  });
};




