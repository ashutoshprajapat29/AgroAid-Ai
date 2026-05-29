/**
 * apiCache.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Central API management layer for Gemini Free Tier.
 *
 * Problems solved:
 *  1. Aggressive localStorage caching with TTL — avoids repeat calls for same data
 *  2. In-memory deduplication — prevents concurrent identical calls
 *  3. Request queue with rate limiting — max 12 RPM (free tier = 15 RPM)
 *  4. Request counting + user-facing quota display
 */

// ─── TTL Constants ─────────────────────────────────────────────────────────────
export const TTL = {
  PRICES:    6  * 60 * 60 * 1000, // 6 hours  — prices don't change intraday
  HISTORY:   24 * 60 * 60 * 1000, // 24 hours — historical data is immutable
  SENTIMENT: 4  * 60 * 60 * 1000, // 4 hours  — sentiment can shift with news
  NEWS:      12 * 60 * 60 * 1000, // 12 hours — news refreshes twice daily
  MANDI_API: 2  * 60 * 60 * 1000, // 2 hours  — real mandi data updates few times/day
  CHAT:      0,                    // no cache — conversational AI is stateful
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────
interface CacheEntry<T> {
  data: T;
  ts: number;
  ttl: number;
}

// ─── Daily quota tracker ───────────────────────────────────────────────────────
const QUOTA_KEY   = "agroaid_api_quota";
const QUOTA_LIMIT = 100; // conservative daily limit (free tier = 1500/day but share across features)

interface QuotaEntry { count: number; date: string }

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

export function getQuotaUsage(): { used: number; limit: number; remaining: number } {
  try {
    const raw = localStorage.getItem(QUOTA_KEY);
    if (raw) {
      const entry: QuotaEntry = JSON.parse(raw);
      if (entry.date === todayStr()) {
        return { used: entry.count, limit: QUOTA_LIMIT, remaining: Math.max(0, QUOTA_LIMIT - entry.count) };
      }
    }
  } catch { /* ignore */ }
  return { used: 0, limit: QUOTA_LIMIT, remaining: QUOTA_LIMIT };
}

function incrementQuota() {
  try {
    const today = todayStr();
    const raw = localStorage.getItem(QUOTA_KEY);
    let entry: QuotaEntry = { count: 0, date: today };
    if (raw) {
      const parsed: QuotaEntry = JSON.parse(raw);
      if (parsed.date === today) entry = parsed;
    }
    entry.count += 1;
    localStorage.setItem(QUOTA_KEY, JSON.stringify(entry));
  } catch { /* ignore */ }
}

export function isQuotaExceeded(): boolean {
  return getQuotaUsage().remaining <= 0;
}

// ─── localStorage cache ───────────────────────────────────────────────────────
export function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(`agroaid_cache_${key}`);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() - entry.ts < entry.ttl) return entry.data;
    localStorage.removeItem(`agroaid_cache_${key}`); // expired
    return null;
  } catch {
    return null;
  }
}

export function cacheSet<T>(key: string, data: T, ttl: number): void {
  try {
    const entry: CacheEntry<T> = { data, ts: Date.now(), ttl };
    localStorage.setItem(`agroaid_cache_${key}`, JSON.stringify(entry));
  } catch (e) {
    // localStorage full — clear old cache entries
    clearOldCache();
  }
}

export function cacheInvalidate(prefix: string): void {
  try {
    const keys = Object.keys(localStorage).filter((k) =>
      k.startsWith(`agroaid_cache_${prefix}`)
    );
    keys.forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

function clearOldCache(): void {
  try {
    const toDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith("agroaid_cache_")) {
        try {
          const raw = localStorage.getItem(k)!;
          const entry: CacheEntry<unknown> = JSON.parse(raw);
          if (Date.now() - entry.ts >= entry.ttl) toDelete.push(k);
        } catch {
          toDelete.push(k!);
        }
      }
    }
    toDelete.forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

// ─── In-flight deduplication ──────────────────────────────────────────────────
// Prevents two simultaneous calls for the same key
const inflight = new Map<string, Promise<unknown>>();

// ─── Rate limiter: max 12 requests per minute ─────────────────────────────────
// Gemini free tier = 15 RPM — we use 12 to leave headroom
const REQUEST_TIMESTAMPS: number[] = [];
const MAX_RPM = 12;
const WINDOW_MS = 60_000;

function canSendNow(): boolean {
  const now = Date.now();
  // Purge timestamps older than 1 minute
  while (REQUEST_TIMESTAMPS.length > 0 && now - REQUEST_TIMESTAMPS[0] > WINDOW_MS) {
    REQUEST_TIMESTAMPS.shift();
  }
  return REQUEST_TIMESTAMPS.length < MAX_RPM;
}

function recordRequest(): void {
  REQUEST_TIMESTAMPS.push(Date.now());
  incrementQuota();
}

function msUntilSlot(): number {
  if (REQUEST_TIMESTAMPS.length < MAX_RPM) return 0;
  const oldest = REQUEST_TIMESTAMPS[0];
  return WINDOW_MS - (Date.now() - oldest) + 100; // +100ms buffer
}

// ─── Core: cached + rate-limited + deduplicated wrapper ─────────────────────
export async function cachedApiCall<T>(
  cacheKey: string,
  ttl: number,
  fn: () => Promise<T>,
  fallback?: T
): Promise<T> {
  // 1. Check localStorage cache first
  const cached = cacheGet<T>(cacheKey);
  if (cached !== null) return cached;

  // 2. Check in-flight (deduplicate concurrent calls)
  if (inflight.has(cacheKey)) {
    return inflight.get(cacheKey) as Promise<T>;
  }

  // 3. Check daily quota
  if (isQuotaExceeded()) {
    console.warn(`[ApiCache] Daily quota exceeded. Returning fallback for ${cacheKey}`);
    if (fallback !== undefined) return fallback;
    throw new Error("Daily API quota exceeded. Please try again tomorrow.");
  }

  // 4. Rate-limit: wait for a free slot
  if (!canSendNow()) {
    const wait = msUntilSlot();
    console.log(`[ApiCache] Rate limit: waiting ${wait}ms for slot...`);
    await new Promise((r) => setTimeout(r, wait));
  }

  // 5. Execute with deduplication
  const promise = (async () => {
    try {
      const result = await fn();
      recordRequest(); // Only count successful calls against quota
      
      if (ttl > 0) {
        // If result is an empty array (meaning API failed/timeout), cache for only 1 minute to retry soon
        const isList = Array.isArray(result);
        const actualTtl = (isList && result.length === 0) ? 60 * 1000 : ttl;
        cacheSet(cacheKey, result, actualTtl);
      }
      return result;
    } catch (err) {
      if (fallback !== undefined) return fallback;
      throw err;
    } finally {
      inflight.delete(cacheKey);
    }
  })();

  inflight.set(cacheKey, promise);
  return promise;
}

// ─── Quota status hook helper ─────────────────────────────────────────────────
export function formatQuotaStatus(): string {
  const { used, limit, remaining } = getQuotaUsage();
  return `${used}/${limit} API calls today (${remaining} remaining)`;
}
