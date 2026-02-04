/**
 * Normalize user-entered web URLs so users don't need to type http/https.
 *
 * Rules:
 * - If already starts with http:// or https:// -> keep (trimmed)
 * - If starts with // -> prepend https:
 * - If it looks like a domain/host but has no protocol -> prepend https://
 * - Otherwise leave as-is (e.g., "@handle", "username")
 */
export function normalizeHttpUrl(input: string): string {
  const v = (input ?? "").trim();
  if (!v) return v;
  if (/^https?:\/\//i.test(v)) return v;
  if (/^\/\//.test(v)) return `https:${v}`;
  // If user typed some other scheme (e.g. ftp://), leave it unchanged.
  if (/^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//.test(v)) return v;
  // Leave non-web values alone (handles, relative paths, etc.)
  if (!looksLikeWebAddress(v)) return v;
  return `https://${v}`;
}

function looksLikeWebAddress(v: string): boolean {
  if (!v) return false;
  if (/\s/.test(v)) return false;
  if (v.startsWith("@")) return false;
  if (v.startsWith("#")) return false;
  if (v.startsWith("/")) return false;
  if (/^mailto:/i.test(v)) return false;
  if (/^tel:/i.test(v)) return false;

  // localhost (dev), IPv4, or anything containing a dot (domain / shortener).
  if (/^localhost(?::\d+)?(\/|$)/i.test(v)) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}(?::\d+)?(\/|$)/.test(v)) return true;
  if (v.includes(".")) return true;

  return false;
}

const URL_KEY_EXACT = new Set([
  // Common website/social keys
  "website",
  "facebook",
  "instagram",
  "twitter",
  "linkedin",
  "tiktok",
  "youtube",
  // App-specific keys seen in schemas
  "applyurl",
  "videourl",
  "ticketurl",
  "registrationurl",
  "zoomlink",
  "websiteurl",
  "listingurl",
  "applepodcasturl",
  "spotifyurl",
  "podcastlink",
  "downloadurl",
  "externalurl",
  "shopurl",
  "youtubeurl",
  "invoiceurl",
  "invoicepdf",
  // Education resource links
  "resource1",
  "resource2",
]);

function isLikelyUrlKey(key: string): boolean {
  const k = (key || "").toLowerCase();
  if (!k) return false;
  if (URL_KEY_EXACT.has(k)) return true;
  if (k === "url") return true;
  if (k.endsWith("url")) return true;
  if (k.endsWith("link")) return true; // e.g. zoomLink, ticketLink
  return false;
}

type UnknownRecord = Record<string, unknown>;

export function normalizeUrlFieldsDeep<T>(value: T): T {
  return walkAndNormalize(value, undefined) as T;
}

function walkAndNormalize(value: unknown, parentKey?: string): unknown {
  if (typeof value === "string") {
    if (parentKey && isLikelyUrlKey(parentKey)) return normalizeHttpUrl(value);
    return value;
  }

  if (!value || typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.map((v) => walkAndNormalize(v));
  }

  // Only transform plain JSON-like objects.
  if (!isPlainObject(value)) return value;

  // Plain object
  const obj = value as UnknownRecord;
  const out: UnknownRecord = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = walkAndNormalize(v, k);
  }
  return out;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

