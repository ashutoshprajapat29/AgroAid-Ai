/**
 * mandiService.ts
 * Real data.gov.in API for mandi prices. Gemini AI only for sentiment & news.
 */

import { GoogleGenAI } from "@google/genai";
import { cachedApiCall, cacheGet, cacheSet, TTL } from "../lib/apiCache";

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
}

export interface SentimentResult {
  sentiment: "Bullish" | "Bearish" | "Stable";
  confidence: number;
  why: string;
  action: string;
}

export interface CommodityCompare {
  commodity: string;
  modal_price: number;
  min_price: number;
  max_price: number;
}

// ─── API config ───────────────────────────────────────────────────────────────
const DATA_GOV_API_KEY = import.meta.env.VITE_DATA_GOV_API_KEY ?? "";
// Use Vite proxy in dev to bypass CORS; in production use direct URL
const DATA_GOV_BASE = "/api/datagov/resource/9ef84268-d588-465a-a308-a864a43d0070";

// ─── Gemini client (only for sentiment & news) ────────────────────────────────
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

async function callDataGovAPI(params: Record<string, string>): Promise<DataGovRecord[]> {
  const qp = new URLSearchParams();
  qp.set("api-key", DATA_GOV_API_KEY);
  qp.set("format", "json");
  qp.set("limit", params.limit ?? "50");

  if (params.offset) qp.set("offset", params.offset);
  if (params.state) qp.set("filters[state.keyword]", params.state);
  if (params.district) qp.set("filters[district]", params.district);
  if (params.market) qp.set("filters[market]", params.market);
  if (params.commodity) qp.set("filters[commodity]", params.commodity);

  const targetUrl = `https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070?${qp.toString()}`;
  
  const resp = await fetch(targetUrl);
  if (!resp.ok) throw new Error(`data.gov.in API error: ${resp.status}`);
  const json = await resp.json();
  return (json.records ?? []) as DataGovRecord[];
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

// ─── 1. Latest mandi prices (REAL API) ────────────────────────────────────────
export async function fetchLatestPrices(
  state: string,
  district: string,
  _language = "English"
): Promise<MandiPrice[]> {
  const cacheKey = `mandi_prices_${state}_${district}`.replace(/\s+/g, "_").toLowerCase();

  return cachedApiCall(
    cacheKey,
    TTL.MANDI_API,
    async () => {
      try {
        const records = await callDataGovAPI({ state, district, limit: "50" });
        if (records.length > 0) {
          return records.map(recordToMandiPrice);
        }
      } catch (e) {
        console.warn("data.gov.in API failed:", e);
      }
      // Fallback: try without district filter
      try {
        const records = await callDataGovAPI({ state, limit: "30" });
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
      try {
        const params: Record<string, string> = { limit: "50" };
        if (searchType === "commodity") {
          params.commodity = searchQuery.toUpperCase();
        } else {
          params.market = searchQuery.toUpperCase();
        }
        const records = await callDataGovAPI(params);
        return records.map(recordToMandiPrice);
      } catch (e) {
        console.warn("Mandi search failed:", e);
        return [];
      }
    },
    [] as MandiPrice[]
  );
}

// ─── 3. Fetch prices by specific market ───────────────────────────────────────
export async function fetchMarketPrices(marketName: string): Promise<MandiPrice[]> {
  const cacheKey = `mandi_market_${marketName}`.replace(/\s+/g, "_").toLowerCase();

  return cachedApiCall(
    cacheKey,
    TTL.MANDI_API,
    async () => {
      try {
        const records = await callDataGovAPI({ market: marketName, limit: "50" });
        return records.map(recordToMandiPrice);
      } catch (e) {
        console.warn("Market price fetch failed:", e);
        return [];
      }
    },
    [] as MandiPrice[]
  );
}

// ─── 4. Commodity comparison (for bar chart) ──────────────────────────────────
export async function fetchCommodityComparison(
  state: string,
  district: string
): Promise<CommodityCompare[]> {
  const cacheKey = `mandi_compare_${state}_${district}`.replace(/\s+/g, "_").toLowerCase();

  return cachedApiCall(
    cacheKey,
    TTL.MANDI_API,
    async () => {
      try {
        const records = await callDataGovAPI({ state, district, limit: "100" });
        // Group by commodity and pick the latest record for each
        const commodityMap = new Map<string, CommodityCompare>();
        for (const r of records) {
          const key = r.commodity;
          if (!commodityMap.has(key)) {
            commodityMap.set(key, {
              commodity: r.commodity,
              modal_price: parseInt(r.modal_price) || 0,
              min_price: parseInt(r.min_price) || 0,
              max_price: parseInt(r.max_price) || 0,
            });
          }
        }
        return Array.from(commodityMap.values())
          .sort((a, b) => b.modal_price - a.modal_price)
          .slice(0, 12);
      } catch (e) {
        console.warn("Commodity comparison failed:", e);
        return [];
      }
    },
    [] as CommodityCompare[]
  );
}

// ─── 5. Price history — synthetic since API only has current day ──────────────
export async function fetchPriceHistory(
  commodity: string,
  state: string,
  district: string
): Promise<PriceHistory[]> {
  const cacheKey = `history_${commodity}_${state}_${district}`.replace(/\s+/g, "_").toLowerCase();

  return cachedApiCall(
    cacheKey,
    TTL.HISTORY,
    async () => {
      // Get today's real price as the anchor point
      let basePrice = 2000;
      try {
        const records = await callDataGovAPI({ state, district, commodity: commodity.toUpperCase(), limit: "1" });
        if (records.length > 0) {
          basePrice = parseInt(records[0].modal_price) || 2000;
        }
      } catch { /* use default */ }

      // Generate synthetic 30-day history anchored to real current price
      return generateAnchoredHistory(basePrice);
    },
    [] as PriceHistory[]
  );
}

function generateAnchoredHistory(currentPrice: number): PriceHistory[] {
  const today = new Date();
  const volatility = currentPrice * 0.04; // 4% daily volatility
  let price = currentPrice * (0.9 + Math.random() * 0.15); // start 85-105% of current

  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (29 - i));

    if (i < 29) {
      // Trend towards current price over 30 days
      const drift = (currentPrice - price) * 0.05;
      price += drift + (Math.random() - 0.48) * volatility;
      price = Math.max(currentPrice * 0.7, Math.min(currentPrice * 1.3, price));
    } else {
      price = currentPrice; // Last day = real current price
    }

    return {
      date: d.toISOString().split("T")[0],
      modal_price: Math.round(price),
      min_price: Math.round(price * 0.92),
      max_price: Math.round(price * 1.08),
    };
  });
}

// ─── 6. Nearby mandis (uses geolocation → state mapping) ─────────────────────
const LOCATION_TO_STATE: Record<string, { state: string; district: string }> = {
  // Major city coordinates mapped to state/district
  // This is a rough mapping — reverse geocoding would be more accurate
};

export async function fetchNearbyPrices(
  lat: number,
  lng: number
): Promise<{ state: string; district: string; prices: MandiPrice[] }> {
  // Reverse geocode using free Nominatim API
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

    // Map Indian state names to the format used by data.gov.in
    const state = mapToDataGovState(addr.state ?? addr.state_district ?? "");
    const district = addr.county ?? addr.state_district ?? addr.city ?? "";

    const result = { state, district };
    cacheSet(cacheKey, result, 24 * 60 * 60 * 1000); // cache 24h
    return result;
  } catch (e) {
    console.warn("Reverse geocoding failed:", e);
    return { state: "Maharashtra", district: "Pune" }; // fallback
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

// ─── 7. AI-curated news (Gemini — no real API available) ──────────────────────
export async function fetchMarketNews(language = "English"): Promise<NewsItem[]> {
  const cacheKey = `news_${language}`.toLowerCase();

  return cachedApiCall(
    cacheKey,
    TTL.NEWS,
    async () => {
      const langNote = language === "Hindi"
        ? "Write title and impact in Hindi (Devanagari script)."
        : "Write in English.";

      const prompt = `You are an expert Indian agri-economist. Generate 3 realistic, impactful agricultural news items for Indian farmers today.
Cover: 1 government policy/MSP, 1 monsoon/weather impact, 1 export/import trade.
${langNote}
Return ONLY a JSON array of exactly 3 objects:
{"title":string,"impact":string,"sentiment":"Positive"|"Negative"|"Neutral","commodity":string}
Keep title under 12 words. Impact: 2 plain sentences.`;

      try {
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

// ─── 8. AI Market Sentiment (Gemini — user-triggered) ─────────────────────────
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

  return cachedApiCall(
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
  "Maharashtra": ["Pune", "Nashik", "Kolhapur", "Solapur", "Aurangabad", "Nagpur", "Ahmednagar"],
  "Punjab":      ["Ludhiana", "Amritsar", "Jalandhar", "Patiala", "Bathinda", "Moga"],
  "Uttar Pradesh": ["Lucknow", "Agra", "Varanasi", "Kanpur", "Meerut", "Bareilly", "Allahabad"],
  "Madhya Pradesh": ["Bhopal", "Indore", "Gwalior", "Jabalpur", "Sagar", "Dewas", "Ujjain","Ratlam","Morena","Chhindwara","Sehore","Mandla","Bhind","Mandsaur","Betul","Neemuch","Dhar","Balaghat","Raisen","Harda","Sidhi","Hoshangabad","Guna","Narsinghpur","Satna","Khargone","Sheopur","Shajapur","Umaria","Shivpuri"],
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
