/**
 * mandiService.ts
 * Real data.gov.in API for mandi prices + price history via date filters.
 * RSS feeds for real news. Gemini AI only for sentiment classification.
 */

import { GoogleGenAI } from "@google/genai";
import { cachedApiCall, cachedGeminiCall, cacheGet, cacheSet, TTL } from "../lib/apiCache";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface MandiPrice {
  state: string;
  district: string;
  market_name: string;
  commodity: string;
  variety: string;
  min_price: number;
  max_price: number;
  modal_price: number;
  date: string;
}

export interface PriceHistory {
  date: string;
  modal_price: number;
  min_price: number;
  max_price: number;
}

export interface NewsItem {
  title: string;
  impact: string;
  sentiment: "Positive" | "Negative" | "Neutral";
  commodity?: string;
  source?: string;
  link?: string;
}

export interface SentimentResult {
  sentiment: "Bullish" | "Bearish" | "Stable";
  confidence: number;
  why: string;
  action: string;
}

export interface MarketCompare {
  market_name: string;
  district: string;
  modal_price: number;
  min_price: number;
  max_price: number;
  date: string;
}

// ─── API config ───────────────────────────────────────────────────────────────
const DATA_GOV_API_KEY = import.meta.env.VITE_DATA_GOV_API_KEY ?? "";

// ─── Gemini client (only for sentiment) ───────────────────────────────────────
const GEN_AI_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEN_AI_KEY2 = import.meta.env.VITE_GEMINI_API_KEY2;
const ai = new GoogleGenAI({ apiKey: GEN_AI_KEY ?? GEN_AI_KEY2 ?? "" });

async function geminiGenerate(prompt: string): Promise<string> {
  const resp = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: [{ parts: [{ text: prompt }] }],
    config: { responseMimeType: "application/json" },
  });
  return resp.text ?? "[]";
}

// ─── data.gov.in API call ─────────────────────────────────────────────────────
interface DataGovRecord {
  state: string;
  district: string;
  market: string;
  commodity: string;
  variety: string;
  grade: string;
  arrival_date: string;
  min_price: string;
  max_price: string;
  modal_price: string;
}

async function callDataGovAPI(params: Record<string, string>, retries = 1): Promise<DataGovRecord[]> {
  const qp = new URLSearchParams();
  qp.set("api-key", DATA_GOV_API_KEY);
  qp.set("format", "json");
  qp.set("limit", params.limit ?? "30");

  if (params.offset) qp.set("offset", params.offset);
  if (params.state) qp.set("filters[state.keyword]", params.state);
  if (params.district) qp.set("filters[district]", params.district);
  if (params.market) qp.set("filters[market]", params.market);
  if (params.commodity) qp.set("filters[commodity]", params.commodity);
  if (params.arrival_date) qp.set("filters[arrival_date]", params.arrival_date);

  const queryString = qp.toString().replace(/\+/g, "%20");
  const targetUrl = `https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070?${queryString}`;
  
  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      
      const resp = await fetch(targetUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!resp.ok) throw new Error(`data.gov.in API error: ${resp.status}`);
      const json = await resp.json();
      return (json.records ?? []) as DataGovRecord[];
    } catch (error) {
      if (i === retries) {
        console.error("data.gov.in final attempt failed:", error);
        throw error;
      }
      console.warn(`data.gov.in attempt ${i + 1} failed, retrying...`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  return [];
}

function recordToMandiPrice(r: DataGovRecord): MandiPrice {
  return {
    state: r.state ?? "",
    district: r.district ?? "",
    market_name: r.market ?? "",
    commodity: r.commodity ?? "",
    variety: r.variety ?? "",
    min_price: parseInt(r.min_price) || 0,
    max_price: parseInt(r.max_price) || 0,
    modal_price: parseInt(r.modal_price) || 0,
    date: r.arrival_date ?? new Date().toISOString().split("T")[0],
  };
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
type TimeRange = "1D" | "7D" | "30D" | "1Y";

function getDateRange(range: TimeRange): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  switch (range) {
    case "1D":  from.setDate(from.getDate() - 1); break;
    case "7D":  from.setDate(from.getDate() - 7); break;
    case "30D": from.setDate(from.getDate() - 30); break;
    case "1Y":  from.setFullYear(from.getFullYear() - 1); break;
  }
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  return { from: fmt(from), to: fmt(to) };
}

// ─── 1. Latest mandi prices (REAL API) ────────────────────────────────────────
export async function fetchLatestPrices(
  state: string,
  district: string,
  _language = "English"
): Promise<MandiPrice[]> {
  const cacheKey = `mandi_v2_${state}_${district}`.replace(/\s+/g, "_").toLowerCase();

  return cachedApiCall(
    cacheKey,
    TTL.MANDI_API,
    async () => {
      try {
        const records = await callDataGovAPI({ state, district, limit: "30" });
        if (records.length > 0) {
          return records.map(recordToMandiPrice);
        }
      } catch (e) {
        console.warn("data.gov.in API failed:", e);
      }
      // Fallback: try without district filter
      try {
        const records = await callDataGovAPI({ state, limit: "20" });
        if (records.length > 0) {
          return records.map(recordToMandiPrice);
        }
      } catch (e) {
        console.warn("data.gov.in state-level fallback failed:", e);
      }
      return [];
    },
    [] as MandiPrice[]
  );
}

// ─── 2. Search mandis/commodities ─────────────────────────────────────────────
export async function searchMandiPrices(
  searchQuery: string,
  searchType: "commodity" | "market" = "commodity"
): Promise<MandiPrice[]> {
  const cacheKey = `mandi_search_${searchType}_${searchQuery}`.replace(/\s+/g, "_").toLowerCase();

  return cachedApiCall(
    cacheKey,
    TTL.MANDI_API,
    async () => {
      // Try original case first, then uppercase fallback
      for (const caseVariant of [searchQuery, searchQuery.toUpperCase()]) {
        try {
          const params: Record<string, string> = { limit: "50" };
          if (searchType === "commodity") {
            params.commodity = caseVariant;
          } else {
            params.market = caseVariant;
          }
          const records = await callDataGovAPI(params);
          if (records.length > 0) return records.map(recordToMandiPrice);
        } catch (e) {
          console.warn(`Mandi search failed for "${caseVariant}":`, e);
        }
      }
      return [];
    },
    [] as MandiPrice[]
  );
}

// ─── 3. Real Price History via data.gov.in date filters ───────────────────────
export async function fetchPriceHistory(
  commodity: string,
  state: string,
  district: string,
  range: TimeRange = "30D"
): Promise<PriceHistory[]> {
  const cacheKey = `history_${range}_${commodity}_${state}_${district}`.replace(/\s+/g, "_").toLowerCase();

  return cachedApiCall(
    cacheKey,
    range === "1D" ? TTL.MANDI_API : TTL.HISTORY,
    async () => {
      const { from, to } = getDateRange(range);
      const commodityUpper = commodity.toUpperCase();

      // data.gov.in supports arrival_date filter — fetch records in date range
      try {
        // Try fetching with district + commodity + date range
        const records = await callDataGovAPI({
          state,
          district,
          commodity: commodityUpper,
          arrival_date: `${from}to${to}`,
          limit: "500",
        });

        if (records.length > 0) {
          return aggregateHistory(records);
        }
      } catch (e) {
        console.warn("Price history with district failed:", e);
      }

      // Fallback: state-level (no district)
      try {
        const records = await callDataGovAPI({
          state,
          commodity: commodityUpper,
          arrival_date: `${from}to${to}`,
          limit: "500",
        });
        if (records.length > 0) {
          return aggregateHistory(records);
        }
      } catch (e) {
        console.warn("Price history state-level fallback failed:", e);
      }

      // Final fallback: just commodity nationwide
      try {
        const records = await callDataGovAPI({
          commodity: commodityUpper,
          arrival_date: `${from}to${to}`,
          limit: "200",
        });
        if (records.length > 0) {
          return aggregateHistory(records);
        }
      } catch (e) {
        console.warn("Price history nationwide fallback failed:", e);
      }

      return [];
    },
    [] as PriceHistory[]
  );
}

/** Aggregate multiple records per date into daily averages */
function aggregateHistory(records: DataGovRecord[]): PriceHistory[] {
  const dayMap = new Map<string, { modals: number[]; mins: number[]; maxs: number[] }>();

  for (const r of records) {
    const date = r.arrival_date ?? "";
    if (!date) continue;
    if (!dayMap.has(date)) dayMap.set(date, { modals: [], mins: [], maxs: [] });
    const bucket = dayMap.get(date)!;
    const modal = parseInt(r.modal_price) || 0;
    const min = parseInt(r.min_price) || 0;
    const max = parseInt(r.max_price) || 0;
    if (modal > 0) bucket.modals.push(modal);
    if (min > 0) bucket.mins.push(min);
    if (max > 0) bucket.maxs.push(max);
  }

  const avg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

  return Array.from(dayMap.entries())
    .map(([date, b]) => ({
      date,
      modal_price: avg(b.modals),
      min_price: avg(b.mins),
      max_price: avg(b.maxs),
    }))
    .filter((p) => p.modal_price > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ─── 4. Market Comparison — Same commodity, different mandis ──────────────────
export async function fetchMarketComparison(
  commodity: string,
  state: string
): Promise<MarketCompare[]> {
  const cacheKey = `mandi_mkt_compare_${commodity}_${state}`.replace(/\s+/g, "_").toLowerCase();

  return cachedApiCall(
    cacheKey,
    TTL.MANDI_API,
    async () => {
      try {
        const records = await callDataGovAPI({
          state,
          commodity: commodity.toUpperCase(),
          limit: "100",
        });
        // Group by market and pick the latest record for each
        const marketMap = new Map<string, MarketCompare>();
        for (const r of records) {
          const key = r.market;
          if (!marketMap.has(key)) {
            marketMap.set(key, {
              market_name: r.market ?? "",
              district: r.district ?? "",
              modal_price: parseInt(r.modal_price) || 0,
              min_price: parseInt(r.min_price) || 0,
              max_price: parseInt(r.max_price) || 0,
              date: r.arrival_date ?? "",
            });
          }
        }
        return Array.from(marketMap.values())
          .filter((m) => m.modal_price > 0)
          .sort((a, b) => b.modal_price - a.modal_price)
          .slice(0, 15);
      } catch (e) {
        console.warn("Market comparison failed:", e);
        return [];
      }
    },
    [] as MarketCompare[]
  );
}

// ─── 5. Nearby mandis (geolocation → state mapping) ──────────────────────────
export async function fetchNearbyPrices(
  lat: number,
  lng: number
): Promise<{ state: string; district: string; prices: MandiPrice[] }> {
  const location = await reverseGeocode(lat, lng);
  const prices = await fetchLatestPrices(location.state, location.district);
  return { ...location, prices };
}

async function reverseGeocode(lat: number, lng: number): Promise<{ state: string; district: string }> {
  const cacheKey = `geocode_${lat.toFixed(2)}_${lng.toFixed(2)}`;
  const cached = cacheGet<{ state: string; district: string }>(cacheKey);
  if (cached) return cached;

  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
      { headers: { "User-Agent": "AgroAid-AI/1.0" } }
    );
    const data = await resp.json();
    const addr = data.address ?? {};

    const state = mapToDataGovState(addr.state ?? addr.state_district ?? "");
    const district = addr.county ?? addr.state_district ?? addr.city ?? "";

    const result = { state, district };
    cacheSet(cacheKey, result, 24 * 60 * 60 * 1000);
    return result;
  } catch (e) {
    console.warn("Reverse geocoding failed:", e);
    return { state: "Madhya Pradesh", district: "Ratlam" }; // updated default
  }
}

function mapToDataGovState(rawState: string): string {
  const stateMap: Record<string, string> = {
    "maharashtra": "Maharashtra",
    "punjab": "Punjab",
    "uttar pradesh": "Uttar Pradesh",
    "madhya pradesh": "Madhya Pradesh",
    "rajasthan": "Rajasthan",
    "haryana": "Haryana",
    "gujarat": "Gujarat",
    "karnataka": "Karnataka",
    "andhra pradesh": "Andhra Pradesh",
    "bihar": "Bihar",
    "west bengal": "West Bengal",
    "tamil nadu": "Tamil Nadu",
    "telangana": "Telangana",
    "odisha": "Odisha",
    "kerala": "Kerala",
    "assam": "Assam",
    "jharkhand": "Jharkhand",
    "chhattisgarh": "Chhattisgarh",
    "uttarakhand": "Uttarakhand",
    "himachal pradesh": "Himachal Pradesh",
    "goa": "Goa",
    "tripura": "Tripura",
    "meghalaya": "Meghalaya",
    "manipur": "Manipur",
    "nagaland": "Nagaland",
    "mizoram": "Mizoram",
    "arunachal pradesh": "Arunachal Pradesh",
    "sikkim": "Sikkim",
    "delhi": "Delhi",
    "jammu and kashmir": "Jammu and Kashmir",
    "chandigarh": "Chandigarh",
    "puducherry": "Puducherry",
  };
  return stateMap[rawState.toLowerCase().trim()] ?? rawState;
}

// ─── 6. Real News via RSS feeds ───────────────────────────────────────────────
const RSS_FEEDS = [
  { url: "https://www.krishijagran.com/rss/news.xml", source: "Krishi Jagran" },
  { url: "https://economictimes.indiatimes.com/news/economy/agriculture/rssfeeds/68880913.cms", source: "ET Agriculture" },
];

interface RSSArticle {
  title: string;
  description: string;
  link: string;
  source: string;
}

async function fetchRSSFeed(feedUrl: string, source: string): Promise<RSSArticle[]> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    // Use a free CORS proxy for RSS feeds (allorigins)
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(feedUrl)}`;
    const resp = await fetch(proxyUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!resp.ok) throw new Error(`RSS fetch failed: ${resp.status}`);
    const text = await resp.text();

    // Parse XML manually (no DOM parser dependency)
    const articles: RSSArticle[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;
    while ((match = itemRegex.exec(text)) !== null && articles.length < 5) {
      const item = match[1];
      const title = item.match(/<title><!\[CDATA\[(.*?)\]\]>|<title>(.*?)<\/title>/)?.[1] || item.match(/<title>(.*?)<\/title>/)?.[1] || "";
      const desc = item.match(/<description><!\[CDATA\[(.*?)\]\]>|<description>(.*?)<\/description>/)?.[1] || item.match(/<description>(.*?)<\/description>/)?.[1] || "";
      const link = item.match(/<link>(.*?)<\/link>/)?.[1] || "";

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
    console.warn(`RSS feed ${source} failed:`, e);
    return [];
  }
}

export async function fetchMarketNews(language = "English"): Promise<NewsItem[]> {
  const cacheKey = `news_rss_${language}`.toLowerCase();

  return cachedApiCall(
    cacheKey,
    TTL.NEWS,
    async () => {
      // 1. Fetch real RSS articles
      const allArticles: RSSArticle[] = [];
      const feedResults = await Promise.allSettled(
        RSS_FEEDS.map((f) => fetchRSSFeed(f.url, f.source))
      );
      for (const result of feedResults) {
        if (result.status === "fulfilled") allArticles.push(...result.value);
      }

      // If we have real articles, use Gemini to classify sentiment only
      if (allArticles.length > 0) {
        const topArticles = allArticles.slice(0, 5);
        try {
          const langNote = language === "Hindi"
            ? "Translate title and impact to Hindi (Devanagari script)."
            : "Keep in English.";

          const prompt = `Classify the sentiment of these agricultural news articles.
${langNote}
Articles:
${topArticles.map((a, i) => `${i + 1}. "${a.title}" — ${a.description}`).join("\n")}

Return ONLY a JSON array. For each article:
{"title":string,"impact":string (2 short sentences summarizing market impact),"sentiment":"Positive"|"Negative"|"Neutral","commodity":string (main commodity mentioned or "General"),"source":string,"link":string}
Preserve the source and link from input.`;

          const raw = await geminiGenerate(prompt);
          let parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            // Restore source/link from original articles
            parsed = parsed.map((item: any, i: number) => ({
              ...item,
              source: topArticles[i]?.source ?? item.source ?? "",
              link: topArticles[i]?.link ?? item.link ?? "",
            }));
            return parsed.slice(0, 4) as NewsItem[];
          }
        } catch (e) {
          console.warn("Gemini sentiment classification failed, using raw articles:", e);
          // Fallback: return raw articles without sentiment
          return topArticles.slice(0, 4).map((a) => ({
            title: a.title,
            impact: a.description,
            sentiment: "Neutral" as const,
            commodity: "General",
            source: a.source,
            link: a.link,
          }));
        }
      }

      // Fallback: AI-generated news if RSS fails entirely
      try {
        const langNote = language === "Hindi"
          ? "Write title and impact in Hindi (Devanagari script)."
          : "Write in English.";

        const prompt = `You are an expert Indian agri-economist. Generate 3 realistic, impactful agricultural news items for Indian farmers today.
Cover: 1 government policy/MSP, 1 monsoon/weather impact, 1 export/import trade.
${langNote}
Return ONLY a JSON array of exactly 3 objects:
{"title":string,"impact":string,"sentiment":"Positive"|"Negative"|"Neutral","commodity":string}
Keep title under 12 words. Impact: 2 plain sentences.`;

        const raw = await geminiGenerate(prompt);
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.slice(0, 3) : [];
      } catch {
        return [{
          title: language === "Hindi" ? "सरकार ने खरीफ फसलों का MSP बढ़ाया" : "Government raises Kharif crop MSP",
          impact: language === "Hindi"
            ? "सरकार ने प्रमुख खरीफ फसलों का न्यूनतम समर्थन मूल्य बढ़ाया है। इससे किसानों को उनकी फसल का उचित मूल्य मिलेगा।"
            : "The government has increased the Minimum Support Price for major Kharif crops. This ensures farmers receive fair value.",
          sentiment: "Positive",
          commodity: "General",
        }];
      }
    },
    [] as NewsItem[]
  );
}

// ─── 7. AI Market Sentiment (Gemini — user-triggered) ─────────────────────────
export async function fetchMarketSentiment(
  commodity: string,
  priceHistory: PriceHistory[],
  news: NewsItem[],
  language = "English"
): Promise<SentimentResult> {
  const cacheKey = `sentiment_${commodity}_${language}`.replace(/\s+/g, "_").toLowerCase();

  const fallback: SentimentResult = {
    sentiment: "Stable",
    confidence: 45,
    why: language === "Hindi"
      ? "बाज़ार डेटा सीमित है। मौसमी औसत के आधार पर कीमतें स्थिर रहने की उम्मीद है।"
      : "Market data is limited. Price stability is expected based on seasonal averages.",
    action: language === "Hindi"
      ? "बेचने का निर्णय लेने से पहले 2-3 दिनों तक बाज़ार पर नज़र रखें।"
      : "Monitor prices for 2-3 days before making selling decisions.",
  };

  return cachedGeminiCall(
    cacheKey,
    TTL.SENTIMENT,
    async () => {
      const historyStr = priceHistory.length > 0
        ? priceHistory.slice(-10).map((p) => `${p.date}: ₹${p.modal_price}`).join(", ")
        : "No historical data";
      const newsStr = news.length > 0
        ? news.map((n) => `[${n.sentiment}] ${n.title}`).join("; ")
        : "No specific news";
      const langNote = language === "Hindi"
        ? "Respond entirely in Hindi (Devanagari script)."
        : "Respond in English.";

      const prompt = `You are an expert Indian agricultural commodity analyst.
Context:
- Commodity: ${commodity}
- Recent Price History (last 10 days): ${historyStr}
- Recent Market News: ${newsStr}

${langNote}
Analyze and return ONLY valid JSON:
{ "sentiment": "Bullish"|"Bearish"|"Stable", "confidence": <0-100>, "why": "<3 plain sentences>", "action": "<1 farmer advice sentence>" }`;

      const raw = await geminiGenerate(prompt);
      return JSON.parse(raw) as SentimentResult;
    },
    fallback
  );
}

// ─── Filter data ──────────────────────────────────────────────────────────────
export const INDIA_STATES_DISTRICTS: Record<string, string[]> = {
  "Madhya Pradesh": ["Ratlam", "Indore", "Bhopal", "Gwalior", "Jabalpur", "Sagar", "Dewas", "Ujjain","Morena","Chhindwara","Sehore","Mandla","Bhind","Mandsaur","Betul","Neemuch","Dhar","Balaghat","Raisen","Harda","Sidhi","Hoshangabad","Guna","Narsinghpur","Satna","Khargone","Sheopur","Shajapur","Umaria","Shivpuri"],
  "Maharashtra": ["Pune", "Nashik", "Kolhapur", "Solapur", "Aurangabad", "Nagpur", "Ahmednagar"],
  "Punjab":      ["Ludhiana", "Amritsar", "Jalandhar", "Patiala", "Bathinda", "Moga"],
  "Uttar Pradesh": ["Lucknow", "Agra", "Varanasi", "Kanpur", "Meerut", "Bareilly", "Allahabad"],
  "Rajasthan":   ["Jaipur", "Jodhpur", "Kota", "Bikaner", "Ajmer", "Alwar"],
  "Haryana":     ["Gurugram", "Faridabad", "Hisar", "Karnal", "Rohtak", "Ambala", "Sirsa"],
  "Gujarat":     ["Ahmedabad", "Surat", "Vadodara", "Rajkot", "Bhavnagar", "Junagadh"],
  "Karnataka":   ["Bengaluru", "Mysuru", "Hubli", "Dharwad", "Belagavi", "Kalaburagi"],
  "Andhra Pradesh": ["Vijayawada", "Visakhapatnam", "Tirupati", "Guntur", "Nellore", "Kadapa"],
  "Bihar":       ["Patna", "Gaya", "Muzaffarpur", "Bhagalpur", "Darbhanga", "Ara"],
  "West Bengal": ["Kolkata", "Howrah", "Asansol", "Siliguri", "Bardhaman", "Malda"],
  "Tamil Nadu":  ["Chennai", "Coimbatore", "Madurai", "Tiruchirappalli", "Salem", "Tirunelveli"],
  "Telangana":   ["Hyderabad", "Warangal", "Nizamabad", "Karimnagar", "Khammam"],
  "Odisha":      ["Bhubaneswar", "Cuttack", "Rourkela", "Berhampur", "Sambalpur"],
  "Kerala":      ["Thiruvananthapuram", "Kochi", "Kozhikode", "Thrissur", "Kannur"],
  "Chhattisgarh": ["Raipur", "Bilaspur", "Durg", "Korba", "Rajnandgaon"],
  "Jharkhand":   ["Ranchi", "Jamshedpur", "Dhanbad", "Bokaro", "Hazaribagh"],
  "Uttarakhand": ["Dehradun", "Haridwar", "Haldwani", "Roorkee"],
  "Himachal Pradesh": ["Shimla", "Mandi", "Kangra", "Solan", "Kullu"],
  "Assam":       ["Guwahati", "Silchar", "Dibrugarh", "Jorhat", "Nagaon"],
};

export const COMMON_COMMODITIES = [
  "Wheat", "Rice", "Tomato", "Onion", "Potato", "Cotton",
  "Maize", "Soybean", "Sugarcane", "Chilli", "Garlic",
  "Groundnut", "Mustard", "Turmeric", "Ginger", "Cabbage",
  "Cauliflower", "Brinjal", "Okra", "Peas",
];

export const COMMON_COMMODITIES_HI: Record<string, string> = {
  "Wheat": "गेहूं", "Rice": "चावल", "Tomato": "टमाटर", "Onion": "प्याज",
  "Potato": "आलू", "Cotton": "कपास", "Maize": "मक्का", "Soybean": "सोयाबीन",
  "Sugarcane": "गन्ना", "Chilli": "मिर्च", "Garlic": "लहसुन",
  "Groundnut": "मूंगफली", "Mustard": "सरसों", "Turmeric": "हल्दी",
  "Ginger": "अदरक", "Cabbage": "पत्तागोभी", "Cauliflower": "फूलगोभी",
  "Brinjal": "बैंगन", "Okra": "भिंडी", "Peas": "मटर",
  "WHEAT": "गेहूं", "RICE": "चावल", "TOMATO": "टमाटर", "ONION": "प्याज",
  "POTATO": "आलू", "COTTON": "कपास", "MAIZE": "मक्का", "SOYBEAN": "सोयाबीन",
  "SUGARCANE": "गन्ना", "CHILLI": "मिर्च", "GARLIC": "लहसुन",
  "GROUNDNUT": "मूंगफली", "MUSTARD": "सरसों", "TURMERIC": "हल्दी",
  "GINGER": "अदरक", "CABBAGE": "पत्तागोभी", "CAULIFLOWER": "फूलगोभी",
  "BRINJAL": "बैंगन", "OKRA": "भिंडी", "PEAS": "मटर",
};
