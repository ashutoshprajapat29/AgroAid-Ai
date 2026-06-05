import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import axios from "axios";
import { createClient } from "@supabase/supabase-js";

admin.initializeApp();
const db = admin.firestore();

// ─── Supabase admin client (service_role for writes) ──────────────────────────
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

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
// Runs every day at 11:00 PM IST (17:30 UTC)
// ─────────────────────────────────────────────────────────────────────────────
export const syncMandiToSupabase = functions
  .runWith({ timeoutSeconds: 540, memory: "1GB" })
  .pubsub.schedule("30 17 * * *")
  .timeZone("Asia/Kolkata")
  .onRun(async (_context) => {
    functions.logger.info("Starting Mandi → Supabase sync for priority states...");

    const API_URL = "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070";
    const API_KEY = process.env.DATA_GOV_API_KEY ?? "";

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      functions.logger.error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set. Aborting sync.");
      return null;
    }

    let totalUpserted = 0;
    let totalErrors = 0;
    const startTime = Date.now();

    for (const state of PRIORITY_STATES) {
      let offset = 0;
      const limit = 500;
      const stateRecords: Record<string, unknown>[] = [];

      // Paginate through all records for this state
      while (true) {
        try {
          const response = await axios.get(API_URL, {
            params: {
              "api-key": API_KEY,
              format: "json",
              limit,
              offset,
              "filters[state.keyword]": state,
            },
            timeout: 20000,
          });

          const records: any[] = response.data?.records ?? [];
          if (!records.length) break;

          for (const r of records) {
            const row = {
              state: (r.state ?? "").trim(),
              district: (r.district ?? "").trim(),
              market_name: (r.market ?? "").trim(),
              commodity: (r.commodity ?? "").trim(),
              variety: (r.variety ?? "").trim(),
              min_price: parseInt(r.min_price) || 0,
              max_price: parseInt(r.max_price) || 0,
              modal_price: parseInt(r.modal_price) || 0,
              arrival_date: parseArrivalDate(r.arrival_date ?? ""),
            };

            if (row.state && row.commodity && row.modal_price > 0) {
              stateRecords.push(row);
            }
          }

          if (records.length < limit) break;
          offset += limit;
        } catch (err: any) {
          functions.logger.warn(`Fetch failed for ${state} offset=${offset}:`, err.message ?? err);
          totalErrors++;
          break;
        }
      }

      // Batch upsert into Supabase (max 500 rows per call)
      for (let i = 0; i < stateRecords.length; i += 500) {
        const batch = stateRecords.slice(i, i + 500);
        try {
          const { error } = await supabaseAdmin
            .from("mandi_prices")
            .upsert(batch, {
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

      functions.logger.info(`[${state}] ${stateRecords.length} records processed`);
    }

    // Purge records older than 30 days
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      const cutoffStr = cutoff.toISOString().split("T")[0];

      const { error, count } = await supabaseAdmin
        .from("mandi_prices")
        .delete()
        .lt("arrival_date", cutoffStr);

      if (error) {
        functions.logger.warn("Purge error:", error.message);
      } else {
        functions.logger.info(`Purged ${count ?? "?"} rows older than ${cutoffStr}`);
      }
    } catch (err: any) {
      functions.logger.warn("Purge exception:", err.message ?? err);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    functions.logger.info(`Sync complete: ${totalUpserted} rows upserted, ${totalErrors} errors, ${duration}s`);

    // Log sync status to Firestore for monitoring
    await db.collection("system_logs").doc("mandi_sync").set({
      last_run: admin.firestore.Timestamp.now(),
      status: totalErrors === 0 ? "success" : "partial",
      total_upserted: totalUpserted,
      total_errors: totalErrors,
      duration_seconds: parseFloat(duration),
      states: PRIORITY_STATES.length,
    });

    return null;
  });

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 2: AI-Filtered Agricultural News Aggregator
// Runs daily at 08:00 IST — before markets open
// ─────────────────────────────────────────────────────────────────────────────
export const aggregateMarketNews = functions
  .runWith({ timeoutSeconds: 180, memory: "256MB" })
  .pubsub.schedule("30 2 * * *") // 08:00 IST = 02:30 UTC
  .timeZone("Asia/Kolkata")
  .onRun(async (_context) => {
    functions.logger.info("Starting market news aggregation...");

    // Seed news from public RSS / government portals
    const RAW_SOURCES = [
      "https://newsapi.org/v2/everything?q=India+mandi+prices+agriculture&language=en&pageSize=10",
      // Fallback: we always generate AI news as well
    ];

    let rawSnippets: string[] = [];

    // Try NewsAPI if key is set
    const newsApiKey = process.env.NEWS_API_KEY;
    if (newsApiKey) {
      try {
        const newsResp = await axios.get(RAW_SOURCES[0] + `&apiKey=${newsApiKey}`, { timeout: 10000 });
        const articles = newsResp.data?.articles ?? [];
        rawSnippets = articles.slice(0, 10).map((a: any) =>
          `${a.title}: ${a.description ?? a.content ?? ""}`
        );
      } catch (e) {
        functions.logger.warn("NewsAPI failed, using Gemini-generated news context");
      }
    }

    // If no real news fetched, have Gemini generate today's key agricultural events
    const prompt = rawSnippets.length > 0
      ? `You are an expert Indian agri-economist. Analyze these news items and return EXACTLY 3 that directly affect Indian commodity market prices (MSP announcements, import/export duty changes, monsoon updates, trade pacts, storage shortages).\n\nNews items:\n${rawSnippets.join("\n")}\n\nReturn a JSON array of exactly 3 objects. Each: { "title": string (max 10 words), "impact": string (2 sentences, simple language), "sentiment": "Positive"|"Negative"|"Neutral", "commodity": string (affected crop or "General") }`
      : `You are an expert Indian agri-economist. Generate a realistic summary of 3 key agricultural market events that would affect Indian Mandi prices TODAY (${new Date().toLocaleDateString("en-IN")}). Include one about MSP/government policy, one about monsoon/weather impact, and one about export/import trade. Return a JSON array of exactly 3 objects: { "title": string, "impact": string (2 sentences), "sentiment": "Positive"|"Negative"|"Neutral", "commodity": string }`;

    try {
      const raw = await callGemini(prompt, true);
      const parsed: NewsItem[] = JSON.parse(raw);

      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error("Gemini returned empty news array");
      }

      await db.collection("market_news").doc("latest").set({
        items: parsed.slice(0, 3),
        timestamp: admin.firestore.Timestamp.now(),
        generated_date: new Date().toISOString().split("T")[0],
        source: rawSnippets.length > 0 ? "newsapi" : "gemini_generated",
      });

      functions.logger.info("Market news saved:", parsed.length, "items");
    } catch (err: any) {
      functions.logger.error("News aggregation failed:", err.message ?? err);
    }
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
      const { data: rows, error } = await supabaseAdmin
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
