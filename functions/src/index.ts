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
  id: string;
  title: string;
  impact: string;
  sentiment: "Positive" | "Negative" | "Neutral";
  commodity: string;
  commodity_hi: string;
  category?: string;
  source?: string;
  link?: string;
  pubDate?: string;
  publishedAt?: string;
  timeAgo?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Call Gemini REST API directly (no SDK in functions)
// ─────────────────────────────────────────────────────────────────────────────
async function callGemini(prompt: string, jsonMode = false): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set in function environment");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;
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
// HELPER: Fetch all mandi records for a single state + date from data.gov.in
// Returns parsed rows ready for Supabase upsert
// ─────────────────────────────────────────────────────────────────────────────
async function fetchStateDate(
  apiUrl: string,
  apiKey: string,
  state: string,
  targetDate: string
): Promise<{ rows: Record<string, unknown>[]; errors: number }> {
  const stateRecords: Record<string, unknown>[] = [];
  let offset = 0;
  const limit = 100;
  let errors = 0;

  while (true) {
    let retries = 3;
    let success = false;
    let records: any[] = [];

    while (retries > 0 && !success) {
      try {
        const response = await axios.get(apiUrl, {
          params: {
            "api-key": apiKey,
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
          errors++;
          break;
        }
        // Exponential backoff: 5s, 10s, 20s
        const backoff = 5000 * Math.pow(2, 3 - retries);
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }

    if (!success) break;
    if (!records.length) break;

    for (const r of records) {
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

  return { rows: stateRecords, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Build an array of DD/MM/YYYY date strings for the last N days in IST
// ─────────────────────────────────────────────────────────────────────────────
function getBackfillDatesIST(daysBack: number): string[] {
  const dates: string[] = [];
  const now = new Date();
  // Convert current UTC time to IST
  const istNow = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));

  for (let i = 1; i <= daysBack; i++) {
    const d = new Date(istNow);
    d.setUTCDate(d.getUTCDate() - i);
    const day = String(d.getUTCDate()).padStart(2, "0");
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    const year = d.getUTCFullYear();
    dates.push(`${day}/${month}/${year}`);
  }

  return dates;
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 1: Sync Mandi Prices to Supabase (replaces old Firestore ingestion)
// Runs once daily at 7:00 AM IST.
// Fetches a rolling 3-day window to automatically backfill any missed days.
// ─────────────────────────────────────────────────────────────────────────────
export const syncMandiToSupabase = functions
  .runWith({ timeoutSeconds: 540, memory: "1GB" })
  .pubsub.schedule("0 7 * * *")
  .timeZone("Asia/Kolkata")
  .onRun(async (context: functions.EventContext) => {
    functions.logger.info("Starting Mandi → Supabase sync (rolling 3-day backfill)...");

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

    // Rolling 3-day window: yesterday, day-before-yesterday, and 3 days ago
    const targetDates = getBackfillDatesIST(3);
    functions.logger.info(`Target dates: ${targetDates.join(", ")}`);

    for (const targetDate of targetDates) {
      for (const state of PRIORITY_STATES) {
        // Early exit if approaching 9-minute timeout (at 7.5 mins = 450000ms)
        if (Date.now() - startTime > 450000) {
          functions.logger.warn("Approaching function timeout. Halting processing early to finish gracefully.");
          break;
        }

        const { rows: stateRecords, errors: fetchErrors } = await fetchStateDate(API_URL, API_KEY, state, targetDate);
        totalErrors += fetchErrors;

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
              functions.logger.warn(`Upsert error for ${state} ${targetDate}:`, error.message);
              totalErrors++;
            } else {
              totalUpserted += batch.length;
            }
          } catch (err: any) {
            functions.logger.warn(`Upsert exception for ${state} ${targetDate}:`, err.message ?? err);
            totalErrors++;
          }
        }

        functions.logger.info(`[${state}][${targetDate}] ${uniqueStateRecords.length} records processed`);

        // Brief delay between states to prevent overwhelming the API
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }

      // Check timeout again between date passes
      if (Date.now() - startTime > 450000) {
        functions.logger.warn("Approaching function timeout after date pass. Stopping.");
        break;
      }

      functions.logger.info(`Completed backfill for date ${targetDate}`);
    }

    // Mandi price retention: Automatic purging disabled to continuously store all historical data in Supabase.
    let purgedRows = 0;

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
      dates_covered: targetDates.length,
    });

    return null;
  });

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 2: Live Multi-Source Agri News Aggregator + Commodity Grouping
// Aggregates real-time news from verified Indian agriculture RSS feeds:
// - The Hindu BusinessLine (Agri-business)
// - Google News India Agriculture (English & Hindi)
// - Krishi Jagran
// Grouped by commodity with sentiment analysis and cached for 1 hour
// ─────────────────────────────────────────────────────────────────────────────

const RSS_FEEDS = [
  { url: "https://www.thehindubusinessline.com/economy/agri-business/feeder/default.rss", defaultSource: "The Hindu BusinessLine", lang: "en" },
  { url: "https://news.google.com/rss/search?q=agriculture+india+mandi+crop+prices+when:7d&hl=en-IN&gl=IN&ceid=IN:en", defaultSource: "Google News", lang: "en" },
  { url: "https://news.google.com/rss/search?q=%E0%A4%95%E0%A5%83%E0%A4%B7%E0%A4%BF+%E0%A4%AE%E0%A4%82%E0%A4%A1%E0%A5%80+%E0%A4%AB%E0%A4%B8%E0%A4%B2+%E0%A4%AD%E0%A4%BE%E0%A4%B5+when:7d&hl=hi&gl=IN&ceid=IN:hi", defaultSource: "Google News Hindi", lang: "hi" },
  { url: "https://hindi.krishijagran.com/feeds/rss", defaultSource: "Krishi Jagran Hindi", lang: "hi" },
  { url: "https://krishijagran.com/feeds/rss", defaultSource: "Krishi Jagran", lang: "en" },
];

function cleanXmlText(str: string): string {
  if (!str) return "";
  let text = str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8216;|&#8217;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&#8230;/g, "...");

  // Strip all HTML tags completely after entity decoding
  text = text.replace(/<[^>]*>/g, "");
  // Strip any raw URLs
  text = text.replace(/https?:\/\/\S+/g, "");

  return text.replace(/\s+/g, " ").trim();
}

const COMMODITY_TAXONOMY = [
  { name: "Wheat", hi: "गेहूँ", patterns: [/\bwheat\b/i, /\bgehu\b/i, /गेहूं/, /गेहूँ/] },
  { name: "Paddy / Rice", hi: "धान / चावल", patterns: [/\bpaddy\b/i, /\brice\b/i, /\bdhan\b/i, /धान/, /चावल/, /बासमती/, /\bbasmati\b/i] },
  { name: "Soybean", hi: "सोयाबीन", patterns: [/\bsoybean\b/i, /\bsoya\b/i, /सोयाबीन/, /सोया/] },
  { name: "Cotton", hi: "कपास", patterns: [/\bcotton\b/i, /\bkapas\b/i, /\bnarma\b/i, /कपास/, /नरमा/, /सूत/] },
  { name: "Mustard", hi: "सरसों", patterns: [/\bmustard\b/i, /\bsarson\b/i, /\brapeseed\b/i, /सरसों/, /राई/, /तारामीरा/] },
  { name: "Onion", hi: "प्याज", patterns: [/\bonion\b/i, /\bpyaz\b/i, /प्याज/, /कांदा/] },
  { name: "Potato", hi: "आलू", patterns: [/\bpotato\b/i, /\baloo\b/i, /आलू/] },
  { name: "Tomato", hi: "टमाटर", patterns: [/\btomato\b/i, /\btamatar\b/i, /टमाटर/] },
  { name: "Maize / Corn", hi: "मक्का", patterns: [/\bmaize\b/i, /\bcorn\b/i, /\bmakka\b/i, /मक्का/, /भुट्टा/] },
  { name: "Gram / Chana", hi: "चना", patterns: [/\bchana\b/i, /\bchickpea\b/i, /\bgram\b/i, /चना/, /छोले/, /काबुली/] },
  { name: "Pulses / Dal", hi: "दालें / दलहन", patterns: [/\bpulses?\b/i, /\bdal\b/i, /\btur\b/i, /\barhar\b/i, /\bmoong\b/i, /\burad\b/i, /\bmasoor\b/i, /दलहन/, /दाल/, /अरहर/, /मूंग/, /उड़द/, /मसूर/] },
  { name: "Garlic & Ginger", hi: "लहसुन व अदरक", patterns: [/\bgarlic\b/i, /\bginger\b/i, /\blahsun\b/i, /\badrak\b/i, /लहसुन/, /अदरक/] },
  { name: "Spices", hi: "मसाले", patterns: [/\bspices?\b/i, /\bjeera\b/i, /\bcumin\b/i, /\bcoriander\b/i, /\bdhaniya\b/i, /\bturmeric\b/i, /\bhaldi\b/i, /\bchilli\b/i, /\bcardamom\b/i, /मसाले/, /जीरा/, /हल्दी/, /धनिया/, /मिर्च/, /इलायची/] },
  { name: "Sugarcane", hi: "गन्ना", patterns: [/\bsugarcane\b/i, /\bsugar\b/i, /\bganna\b/i, /गन्ना/, /चीनी/, /गुड़/, /\bjaggery\b/i] },
  { name: "Edible Oils", hi: "खाद्य तेल", patterns: [/\bedible oils?\b/i, /\boilseeds?\b/i, /\bpalm oil\b/i, /तिलहन/, /खाद्य तेल/, /तेल/] },
  { name: "Fruits & Vegetables", hi: "फल व सब्जियां", patterns: [/\bfruits?\b/i, /\bvegetables?\b/i, /\bapple\b/i, /\bmango\b/i, /\bbanana\b/i, /फल/, /सब्ज/] },
  { name: "Dairy & Livestock", hi: "डेयरी व पशुपालन", patterns: [/\bmilk\b/i, /\bdairy\b/i, /\bcattle\b/i, /\blivestock\b/i, /\bpoultry\b/i, /दूध/, /डेयरी/, /पशु/, /गोपालन/] },
  { name: "Fertilizer & Seeds", hi: "उर्वरक व बीज", patterns: [/\bfertilizer\b/i, /\burea\b/i, /\bdap\b/i, /\bseeds?\b/i, /खाद/, /उर्वरक/, /यूरिया/, /बीज/] },
  { name: "Weather & Monsoon", hi: "मौसम व मानसून", patterns: [/\bmonsoon\b/i, /\brainfall\b/i, /\bweather\b/i, /\bdrought\b/i, /\bflood\b/i, /\brain\b/i, /बारिश/, /मानसून/, /मौसम/, /सूखा/, /बाढ़/] },
  { name: "Policy & MSP", hi: "नीति व एमएसपी", patterns: [/\bmsp\b/i, /\bprocurement\b/i, /\bsubsidy\b/i, /\bscheme\b/i, /\bkisan\b/i, /एमएसपी/, /सब्सिडी/, /खरीद/, /योजना/, /नीति/] }
];

function classifyCommodity(text: string): { commodity: string; commodity_hi: string } {
  for (const item of COMMODITY_TAXONOMY) {
    for (const pat of item.patterns) {
      if (pat.test(text)) {
        return { commodity: item.name, commodity_hi: item.hi };
      }
    }
  }
  return { commodity: "General Agriculture", commodity_hi: "सामान्य कृषि" };
}

function classifySentiment(text: string): "Positive" | "Negative" | "Neutral" {
  const posRegex = /\b(surge|jump|ris(e|ing|en)|gains?|hike|rally|higher|boom|record|bumper|profit|bullish|relief|boost|upswing)\b|तेजी|उछाल|बढ़ोतरी|रिकॉर्ड|मुनाफा|बंपर|खुश|राहत|मजबूत|वृद्धि|ऊंचे|फायदा/i;
  const negRegex = /\b(crash|falls?|falling|fallen|drop|plunge|slump|decline|loss(es)?|pest|damage|rot|delay|drought|flood|dip|bearish|slashing|glut)\b|गिरावट|मंदी|नुकसान|घाटा|कीट|रोग|सूखा|बाढ़|कमी|गिरे|कम|चुनौती|संकट|असर/i;

  if (posRegex.test(text)) return "Positive";
  if (negRegex.test(text)) return "Negative";
  return "Neutral";
}

function generateImpact(desc: string, title: string, commodity: string, commodity_hi: string, sentiment: "Positive" | "Negative" | "Neutral", isHindi: boolean): string {
  const cleanedDesc = (desc || "")
    .replace(/<[^>]*>/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .trim();

  // If desc is missing, too short, contains raw html leftovers, or basically just the headline repeating
  const normTitle = (title || "").toLowerCase().replace(/[^a-z0-9\u0900-\u097F]/g, "").slice(0, 25);
  const normDesc = cleanedDesc.toLowerCase().replace(/[^a-z0-9\u0900-\u097F]/g, "").slice(0, 25);
  const isRedundant = !cleanedDesc ||
    cleanedDesc.length < 30 ||
    cleanedDesc.startsWith("<") ||
    (normTitle && normDesc && (normTitle === normDesc || normDesc.includes(normTitle)));

  if (!isRedundant) {
    const trimmed = cleanedDesc.slice(0, 180);
    return trimmed.endsWith(".") ? trimmed : trimmed + "...";
  }

  if (isHindi) {
    if (sentiment === "Positive") {
      return `इस घटनाक्रम से ${commodity_hi} के बाजार भाव व मांग में सकारात्मक रुझान देखने को मिल सकता है।`;
    } else if (sentiment === "Negative") {
      return `इस खबर से ${commodity_hi} की स्थानीय आवक व मंडी कीमतों पर दबाव रहने की संभावना है।`;
    }
    return `${commodity_hi} से जुड़ी नवीनतम गतिविधियों पर किसान मंडी भाव व आगामी नीतियों के अनुसार निर्णय लें।`;
  } else {
    if (sentiment === "Positive") {
      return `Positive developments indicate supportive price momentum and steady trade demand for ${commodity}.`;
    } else if (sentiment === "Negative") {
      return `Market signals suggest cautious arrivals or downward price pressure for ${commodity}.`;
    }
    return `Stay updated on mandi arrivals and trading volume trends regarding ${commodity}.`;
  }
}

function getRelativeTime(dateStr?: string, isHindi = false): string {
  if (!dateStr) return isHindi ? "ताज़ा" : "Recent";
  try {
    const timestamp = Date.parse(dateStr);
    if (isNaN(timestamp)) return isHindi ? "ताज़ा" : "Recent";
    const diffMs = Date.now() - timestamp;
    if (diffMs < 0 || diffMs < 60 * 1000) return isHindi ? "अभी-अभी" : "Just now";
    const mins = Math.floor(diffMs / (60 * 1000));
    const hours = Math.floor(diffMs / (60 * 60 * 1000));
    const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    if (mins < 60) return isHindi ? `${mins} मिनट पहले` : `${mins}m ago`;
    if (hours < 24) return isHindi ? `${hours} घंटे पहले` : `${hours}h ago`;
    if (days === 1) return isHindi ? "कल" : "Yesterday";
    return isHindi ? `${days} दिन पहले` : `${days}d ago`;
  } catch {
    return isHindi ? "ताज़ा" : "Recent";
  }
}

async function fetchRSSFeedServer(
  feedUrl: string,
  defaultSource: string,
  isHindiLang: boolean
): Promise<NewsItem[]> {
  try {
    const resp = await axios.get(feedUrl, {
      timeout: 10000,
      headers: { "User-Agent": "AgroAid-AI/2.0 (+https://agroaid.app)" },
      maxContentLength: 1024 * 1024,
      maxBodyLength: 1024 * 1024,
    });
    const text: string = resp.data;
    const articles: NewsItem[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;

    while ((match = itemRegex.exec(text)) !== null) {
      const itemXml = match[1];
      const title = cleanXmlText(itemXml.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "");
      if (!title || title.length < 8) continue;

      const desc = cleanXmlText(itemXml.match(/<description>([\s\S]*?)<\/description>/)?.[1] || "");
      const link = cleanXmlText(itemXml.match(/<link>([\s\S]*?)<\/link>/)?.[1] || "");
      const pubDate = cleanXmlText(itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || "");
      const itemSource = cleanXmlText(itemXml.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] || "") || defaultSource;

      const fullContent = `${title} ${desc}`;
      const { commodity, commodity_hi } = classifyCommodity(fullContent);
      const sentiment = classifySentiment(fullContent);
      const impact = generateImpact(desc, title, commodity, commodity_hi, sentiment, isHindiLang);
      const timeAgo = getRelativeTime(pubDate, isHindiLang);

      // Create a deterministic clean ID
      const cleanSlug = title.toLowerCase().replace(/[^a-z0-9\u0900-\u097F]/g, "").slice(0, 30);
      const id = `${cleanSlug}-${Date.parse(pubDate) || articles.length}`;

      let publishedAt = new Date().toISOString();
      if (pubDate) {
        const parsed = Date.parse(pubDate);
        if (!isNaN(parsed)) {
          // Discard articles older than 7 days (or future timestamps beyond 24 hours)
          const ageMs = Date.now() - parsed;
          if (ageMs > 7 * 24 * 60 * 60 * 1000 || ageMs < -24 * 60 * 60 * 1000) {
            return articles;
          }
          publishedAt = new Date(parsed).toISOString();
        }
      }

      articles.push({
        id,
        title,
        impact,
        sentiment,
        commodity,
        commodity_hi,
        source: itemSource,
        link,
        pubDate,
        publishedAt,
        timeAgo,
      });
    }
    return articles;
  } catch (e) {
    functions.logger.warn(`RSS feed ${defaultSource} failed:`, e);
    return [];
  }
}

export const fetchAgriNews = functions
  .runWith({ timeoutSeconds: 60, memory: "256MB" })
  .https.onCall(async (data: { language?: string; forceRefresh?: boolean }, context) => {
    const language = data.language || "English";
    const isHindi = language === "Hindi";
    const cacheDocId = `news_${language.toLowerCase()}`;
    const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour fresh cache

    // Check Firestore cache unless forceRefresh
    if (!data.forceRefresh) {
      try {
        const doc = await db.collection("agri_news_cache").doc(cacheDocId).get();
        if (doc.exists) {
          const cacheData = doc.data()!;
          const ageMs = Date.now() - (cacheData.cached_at?.toMillis() ?? 0);
          if (ageMs < CACHE_TTL_MS && Array.isArray(cacheData.items) && cacheData.items.length > 0) {
            return { items: cacheData.items, cached: true, totalCount: cacheData.items.length };
          }
        }
      } catch (e) {
        functions.logger.warn("Cache read failed:", e);
      }
    }

    // Fetch RSS feeds in parallel
    const feedResults = await Promise.allSettled(
      RSS_FEEDS.map((f) => fetchRSSFeedServer(f.url, f.defaultSource, isHindi))
    );

    const allArticles: NewsItem[] = [];
    const seenTitles = new Set<string>();

    for (const result of feedResults) {
      if (result.status === "fulfilled") {
        for (const item of result.value) {
          const normTitle = item.title.toLowerCase().replace(/[^a-z0-9\u0900-\u097F]/g, "").slice(0, 45);
          if (!seenTitles.has(normTitle)) {
            seenTitles.add(normTitle);
            allArticles.push(item);
          }
        }
      }
    }

    // Sort: When in Hindi, prioritize Hindi articles at top while preserving recency; otherwise pure recency descending
    allArticles.sort((a, b) => {
      const timeA = a.publishedAt ? Date.parse(a.publishedAt) : 0;
      const timeB = b.publishedAt ? Date.parse(b.publishedAt) : 0;
      if (isHindi) {
        const isHindiA = /[\u0900-\u097F]/.test(a.title) ? 1 : 0;
        const isHindiB = /[\u0900-\u097F]/.test(b.title) ? 1 : 0;
        if (isHindiA !== isHindiB) return isHindiB - isHindiA;
      }
      return timeB - timeA;
    });

    // Fallback: in case all network feeds were unreachable
    if (allArticles.length === 0) {
      allArticles.push({
        id: "fallback-news-1",
        title: isHindi
          ? "मंडियों में नई रबी फसलों की आवक सामान्य, समर्थन मूल्य पर खरीद जारी"
          : "Mandi arrivals for rabi crops remain steady, procurement active at MSP",
        impact: isHindi
          ? "प्रमुख कृषि उपज मंडियों में सामान्य व्यापारिक कारोबार जारी है।"
          : "Trading continues normally across major agricultural markets in the region.",
        sentiment: "Neutral",
        commodity: "Wheat",
        commodity_hi: "गेहूँ",
        source: "AgroAid Market Desk",
        timeAgo: isHindi ? "आज" : "Today",
        publishedAt: new Date().toISOString(),
      });
    }

    // Cache results in Firestore
    try {
      await db.collection("agri_news_cache").doc(cacheDocId).set({
        items: allArticles,
        cached_at: admin.firestore.Timestamp.now(),
        language,
        totalCount: allArticles.length,
      });
    } catch (e) {
      functions.logger.warn("Cache write failed:", e);
    }

    return { items: allArticles, cached: false, totalCount: allArticles.length };
  });



// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 3: AI Market Sentiment Engine (HTTP Callable)
// Called from frontend when user views a crop page
// ─────────────────────────────────────────────────────────────────────────────
export const getMarketSentiment = functions
  .runWith({ timeoutSeconds: 60, memory: "256MB" })
  .https.onCall(async (data: { commodity: string; state: string; district?: string; language?: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Authentication required for market sentiment.");
    }

    const { commodity, state, district, language = "English" } = data;
    if (!commodity || !state) {
      throw new functions.https.HttpsError("invalid-argument", "commodity and state are required");
    }

    functions.logger.info(`Sentiment request: ${commodity} in ${state}/${district}`);

    // 1. Fetch historical modal prices from Supabase (up to 60-90 days of daily aggregated data)
    const daysToFetch = Math.min(Math.max((data as any).days || 60, 7), 90);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysToFetch);
    const cutoffDate = startDate.toISOString().split("T")[0];

    let priceHistory: { date: string; modal_price: number; min_price: number; max_price: number }[] = [];
    const admin = getSupabaseAdmin();

    // Try localized district history via RPC first if district provided
    if (district) {
      try {
        const { data: rpcRows, error: rpcErr } = await (admin as any).rpc("get_price_history", {
          p_commodity: commodity,
          p_state: state,
          p_district: district,
          p_days: daysToFetch,
        });

        if (!rpcErr && Array.isArray(rpcRows) && rpcRows.length >= 3) {
          priceHistory = (rpcRows as any[]).map((r: any) => ({
            date: r.arrival_date,
            modal_price: Number(r.avg_modal) || 0,
            min_price: Number(r.avg_min) || 0,
            max_price: Number(r.avg_max) || 0,
          })).filter((p: any) => p.modal_price > 0);
        }
      } catch (rpcEx) {
        functions.logger.warn("RPC get_price_history district lookup failed:", rpcEx);
      }
    }

    // Fallback or broader state aggregation if district data is sparse (< 3 distinct days)
    if (priceHistory.length < 3) {
      try {
        const { data: rows, error } = await (admin as any)
          .from("mandi_prices")
          .select("arrival_date, modal_price, min_price, max_price")
          .ilike("commodity", commodity)
          .eq("state", state)
          .gte("arrival_date", cutoffDate)
          .order("arrival_date", { ascending: true })
          .limit(1000);

        if (!error && Array.isArray(rows) && rows.length > 0) {
          // Aggregate multiple markets/varieties into one true daily average per arrival_date
          const dailyMap = new Map<string, { totalModal: number; min: number; max: number; count: number }>();
          for (const r of (rows as any[])) {
            const date = r.arrival_date;
            const modal = Number(r.modal_price) || 0;
            const min = Number(r.min_price) || modal;
            const max = Number(r.max_price) || modal;
            if (!date || modal <= 0) continue;

            const current = dailyMap.get(date);
            if (current) {
              current.totalModal += modal;
              current.count += 1;
              current.min = Math.min(current.min, min);
              current.max = Math.max(current.max, max);
            } else {
              dailyMap.set(date, { totalModal: modal, min, max, count: 1 });
            }
          }

          priceHistory = Array.from(dailyMap.entries())
            .map(([date, stats]) => ({
              date,
              modal_price: Math.round(stats.totalModal / stats.count),
              min_price: stats.min,
              max_price: stats.max,
            }))
            .sort((a, b) => a.date.localeCompare(b.date));
        }
      } catch (e) {
        functions.logger.warn("Supabase state price history query failed:", e);
      }
    }

    // 2. Fetch latest news summaries from Firestore
    let newsItems: NewsItem[] = [];
    try {
      const cacheDocId = `news_${language.toLowerCase()}`;
      const newsDoc = await db.collection("agri_news_cache").doc(cacheDocId).get();
      if (newsDoc.exists) {
        newsItems = newsDoc.data()?.items ?? [];
      }
    } catch (e) {
      functions.logger.warn("Could not fetch news:", e);
    }

    // 3. Compute concrete price momentum metrics for Gemini
    let trendStatsStr = "Insufficient historical price points.";
    if (priceHistory.length >= 2) {
      const firstPoint = priceHistory[0];
      const lastPoint = priceHistory[priceHistory.length - 1];
      const priceDiff = lastPoint.modal_price - firstPoint.modal_price;
      const pctChange = ((priceDiff / firstPoint.modal_price) * 100).toFixed(1);
      const direction = priceDiff > 0 ? "UP" : priceDiff < 0 ? "DOWN" : "STABLE";

      trendStatsStr = `Calculated Price Movement:
- Historical window: ${priceHistory.length} distinct trading days across past ${daysToFetch} days
- Earliest recorded price: ₹${firstPoint.modal_price}/qtl on ${firstPoint.date}
- Latest recorded price: ₹${lastPoint.modal_price}/qtl on ${lastPoint.date}
- Net change: ${direction} by ₹${Math.abs(priceDiff)}/qtl (${pctChange}%)`;
    }

    // 4. Call Gemini for sentiment analysis
    const historyStr = priceHistory.length > 0
      ? priceHistory.map((p) => `${p.date}: ₹${p.modal_price}/qtl`).join(", ")
      : "No historical data available — use general market knowledge for this commodity";

    // Filter news specific to this commodity, or general news if sparse
    const relevantNews = newsItems.filter((n) =>
      (n.commodity && n.commodity.toLowerCase().includes(commodity.toLowerCase())) ||
      (commodity.toLowerCase().includes(n.commodity?.toLowerCase() || "")) ||
      n.title.toLowerCase().includes(commodity.toLowerCase())
    );
    const chosenNews = relevantNews.length > 0 ? relevantNews.slice(0, 6) : newsItems.slice(0, 4);

    const newsStr = chosenNews.length > 0
      ? chosenNews.map((n) => `[${n.sentiment} | ${n.commodity}] ${n.title}: ${n.impact}`).join("\n")
      : "No specific news — use general seasonal patterns";

    const prompt = `Context:
- Commodity: ${commodity}
- Region: ${district ? `${district}, ` : ""}${state}
- ${daysToFetch}-Day Daily Aggregated Price History (${priceHistory.length} trading days):
${historyStr}
- Trend Analysis:
${trendStatsStr}
- Recent Trade/Regulatory News:
${newsStr}

Task: As an expert Indian agricultural commodity analyst, analyze the price trend momentum and news sentiment.
Do NOT guess exact future prices. Provide:
1. A sentiment indicator: exactly one of "Bullish", "Bearish", or "Stable" (in English)
2. A confidence score 0-100
3. A "why" explanation in exactly 3 plain-language sentences that a farmer can understand. Respond strictly in ${language}.
4. A recommended action for the farmer (1 sentence). Respond strictly in ${language}.

Return valid JSON: { "sentiment": "Bullish"|"Bearish"|"Stable", "confidence": number, "why": string, "action": string }`;

    try {
      const raw = await callGemini(prompt, true);
      const result = JSON.parse(raw);
      return {
        sentiment: result.sentiment ?? "Stable",
        confidence: result.confidence ?? 50,
        why: result.why ?? (language === "Hindi" ? "बाज़ार डेटा एक विश्वसनीय विश्लेषण के लिए अपर्याप्त है।" : "Market data is insufficient for a confident analysis."),
        action: result.action ?? (language === "Hindi" ? "बेचने से पहले दैनिक कीमतों की निगरानी करें।" : "Monitor prices daily before selling."),
        priceHistory,
        newsItems,
      };
    } catch (err: any) {
      functions.logger.error("Sentiment Gemini call failed:", err.message);
      return {
        sentiment: "Stable",
        confidence: 40,
        why: language === "Hindi"
          ? "इस समय बाजार के रुझान का विश्लेषण करने में असमर्थ। कृपया बाद में पुनः प्रयास करें।"
          : "Unable to analyze market sentiment at this time. Please check back later.",
        action: language === "Hindi"
          ? "अगले 2-3 दिनों तक बाजार पर नजर रखें और प्रतीक्षा करें।"
          : "Hold and monitor the market for the next 2-3 days.",
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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;

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
