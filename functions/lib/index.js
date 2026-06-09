"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMarketSentiment = exports.fetchAgriNews = exports.syncMandiToSupabase = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const axios_1 = __importDefault(require("axios"));
const supabase_js_1 = require("@supabase/supabase-js");
admin.initializeApp();
const db = admin.firestore();
// ─── Supabase admin client (service_role for writes) ──────────────────────────
// Lazily initialize to prevent "supabaseUrl is required" errors during Firebase deployment
let supabaseAdmin = null;
function getSupabaseAdmin() {
    var _a, _b;
    if (!supabaseAdmin) {
        supabaseAdmin = (0, supabase_js_1.createClient)((_a = process.env.SUPABASE_URL) !== null && _a !== void 0 ? _a : "https://dummy.supabase.co", (_b = process.env.SUPABASE_SERVICE_ROLE_KEY) !== null && _b !== void 0 ? _b : "dummy_key");
    }
    return supabaseAdmin;
}
// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Call Gemini REST API directly (no SDK in functions)
// ─────────────────────────────────────────────────────────────────────────────
async function callGemini(prompt, jsonMode = false) {
    var _a, _b, _c, _d, _e, _f, _g;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey)
        throw new Error("GEMINI_API_KEY not set in function environment");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
    const body = {
        contents: [{ parts: [{ text: prompt }] }],
    };
    if (jsonMode) {
        body.generationConfig = { responseMimeType: "application/json" };
    }
    const res = await axios_1.default.post(url, body, { timeout: 30000 });
    return (_g = (_f = (_e = (_d = (_c = (_b = (_a = res.data) === null || _a === void 0 ? void 0 : _a.candidates) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.content) === null || _d === void 0 ? void 0 : _d.parts) === null || _e === void 0 ? void 0 : _e[0]) === null || _f === void 0 ? void 0 : _f.text) !== null && _g !== void 0 ? _g : "";
}
// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Parse date from data.gov.in (handles DD/MM/YYYY and YYYY-MM-DD)
// ─────────────────────────────────────────────────────────────────────────────
function parseArrivalDate(dateStr) {
    if (!dateStr)
        return new Date().toISOString().split("T")[0];
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
// Runs every day at 11:30 AM IST (data.gov.in publishes previous day's data by morning)
// ─────────────────────────────────────────────────────────────────────────────
exports.syncMandiToSupabase = functions
    .runWith({ timeoutSeconds: 540, memory: "1GB" })
    .pubsub.schedule("30 11 * * *")
    .timeZone("Asia/Kolkata")
    .onRun(async (context) => {
    var _a, _b, _c, _d, _e, _f;
    functions.logger.info("Starting Mandi → Supabase sync for priority states...");
    // Historical endpoint — data persists permanently, uses PascalCase field names
    const API_URL = "https://api.data.gov.in/resource/35985678-0d79-46b4-9ed6-6f13308a1d24";
    const API_KEY = (_a = process.env.DATA_GOV_API_KEY) !== null && _a !== void 0 ? _a : "";
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
        const stateRecords = [];
        let offset = 0;
        const limit = 500;
        // Paginate through records for this state + date
        while (true) {
            let retries = 3;
            let success = false;
            let records = [];
            while (retries > 0 && !success) {
                try {
                    const response = await axios_1.default.get(API_URL, {
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
                    records = (_c = (_b = response.data) === null || _b === void 0 ? void 0 : _b.records) !== null && _c !== void 0 ? _c : [];
                    success = true;
                }
                catch (err) {
                    retries--;
                    functions.logger.warn(`Fetch failed for ${state} date=${targetDate} offset=${offset}. Retries left: ${retries}. Error:`, (_d = err.message) !== null && _d !== void 0 ? _d : err);
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
            if (!records.length)
                break;
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
            if (records.length < limit)
                break;
            offset += limit;
            // Rate limit delay between successful pagination requests
            await new Promise((resolve) => setTimeout(resolve, 500));
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
                    .upsert(batch, {
                    onConflict: "state,district,market_name,commodity,variety,arrival_date",
                });
                if (error) {
                    functions.logger.warn(`Upsert error for ${state}:`, error.message);
                    totalErrors++;
                }
                else {
                    totalUpserted += batch.length;
                }
            }
            catch (err) {
                functions.logger.warn(`Upsert exception for ${state}:`, (_e = err.message) !== null && _e !== void 0 ? _e : err);
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
        }
        else {
            purgedRows = count !== null && count !== void 0 ? count : 0;
            functions.logger.info(`Purged ${purgedRows} rows older than ${cutoffStr}`);
        }
    }
    catch (err) {
        functions.logger.warn("Purge exception:", (_f = err.message) !== null && _f !== void 0 ? _f : err);
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
async function fetchRSSFeedServer(feedUrl, source) {
    var _a, _b, _c, _d, _e;
    try {
        const resp = await axios_1.default.get(feedUrl, {
            timeout: 10000,
            headers: { "User-Agent": "AgroAid-AI/1.0 (+https://agroaid.app)" },
        });
        const text = resp.data;
        const articles = [];
        const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
        let match;
        while ((match = itemRegex.exec(text)) !== null && articles.length < 5) {
            const item = match[1];
            const title = ((_a = item.match(/<title><!\[CDATA\[(.*?)\]\]>|<title>(.*?)<\/title>/)) === null || _a === void 0 ? void 0 : _a[1]) || ((_b = item.match(/<title>(.*?)<\/title>/)) === null || _b === void 0 ? void 0 : _b[1]) || "";
            const desc = ((_c = item.match(/<description><!\[CDATA\[(.*?)\]\]>|<description>(.*?)<\/description>/)) === null || _c === void 0 ? void 0 : _c[1]) || ((_d = item.match(/<description>(.*?)<\/description>/)) === null || _d === void 0 ? void 0 : _d[1]) || "";
            const link = ((_e = item.match(/<link>(.*?)<\/link>/)) === null || _e === void 0 ? void 0 : _e[1]) || "";
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
    }
    catch (e) {
        functions.logger.warn(`RSS feed ${source} failed:`, e);
        return [];
    }
}
exports.fetchAgriNews = functions
    .runWith({ timeoutSeconds: 60, memory: "256MB" })
    .https.onCall(async (data, context) => {
    var _a, _b;
    const language = data.language || "English";
    const cacheDocId = `news_${language.toLowerCase()}`;
    // Check Firestore cache (12hr)
    try {
        const doc = await db.collection("agri_news_cache").doc(cacheDocId).get();
        if (doc.exists) {
            const cacheData = doc.data();
            const ageMs = Date.now() - ((_b = (_a = cacheData.cached_at) === null || _a === void 0 ? void 0 : _a.toMillis()) !== null && _b !== void 0 ? _b : 0);
            if (ageMs < 12 * 60 * 60 * 1000) {
                return { items: cacheData.items, cached: true };
            }
        }
    }
    catch (e) {
        functions.logger.warn("Cache read failed:", e);
    }
    // Fetch RSS feeds in parallel
    const feedResults = await Promise.allSettled(RSS_FEEDS.map((f) => fetchRSSFeedServer(f.url, f.source)));
    const allArticles = [];
    for (const result of feedResults) {
        if (result.status === "fulfilled")
            allArticles.push(...result.value);
    }
    let items = [];
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
                items = parsed.map((item, i) => {
                    var _a, _b, _c, _d, _e, _f;
                    return (Object.assign(Object.assign({}, item), { source: (_c = (_b = (_a = top[i]) === null || _a === void 0 ? void 0 : _a.source) !== null && _b !== void 0 ? _b : item.source) !== null && _c !== void 0 ? _c : "", link: (_f = (_e = (_d = top[i]) === null || _d === void 0 ? void 0 : _d.link) !== null && _e !== void 0 ? _e : item.link) !== null && _f !== void 0 ? _f : "" }));
                }).slice(0, 4);
            }
        }
        catch (e) {
            functions.logger.warn("Gemini classification failed, using raw articles");
            items = top.slice(0, 4).map((a) => ({
                title: a.title,
                impact: a.description,
                sentiment: "Neutral",
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
            if (Array.isArray(parsed))
                items = parsed.slice(0, 3);
        }
        catch (e) {
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
    }
    catch (e) {
        functions.logger.warn("Cache write failed:", e);
    }
    return { items, cached: false };
});
// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 3: AI Market Sentiment Engine (HTTP Callable)
// Called from frontend when user views a crop page
// ─────────────────────────────────────────────────────────────────────────────
exports.getMarketSentiment = functions
    .runWith({ timeoutSeconds: 60, memory: "256MB" })
    .https.onCall(async (data) => {
    var _a, _b, _c, _d, _e, _f;
    const { commodity, state, district } = data;
    if (!commodity || !state) {
        throw new functions.https.HttpsError("invalid-argument", "commodity and state are required");
    }
    functions.logger.info(`Sentiment request: ${commodity} in ${state}/${district}`);
    // 1. Fetch last 30 days of modal prices from Supabase
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoffDate = thirtyDaysAgo.toISOString().split("T")[0];
    let priceHistory = [];
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
            priceHistory = rows.map((r) => ({
                date: r.arrival_date,
                modal_price: r.modal_price,
                min_price: r.min_price,
                max_price: r.max_price,
            }));
        }
    }
    catch (e) {
        functions.logger.warn("Supabase price history query failed:", e);
    }
    // 2. Fetch latest news summaries from Firestore
    let newsItems = [];
    try {
        const newsDoc = await db.collection("agri_news_cache").doc("news_english").get();
        if (newsDoc.exists) {
            newsItems = (_b = (_a = newsDoc.data()) === null || _a === void 0 ? void 0 : _a.items) !== null && _b !== void 0 ? _b : [];
        }
    }
    catch (e) {
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
            sentiment: (_c = result.sentiment) !== null && _c !== void 0 ? _c : "Stable",
            confidence: (_d = result.confidence) !== null && _d !== void 0 ? _d : 50,
            why: (_e = result.why) !== null && _e !== void 0 ? _e : "Market data is insufficient for a confident analysis.",
            action: (_f = result.action) !== null && _f !== void 0 ? _f : "Monitor prices daily before selling.",
            priceHistory,
            newsItems,
        };
    }
    catch (err) {
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
//# sourceMappingURL=index.js.map