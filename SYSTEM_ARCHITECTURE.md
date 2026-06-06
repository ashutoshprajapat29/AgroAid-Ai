# AgroAid-AI System Architecture

This document serves as a comprehensive guide for AI agents and developers to instantly understand the structure, data flow, and technologies used in the AgroAid-AI application. It is meant to save context window tokens and prevent the need to scan the entire codebase.

## 1. Tech Stack Overview
- **Frontend Framework:** React 19 + Vite + TypeScript
- **Styling:** Tailwind CSS (v4)
- **Map Library:** React-Leaflet + Leaflet-Draw + Turf.js (for farm boundary drawing and area calculation)
- **Charts:** Recharts (used for historical price trends and market comparisons)
- **Authentication & Core DB:** Firebase (Auth, Firestore, Cloud Messaging, Hosting)
- **Relational DB (Market Prices):** Supabase (PostgreSQL + RPCs)
- **AI Integrations:** Google Generative AI (Gemini 2.5 Flash) via `@google/genai`
- **PWA:** Managed via `vite-plugin-pwa` (Service Worker caching)

## 2. Directory Structure

```text
/
├── src/
│   ├── components/       # UI Components & Page Views
│   ├── lib/              # Context Providers (State) and Config (Firebase/Supabase)
│   ├── services/         # API wrappers (Supabase fetching, Gemini integrations)
│   ├── App.tsx           # Main router & layout structure
│   └── index.css         # Global styles & Tailwind entry
├── functions/            # Firebase Cloud Functions (Node.js/TypeScript)
├── supabase/             # Supabase migrations & setup SQL
└── package.json          # Dependencies
```

## 3. State Management & Contexts (`src/lib/`)
The app avoids complex state managers like Redux and relies heavily on React Context:
- **`AuthContext.tsx`**: Manages Firebase Authentication state and automatically loads the user's Firestore profile (`users/{uid}`).
- **`LanguageContext.tsx`**: Provides i18n capabilities (English/Hindi). Wraps the app and provides a `translate()` function and language toggle state.
- **`ThemeContext.tsx`**: Toggles between light and dark modes via a CSS class on the HTML root.
- **`WeatherContext.tsx`**: Centralized weather fetching. Uses `apiCache.ts` to prevent redundant network calls to weather APIs.
- **`firebase.ts` / `supabase.ts`**: Initialization singletons for backend clients.

## 4. Key Services (`src/services/`)
- **`mandiService.ts`**: Wrapper for fetching agricultural market prices. Instead of direct `SELECT` queries, it heavily uses Supabase RPCs (Remote Procedure Calls) like `get_latest_prices` and `get_market_comparison`. It includes aggressive local caching (`cachedApiCall`).
- **`gemini.ts`**: Wraps the `@google/genai` SDK. Handles prompt structuring for crop disease scanning (Vision), general farming advice, and voice advisor logic.

## 5. Core Application Views (`src/components/`)
1. **`MarketDashboard.tsx`**: The most complex component. Allows users to drill down by State -> District -> Market. Displays latest commodity prices, historical area charts, comparison bar charts, AI sentiment analysis (fetched from Firebase Functions), and semantic search.
2. **`FieldManager.tsx`**: A map interface. Users draw polygons (farm boundaries) on a Leaflet map. Uses `Turf.js` to calculate acreage. Saves the GeoJSON data to Firestore under `users/{uid}/fields`.
3. **`FarmingAdvisor.tsx`**: An AI chat interface. Reads the user's fields, weather, and language to provide highly contextual agronomy advice using Gemini.
4. **`DiseaseScanner.tsx`**: Allows image upload or camera capture. Converts images to Base64 and sends them to Gemini 2.5 Flash to diagnose crop diseases and suggest treatments.
5. **`LiveVoiceAdvisor.tsx`**: Implements speech recognition and text-to-speech for hands-free AI interaction.
6. **`TaskManager.tsx`**: A simple CRUD interface for farm activities, saving data to Firestore.
7. **`Profile.tsx`**: User settings. Includes default State/District preferences so the Market Dashboard knows what to load on startup.
8. **`NotificationManager.tsx`**: Silently runs in the background. Prompts for Firebase Cloud Messaging (FCM) permissions and registers device tokens in Firestore.

## 6. Backend: Firebase Cloud Functions (`functions/src/index.ts`)
- **`syncMandiToSupabase`**: A cron job scheduled via Pub/Sub (runs at 4:00 AM IST daily). Fetches latest market prices from the Indian Govt API (`data.gov.in`) and batch upserts them into the Supabase `mandi_prices` table.
- **`fetchAgriNews`**: HTTP endpoint. Pulls RSS feeds from Krishi Jagran & Economic Times, uses Gemini to summarize and rate the "Sentiment" (Bullish/Bearish), and returns it to the frontend.
- **`getMarketSentiment`**: HTTP endpoint. Reads the last 30 days of commodity prices and news, feeds them to Gemini, and returns a 3-sentence plain-language analysis of market momentum.

## 7. Backend: Supabase Database (`supabase/setup.sql`)
- Used exclusively for `mandi_prices` due to PostgreSQL's superior analytical querying capabilities over Firestore.
- **Table:** `mandi_prices` (state, district, market_name, commodity, variety, min_price, max_price, modal_price, arrival_date)
- **RPCs:**
  - `get_latest_prices(p_state, p_district, p_market)`: Uses `DISTINCT ON (commodity)` to fetch only the newest date row per commodity.
  - `search_mandi_prices`: Enables fuzzy/partial text search across commodities and markets.
  - `get_historical_prices`: Returns a 30-day time-series array for charts.
  - `get_market_comparison`: Finds the price of a specific commodity in nearby markets (within the same state/district) on the exact same date.

## AI Agent Action Guide
- **When adding a new UI feature:** Put it in `src/components/`. If it needs new backend data, use Firebase Firestore for user-specific data, and Supabase for public/analytical data.
- **When updating market prices logic:** Check `src/services/mandiService.ts` and `supabase/setup.sql`. The logic is split between the frontend cache and the Postgres RPCs.
- **When modifying AI prompts:** Check `src/services/gemini.ts` for frontend AI, and `functions/src/index.ts` for backend AI (News/Sentiment).
- **When tweaking map tools:** Check `src/components/FieldManager.tsx` and ensure `leaflet-draw` and `turf` types remain consistent.
- **Before running commands:** Avoid running `grep` manually; use the `grep_search` tool. Do not use `cat` to modify files.
