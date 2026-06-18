/**
 * gemini.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Proxy layer for Gemini AI calls.
 * All AI calls are routed through authenticated Firebase Cloud Functions.
 * NO API keys are stored or used in the frontend bundle.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { httpsCallable } from "firebase/functions";
import { functions } from "../lib/firebase";

// ─── In-memory advisor response cache (5 min TTL) ─────────────────────────────
const advisorCache = new Map<string, { text: string; ts: number }>();
const ADVISOR_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getAdvisorCacheKey(query: string, fieldId?: string, historyLen?: number): string {
  return `${(fieldId || 'default')}::${historyLen ?? 0}::${query.trim().toLowerCase()}`;
}

function getCachedAdvisorResponse(key: string): string | null {
  const entry = advisorCache.get(key);
  if (entry && Date.now() - entry.ts < ADVISOR_CACHE_TTL) return entry.text;
  if (entry) advisorCache.delete(key); // expired
  return null;
}

function setCachedAdvisorResponse(key: string, text: string): void {
  // Cap cache size to prevent memory leaks
  if (advisorCache.size > 50) {
    const oldest = advisorCache.keys().next().value;
    if (oldest) advisorCache.delete(oldest);
  }
  advisorCache.set(key, { text, ts: Date.now() });
}

// ─── Smart extraction heuristic ───────────────────────────────────────────────
// Only call extractFarmUpdates when conversation likely contains actionable farm data.
// This skips greetings, general questions, weather queries, etc. — saving ~50% of calls.
const EXTRACT_KEYWORDS = [
  // Crops & planting
  'crop', 'plant', 'sow', 'seed', 'harvest', 'yield', 'variety', 'cultivar',
  'फसल', 'बोना', 'बीज', 'कटाई', 'उपज', 'किस्म',
  // Soil & nutrients
  'soil', 'ph', 'nitrogen', 'phosphorus', 'potassium', 'fertilizer', 'manure', 'npk', 'urea', 'dap',
  'मिट्टी', 'उर्वरक', 'खाद', 'यूरिया',
  // Sprays & disease
  'spray', 'pesticide', 'fungicide', 'insecticide', 'disease', 'blight', 'rot', 'wilt', 'pest', 'bug',
  'कीट', 'रोग', 'छिड़काव', 'दवाई',
  // Irrigation
  'irrigat', 'watering', 'drip', 'flood irrigation', 'mulch',
  'सिंचाई', 'पानी',
  // Tasks & scheduling
  'schedule', 'task', 'todo', 'remind', 'plan', 'apply', 'dose',
  'योजना', 'कार्य',
  // Specific data signals
  'kg', 'quintal', 'acre', 'hectare', 'bigha',
];

export function shouldExtractUpdates(userQuery: string, botResponse: string): boolean {
  const combined = (userQuery + ' ' + botResponse).toLowerCase();
  return EXTRACT_KEYWORDS.some(kw => combined.includes(kw));
}

// ─── Cloud Function references ────────────────────────────────────────────────
const getFarmingAdviceFn = httpsCallable<any, { text: string }>(functions, "getFarmingAdviceProxy");
const analyzeFarmingImageFn = httpsCallable<any, { text: string }>(functions, "analyzeFarmingImageProxy");
const detectPlantDiseaseFn = httpsCallable<any, { text: string }>(functions, "detectPlantDiseaseProxy");
const extractFarmUpdatesFn = httpsCallable<any, { fieldUpdates: any; soilUpdates: any; newTasks: any[] }>(functions, "extractFarmUpdatesProxy");

// ─── Farming Advice (text chat) ──────────────────────────────────────────────
export async function getFarmingAdvice(query: string, farmDetails?: string, history: any[] = [], preferredLanguage: string = "English", fieldContext?: any, latestSoilReport?: any) {
  // Check in-memory cache for identical recent queries (prevents duplicate calls)
  const cacheKey = getAdvisorCacheKey(query, fieldContext?.id, history.length);
  const cached = getCachedAdvisorResponse(cacheKey);
  if (cached) {
    console.log('[Gemini] Returning cached advisor response');
    return cached;
  }

  try {
    const result = await getFarmingAdviceFn({
      query,
      farmDetails,
      history: history.slice(-6),
      preferredLanguage,
      fieldContext,
      latestSoilReport,
    });

    const text = result.data.text;
    // Cache the response for deduplication
    setCachedAdvisorResponse(cacheKey, text);
    return text;
  } catch (error: any) {
    console.error("getFarmingAdvice proxy call failed:", error);
    if (error.code === "unauthenticated") {
      return "Please sign in to use the AI advisor.";
    }
    return "The AI advisor is currently unavailable. Please try again later.";
  }
}

// ─── Image Analysis (vision chat) ───────────────────────────────────────────
export async function analyzeFarmingImage(images: { data: string, mimeType: string }[], userQuery: string, farmDetails?: string, preferredLanguage: string = "English", fieldContext?: any, latestSoilReport?: any) {
  try {
    const result = await analyzeFarmingImageFn({
      images,
      userQuery,
      farmDetails,
      preferredLanguage,
      fieldContext,
      latestSoilReport,
    });

    return result.data.text;
  } catch (error: any) {
    console.error("analyzeFarmingImage proxy call failed:", error);
    if (error.code === "unauthenticated") {
      return "Please sign in to analyze images.";
    }
    return "I was unable to analyze the images. Please try again later.";
  }
}

// ─── Plant Disease Detection ─────────────────────────────────────────────────
export async function detectPlantDisease(base64Image: string, mimeType: string, language: string = "English") {
  try {
    const result = await detectPlantDiseaseFn({
      base64Image,
      mimeType,
      language,
    });

    return result.data.text;
  } catch (error: any) {
    console.error("detectPlantDisease proxy call failed:", error);
    if (error.code === "unauthenticated") {
      return "Please sign in to use disease detection.";
    }
    return "I was unable to detect any disease. Please check the image quality.";
  }
}

// ─── Extract Farm Updates (background, JSON structured) ──────────────────────
export async function extractFarmUpdates(userQuery: string, botResponse: string, currentFieldData?: any) {
  // Smart skip: don't waste an API call on casual/greeting messages
  if (!shouldExtractUpdates(userQuery, botResponse)) {
    console.log('[Gemini] Skipping extraction — no actionable farm keywords detected');
    return { fieldUpdates: {}, soilUpdates: {}, newTasks: [] };
  }

  try {
    const result = await extractFarmUpdatesFn({
      userQuery,
      botResponse,
      currentFieldData: currentFieldData ? {
        name: currentFieldData.name,
        currentCrop: currentFieldData.currentCrop,
        variety: currentFieldData.variety,
        plantingDate: currentFieldData.plantingDate,
        previousSprays: currentFieldData.previousSprays,
        irrigationTimings: currentFieldData.irrigationTimings,
        otherDetails: currentFieldData.otherDetails,
      } : undefined,
    });

    return {
      fieldUpdates: result.data.fieldUpdates || {},
      soilUpdates: result.data.soilUpdates || {},
      newTasks: result.data.newTasks || [],
    };
  } catch (error) {
    console.warn("Failed to extract farm updates:", error);
    return { fieldUpdates: {}, soilUpdates: {}, newTasks: [] };
  }
}
