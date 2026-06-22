import * as functions from "firebase-functions/v1";
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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
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
// Runs every day at 7:00 AM IST (data.gov.in publishes previous day's data by morning)
// ─────────────────────────────────────────────────────────────────────────────
export const syncMandiToSupabase = functions
  .runWith({ timeoutSeconds: 540, memory: "1GB" })
  .pubsub.schedule("0 7 * * *")
  .timeZone("Asia/Kolkata")
  .onRun(async (context: functions.EventContext) => {
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

    // Calculate yesterday's date in IST (the sync targets previous day's trading data)
    const now = new Date();
    const istYesterday = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
    istYesterday.setUTCDate(istYesterday.getUTCDate() - 1);

    const day = String(istYesterday.getUTCDate()).padStart(2, "0");
    const month = String(istYesterday.getUTCMonth() + 1).padStart(2, "0");
    const year = istYesterday.getUTCFullYear();
    const targetDate = `${day}/${month}/${year}`;
    functions.logger.info(`Target date: ${targetDate}`);

    for (const state of PRIORITY_STATES) {
      // Early exit if approaching 9-minute timeout (e.g. at 8 mins = 480000ms)
      if (Date.now() - startTime > 480000) {
        functions.logger.warn("Approaching function timeout. Halting processing early to finish gracefully.");
        break;
      }

      const stateRecords: Record<string, unknown>[] = [];
        let offset = 0;
        const limit = 100; // Reduced from 500 to make smaller, faster DB queries to data.gov.in

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
                timeout: 120000,
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
              // Exponential backoff: 5s, 10s, 20s
              const backoff = 5000 * Math.pow(2, 3 - retries);
              await new Promise((resolve) => setTimeout(resolve, backoff));
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
        await new Promise((resolve) => setTimeout(resolve, 1000));
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
      
      // Add a brief delay between states to prevent overwhelming the API
      await new Promise((resolve) => setTimeout(resolve, 2000));
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
      maxContentLength: 512 * 1024,
      maxBodyLength: 512 * 1024,
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
// FUNCTION 3: AI Market Sentiment Engine (HTTP Callable)
// Called from frontend when user views a crop page
// ─────────────────────────────────────────────────────────────────────────────
export const getMarketSentiment = functions
  .runWith({ timeoutSeconds: 60, memory: "256MB" })
  .https.onCall(async (data: { commodity: string; state: string; district?: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Authentication required for market sentiment.");
    }

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
      const newsDoc = await db.collection("agri_news_cache").doc("news_english").get();
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

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Advanced Gemini REST API call (system instructions, images, history)
// ─────────────────────────────────────────────────────────────────────────────
interface GeminiAdvancedOptions {
  systemInstruction?: string;
  contents: unknown[];
  jsonMode?: boolean;
  responseSchema?: unknown;
  timeout?: number;
}

async function callGeminiAdvanced(opts: GeminiAdvancedOptions): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set in function environment");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;

  const body: Record<string, unknown> = { contents: opts.contents };

  if (opts.systemInstruction) {
    body.systemInstruction = { parts: [{ text: opts.systemInstruction }] };
  }

  const genConfig: Record<string, unknown> = {};
  if (opts.jsonMode) genConfig.responseMimeType = "application/json";
  if (opts.responseSchema) genConfig.responseSchema = opts.responseSchema;
  if (Object.keys(genConfig).length > 0) body.generationConfig = genConfig;

  const res = await axios.post(url, body, { timeout: opts.timeout || 30000 });
  return res.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Build farm context string from field/soil data
// ─────────────────────────────────────────────────────────────────────────────
function buildFarmContext(farmDetails?: string, fieldContext?: any, latestSoilReport?: any): string {
  let ctx = farmDetails ? `General farm context: ${farmDetails}\n` : "";

  if (fieldContext) {
    ctx += `Specific Plot/Field Context:
    - Name: ${fieldContext.name || "N/A"}
    - Area: ${fieldContext.area || "N/A"} ${fieldContext.unit || ""}
    - Soil Type: ${fieldContext.soilType || "N/A"}
    - Location: ${fieldContext.location || "N/A"}
    - Land Description: ${fieldContext.description || "N/A"}
    - Current Crop: ${fieldContext.currentCrop || "None recorded"}
    - Variety: ${fieldContext.variety || "N/A"}
    - Planting Date: ${fieldContext.plantingDate || "N/A"}
    - Previous Sprays: ${fieldContext.previousSprays || "None recorded"}
    - Irrigation Schedule: ${fieldContext.irrigationTimings || "None recorded"}
    - Other Details: ${fieldContext.otherDetails || "None"}\n`;
  }

  if (latestSoilReport) {
    ctx += `Latest Soil Report for this Plot:
    - Date: ${latestSoilReport.testDate || "N/A"}
    - pH: ${latestSoilReport.ph || "N/A"}
    - Nitrogen (N): ${latestSoilReport.nitrogen || "N/A"}
    - Phosphorus (P): ${latestSoilReport.phosphorus || "N/A"}
    - Potassium (K): ${latestSoilReport.potassium || "N/A"}
    - Organic Carbon: ${latestSoilReport.organicCarbon || "N/A"}
    - Notes: ${latestSoilReport.otherNotes || "N/A"}\n`;
  }

  return ctx;
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 4: Farming Advice Proxy (authenticated, server-side Gemini)
// ─────────────────────────────────────────────────────────────────────────────
export const getFarmingAdviceProxy = functions
  .runWith({ timeoutSeconds: 60, memory: "256MB" })
  .https.onCall(async (data: any, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Authentication required");
    }

    const { query, farmDetails, history, preferredLanguage = "English", fieldContext, latestSoilReport } = data;

    if (!query || typeof query !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "query is required");
    }
    if (query.length > 10000) {
      throw new functions.https.HttpsError("invalid-argument", "query too long (max 10000 chars)");
    }

    const contextStr = buildFarmContext(farmDetails, fieldContext, latestSoilReport);

    const systemInstruction = `You are a professional, helpful agronomist and farming AI advisor.
  - CURRENT DATE: Today is ${new Date().toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}. Use this date to give seasonal and timely advice.
  - CONTEXT USAGE: You are provided with "Specific Plot Context" and "Latest Soil Report". Use this context ONLY when it is directly relevant to answering the user's specific question. Do NOT provide a full action plan unless they ask for one or ask a question that requires it.
  - STYLE: Concise, clear, easy to read. Use bullet points when listing steps or providing actionable advice.
  - CONTENT: When giving specific agricultural advice, you may suggest fertilizers/sprays with brand names, and prioritize soil health.
  - INTERACTIVE: Keep responses focused. End with a short, relevant follow-up question.
  - LANGUAGE: Respond strictly in ${preferredLanguage}.
  - SCOPE: Politely redirect non-farming queries to farming topics.
  
  ${contextStr ? `--- Farmer Context ---\n${contextStr}\n----------------------` : ""}`;

    const historyToSend = (history || []).slice(-6);
    const contents = [...historyToSend, { role: "user", parts: [{ text: query }] }];

    try {
      const text = await callGeminiAdvanced({ systemInstruction, contents, timeout: 25000 });
      return { text: text || "I'm sorry, I couldn't generate a response at the moment. Please try again later." };
    } catch (err: any) {
      functions.logger.error("getFarmingAdviceProxy failed:", err.message);
      return { text: "The AI advisor is taking longer than usual. Please check your internet connection or try a shorter question." };
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 5: Image Analysis Proxy (authenticated, server-side Gemini vision)
// ─────────────────────────────────────────────────────────────────────────────
export const analyzeFarmingImageProxy = functions
  .runWith({ timeoutSeconds: 90, memory: "512MB" })
  .https.onCall(async (data: any, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Authentication required");
    }

    const { images, userQuery, farmDetails, preferredLanguage = "English", fieldContext, latestSoilReport } = data;

    if (!images || !Array.isArray(images) || images.length === 0) {
      throw new functions.https.HttpsError("invalid-argument", "At least one image is required");
    }
    if (images.length > 4) {
      throw new functions.https.HttpsError("invalid-argument", "Maximum 4 images allowed");
    }

    const contextStr = buildFarmContext(farmDetails, fieldContext, latestSoilReport);

    const systemInstruction = `Professional agronomist advisor. Direct, high-precision, supportive.
  - STYLE: Precise, immediate action-based, bullet points.
  - INTERACTIVE: Mandatory short follow-up question.
  - TASK: Analyze images + query + context to provide actionable advice.
  - LANGUAGE: ${preferredLanguage}.
  ${contextStr ? `Farmer Context:\n${contextStr}` : ""}`;

    const imageParts = images.map((img: any) => ({
      inlineData: { mimeType: img.mimeType, data: img.data },
    }));

    const contents = [{ role: "user", parts: [...imageParts, { text: userQuery || "Analyze these images." }] }];

    try {
      const text = await callGeminiAdvanced({ systemInstruction, contents, timeout: 35000 });
      return { text: text || "I was unable to analyze the images. Please check if they are clear and try again." };
    } catch (err: any) {
      functions.logger.error("analyzeFarmingImageProxy failed:", err.message);
      return { text: "Image analysis is taking unusually long. Please try again with fewer or smaller images." };
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 6: Plant Disease Detection Proxy (authenticated, server-side)
// ─────────────────────────────────────────────────────────────────────────────
export const detectPlantDiseaseProxy = functions
  .runWith({ timeoutSeconds: 60, memory: "512MB" })
  .https.onCall(async (data: any, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Authentication required");
    }

    const { base64Image, mimeType, language = "English" } = data;

    if (!base64Image || typeof base64Image !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "base64Image is required");
    }
    if (!mimeType || typeof mimeType !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "mimeType is required");
    }

    const prompt = `Identify the plant and check for diseases. Be supportive and direct. If diseased, name it, cause, and immediate treatment. If healthy, skip explanations and give one growth tip. Use bullet points. End by asking if the user has noticed this on other parts of the plant or in other plots. Respond strictly in ${language}.`;

    const contents = [{
      role: "user",
      parts: [
        { inlineData: { mimeType, data: base64Image } },
        { text: prompt },
      ],
    }];

    try {
      const text = await callGeminiAdvanced({ contents, timeout: 30000 });
      return { text: text || "I was unable to detect any disease. Please check the image quality." };
    } catch (err: any) {
      functions.logger.error("detectPlantDiseaseProxy failed:", err.message);
      throw new functions.https.HttpsError("internal", "Disease detection failed. Please try again.");
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 7: Extract Farm Updates Proxy (authenticated, server-side JSON)
// ─────────────────────────────────────────────────────────────────────────────
export const extractFarmUpdatesProxy = functions
  .runWith({ timeoutSeconds: 60, memory: "256MB" })
  .https.onCall(async (data: any, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Authentication required");
    }

    const { userQuery, botResponse, currentFieldData } = data;

    if (!userQuery || !botResponse) {
      return { fieldUpdates: {}, soilUpdates: {}, newTasks: [] };
    }

    const trimmedFieldData = currentFieldData ? {
      name: currentFieldData.name,
      currentCrop: currentFieldData.currentCrop,
      variety: currentFieldData.variety,
      plantingDate: currentFieldData.plantingDate,
      previousSprays: currentFieldData.previousSprays,
      irrigationTimings: currentFieldData.irrigationTimings,
      otherDetails: currentFieldData.otherDetails,
    } : {};

    const prompt = `
    Analyze the following conversation between a farmer and an AI advisor.
    Extract any relevant technical updates for the farm plot (field) record AND any NEW soil test metrics.
    
    CURRENT DATE: ${new Date().toISOString().split("T")[0]} (Use this exact date when tasks are 'immediate' or 'today')
    Current Field Data (if any): ${JSON.stringify(trimmedFieldData)}
    
    Farmer: ${userQuery}
    AI Advisor: ${botResponse}
    
    Return a single JSON object with THREE keys: "fieldUpdates", "soilUpdates", and "newTasks".
    
    For "fieldUpdates", extract any of these if they have NEW/UPDATED info compared to Current Field Data:
    - currentCrop (string)
    - variety (string)
    - plantingDate (string YYYY-MM-DD)
    - previousSprays (string - append chronologically)
    - irrigationTimings (string)
    - otherDetails (string)
    
    For "soilUpdates", extract these ONLY if NEW metrics are introduced/confirmed in this exact exchange:
    - ph (number - NEVER hallucinate, only extract if seen in text, e.g. "pH is 6.5")
    - nitrogen (number)
    - phosphorus (number)
    - potassium (number)
    - organicCarbon (number)
    - otherNotes (string)
    - testDate (ISO string)
    
    For "newTasks", extract any actionable recommendations the AI gave that should be scheduled as a task/reminder.
    Return an array of objects. Each object must have:
    - title (string)
    - description (string)
    - type ("irrigation", "fertilizer", "follow-up", "monitoring", "harvest", "other")
    - dueDate (string YYYY-MM-DD, estimate based on AI advice, use current date if immediate)
    
    If nothing relevant is found for fields, leave "fieldUpdates": {}.
    If nothing relevant is found for soil, leave "soilUpdates": {}.
    If no new tasks are found, leave "newTasks": [].
    Return ONLY a valid JSON object.`;

    try {
      const raw = await callGeminiAdvanced({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        jsonMode: true,
        timeout: 25000,
      });

      const parsed = JSON.parse(raw || "{}");

      // Ensure numbers for soil are correctly typed
      if (parsed.soilUpdates) {
        for (const key of ["ph", "nitrogen", "phosphorus", "potassium", "organicCarbon"]) {
          if (parsed.soilUpdates[key] !== undefined && parsed.soilUpdates[key] !== null) {
            parsed.soilUpdates[key] = Number(parsed.soilUpdates[key]);
          }
        }
      }

      return {
        fieldUpdates: parsed.fieldUpdates || {},
        soilUpdates: parsed.soilUpdates || {},
        newTasks: parsed.newTasks || [],
      };
    } catch (err: any) {
      functions.logger.warn("extractFarmUpdatesProxy failed:", err.message);
      return { fieldUpdates: {}, soilUpdates: {}, newTasks: [] };
    }
  });
