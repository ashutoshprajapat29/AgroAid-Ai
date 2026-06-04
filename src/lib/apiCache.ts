/**
 * apiCache.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Central API management layer.
 *
 * Two call paths:
 *  1. `cachedApiCall()`   — for data.gov.in / RSS / external APIs: NO quota, NO rate limit
 *  2. `cachedGeminiCall()` — for Gemini AI calls: quota (100/day), rate limit (12 RPM)
 *
 * Both share: localStorage caching with TTL + in-flight deduplication.
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

// ─── Daily quota tracker (Gemini only) ────────────────────────────────────────
const QUOTA_KEY   = "agroaid_gemini_quota";
const QUOTA_LIMIT = 100; // conservative daily limit for Gemini

interface QuotaEntry { count: number; date: string }

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

export function getGeminiQuotaUsage(): { used: number; limit: number; remaining: number } {
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

/** @deprecated Use getGeminiQuotaUsage() */
export const getQuotaUsage = getGeminiQuotaUsage;

function incrementGeminiQuota() {
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

export function isGeminiQuotaExceeded(): boolean {
  return getGeminiQuotaUsage().remaining <= 0;
}

/** @deprecated Use isGeminiQuotaExceeded() */
export const isQuotaExceeded = isGeminiQuotaExceeded;

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
const inflight = new Map<string, Promise<unknown>>();

// ─── Rate limiter: max 12 Gemini requests per minute ──────────────────────────
const REQUEST_TIMESTAMPS: number[] = [];
const MAX_RPM = 12;
const WINDOW_MS = 60_000;

function canSendNow(): boolean {
  const now = Date.now();
  while (REQUEST_TIMESTAMPS.length > 0 && now - REQUEST_TIMESTAMPS[0] > WINDOW_MS) {
    REQUEST_TIMESTAMPS.shift();
  }
  return REQUEST_TIMESTAMPS.length < MAX_RPM;
}

function recordGeminiRequest(): void {
  REQUEST_TIMESTAMPS.push(Date.now());
  incrementGeminiQuota();
}

function msUntilSlot(): number {
  if (REQUEST_TIMESTAMPS.length < MAX_RPM) return 0;
  const oldest = REQUEST_TIMESTAMPS[0];
  return WINDOW_MS - (Date.now() - oldest) + 100;
}

// ─── cachedApiCall: for data.gov.in / RSS / external — NO quota, NO rate limit ─
export async function cachedApiCall<T>(
  cacheKey: string,
  ttl: number,
  fn: () => Promise<T>,
  fallback?: T
): Promise<T> {
  // 1. Check localStorage cache
  const cached = cacheGet<T>(cacheKey);
  if (cached !== null) return cached;

  // 2. Deduplicate concurrent calls
  if (inflight.has(cacheKey)) {
    return inflight.get(cacheKey) as Promise<T>;
  }

  // 3. Execute — NO quota check, NO rate limit
  const promise = (async () => {
    try {
      const result = await fn();
      if (ttl > 0) {
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

// ─── cachedGeminiCall: for Gemini AI — WITH quota + rate limit ─────────────────
export async function cachedGeminiCall<T>(
  cacheKey: string,
  ttl: number,
  fn: () => Promise<T>,
  fallback?: T
): Promise<T> {
  // 1. Check localStorage cache
  const cached = cacheGet<T>(cacheKey);
  if (cached !== null) return cached;

  // 2. Deduplicate concurrent calls
  if (inflight.has(cacheKey)) {
    return inflight.get(cacheKey) as Promise<T>;
  }

  // 3. Check daily Gemini quota
  if (isGeminiQuotaExceeded()) {
    console.warn(`[ApiCache] Gemini daily quota exceeded. Returning fallback for ${cacheKey}`);
    if (fallback !== undefined) return fallback;
    throw new Error("Daily AI quota exceeded. Please try again tomorrow.");
  }

  // 4. Rate-limit: wait for a free slot
  if (!canSendNow()) {
    const wait = msUntilSlot();
    console.log(`[ApiCache] Gemini rate limit: waiting ${wait}ms for slot...`);
    await new Promise((r) => setTimeout(r, wait));
  }

  // 5. Execute with deduplication
  const promise = (async () => {
    try {
      const result = await fn();
      recordGeminiRequest(); // Only count successful Gemini calls

      if (ttl > 0) {
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
  const { used, limit, remaining } = getGeminiQuotaUsage();
  return `${used}/${limit} AI calls today (${remaining} remaining)`;
}
