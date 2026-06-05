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
exports.getMarketSentiment = exports.aggregateMarketNews = exports.syncMandiToSupabase = void 0;
const functions = __importStar(require("firebase-functions"));
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
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
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
// Runs every day at 11:00 PM IST (17:30 UTC)
// ─────────────────────────────────────────────────────────────────────────────
exports.syncMandiToSupabase = functions
    .runWith({ timeoutSeconds: 540, memory: "1GB" })
    .pubsub.schedule("30 17 * * *")
    .timeZone("Asia/Kolkata")
    .onRun(async (_context) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
    functions.logger.info("Starting Mandi → Supabase sync for priority states...");
    const API_URL = "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070";
    const API_KEY = (_a = process.env.DATA_GOV_API_KEY) !== null && _a !== void 0 ? _a : "";
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
        const stateRecords = [];
        // Paginate through all records for this state
        while (true) {
            try {
                const response = await axios_1.default.get(API_URL, {
                    params: {
                        "api-key": API_KEY,
                        format: "json",
                        limit,
                        offset,
                        "filters[State]": state, // As per your API schema
                    },
                    timeout: 20000,
                });
                const records = (_c = (_b = response.data) === null || _b === void 0 ? void 0 : _b.records) !== null && _c !== void 0 ? _c : [];
                if (!records.length)
                    break;
                for (const r of records) {
                    // Mapping exactly from the API's PascalCase JSON to our lowercase Supabase schema
                    const row = {
                        state: ((_d = r.State) !== null && _d !== void 0 ? _d : "").trim(),
                        district: ((_e = r.District) !== null && _e !== void 0 ? _e : "").trim(),
                        market_name: ((_f = r.Market) !== null && _f !== void 0 ? _f : "").trim(),
                        commodity: ((_g = r.Commodity) !== null && _g !== void 0 ? _g : "").trim(),
                        variety: ((_h = r.Variety) !== null && _h !== void 0 ? _h : "").trim(),
                        min_price: parseInt(r.Min_Price) || 0,
                        max_price: parseInt(r.Max_Price) || 0,
                        modal_price: parseInt(r.Modal_Price) || 0,
                        arrival_date: parseArrivalDate((_j = r.Arrival_Date) !== null && _j !== void 0 ? _j : ""),
                    };
                    if (row.state && row.commodity && row.modal_price > 0) {
                        stateRecords.push(row);
                    }
                }
                if (records.length < limit)
                    break;
                offset += limit;
            }
            catch (err) {
                functions.logger.warn(`Fetch failed for ${state} offset=${offset}:`, (_k = err.message) !== null && _k !== void 0 ? _k : err);
                totalErrors++;
                break;
            }
        }
        // Batch upsert into Supabase (max 500 rows per call)
        for (let i = 0; i < stateRecords.length; i += 500) {
            const batch = stateRecords.slice(i, i + 500);
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
                functions.logger.warn(`Upsert exception for ${state}:`, (_l = err.message) !== null && _l !== void 0 ? _l : err);
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
        const { error, count } = await getSupabaseAdmin()
            .from("mandi_prices")
            .delete()
            .lt("arrival_date", cutoffStr);
        if (error) {
            functions.logger.warn("Purge error:", error.message);
        }
        else {
            functions.logger.info(`Purged ${count !== null && count !== void 0 ? count : "?"} rows older than ${cutoffStr}`);
        }
    }
    catch (err) {
        functions.logger.warn("Purge exception:", (_m = err.message) !== null && _m !== void 0 ? _m : err);
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
exports.aggregateMarketNews = functions
    .runWith({ timeoutSeconds: 180, memory: "256MB" })
    .pubsub.schedule("30 2 * * *") // 08:00 IST = 02:30 UTC
    .timeZone("Asia/Kolkata")
    .onRun(async (_context) => {
    var _a, _b, _c;
    functions.logger.info("Starting market news aggregation...");
    // Seed news from public RSS / government portals
    const RAW_SOURCES = [
        "https://newsapi.org/v2/everything?q=India+mandi+prices+agriculture&language=en&pageSize=10",
        // Fallback: we always generate AI news as well
    ];
    let rawSnippets = [];
    // Try NewsAPI if key is set
    const newsApiKey = process.env.NEWS_API_KEY;
    if (newsApiKey) {
        try {
            const newsResp = await axios_1.default.get(RAW_SOURCES[0] + `&apiKey=${newsApiKey}`, { timeout: 10000 });
            const articles = (_b = (_a = newsResp.data) === null || _a === void 0 ? void 0 : _a.articles) !== null && _b !== void 0 ? _b : [];
            rawSnippets = articles.slice(0, 10).map((a) => { var _a, _b; return `${a.title}: ${(_b = (_a = a.description) !== null && _a !== void 0 ? _a : a.content) !== null && _b !== void 0 ? _b : ""}`; });
        }
        catch (e) {
            functions.logger.warn("NewsAPI failed, using Gemini-generated news context");
        }
    }
    // If no real news fetched, have Gemini generate today's key agricultural events
    const prompt = rawSnippets.length > 0
        ? `You are an expert Indian agri-economist. Analyze these news items and return EXACTLY 3 that directly affect Indian commodity market prices (MSP announcements, import/export duty changes, monsoon updates, trade pacts, storage shortages).\n\nNews items:\n${rawSnippets.join("\n")}\n\nReturn a JSON array of exactly 3 objects. Each: { "title": string (max 10 words), "impact": string (2 sentences, simple language), "sentiment": "Positive"|"Negative"|"Neutral", "commodity": string (affected crop or "General") }`
        : `You are an expert Indian agri-economist. Generate a realistic summary of 3 key agricultural market events that would affect Indian Mandi prices TODAY (${new Date().toLocaleDateString("en-IN")}). Include one about MSP/government policy, one about monsoon/weather impact, and one about export/import trade. Return a JSON array of exactly 3 objects: { "title": string, "impact": string (2 sentences), "sentiment": "Positive"|"Negative"|"Neutral", "commodity": string }`;
    try {
        const raw = await callGemini(prompt, true);
        const parsed = JSON.parse(raw);
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
    }
    catch (err) {
        functions.logger.error("News aggregation failed:", (_c = err.message) !== null && _c !== void 0 ? _c : err);
    }
    return null;
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
        const newsDoc = await db.collection("market_news").doc("latest").get();
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