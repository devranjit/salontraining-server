import type { Request, Response, NextFunction } from "express";
import { normalizeUrlFieldsDeep } from "../utils/httpUrl";

function shouldSkip(req: Request): boolean {
  const path = req.originalUrl || "";
  // Stripe webhooks require raw body signature verification.
  if (path.startsWith("/api/memberships/stripe/webhook")) return true;
  if (path.startsWith("/api/store-checkout/webhook")) return true;
  return false;
}

/**
 * Global safety layer:
 * - Normalizes URL-like fields anywhere in req.body before controllers save them.
 * - Does not change DB structure; only normalizes strings.
 */
export function normalizeUrls(req: Request, _res: Response, next: NextFunction) {
  if (shouldSkip(req)) return next();

  const body = (req as any).body;
  if (!body || typeof body !== "object") return next();

  try {
    (req as any).body = normalizeUrlFieldsDeep(body);
    next();
  } catch (err) {
    next(err);
  }
}

