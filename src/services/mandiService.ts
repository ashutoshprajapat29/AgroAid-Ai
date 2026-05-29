/**
 * mandiService.ts
 * All Firestore + Gemini AI calls go through apiCache → rate-limited + cached.
 */

import { collection, query, where, orderBy, limit, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { GoogleGenAI } from "@google/genai";
import { cachedApiCall, TTL } from "../lib/apiCache";

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

// ─── Gemini client ────────────────────────────────────────────────────────────
const GEN_AI_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEN_AI_KEY2 = import.meta.env.VITE_GEMINI_API_KEY2;
const ai = new GoogleGenAI({ apiKey: GEN_AI_KEY ?? GEN_AI_KEY2 ?? "" });

async function geminiGenerate(prompt: string): Promise<string> {
  const resp = await ai.models.generateContent({
    model: "gemini-2.0-flash-lite",
    contents: [{ parts: [{ text: prompt }] }],
    config: { responseMimeType: "application/json" },
  });
  return resp.text ?? "[]";
}

// ─── 1. Latest mandi prices ───────────────────────────────────────────────────
// Cache key: prices_{state}_{district}_{lang} → 6h TTL
// Language only affects Gemini fallback crop names — not Firestore data
export async function fetchLatestPrices(
  state: string,
  district: string,
  language = "English"
): Promise<MandiPrice[]> {
  const cacheKey = `prices_${state}_${district}_${language}`.replace(/\s+/g, "_").toLowerCase();

  return cachedApiCall(
    cacheKey,
    TTL.PRICES,
    async () => {
      // Try Firestore first (free, no quota cost)
      try {
        const q = query(
          collection(db, "mandi_latest"),
          where("state", "==", state),
          where("district", "==", district),
          limit(20)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          return snap.docs.map((d) => d.data() as MandiPrice);
        }
      } catch (e) {
        console.warn("Firestore mandi_latest unavailable, using AI:", e);
      }

      // AI fallback
      return fetchAIPrices(`${district}, ${state}`, language);
    },
    [] as MandiPrice[]
  );
}

// ─── 2. 30-day price history ──────────────────────────────────────────────────
// Cache key: history_{commodity}_{state}_{district} → 24h TTL (data never changes)
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
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const cutoff = thirtyDaysAgo.toISOString().split("T")[0];

      try {
        const q = query(
          collection(db, "mandi_prices"),
          where("commodity", "==", commodity),
          where("state", "==", state),
          where("district", "==", district),
          where("date", ">=", cutoff),
          orderBy("date", "asc"),
          limit(30)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          return snap.docs.map((d) => {
            const r = d.data();
            return { date: r.date, modal_price: r.modal_price, min_price: r.min_price, max_price: r.max_price };
          });
        }
      } catch (e) {
        console.warn("Firestore price history failed, using AI:", e);
      }

      return fetchAIPriceHistory(commodity, state);
    },
    [] as PriceHistory[]
  );
}

// ─── 3. AI-curated news ───────────────────────────────────────────────────────
// Cache key: news_{lang} → 12h TTL
export async function fetchMarketNews(language = "English"): Promise<NewsItem[]> {
  const cacheKey = `news_${language}`.toLowerCase();

  return cachedApiCall(
    cacheKey,
    TTL.NEWS,
    async () => {
      // Check Firestore (written by Cloud Function — free read)
      try {
        const snap = await getDoc(doc(db, "market_news", "latest"));
        if (snap.exists()) {
          const data = snap.data();
          const ts: number = data.timestamp?.seconds ?? 0;
          const items: NewsItem[] = data.items ?? [];
          if (Date.now() / 1000 - ts < 86400 && items.length > 0) return items;
        }
      } catch (e) {
        console.warn("Firestore market_news failed, using AI:", e);
      }

      return fetchAINews(language);
    },
    [] as NewsItem[]
  );
}

// ─── 4. AI Market Sentiment ───────────────────────────────────────────────────
// Cache key: sentiment_{commodity}_{state}_{lang} → 4h TTL
// NOTE: This is NOT auto-triggered — only called when user clicks "Analyze"
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

// ─── GEMINI FALLBACKS (all go through cachedApiCall with their own keys) ────

export async function fetchAIPrices(location: string, language = "English"): Promise<MandiPrice[]> {
  const langNote = language === "Hindi"
    ? "Return commodity names in Hindi Devanagari script (e.g., गेहूं, टमाटर, प्याज, आलू, कपास)."
    : "Return commodity names in English.";

  const today = new Date().toISOString().split("T")[0];
  const prompt = `You are a live Indian commodity Mandi price API. Generate realistic wholesale prices for exactly 8 crops for ${location} on ${today}.
Include a realistic mix of grains, vegetables, and cash crops for this region. ${langNote}
Return ONLY a JSON array of 8 objects:
{"state":string,"district":string,"market_name":string,"commodity":string,"variety":string,"min_price":number,"max_price":number,"modal_price":number,"date":"${today}"}
All prices in INR per quintal (100kg). Make them realistic for current Indian market rates.`;

  const raw = await geminiGenerate(prompt);
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

async function fetchAIPriceHistory(commodity: string, state: string): Promise<PriceHistory[]> {
  const today = new Date();
  const prompt = `Generate a realistic 30-day price history for ${commodity} in ${state}, India.
Show natural price fluctuations — include 1-2 spike events and gradual seasonal trend.
Return ONLY a JSON array of exactly 30 objects sorted oldest-first:
{"date":"YYYY-MM-DD","modal_price":number,"min_price":number,"max_price":number}
Prices in INR/quintal. Start date: ${new Date(today.getTime() - 29 * 86400000).toISOString().split("T")[0]}.`;

  try {
    const raw = await geminiGenerate(prompt);
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.sort((a: PriceHistory, b: PriceHistory) => a.date.localeCompare(b.date))
      : generateSyntheticHistory();
  } catch {
    return generateSyntheticHistory();
  }
}

// Pure math fallback — zero API cost
function generateSyntheticHistory(): PriceHistory[] {
  const today = new Date();
  let base = 1200 + Math.random() * 800;
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (29 - i));
    base = base + (Math.random() - 0.48) * 80; // slight upward drift
    base = Math.max(500, Math.min(4000, base));
    return {
      date: d.toISOString().split("T")[0],
      modal_price: Math.round(base),
      min_price: Math.round(base * 0.91),
      max_price: Math.round(base * 1.09),
    };
  });
}

async function fetchAINews(language = "English"): Promise<NewsItem[]> {
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
}

// ─── Filter data ──────────────────────────────────────────────────────────────
export const INDIA_STATES_DISTRICTS: Record<string, string[]> = {
  "Maharashtra": ["Pune", "Nashik", "Kolhapur", "Solapur", "Aurangabad", "Nagpur", "Ahmednagar"],
  "Punjab":      ["Ludhiana", "Amritsar", "Jalandhar", "Patiala", "Bathinda", "Moga"],
  "Uttar Pradesh": ["Lucknow", "Agra", "Varanasi", "Kanpur", "Meerut", "Bareilly", "Allahabad"],
  "Madhya Pradesh": ["Bhopal", "Indore", "Gwalior", "Jabalpur", "Sagar", "Dewas", "Ujjain"],
  "Rajasthan":   ["Jaipur", "Jodhpur", "Kota", "Bikaner", "Ajmer", "Alwar"],
  "Haryana":     ["Gurugram", "Faridabad", "Hisar", "Karnal", "Rohtak", "Ambala", "Sirsa"],
  "Gujarat":     ["Ahmedabad", "Surat", "Vadodara", "Rajkot", "Bhavnagar", "Junagadh"],
  "Karnataka":   ["Bengaluru", "Mysuru", "Hubli", "Dharwad", "Belagavi", "Kalaburagi"],
  "Andhra Pradesh": ["Vijayawada", "Visakhapatnam", "Tirupati", "Guntur", "Nellore", "Kadapa"],
  "Bihar":       ["Patna", "Gaya", "Muzaffarpur", "Bhagalpur", "Darbhanga", "Ara"],
  "West Bengal": ["Kolkata", "Howrah", "Asansol", "Siliguri", "Bardhaman", "Malda"],
  "Tamil Nadu":  ["Chennai", "Coimbatore", "Madurai", "Tiruchirappalli", "Salem", "Tirunelveli"],
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
};
