import { Request, Response } from "express";
import AnalyticsSnapshot from "../models/AnalyticsSnapshot";
import { Listing } from "../models/Listing";

const DEFAULT_SUMMARY = {
  visitors: 14820,
  uniqueVisitors: 9820,
  topLocations: [
    { label: "New York", value: 4200 },
    { label: "Los Angeles", value: 3100 },
    { label: "Chicago", value: 1800 },
    { label: "Miami", value: 1500 },
  ],
  topPages: [
    { label: "/trainers", value: 4200 },
    { label: "/events", value: 2800 },
    { label: "/jobs", value: 1800 },
    { label: "/education", value: 1500 },
  ],
  trafficSources: [
    { label: "Organic", value: 52 },
    { label: "Direct", value: 28 },
    { label: "Social", value: 12 },
    { label: "Referral", value: 8 },
  ],
  devices: [
    { label: "Mobile", value: 62 },
    { label: "Desktop", value: 32 },
    { label: "Tablet", value: 6 },
  ],
  seoScore: 84,
  seoNotes: "High technical health. Focus on long-tail classes & job keywords for next sprint.",
  listingsCreated: 0,
  listingsApproved: 0,
  listingsRejected: 0,
};

export const getAnalyticsSummary = async (req: Request, res: Response) => {
  try {
    const latest = await AnalyticsSnapshot.findOne().sort({ date: -1 }).lean();
    const snapshots = await AnalyticsSnapshot.find().sort({ date: -1 }).limit(7).lean();

    const weekly = snapshots.length
      ? snapshots
          .reverse()
          .map((snap) => ({
            date: snap.date,
            visitors: snap.visitors,
            listingsCreated: snap.listingsCreated,
          }))
      : await buildWeeklyListingStats();

    const summary =
      latest || {
        ...DEFAULT_SUMMARY,
        listingsCreated: weekly.reduce((sum, day) => sum + (day.listingsCreated || 0), 0),
        listingsApproved: await Listing.countDocuments({ status: "approved" }),
        listingsRejected: await Listing.countDocuments({ status: "rejected" }),
      };

    res.json({
      success: true,
      summary,
      weekly,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err?.message || "Failed to load analytics",
    });
  }
};

async function buildWeeklyListingStats() {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);

  const listingAgg = await Listing.aggregate([
    {
      $match: {
        createdAt: { $gte: start },
      },
    },
    {
      $project: {
        day: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
      },
    },
    {
      $group: {
        _id: "$day",
        count: { $sum: 1 },
      },
    },
  ]);

  const map = listingAgg.reduce<Record<string, number>>((acc, doc) => {
    acc[doc._id] = doc.count;
    return acc;
  }, {});

  const days: { date: string; listingsCreated: number }[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const day = new Date(end);
    day.setDate(end.getDate() - i);
    const key = day.toISOString().slice(0, 10);
    days.push({
      date: day.toISOString(),
      listingsCreated: map[key] || 0,
    });
  }

  return days;
}

