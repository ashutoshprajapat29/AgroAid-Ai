/**
 * mandiService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Supabase PostgreSQL-backed mandi price service.
 * All price/market queries go through Supabase RPCs with client-side caching.
 * RSS feeds for real news. Gemini AI only for sentiment classification.
 */

import { GoogleGenAI } from "@google/genai";
import { cachedApiCall, cachedGeminiCall, cacheGet, cacheSet, TTL } from "../lib/apiCache";
import { supabase, isSupabaseConfigured } from "../lib/supabase";

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

export interface VarietyPrice {
  variety: string;
  min_price: number;
  max_price: number;
  modal_price: number;
  date: string;
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

// ─── Time Range ───────────────────────────────────────────────────────────────
type TimeRange = "1D" | "7D" | "30D" | "1Y";

function timeRangeToDays(range: TimeRange): number {
  switch (range) {
    case "1D":  return 1;
    case "7D":  return 7;
    case "30D": return 30;
    case "1Y":  return 365;
  }
}

// ─── Gemini client (only for sentiment + news classification) ─────────────────
const GEN_AI_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEN_AI_KEY2 = import.meta.env.VITE_GEMINI_API_KEY2;
const ai = new GoogleGenAI({ apiKey: GEN_AI_KEY ?? GEN_AI_KEY2 ?? "" });

async function geminiGenerate(prompt: string): Promise<string> {
  const resp = await ai.models.generateContent({
    model: "gemini-2.5-flash-lite",
    contents: [{ parts: [{ text: prompt }] }],
    config: { responseMimeType: "application/json" },
  });
  return resp.text ?? "[]";
}

// ─── Helper: Format commodity name ────────────────────────────────────────────
function formatName(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUPABASE-BACKED QUERIES
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 1. Fetch States (from DB, fallback to hardcoded) ─────────────────────────
export async function fetchStates(): Promise<string[]> {
  return cachedApiCall(
    "mandi_db_states",
    TTL.HISTORY, // 24hr cache
    async () => {
      if (!isSupabaseConfigured) return Object.keys(INDIA_STATES_DISTRICTS);
      const { data, error } = await supabase.rpc("get_states");
      if (error) throw error;
      const states = (data ?? []).map((r: any) => r.state as string);
      return states.length > 0 ? states : Object.keys(INDIA_STATES_DISTRICTS);
    },
    Object.keys(INDIA_STATES_DISTRICTS)
  );
}

// ─── 2. Fetch Districts for State (from DB, fallback to hardcoded) ────────────
export async function fetchDistricts(state: string): Promise<string[]> {
  const cacheKey = `mandi_db_districts_${state}`.replace(/\s+/g, "_").toLowerCase();
  return cachedApiCall(
    cacheKey,
    TTL.PRICES, // 6hr cache
    async () => {
      if (!isSupabaseConfigured) return INDIA_STATES_DISTRICTS[state] ?? [];
      const { data, error } = await supabase.rpc("get_districts", { p_state: state });
      if (error) throw error;
      const districts = (data ?? []).map((r: any) => r.district as string);
      return districts.length > 0 ? districts : (INDIA_STATES_DISTRICTS[state] ?? []);
    },
    INDIA_STATES_DISTRICTS[state] ?? []
  );
}

// ─── 3. Fetch Markets for District (from DB) ─────────────────────────────────
export async function fetchMarkets(state: string, district: string): Promise<string[]> {
  const cacheKey = `mandi_db_markets_${state}_${district}`.replace(/\s+/g, "_").toLowerCase();
  return cachedApiCall(
    cacheKey,
    TTL.PRICES, // 6hr cache
    async () => {
      if (!isSupabaseConfigured) return [];
      const { data, error } = await supabase.rpc("get_markets", {
        p_state: state,
        p_district: district,
      });
      if (error) throw error;
      return (data ?? []).map((r: any) => r.market_name as string);
    },
    []
  );
}

// ─── 4. Latest Mandi Prices ──────────────────────────────────────────────────
export async function fetchLatestPrices(
  state: string,
  district: string,
  market?: string,
  _language = "English"
): Promise<MandiPrice[]> {
  const marketKey = market && market !== "All" ? market : "all";
  const cacheKey = `mandi_latest_${state}_${district}_${marketKey}`.replace(/\s+/g, "_").toLowerCase();

  return cachedApiCall(
    cacheKey,
    TTL.MANDI_API, // 2hr cache
    async () => {
      if (!isSupabaseConfigured) return [];

      const params: Record<string, any> = { p_state: state, p_district: district };
      if (market && market !== "All") params.p_market = market;

      const { data, error } = await supabase.rpc("get_latest_prices", params);
      if (error) throw error;

      return (data ?? []).map((r: any): MandiPrice => ({
        state: r.state ?? "",
        district: r.district ?? "",
        market_name: r.market_name ?? "",
        commodity: r.commodity ?? "",
        variety: r.variety ?? "",
        min_price: r.min_price ?? 0,
        max_price: r.max_price ?? 0,
        modal_price: r.modal_price ?? 0,
        date: r.arrival_date ?? "",
      }));
    },
    [] as MandiPrice[]
  );
}

// ─── 5. Search Commodities/Markets ───────────────────────────────────────────
export async function searchMandiPrices(
  searchQuery: string,
  searchType: "commodity" | "market" = "commodity",
  state?: string,
  district?: string,
  market?: string
): Promise<MandiPrice[]> {
  const cacheKey = `mandi_search_${searchType}_${searchQuery}_${state}_${district}_${market}`.replace(/\s+/g, "_").toLowerCase();

  return cachedApiCall(
    cacheKey,
    TTL.MANDI_API,
    async () => {
      if (!isSupabaseConfigured) return [];

      const { data, error } = await supabase.rpc("search_mandi", {
        p_query: searchQuery,
        p_search_type: searchType,
        p_state: state,
        p_district: district,
        p_market: market && market !== "All" ? market : undefined
      });
      if (error) throw error;
      return (data ?? []).map((r: any): MandiPrice => ({
        state: r.state ?? "",
        district: r.district ?? "",
        market_name: r.market_name ?? "",
        commodity: r.commodity ?? "",
        variety: r.variety ?? "",
        min_price: r.min_price ?? 0,
        max_price: r.max_price ?? 0,
        modal_price: r.modal_price ?? 0,
        date: r.arrival_date ?? "",
      }));
    },
    [] as MandiPrice[]
  );
}

// ─── 6. Commodity Variety Breakdown ──────────────────────────────────────────
export async function fetchCommodityVarieties(
  state: string,
  district: string,
  market: string,
  commodity: string
): Promise<VarietyPrice[]> {
  const cacheKey = `mandi_varieties_${state}_${district}_${market}_${commodity}`.replace(/\s+/g, "_").toLowerCase();

  return cachedApiCall(
    cacheKey,
    TTL.MANDI_API,
    async () => {
      if (!isSupabaseConfigured) return [];

      const { data, error } = await supabase.rpc("get_commodity_varieties", {
        p_state: state,
        p_district: district,
        p_market: market,
        p_commodity: commodity,
      });
      if (error) throw error;
      return (data ?? []).map((r: any): VarietyPrice => ({
        variety: r.variety || "Standard",
        min_price: r.min_price ?? 0,
        max_price: r.max_price ?? 0,
        modal_price: r.modal_price ?? 0,
        date: r.arrival_date ?? "",
      }));
    },
    [] as VarietyPrice[]
  );
}

// ─── 7. Price History ────────────────────────────────────────────────────────
export async function fetchPriceHistory(
  commodity: string,
  state: string,
  district: string,
  range: TimeRange = "30D",
  market?: string
): Promise<PriceHistory[]> {
  const marketKey = market && market !== "All" ? market : "all";
  const cacheKey = `history_${range}_${commodity}_${state}_${district}_${marketKey}`.replace(/\s+/g, "_").toLowerCase();

  return cachedApiCall(
    cacheKey,
    range === "1D" ? TTL.MANDI_API : TTL.HISTORY,
    async () => {
      if (!isSupabaseConfigured) return [];

      const days = timeRangeToDays(range);
      const params: Record<string, any> = {
        p_commodity: commodity,
        p_state: state,
        p_district: district,
        p_days: days,
      };
      if (market && market !== "All") params.p_market = market;

      const { data, error } = await supabase.rpc("get_price_history", params);
      if (error) throw error;

      return (data ?? []).map((r: any): PriceHistory => ({
        date: r.arrival_date ?? "",
        modal_price: r.avg_modal ?? 0,
        min_price: r.avg_min ?? 0,
        max_price: r.avg_max ?? 0,
      })).filter((p) => p.modal_price > 0);
    },
    [] as PriceHistory[]
  );
}

// ─── 8. Nearby Market Comparison ─────────────────────────────────────────────
export async function fetchMarketComparison(
  commodity: string,
  state: string,
  district?: string,
  excludeMarket?: string
): Promise<MarketCompare[]> {
  const excl = excludeMarket && excludeMarket !== "All" ? excludeMarket : "none";
  const cacheKey = `mandi_nearby_${commodity}_${state}_${district ?? state}_${excl}`.replace(/\s+/g, "_").toLowerCase();

  return cachedApiCall(
    cacheKey,
    TTL.MANDI_API,
    async () => {
      if (!isSupabaseConfigured) return [];

      const params: Record<string, any> = {
        p_state: state,
        p_district: district ?? "",
        p_commodity: commodity,
      };
      if (excludeMarket && excludeMarket !== "All") {
        params.p_exclude_market = excludeMarket;
      }

      const { data, error } = await supabase.rpc("get_nearby_markets", params);
      if (error) throw error;

      return (data ?? []).map((r: any): MarketCompare => ({
        market_name: r.market_name ?? "",
        district: r.district ?? "",
        modal_price: r.modal_price ?? 0,
        min_price: r.min_price ?? 0,
        max_price: r.max_price ?? 0,
        date: r.arrival_date ?? "",
      })).sort((a, b) => b.modal_price - a.modal_price);
    },
    [] as MarketCompare[]
  );
}

// ─── 9. Nearby mandis (geolocation → state mapping) ──────────────────────────
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
    return { state: "Madhya Pradesh", district: "Ratlam" };
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

// ═══════════════════════════════════════════════════════════════════════════════
// NEWS (Fetched via Firebase Cloud Function)
// ═══════════════════════════════════════════════════════════════════════════════

import { httpsCallable } from "firebase/functions";
import dynamicTranslations from "../lib/mandi_translations.json";
import { functions } from "../lib/firebase";

export async function fetchMarketNews(language = "English"): Promise<NewsItem[]> {
  const cacheKey = `news_rss_${language}`.toLowerCase();

  return cachedApiCall(
    cacheKey,
    TTL.NEWS,
    async () => {
      try {
        const fetchNewsFn = httpsCallable<{ language: string }, { items: NewsItem[]; cached: boolean }>(
          functions,
          "fetchAgriNews"
        );
        const result = await fetchNewsFn({ language });
        return result.data.items || [];
      } catch (e) {
        console.error("Failed to fetch agri news from Cloud Function:", e);
        return [];
      }
    },
    [] as NewsItem[]
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SENTIMENT (Gemini — user-triggered, unchanged)
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// FALLBACK DATA (used when Supabase not yet configured)
// ═══════════════════════════════════════════════════════════════════════════════

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

export const COMMON_LOCATIONS_HI: Record<string, string> = {
  "Madhya Pradesh": "मध्य प्रदेश",
  "Uttar Pradesh": "उत्तर प्रदेश",
  "Maharashtra": "महाराष्ट्र",
  "Gujarat": "गुजरात",
  "Punjab": "पंजाब",
  "Haryana": "हरियाणा",
  "Rajasthan": "राजस्थान",
  "Bihar": "बिहार",
  "Uttarakhand": "उत्तराखंड",
  "Himachal Pradesh": "हिमाचल प्रदेश",
  "Delhi": "दिल्ली",
  "Chandigarh": "चंडीगढ़",
  "Karnataka": "कर्नाटक",
  "Andhra Pradesh": "आंध्र प्रदेश",
  "West Bengal": "पश्चिम बंगाल",
  "Tamil Nadu": "तमिलनाडु",
  "Telangana": "तेलंगाना",
  "Odisha": "ओडिशा",
  "Kerala": "केरल",
  "Chhattisgarh": "छत्तीसगढ़",
  "Jharkhand": "झारखंड",
  "Assam": "असम",
  "Ratlam": "रतलाम",
  "Indore": "इंदौर",
  "Bhopal": "भोपाल",
  "Ujjain": "उज्जैन",
  "Dhar": "धार",
  "Mandsaur": "मंदसौर",
  "Neemuch": "नीमच",
  "Ratlam APMC": "रतलाम मंडी",
  "Sailana APMC": "सैलाना मंडी",
  "Jaora APMC": "जावरा मंडी",
  "A lot APMC": "आलोट मंडी",
  "All Markets": "सभी मंडियां",
};

export const COMMON_COMMODITIES_HI: Record<string, string> = {
  ...dynamicTranslations,
  "Wheat": "गेहूं", "Rice": "चावल", "Tomato": "टमाटर", "Onion": " प्याज",
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
