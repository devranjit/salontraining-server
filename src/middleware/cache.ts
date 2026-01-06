/**
 * In-Memory API Response Cache Middleware
 * 
 * Features:
 * - Caches public GET endpoints only
 * - TTL-based expiration (60-120 seconds)
 * - Cache key includes full URL and query params
 * - Reduces database load for frequently accessed public data
 * - Production-ready with memory management
 */

import { Request, Response, NextFunction } from "express";

// =========================================
// CACHE STORE
// =========================================
interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
}

// In-memory cache store
const cache = new Map<string, CacheEntry>();

// Cache statistics for monitoring
let cacheHits = 0;
let cacheMisses = 0;

// Maximum cache size to prevent memory issues
const MAX_CACHE_ENTRIES = 500;

// =========================================
// CACHE CONFIGURATION
// =========================================

// Default TTL in milliseconds (60 seconds)
const DEFAULT_TTL = 60 * 1000;

// Route-specific TTL configuration (in milliseconds)
// Longer TTL for data that changes less frequently
const ROUTE_TTL_CONFIG: Record<string, number> = {
  // Homepage featured sections - 90 seconds (changes rarely)
  "/api/trainers/featured": 90 * 1000,
  "/api/events/featured": 90 * 1000,
  "/api/education/featured": 90 * 1000,
  "/api/blogs/featured": 90 * 1000,
  "/api/jobs/featured": 90 * 1000,
  "/api/products/featured": 90 * 1000,
  
  // Public listing endpoints - 60 seconds
  "/api/trainers/all": 60 * 1000,
  "/api/events/all": 60 * 1000,
  "/api/education/all": 60 * 1000,
  "/api/blogs/all": 60 * 1000,
  "/api/jobs/all": 60 * 1000,
  "/api/products/all": 60 * 1000,
  
  // Categories - 120 seconds (rarely changes)
  "/api/categories": 120 * 1000,
  
  // Individual detail pages - 60 seconds
  "/api/trainers/slug": 60 * 1000,
  "/api/blogs/slug": 60 * 1000,
  
  // Search/suggestions - 60 seconds
  "/api/trainers/suggestions": 60 * 1000,
};

// Routes that should be cached (public GET endpoints only)
// Uses prefix matching for flexibility
const CACHEABLE_ROUTE_PREFIXES = [
  // Trainers
  "/api/trainers/featured",
  "/api/trainers/all",
  "/api/trainers/suggestions",
  
  // Events
  "/api/events/featured",
  "/api/events/all",
  
  // Education
  "/api/education/featured",
  "/api/education/",          // Public listing at /api/education/
  "/api/education/categories", // Education categories
  
  // Blogs
  "/api/blogs/featured",
  "/api/blogs/all",
  
  // Jobs
  "/api/jobs/featured",
  "/api/jobs/",               // Public listing at /api/jobs/
  
  // Products
  "/api/products/featured",
  "/api/products/",           // Public listing at /api/products/
  "/api/products/filters",    // Product filters
  
  // Categories
  "/api/categories",
  
  // Member Videos (public only)
  "/api/member-videos/public",
  
  // Seeking Employment (public)
  "/api/seeking-employment/", // Public listing (not admin routes)
];

// Routes that should NEVER be cached
const NEVER_CACHE_PREFIXES = [
  "/api/auth",
  "/api/admin",
  "/api/dashboard",
  "/api/users",
  "/api/orders",
  "/api/memberships",
  "/api/notifications",
  "/api/upload",
  "/api/version-history",
  "/api/system",
  "/api/store-checkout",
  "/api/forms",
  "/api/pro-verification",
  "/api/coupons",
  "/api/reviews",
  "/api/shipping",
];

// Patterns within cacheable routes that should NOT be cached
// (user-specific routes like /my, admin routes)
const EXCLUDED_PATTERNS = [
  "/my",       // User's own listings
  "/admin",    // Admin routes within public APIs
  "/control-panel",
];

// =========================================
// HELPER FUNCTIONS
// =========================================

/**
 * Generate cache key from request
 * Includes full path and sorted query parameters for consistency
 */
function generateCacheKey(req: Request): string {
  const path = req.path;
  
  // Sort query params for consistent cache keys
  const queryParams = Object.keys(req.query)
    .sort()
    .map((key) => `${key}=${req.query[key]}`)
    .join("&");
  
  return queryParams ? `${path}?${queryParams}` : path;
}

/**
 * Check if a route should be cached
 */
function isCacheable(req: Request): boolean {
  // Only cache GET requests
  if (req.method !== "GET") return false;
  
  const path = req.path;
  
  // Never cache these routes
  if (NEVER_CACHE_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return false;
  }
  
  // Check for excluded patterns (user-specific, admin routes)
  if (EXCLUDED_PATTERNS.some((pattern) => path.includes(pattern))) {
    return false;
  }
  
  // Check if route matches cacheable prefixes
  return CACHEABLE_ROUTE_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/**
 * Get TTL for a specific route
 */
function getTTL(path: string): number {
  // Check exact match first
  if (ROUTE_TTL_CONFIG[path]) {
    return ROUTE_TTL_CONFIG[path];
  }
  
  // Check prefix matches
  for (const route of Object.keys(ROUTE_TTL_CONFIG)) {
    if (path.startsWith(route)) {
      return ROUTE_TTL_CONFIG[route];
    }
  }
  
  return DEFAULT_TTL;
}

/**
 * Clean up expired entries periodically
 */
function cleanupExpiredEntries(): void {
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const [key, entry] of cache.entries()) {
    if (now - entry.timestamp > entry.ttl) {
      cache.delete(key);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`[Cache] Cleaned up ${cleanedCount} expired entries. Active: ${cache.size}`);
  }
}

/**
 * Enforce maximum cache size (LRU-like behavior)
 */
function enforceMaxSize(): void {
  if (cache.size <= MAX_CACHE_ENTRIES) return;
  
  // Remove oldest entries (first in map)
  const entriesToRemove = cache.size - MAX_CACHE_ENTRIES + 50; // Remove extra to reduce frequency
  let removed = 0;
  
  for (const key of cache.keys()) {
    if (removed >= entriesToRemove) break;
    cache.delete(key);
    removed++;
  }
  
  console.log(`[Cache] Enforced max size, removed ${removed} entries. Active: ${cache.size}`);
}

// Run cleanup every 30 seconds
setInterval(cleanupExpiredEntries, 30 * 1000);

// =========================================
// CACHE MIDDLEWARE
// =========================================

/**
 * API Response Cache Middleware
 * 
 * Usage: Apply to specific routes or globally before route handlers
 * Only caches responses for whitelisted public GET endpoints
 */
export function apiCache(req: Request, res: Response, next: NextFunction): void {
  // Skip if not cacheable
  if (!isCacheable(req)) {
    return next();
  }
  
  const cacheKey = generateCacheKey(req);
  const now = Date.now();
  
  // Check cache
  const cached = cache.get(cacheKey);
  
  if (cached && (now - cached.timestamp) < cached.ttl) {
    // Cache hit - return cached response
    cacheHits++;
    
    // Add cache headers for debugging
    res.setHeader("X-Cache", "HIT");
    res.setHeader("X-Cache-Age", Math.floor((now - cached.timestamp) / 1000).toString());
    
    res.json(cached.data);
    return;
  }
  
  // Cache miss
  cacheMisses++;
  
  // Override res.json to capture and cache the response
  const originalJson = res.json.bind(res);
  
  res.json = function (data: any) {
    // Only cache successful responses
    if (res.statusCode >= 200 && res.statusCode < 300) {
      // Store in cache
      cache.set(cacheKey, {
        data,
        timestamp: now,
        ttl: getTTL(req.path),
      });
      
      // Enforce max size
      enforceMaxSize();
    }
    
    // Add cache headers
    res.setHeader("X-Cache", "MISS");
    
    return originalJson(data);
  };
  
  next();
}

// =========================================
// CACHE STATS ENDPOINT (for monitoring)
// =========================================

/**
 * Get cache statistics
 * Can be exposed via an admin endpoint for monitoring
 */
export function getCacheStats() {
  const now = Date.now();
  let activeEntries = 0;
  let expiredEntries = 0;
  
  for (const entry of cache.values()) {
    if (now - entry.timestamp < entry.ttl) {
      activeEntries++;
    } else {
      expiredEntries++;
    }
  }
  
  const hitRate = cacheHits + cacheMisses > 0 
    ? ((cacheHits / (cacheHits + cacheMisses)) * 100).toFixed(2) 
    : "0.00";
  
  return {
    totalEntries: cache.size,
    activeEntries,
    expiredEntries,
    hits: cacheHits,
    misses: cacheMisses,
    hitRate: `${hitRate}%`,
    maxEntries: MAX_CACHE_ENTRIES,
  };
}

/**
 * Clear all cache entries (for admin use only)
 */
export function clearCache(): void {
  cache.clear();
  console.log("[Cache] All entries cleared");
}

/**
 * Reset cache statistics
 */
export function resetCacheStats(): void {
  cacheHits = 0;
  cacheMisses = 0;
  console.log("[Cache] Statistics reset");
}

export default apiCache;

