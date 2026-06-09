import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const GEMINI_KEY = process.env.VITE_GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY2;

if (!SUPABASE_URL || !SUPABASE_KEY || !GEMINI_KEY) {
  console.error("Missing environment variables. Make sure .env exists in the root.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });

const TRANSLATIONS_FILE = path.resolve(__dirname, "../src/lib/mandi_translations.json");

// Load existing translations to avoid re-translating
let existingTranslations = {};
if (fs.existsSync(TRANSLATIONS_FILE)) {
  existingTranslations = JSON.parse(fs.readFileSync(TRANSLATIONS_FILE, "utf-8"));
}

async function translateBatch(words, retries = 3) {
  const prompt = `You are an expert in Indian agriculture. Translate the following English agricultural terms (crop names and market names) into Hindi. Ensure the translation is accurate and commonly used in Indian Mandis. 
Respond ONLY with a valid JSON object where the keys are the original English words and the values are the Hindi translations. Do not include markdown formatting or extra text.

Terms to translate:
${JSON.stringify(words)}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const resp = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ parts: [{ text: prompt }] }],
        config: { responseMimeType: "application/json" }
      });
      
      let text = resp.text || "{}";
      // Strip markdown code blocks if present
      if (text.startsWith("```json")) text = text.replace(/```json/g, "").replace(/```/g, "");
      else if (text.startsWith("```")) text = text.replace(/```/g, "");
      
      return JSON.parse(text);
    } catch (err) {
      console.error(`Gemini Translation Error (Attempt ${attempt}):`, err.message || err);
      if (attempt === retries) return {};
      // Wait before retrying (exponential backoff)
      await new Promise(res => setTimeout(res, attempt * 3000));
    }
  }
  return {};
}

async function run() {
  console.log("Fetching unique commodities and markets from Supabase...");
  
  let allRows = [];
  let from = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const { data, error } = await supabase.from("mandi_prices").select("commodity, market_name, variety, district, state").range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allRows = allRows.concat(data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const uniqueTerms = new Set([
    "Average",
    ...allRows.map(r => r.commodity?.trim()).filter(Boolean),
    ...allRows.map(r => r.market_name?.trim()).filter(Boolean),
    ...allRows.map(r => r.variety?.trim()).filter(Boolean),
    ...allRows.map(r => r.district?.trim()).filter(Boolean),
    ...allRows.map(r => r.state?.trim()).filter(Boolean)
  ]);

  const termsToTranslate = Array.from(uniqueTerms).filter(t => !existingTranslations[t]);
  console.log(`Found ${uniqueTerms.size} total terms. ${termsToTranslate.length} need translation.`);

  if (termsToTranslate.length === 0) {
    console.log("Everything is already translated!");
    process.exit(0);
  }

  // HARD LIMIT: Only translate a maximum of 100 terms per run to prevent massive API token burn.
  const MAX_TERMS_PER_RUN = 100;
  const termsToProcess = termsToTranslate.slice(0, MAX_TERMS_PER_RUN);
  if (termsToTranslate.length > MAX_TERMS_PER_RUN) {
    console.warn(`\n⚠️ WARNING: Capping translation to ${MAX_TERMS_PER_RUN} terms to prevent high API costs.`);
    console.warn(`Run the script again later to translate the remaining ${termsToTranslate.length - MAX_TERMS_PER_RUN} terms.\n`);
  }

  // Batch into chunks of 50
  const BATCH_SIZE = 50;
  for (let i = 0; i < termsToProcess.length; i += BATCH_SIZE) {
    const batch = termsToProcess.slice(i, i + BATCH_SIZE);
    console.log(`Translating batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(termsToProcess.length / BATCH_SIZE)}...`);
    
    const translatedBatch = await translateBatch(batch);
    
    // Merge into existing
    existingTranslations = { ...existingTranslations, ...translatedBatch };
    
    // Save incrementally
    fs.writeFileSync(TRANSLATIONS_FILE, JSON.stringify(existingTranslations, null, 2));
    
    // Small delay to avoid rate limits
    await new Promise(res => setTimeout(res, 2000));
  }
  
  console.log(`✅ Translations updated successfully. Total terms: ${Object.keys(existingTranslations).length}`);
  console.log(`Saved to ${TRANSLATIONS_FILE}`);
}

run().catch(console.error);
