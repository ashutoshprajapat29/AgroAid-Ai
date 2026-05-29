import { GoogleGenAI, Modality, Type } from "@google/genai";

export interface MarketPrice {
  crop: string;
  price: number;
  unit: string;
  trend: 'up' | 'down' | 'stable';
  demand: 'high' | 'medium' | 'low';
  lastUpdated: string;
}

const GEN_AI_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEN_AI_KEY2 = import.meta.env.VITE_GEMINI_API_KEY2;

if (!GEN_AI_KEY && !GEN_AI_KEY2) {
  console.warn("GEMINI_API_KEY is missing in environment variables. AI features may not work.");
}

const aiClients: GoogleGenAI[] = [];
if (GEN_AI_KEY) aiClients.push(new GoogleGenAI({ apiKey: GEN_AI_KEY }));
if (GEN_AI_KEY2) aiClients.push(new GoogleGenAI({ apiKey: GEN_AI_KEY2 }));
if (aiClients.length === 0) aiClients.push(new GoogleGenAI({ apiKey: "" }));

function getAIClient() {
  const randomIndex = Math.floor(Math.random() * aiClients.length);
  return aiClients[randomIndex];
}

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

export async function getFarmingAdvice(query: string, farmDetails?: string, history: any[] = [], preferredLanguage: string = "English", fieldContext?: any, latestSoilReport?: any) {
  if (!GEN_AI_KEY && !GEN_AI_KEY2) return "The AI advisor is currently unavailable due to configuration issues. Please contact support.";

  // Check in-memory cache for identical recent queries (prevents duplicate calls)
  const cacheKey = getAdvisorCacheKey(query, fieldContext?.id, history.length);
  const cached = getCachedAdvisorResponse(cacheKey);
  if (cached) {
    console.log('[Gemini] Returning cached advisor response');
    return cached;
  }
  
  let context = farmDetails ? `General farm context: ${farmDetails}\n` : "";
  
  if (fieldContext) {
    context += `Specific Plot/Field Context:
    - Name: ${fieldContext.name}
    - Area: ${fieldContext.area} ${fieldContext.unit}
    - Soil Type: ${fieldContext.soilType}
    - Location: ${fieldContext.location}
    - Land Description: ${fieldContext.description}
    - Current Crop: ${fieldContext.currentCrop || 'None recorded'}
    - Variety: ${fieldContext.variety || 'N/A'}
    - Planting Date: ${fieldContext.plantingDate || 'N/A'}
    - Previous Sprays: ${fieldContext.previousSprays || 'None recorded'}
    - Irrigation Schedule: ${fieldContext.irrigationTimings || 'None recorded'}
    - Other Details: ${fieldContext.otherDetails || 'None'}\n`;
  }

  if (latestSoilReport) {
    context += `Latest Soil Report for this Plot:
    - Date: ${latestSoilReport.testDate}
    - pH: ${latestSoilReport.ph || 'N/A'}
    - Nitrogen (N): ${latestSoilReport.nitrogen || 'N/A'}
    - Phosphorus (P): ${latestSoilReport.phosphorus || 'N/A'}
    - Potassium (K): ${latestSoilReport.potassium || 'N/A'}
    - Organic Carbon: ${latestSoilReport.organicCarbon || 'N/A'}
    - Notes: ${latestSoilReport.otherNotes || 'N/A'}\n`;
  }

  const systemInstruction = `You are a professional, helpful agronomist and farming AI advisor.
  - CONTEXT USAGE: You are provided with "Specific Plot Context" and "Latest Soil Report". Use this context ONLY when it is directly relevant to answering the user's specific question. Do NOT provide a full action plan unless they ask for one or ask a question that requires it.
  - STYLE: Concise, clear, easy to read. Use bullet points when listing steps or providing actionable advice.
  - CONTENT: When giving specific agricultural advice, you may suggest fertilizers/sprays with brand names, and prioritize soil health.
  - INTERACTIVE: Keep responses focused. End with a short, relevant follow-up question.
  - LANGUAGE: Respond strictly in ${preferredLanguage}.
  - SCOPE: Politely redirect non-farming queries to farming topics.
  
  ${context ? `--- Farmer Context ---\n${context}\n----------------------` : ""}`;

  const historyToSent = history.slice(-6); // Limit history for performance
  const contents = [...historyToSent, { role: 'user', parts: [{ text: query }] }];

  try {
    const apiCall = getAIClient().models.generateContent({
      model: "gemini-2.5-flash",
      contents,
      config: {
        systemInstruction,
      },
    });

    const timeout = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error("ADVISOR_TIMEOUT")), 25000)
    );

    const response = await Promise.race([apiCall, timeout]);

    if (!response || !response.text) {
      console.warn("Gemini returned empty response:", response);
      return "I'm sorry, I couldn't generate a response at the moment. Please try again later.";
    }
    // Cache the response for deduplication
    setCachedAdvisorResponse(cacheKey, response.text);
    return response.text;
  } catch (error: any) {
    if (error.message === "ADVISOR_TIMEOUT") {
      return "The AI advisor is taking longer than usual. Please check your internet connection or try a shorter question.";
    }
    console.error("Gemini getFarmingAdvice failed:", error);
    throw error;
  }
}

export async function analyzeFarmingImage(images: { data: string, mimeType: string }[], userQuery: string, farmDetails?: string, preferredLanguage: string = "English", fieldContext?: any, latestSoilReport?: any) {
  let context = farmDetails ? `General farm context: ${farmDetails}\n` : "";

  if (fieldContext) {
    context += `Specific Plot/Field Context:
    - Name: ${fieldContext.name}
    - Area: ${fieldContext.area} ${fieldContext.unit}
    - Soil Type: ${fieldContext.soilType}
    - Location: ${fieldContext.location}
    - Land Description: ${fieldContext.description}
    - Current Crop: ${fieldContext.currentCrop || 'None recorded'}
    - Variety: ${fieldContext.variety || 'N/A'}
    - Planting Date: ${fieldContext.plantingDate || 'N/A'}
    - Previous Sprays: ${fieldContext.previousSprays || 'None recorded'}
    - Irrigation Schedule: ${fieldContext.irrigationTimings || 'None recorded'}
    - Other Details: ${fieldContext.otherDetails || 'None'}\n`;
  }

  if (latestSoilReport) {
    context += `Latest Soil Report for this Plot:
    - Date: ${latestSoilReport.testDate}
    - pH: ${latestSoilReport.ph || 'N/A'}
    - Nitrogen (N): ${latestSoilReport.nitrogen || 'N/A'}
    - Phosphorus (P): ${latestSoilReport.phosphorus || 'N/A'}
    - Potassium (K): ${latestSoilReport.potassium || 'N/A'}
    - Organic Carbon: ${latestSoilReport.organicCarbon || 'N/A'}
    - Notes: ${latestSoilReport.otherNotes || 'N/A'}\n`;
  }

  const systemInstruction = `Professional agronomist advisor. Direct, high-precision, supportive.
  - STYLE: Precise, immediate action-based, bullet points.
  - INTERACTIVE: Mandatory short follow-up question.
  - TASK: Analyze images + query + context to provide actionable advice.
  - LANGUAGE: ${preferredLanguage}.
  ${context ? `Farmer Context:\n${context}` : ""}`;

  const imageParts = images.map(img => ({
    inlineData: {
      mimeType: img.mimeType,
      data: img.data,
    },
  }));

  try {
    const apiCall = getAIClient().models.generateContent({
      model: "gemini-2.5-flash",
      contents: { parts: [...imageParts, { text: userQuery }] },
      config: {
        systemInstruction,
      },
    });

    const timeout = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error("VISION_TIMEOUT")), 35000)
    );

    const response = await Promise.race([apiCall, timeout]);

    if (!response || !response.text) {
      console.warn("Gemini returned empty response for vision:", response);
      return "I was unable to analyze the images. Please check if they are clear and try again.";
    }

    return response.text;
  } catch (error: any) {
    if (error.message === "VISION_TIMEOUT") {
      return "Image analysis is taking unusually long. Please try again with fewer or smaller images.";
    }
    console.error("Gemini analyzeFarmingImage failed:", error);
    throw error;
  }
}

export async function detectPlantDisease(base64Image: string, mimeType: string) {
  const prompt = "Identify the plant and check for diseases. Be supportive and direct. If diseased, name it, cause, and immediate treatment. If healthy, skip explanations and give one growth tip. Use bullet points. End by asking if the user has noticed this on other parts of the plant or in other plots.";

  const imagePart = {
    inlineData: {
      mimeType,
      data: base64Image,
    },
  };

  try {
    const response = await getAIClient().models.generateContent({
      model: "gemini-2.5-flash",
      contents: { parts: [imagePart, { text: prompt }] },
    });

    return response.text || "I was unable to detect any disease. Please check the image quality.";
  } catch (error) {
    console.error("Gemini detectPlantDisease failed:", error);
    throw error;
  }
}

export async function getTTSAudio(text: string) {
  try {
    const response = await getAIClient().models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text: `Say clearly and helpfully: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  } catch (error) {
    console.error("TTS generation failed:", error);
    return null;
  }
}

export async function extractFarmUpdates(userQuery: string, botResponse: string, currentFieldData?: any) {
  if (!GEN_AI_KEY && !GEN_AI_KEY2) return { fieldUpdates: {}, soilUpdates: {}, newTasks: [] };

  // Smart skip: don't waste an API call on casual/greeting messages
  if (!shouldExtractUpdates(userQuery, botResponse)) {
    console.log('[Gemini] Skipping extraction — no actionable farm keywords detected');
    return { fieldUpdates: {}, soilUpdates: {}, newTasks: [] };
  }

    // Trim field data to save tokens
    const trimmedFieldData = currentFieldData ? {
      name: currentFieldData.name,
      currentCrop: currentFieldData.currentCrop,
      variety: currentFieldData.variety,
      plantingDate: currentFieldData.plantingDate,
      previousSprays: currentFieldData.previousSprays,
      irrigationTimings: currentFieldData.irrigationTimings,
      otherDetails: currentFieldData.otherDetails
    } : {};

    const prompt = `
    Analyze the following conversation between a farmer and an AI advisor.
    Extract any relevant technical updates for the farm plot (field) record AND any NEW soil test metrics.
    
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
    Return ONLY a valid JSON object.
    MANDATORY: Ensure the JSON is NOT wrapped in Markdown code blocks. Just return the raw JSON string.
  `;

  try {
    const response = await getAIClient().models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            fieldUpdates: {
              type: Type.OBJECT,
              properties: {
                currentCrop: { type: Type.STRING },
                variety: { type: Type.STRING },
                plantingDate: { type: Type.STRING },
                previousSprays: { type: Type.STRING },
                irrigationTimings: { type: Type.STRING },
                otherDetails: { type: Type.STRING },
              }
            },
            soilUpdates: {
              type: Type.OBJECT,
              properties: {
                ph: { type: Type.NUMBER },
                nitrogen: { type: Type.NUMBER },
                phosphorus: { type: Type.NUMBER },
                potassium: { type: Type.NUMBER },
                organicCarbon: { type: Type.NUMBER },
                otherNotes: { type: Type.STRING },
                testDate: { type: Type.STRING },
              }
            },
            newTasks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                  type: { type: Type.STRING },
                  dueDate: { type: Type.STRING },
                }
              }
            }
          }
        }
      }
    });

    const text = (response.text || '{}').trim();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      console.warn('extractFarmUpdates: failed to parse response:', text);
      return { fieldUpdates: {}, soilUpdates: {}, newTasks: [] };
    }
    
    // Ensure numbers for soil correctly parsed
    if (parsed.soilUpdates) {
      ['ph', 'nitrogen', 'phosphorus', 'potassium', 'organicCarbon'].forEach(key => {
        if (parsed.soilUpdates[key] !== undefined && parsed.soilUpdates[key] !== null) {
          parsed.soilUpdates[key] = Number(parsed.soilUpdates[key]);
        }
      });
    }

    return {
       fieldUpdates: parsed.fieldUpdates || {},
       soilUpdates: parsed.soilUpdates || {},
       newTasks: parsed.newTasks || []
    };
  } catch (error) {
    console.warn("Failed to extract farm updates:", error);
    return { fieldUpdates: {}, soilUpdates: {}, newTasks: [] };
  }
}

export async function getMarketPrices(location: string = "India", language: string = "English"): Promise<MarketPrice[]> {
  if (!GEN_AI_KEY && !GEN_AI_KEY2) return [];

  const prompt = `You are a live commodity market API. Return realistic, current wholesale market (Mandi) prices for 6 common crops (like Wheat, Rice, Tomato, Onion, Potato, Cotton, etc.) in ${location}.
  ${language === 'Hindi' ? 'Return crop names in Hindi (Devanagari script). For example: गेहूं, चावल, टमाटर, प्याज, आलू, कपास.' : 'Return crop names in English.'}
  Return ONLY a valid JSON array of objects. Make the data realistic for the current season.`;

  try {
    const response = await getAIClient().models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              crop: { type: Type.STRING },
              price: { type: Type.NUMBER },
              unit: { type: Type.STRING },
              trend: { type: Type.STRING },
              demand: { type: Type.STRING },
              lastUpdated: { type: Type.STRING },
            }
          }
        }
      }
    });

    try {
      return JSON.parse(response.text || "[]");
    } catch {
      return [];
    }
  } catch (error) {
    console.error("Failed to get market prices:", error);
    return [];
  }
}
