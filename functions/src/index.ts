import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import axios from "axios";
import { createClient } from "@supabase/supabase-js";

admin.initializeApp();
const db = admin.firestore();

// ─── Supabase admin client (service_role for writes) ──────────────────────────
// Lazily initialize to prevent "supabaseUrl is required" errors during Firebase deployment
let supabaseAdmin: ReturnType<typeof createClient> | null = null;
function getSupabaseAdmin() {
  if (!supabaseAdmin) {
    supabaseAdmin = createClient(
      process.env.SUPABASE_URL ?? "https://dummy.supabase.co",
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? "dummy_key"
    );
  }
  return supabaseAdmin;
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
interface NewsItem {
  title: string;
  impact: string;
  sentiment: "Positive" | "Negative" | "Neutral";
  source?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Call Gemini REST API directly (no SDK in functions)
// ─────────────────────────────────────────────────────────────────────────────
async function callGemini(prompt: string, jsonMode = false): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set in function environment");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: prompt }] }],
  };
  if (jsonMode) {
    body.generationConfig = { responseMimeType: "application/json" };
  }

  const res = await axios.post(url, body, { timeout: 30000 });
  return res.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Parse date from data.gov.in (handles DD/MM/YYYY and YYYY-MM-DD)
// ─────────────────────────────────────────────────────────────────────────────
function parseArrivalDate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString().split("T")[0];
  // Handle "DD/MM/YYYY" format
  if (dateStr.includes("/")) {
    const parts = dateStr.split("/");
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
    }
  }
  // Already "YYYY-MM-DD"
  return dateStr;
}

// ─────────────────────────────────────────────────────────────────────────────
// Priority states for nightly sync (North India focus)
// ─────────────────────────────────────────────────────────────────────────────
const PRIORITY_STATES = [
  "Madhya Pradesh", "Rajasthan", "Maharashtra", "Gujarat",
  "Uttar Pradesh", "Bihar", "Haryana", "Punjab",
  "Uttarakhand", "Himachal Pradesh", "Delhi", "Chandigarh",
];

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 1: Sync Mandi Prices to Supabase (replaces old Firestore ingestion)
// Runs every day at 4:00 AM IST
// ─────────────────────────────────────────────────────────────────────────────
export const syncMandiToSupabase = functions
  .runWith({ timeoutSeconds: 540, memory: "1GB" })
  .pubsub.schedule("0 4 * * *")
  .timeZone("Asia/Kolkata")
  .onRun(async (_context) => {
    functions.logger.info("Starting Mandi → Supabase sync for priority states...");

    // Historical endpoint — data persists permanently, uses PascalCase field names
    const API_URL = "https://api.data.gov.in/resource/35985678-0d79-46b4-9ed6-6f13308a1d24";
    const API_KEY = process.env.DATA_GOV_API_KEY ?? "";

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      functions.logger.error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set. Aborting sync.");
      return null;
    }

    let totalUpserted = 0;
    let totalErrors = 0;
    const startTime = Date.now();

    // Fetch only yesterday's date (relative to IST) because today's 4:00 AM sync targets yesterday's trading data
    const targetDates: string[] = [];
    const now = new Date();
    
    // Explicitly calculate "yesterday in IST" to be completely safe against timezone and schedule changes
    // 1. Get current time in UTC
    // 2. Add 5.5 hours to get IST time
    // 3. Subtract 1 day to get yesterday
    const istYesterday = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
    istYesterday.setUTCDate(istYesterday.getUTCDate() - 1);

    const day = String(istYesterday.getUTCDate()).padStart(2, "0");
    const month = String(istYesterday.getUTCMonth() + 1).padStart(2, "0");
    const year = istYesterday.getUTCFullYear();
    
    targetDates.push(`${day}/${month}/${year}`);
    functions.logger.info(`Target dates: ${targetDates.join(", ")}`);

    for (const state of PRIORITY_STATES) {
      const stateRecords: Record<string, unknown>[] = [];

      for (const targetDate of targetDates) {
        let offset = 0;
        const limit = 500;

        // Paginate through records for this state + date
        while (true) {
          let retries = 3;
          let success = false;
          let records: any[] = [];

          while (retries > 0 && !success) {
            try {
              const response = await axios.get(API_URL, {
                params: {
                  "api-key": API_KEY,
                  format: "json",
                  limit,
                  offset,
                  "filters[State]": state,
                  "filters[Arrival_Date]": targetDate,
                },
                timeout: 30000,
              });

              records = response.data?.records ?? [];
              success = true;
            } catch (err: any) {
              retries--;
              functions.logger.warn(`Fetch failed for ${state} date=${targetDate} offset=${offset}. Retries left: ${retries}. Error:`, err.message ?? err);
              if (retries === 0) {
                  totalErrors++;
                  break;
              }
              // Wait 5 seconds before retrying
              await new Promise((resolve) => setTimeout(resolve, 5000));
            }
          }

          if (!success) {
              break; // Skip pagination for this state/date if all retries failed
          }

          if (!records.length) break;

          for (const r of records) {
            // Historical endpoint uses PascalCase keys
            const arrivalStr = parseArrivalDate(r.Arrival_Date || r.arrival_date || "");

            const row = {
              state: (r.State || r.state || "").trim(),
              district: (r.District || r.district || "").trim(),
              market_name: (r.Market || r.market || "").trim(),
              commodity: (r.Commodity || r.commodity || "").trim(),
              variety: (r.Variety || r.variety || "").trim(),
              min_price: parseInt(r.Min_Price || r.min_price) || 0,
              max_price: parseInt(r.Max_Price || r.max_price) || 0,
              modal_price: parseInt(r.Modal_Price || r.modal_price) || 0,
              arrival_date: arrivalStr,
            };

            if (row.state && row.commodity && row.modal_price > 0) {
              stateRecords.push(row);
            }
          }

          if (records.length < limit) break;
          offset += limit;

          // Rate limit delay between successful pagination requests
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      // Deduplicate records to prevent "ON CONFLICT DO UPDATE command cannot affect row a second time"
      const uniqueRecordsMap = new Map();
      for (const r of stateRecords) {
        const key = `${r.state}|${r.district}|${r.market_name}|${r.commodity}|${r.variety}|${r.arrival_date}`;
        uniqueRecordsMap.set(key, r);
      }
      const uniqueStateRecords = Array.from(uniqueRecordsMap.values());

      // Batch upsert into Supabase (max 500 rows per call)
      for (let i = 0; i < uniqueStateRecords.length; i += 500) {
        const batch = uniqueStateRecords.slice(i, i + 500);
        try {
          const { error } = await getSupabaseAdmin()
            .from("mandi_prices")
            .upsert(batch as any, {
              onConflict: "state,district,market_name,commodity,variety,arrival_date",
            });

          if (error) {
            functions.logger.warn(`Upsert error for ${state}:`, error.message);
            totalErrors++;
          } else {
            totalUpserted += batch.length;
          }
        } catch (err: any) {
          functions.logger.warn(`Upsert exception for ${state}:`, err.message ?? err);
          totalErrors++;
        }
      }

      functions.logger.info(`[${state}] ${uniqueStateRecords.length} records processed`);
    }

    // Purge records older than 45 days to keep DB size in check
    let purgedRows = 0;
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 45);
      const cutoffStr = cutoff.toISOString().split("T")[0];

      const { error, count } = await getSupabaseAdmin()
        .from("mandi_prices")
        .delete({ count: "exact" })
        .lt("arrival_date", cutoffStr);

      if (error) {
        functions.logger.warn("Purge error:", error.message);
      } else {
        purgedRows = count ?? 0;
        functions.logger.info(`Purged ${purgedRows} rows older than ${cutoffStr}`);
      }
    } catch (err: any) {
      functions.logger.warn("Purge exception:", err.message ?? err);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    functions.logger.info(`Sync complete: ${totalUpserted} rows upserted, ${purgedRows} purged, ${totalErrors} errors, ${duration}s`);

    // Log sync status to Firestore for monitoring
    await db.collection("system_logs").doc("mandi_sync").set({
      last_run: admin.firestore.Timestamp.now(),
      status: totalErrors === 0 ? "success" : "partial",
      total_upserted: totalUpserted,
      total_purged: purgedRows,
      total_errors: totalErrors,
      duration_seconds: parseFloat(duration),
      states: PRIORITY_STATES.length,
    });

    return null;
  });

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 2: RSS Agri News Aggregator + Gemini Sentiment (HTTP endpoint)
// Called from frontend — replaces allorigins.win proxy
// Results cached 12 hours in Firestore
// ─────────────────────────────────────────────────────────────────────────────
const RSS_FEEDS = [
  { url: "https://www.krishijagran.com/rss/news.xml", source: "Krishi Jagran" },
  { url: "https://economictimes.indiatimes.com/news/economy/agriculture/rssfeeds/68880913.cms", source: "ET Agriculture" },
];

async function fetchRSSFeedServer(feedUrl: string, source: string): Promise<{ title: string; description: string; link: string; source: string }[]> {
  try {
    const resp = await axios.get(feedUrl, {
      timeout: 10000,
      headers: { "User-Agent": "AgroAid-AI/1.0 (+https://agroaid.app)" },
    });
    const text: string = resp.data;

    const articles: { title: string; description: string; link: string; source: string }[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;
    while ((match = itemRegex.exec(text)) !== null && articles.length < 5) {
      const item = match[1];
      const title = item.match(/<title><!\[CDATA\[(.*?)\]\]>|<title>(.*?)<\/title>/)?.[1] || item.match(/<title>(.*?)<\/title>/)?.[1] || "";
      const desc  = item.match(/<description><!\[CDATA\[(.*?)\]\]>|<description>(.*?)<\/description>/)?.[1] || item.match(/<description>(.*?)<\/description>/)?.[1] || "";
      const link  = item.match(/<link>(.*?)<\/link>/)?.[1] || "";
      if (title.trim()) {
        articles.push({
          title: title.replace(/<[^>]+>/g, "").trim(),
          description: desc.replace(/<[^>]+>/g, "").trim().slice(0, 200),
          link: link.trim(),
          source,
        });
      }
    }
    return articles;
  } catch (e) {
    functions.logger.warn(`RSS feed ${source} failed:`, e);
    return [];
  }
}

export const fetchAgriNews = functions
  .runWith({ timeoutSeconds: 60, memory: "256MB" })
  .https.onCall(async (data: { language?: string }, context) => {
    const language = data.language || "English";
    const cacheDocId = `news_${language.toLowerCase()}`;

    // Check Firestore cache (12hr)
    try {
      const doc = await db.collection("agri_news_cache").doc(cacheDocId).get();
      if (doc.exists) {
        const cacheData = doc.data()!;
        const ageMs = Date.now() - (cacheData.cached_at?.toMillis() ?? 0);
        if (ageMs < 12 * 60 * 60 * 1000) {
          return { items: cacheData.items, cached: true };
        }
      }
    } catch (e) {
      functions.logger.warn("Cache read failed:", e);
    }

    // Fetch RSS feeds in parallel
    const feedResults = await Promise.allSettled(
      RSS_FEEDS.map((f) => fetchRSSFeedServer(f.url, f.source))
    );
    const allArticles: { title: string; description: string; link: string; source: string }[] = [];
    for (const result of feedResults) {
      if (result.status === "fulfilled") allArticles.push(...result.value);
    }

    let items: NewsItem[] = [];

    if (allArticles.length > 0) {
      const top = allArticles.slice(0, 5);
      const langNote = language === "Hindi"
        ? "Translate title and impact to Hindi (Devanagari script)."
        : "Keep in English.";
      const prompt = `Classify the sentiment of these agricultural news articles. ${langNote}\nArticles:\n${top.map((a, i) => `${i + 1}. "${a.title}" — ${a.description}`).join("\n")}\n\nReturn ONLY a JSON array. For each: {\"title\":string,\"impact\":string (2 short sentences),\"sentiment\":\"Positive\"|\"Negative\"|\"Neutral\",\"commodity\":string,\"source\":string,\"link\":string}`;
      try {
        const raw = await callGemini(prompt, true);
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          items = parsed.map((item: any, i: number) => ({
            ...item,
            source: top[i]?.source ?? item.source ?? "",
            link: top[i]?.link ?? item.link ?? "",
          })).slice(0, 4);
        }
      } catch (e) {
        functions.logger.warn("Gemini classification failed, using raw articles");
        items = top.slice(0, 4).map((a) => ({
          title: a.title,
          impact: a.description,
          sentiment: "Neutral" as const,
          commodity: "General",
          source: a.source,
          link: a.link,
        }));
      }
    }

    // Fallback: AI-generated news
    if (items.length === 0) {
      const langNote = language === "Hindi" ? "Write in Hindi (Devanagari)." : "Write in English.";
      const prompt = `Generate 3 realistic agricultural news items for Indian farmers today. Cover: MSP/government policy, monsoon/weather, export/import. ${langNote}\nReturn ONLY JSON array of 3: {\"title\":string,\"impact\":string,\"sentiment\":\"Positive\"|\"Negative\"|\"Neutral\",\"commodity\":string}`;
      try {
        const raw = await callGemini(prompt, true);
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) items = parsed.slice(0, 3);
      } catch (e) {
        functions.logger.error("Fallback news generation failed:", e);
      }
    }

    // Cache result
    try {
      await db.collection("agri_news_cache").doc(cacheDocId).set({
        items,
        cached_at: admin.firestore.Timestamp.now(),
        language,
      });
    } catch (e) {
      functions.logger.warn("Cache write failed:", e);
    }

    return { items, cached: false };
  });

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 3 (legacy): AI Market News — kept for backwards compat
// ─────────────────────────────────────────────────────────────────────────────
export const aggregateMarketNews = functions
  .runWith({ timeoutSeconds: 180, memory: "256MB" })
  .pubsub.schedule("30 2 * * *")
  .timeZone("Asia/Kolkata")
  .onRun(async (_context) => {
    functions.logger.info("aggregateMarketNews: delegating to fetchAgriNews logic...");
    // News is now served via fetchAgriNews HTTP endpoint with Firestore caching
    return null;
  });


// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 3: AI Market Sentiment Engine (HTTP Callable)
// Called from frontend when user views a crop page
// ─────────────────────────────────────────────────────────────────────────────
export const getMarketSentiment = functions
  .runWith({ timeoutSeconds: 60, memory: "256MB" })
  .https.onCall(async (data: { commodity: string; state: string; district?: string }) => {
    const { commodity, state, district } = data;
    if (!commodity || !state) {
      throw new functions.https.HttpsError("invalid-argument", "commodity and state are required");
    }

    functions.logger.info(`Sentiment request: ${commodity} in ${state}/${district}`);

    // 1. Fetch last 30 days of modal prices from Supabase
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoffDate = thirtyDaysAgo.toISOString().split("T")[0];

    let priceHistory: { date: string; modal_price: number; min_price: number; max_price: number }[] = [];
    try {
      const { data: rows, error } = await getSupabaseAdmin()
        .from("mandi_prices")
        .select("arrival_date, modal_price, min_price, max_price")
        .eq("commodity", commodity)
        .eq("state", state)
        .gte("arrival_date", cutoffDate)
        .order("arrival_date", { ascending: true })
        .limit(30);

      if (!error && rows) {
        priceHistory = rows.map((r: any) => ({
          date: r.arrival_date,
          modal_price: r.modal_price,
          min_price: r.min_price,
          max_price: r.max_price,
        }));
      }
    } catch (e) {
      functions.logger.warn("Supabase price history query failed:", e);
    }

    // 2. Fetch latest news summaries from Firestore
    let newsItems: NewsItem[] = [];
    try {
      const newsDoc = await db.collection("market_news").doc("latest").get();
      if (newsDoc.exists) {
        newsItems = newsDoc.data()?.items ?? [];
      }
    } catch (e) {
      functions.logger.warn("Could not fetch news:", e);
    }

    // 3. Call Gemini for sentiment analysis
    const historyStr = priceHistory.length > 0
      ? priceHistory.map((p) => `${p.date}: ₹${p.modal_price}/qtl`).join(", ")
      : "No historical data available — use general market knowledge for this commodity";

    const newsStr = newsItems.length > 0
      ? newsItems.map((n) => `[${n.sentiment}] ${n.title}: ${n.impact}`).join("\n")
      : "No specific news — use general seasonal patterns";

    const prompt = `Context:
- Commodity: ${commodity}
- Region: ${district ? `${district}, ` : ""}${state}
- 30-Day Price History: ${historyStr}
- Recent Trade/Regulatory News:
${newsStr}

Task: As an expert Indian agricultural commodity analyst, analyze the price trend momentum and news sentiment.
Do NOT guess exact future prices. Provide:
1. A sentiment indicator: exactly one of "Bullish", "Bearish", or "Stable"
2. A confidence score 0-100
3. A "why" explanation in exactly 3 plain-language sentences that a farmer can understand
4. A recommended action for the farmer (1 sentence)

Return valid JSON: { "sentiment": "Bullish"|"Bearish"|"Stable", "confidence": number, "why": string, "action": string }`;

    try {
      const raw = await callGemini(prompt, true);
      const result = JSON.parse(raw);
      return {
        sentiment: result.sentiment ?? "Stable",
        confidence: result.confidence ?? 50,
        why: result.why ?? "Market data is insufficient for a confident analysis.",
        action: result.action ?? "Monitor prices daily before selling.",
        priceHistory,
        newsItems,
      };
    } catch (err: any) {
      functions.logger.error("Sentiment Gemini call failed:", err.message);
      return {
        sentiment: "Stable",
        confidence: 40,
        why: "Unable to analyze market sentiment at this time. Please check back later.",
        action: "Hold and monitor the market for the next 2-3 days.",
        priceHistory,
        newsItems,
      };
    }
  });
