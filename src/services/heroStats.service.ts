import { User } from "../models/User";
import { TrainerListing } from "../models/TrainerListing";
import { Event } from "../models/Event";
import { Education } from "../models/Education";

type HeroStatsPayload = {
  users: { total: number };
  trainers: { total: number };
  events: { total: number };
  education: { total: number };
};

const HERO_STATS_TTL_MS = 120 * 1000;

let heroStatsCache: {
  expiresAt: number;
  payload: HeroStatsPayload;
} | null = null;

export async function getHeroBadgeStats(): Promise<HeroStatsPayload> {
  const now = Date.now();
  if (heroStatsCache && heroStatsCache.expiresAt > now) {
    return heroStatsCache.payload;
  }

  // Keep definitions aligned with admin dashboard "total" fields:
  // users.total, trainers.total, events.total, education.total
  const [totalUsers, totalTrainers, totalEvents, totalEducation] = await Promise.all([
    User.countDocuments(),
    TrainerListing.countDocuments(),
    Event.countDocuments(),
    Education.countDocuments(),
  ]);

  const payload: HeroStatsPayload = {
    users: { total: totalUsers },
    trainers: { total: totalTrainers },
    events: { total: totalEvents },
    education: { total: totalEducation },
  };

  heroStatsCache = {
    expiresAt: now + HERO_STATS_TTL_MS,
    payload,
  };

  return payload;
}

