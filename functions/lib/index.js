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
exports.proxyDataGov = exports.getMarketSentiment = exports.aggregateMarketNews = exports.ingestMandiPrices = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const axios_1 = __importDefault(require("axios"));
admin.initializeApp();
const db = admin.firestore();
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
// FUNCTION 1: Ingest Daily Mandi Prices from Data.gov.in / Agmarknet
// Runs every day at 18:30 IST (13:00 UTC)
// ─────────────────────────────────────────────────────────────────────────────
exports.ingestMandiPrices = functions
    .runWith({ timeoutSeconds: 300, memory: "512MB" })
    .pubsub.schedule("0 13 * * *")
    .timeZone("Asia/Kolkata")
    .onRun(async (_context) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
    functions.logger.info("Starting Mandi price ingestion...");
    const AGMARKNET_API = "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070";
    const API_KEY = (_a = process.env.DATA_GOV_API_KEY) !== null && _a !== void 0 ? _a : "579b464db66ec23bdd000001cdd3946e44ce4aab351d4b4ec1aa1c95";
    const today = new Date().toISOString().split("T")[0];
    let offset = 0;
    const limit = 500;
    let totalIngested = 0;
    const batch = db.batch();
    let batchCount = 0;
    try {
        // Paginate through all results for today
        while (true) {
            const response = await axios_1.default.get(AGMARKNET_API, {
                params: {
                    "api-key": API_KEY,
                    format: "json",
                    limit,
                    offset,
                    filters: `[Arrival_Date=${today}]`,
                },
                timeout: 20000,
            });
            const records = (_c = (_b = response.data) === null || _b === void 0 ? void 0 : _b.records) !== null && _c !== void 0 ? _c : [];
            if (!records.length)
                break;
            for (const r of records) {
                try {
                    const state = ((_d = r["State"]) !== null && _d !== void 0 ? _d : "").trim();
                    const district = ((_e = r["District"]) !== null && _e !== void 0 ? _e : "").trim();
                    const market = ((_f = r["Market"]) !== null && _f !== void 0 ? _f : "").trim();
                    const commodity = ((_g = r["Commodity"]) !== null && _g !== void 0 ? _g : "").trim();
                    const variety = ((_h = r["Variety"]) !== null && _h !== void 0 ? _h : "").trim();
                    const minPrice = parseFloat((_k = (_j = r["Min_x0020_Price"]) !== null && _j !== void 0 ? _j : r["Min Price"]) !== null && _k !== void 0 ? _k : "0");
                    const maxPrice = parseFloat((_m = (_l = r["Max_x0020_Price"]) !== null && _l !== void 0 ? _l : r["Max Price"]) !== null && _m !== void 0 ? _m : "0");
                    const modalPrice = parseFloat((_p = (_o = r["Modal_x0020_Price"]) !== null && _o !== void 0 ? _o : r["Modal Price"]) !== null && _p !== void 0 ? _p : "0");
                    if (!state || !commodity || !modalPrice)
                        continue;
                    const docId = `${state}_${district}_${commodity}_${today}`
                        .replace(/\s+/g, "_")
                        .toLowerCase();
                    const data = {
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
                }
                catch (rowErr) {
                    functions.logger.warn("Skipping bad row:", rowErr);
                }
            }
            if (records.length < limit)
                break;
            offset += limit;
        }
        if (batchCount > 0)
            await batch.commit();
        functions.logger.info(`Ingested ${totalIngested} mandi records for ${today}`);
    }
    catch (err) {
        functions.logger.error("Mandi ingestion failed:", (_q = err.message) !== null && _q !== void 0 ? _q : err);
        // Store error status in Firestore for monitoring
        await db.collection("system_logs").doc("mandi_ingestion").set({
            last_run: admin.firestore.Timestamp.now(),
            status: "error",
            error: (_r = err.message) !== null && _r !== void 0 ? _r : "Unknown error",
            date: today,
        });
    }
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
    // 1. Fetch last 30 days of modal prices from Firestore
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoffDate = thirtyDaysAgo.toISOString().split("T")[0];
    let priceHistory = [];
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
    }
    catch (e) {
        functions.logger.warn("Firestore price history query failed:", e);
    }
    // 2. Fetch latest news summaries
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
// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 6: Proxy for data.gov.in API (Solves CORS)
// ─────────────────────────────────────────────────────────────────────────────
exports.proxyDataGov = functions.https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
    }
    try {
        const targetPath = req.originalUrl.replace(/^\/api\/datagov/, "");
        const targetUrl = `https://api.data.gov.in${targetPath}`;
        const response = await axios_1.default.get(targetUrl, {
            responseType: 'stream',
            validateStatus: () => true,
        });
        res.status(response.status);
        if (response.headers["content-type"]) {
            res.set("Content-Type", response.headers["content-type"]);
        }
        response.data.pipe(res);
    }
    catch (error) {
        console.error("Proxy error:", error);
        res.status(500).json({ error: "Failed to proxy request" });
    }
});
//# sourceMappingURL=index.js.map