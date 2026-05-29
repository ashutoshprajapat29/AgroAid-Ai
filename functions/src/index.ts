import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import axios from "axios";

admin.initializeApp();
const db = admin.firestore();

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
interface MandiRecord {
  state: string;
  district: string;
  market_name: string;
  commodity: string;
  variety: string;
  min_price: number;
  max_price: number;
  modal_price: number;
  date: string;
  ingested_at: admin.firestore.Timestamp;
}

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
// FUNCTION 1: Ingest Daily Mandi Prices from Data.gov.in / Agmarknet
// Runs every day at 18:30 IST (13:00 UTC)
// ─────────────────────────────────────────────────────────────────────────────
export const ingestMandiPrices = functions
  .runWith({ timeoutSeconds: 300, memory: "512MB" })
  .pubsub.schedule("0 13 * * *")
  .timeZone("Asia/Kolkata")
  .onRun(async (_context) => {
    functions.logger.info("Starting Mandi price ingestion...");

    const AGMARKNET_API =
      "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070";
    const API_KEY = process.env.DATA_GOV_API_KEY ?? "579b464db66ec23bdd000001cdd3946e44ce4aab351d4b4ec1aa1c95";

    const today = new Date().toISOString().split("T")[0];
    let offset = 0;
    const limit = 500;
    let totalIngested = 0;
    const batch = db.batch();
    let batchCount = 0;

    try {
      // Paginate through all results for today
      while (true) {
        const response = await axios.get(AGMARKNET_API, {
          params: {
            "api-key": API_KEY,
            format: "json",
            limit,
            offset,
            filters: `[Arrival_Date=${today}]`,
          },
          timeout: 20000,
        });

        const records: any[] = response.data?.records ?? [];
        if (!records.length) break;

        for (const r of records) {
          try {
            const state = (r["State"] ?? "").trim();
            const district = (r["District"] ?? "").trim();
            const market = (r["Market"] ?? "").trim();
            const commodity = (r["Commodity"] ?? "").trim();
            const variety = (r["Variety"] ?? "").trim();
            const minPrice = parseFloat(r["Min_x0020_Price"] ?? r["Min Price"] ?? "0");
            const maxPrice = parseFloat(r["Max_x0020_Price"] ?? r["Max Price"] ?? "0");
            const modalPrice = parseFloat(r["Modal_x0020_Price"] ?? r["Modal Price"] ?? "0");

            if (!state || !commodity || !modalPrice) continue;

            const docId = `${state}_${district}_${commodity}_${today}`
              .replace(/\s+/g, "_")
              .toLowerCase();

            const data: MandiRecord = {
              state,
              district,
              market_name: market,
              commodity,
              variety,
              min_price: minPrice,
              max_price: maxPrice,
              modal_price: modalPrice,
              date: today,
              ingested_at: admin.firestore.Timestamp.now(),
            };

            // Full history collection
            batch.set(db.collection("mandi_prices").doc(docId), data, { merge: true });

            // Latest price per district-commodity (cheap reads for home feed)
            const latestDocId = `${state}_${district}_${commodity}`
              .replace(/\s+/g, "_")
              .toLowerCase();
            batch.set(db.collection("mandi_latest").doc(latestDocId), data, { merge: true });

            batchCount++;
            totalIngested++;

            // Firestore batch limit is 500
            if (batchCount >= 490) {
              await batch.commit();
              batchCount = 0;
            }
          } catch (rowErr) {
            functions.logger.warn("Skipping bad row:", rowErr);
          }
        }

        if (records.length < limit) break;
        offset += limit;
      }

      if (batchCount > 0) await batch.commit();
      functions.logger.info(`Ingested ${totalIngested} mandi records for ${today}`);
    } catch (err: any) {
      functions.logger.error("Mandi ingestion failed:", err.message ?? err);
      // Store error status in Firestore for monitoring
      await db.collection("system_logs").doc("mandi_ingestion").set({
        last_run: admin.firestore.Timestamp.now(),
        status: "error",
        error: err.message ?? "Unknown error",
        date: today,
      });
    }
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

    // 1. Fetch last 30 days of modal prices from Firestore
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoffDate = thirtyDaysAgo.toISOString().split("T")[0];

    let priceHistory: { date: string; modal_price: number; min_price: number; max_price: number }[] = [];
    try {
      const q = db.collection("mandi_prices")
        .where("commodity", "==", commodity)
        .where("state", "==", state)
        .where("date", ">=", cutoffDate)
        .orderBy("date", "asc")
        .limit(30);

      const snap = await q.get();
      priceHistory = snap.docs.map((d) => {
        const r = d.data();
        return { date: r.date, modal_price: r.modal_price, min_price: r.min_price, max_price: r.max_price };
      });
    } catch (e) {
      functions.logger.warn("Firestore price history query failed:", e);
    }

    // 2. Fetch latest news summaries
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

