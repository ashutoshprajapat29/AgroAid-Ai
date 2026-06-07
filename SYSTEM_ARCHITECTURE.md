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

## 2. High-Level Architecture Diagram

```mermaid
flowchart TD
    %% Frontend Layer
    subgraph Frontend [Frontend: React + Vite + PWA]
        UI[UI Components]
        Maps[Leaflet Maps / Turf.js]
        Charts[Recharts]
        Dict[mandi_translations.json]
    end

    %% Backend / DB Layer
    subgraph Backend [Backend & Databases]
        FB[Firebase Auth & Firestore]
        Supa[(Supabase PostgreSQL)]
        CF[Firebase Cloud Functions]
    end

    %% External APIs
    subgraph External [External APIs]
        Gemini[Google Gemini API]
        GovAPI[data.gov.in API]
        Weather[OpenWeather / VisualCrossing]
    end

    %% Connections
    UI <-->|Auth & User Data| FB
    UI <-->|Market Prices via RPCs| Supa
    UI -->|Translation Lookups| Dict
    UI <-->|Weather Data| Weather
    UI <-->|Vision, Chat, Voice| Gemini
    
    CF -->|Fetch Market Prices (Cron)| GovAPI
    CF -->|Upsert Prices| Supa
    CF -->|Agri News & Sentiment| Gemini
```

## 3. Exhaustive File & Directory Dictionary

To prevent an agent from needing to manually list directories, below is the exact mapping of every single folder and file of importance in the project:

### `/src/components/` (React UI Components)
- `DiseaseScanner.tsx`: Allows image upload or camera capture. Converts images to Base64 and sends them to Gemini 2.5 Flash to diagnose crop diseases and suggest treatments.
- `FarmingAdvisor.tsx`: An AI chat interface. Reads the user's fields, weather, and language to provide highly contextual agronomy advice using Gemini.
- `FieldManager.tsx`: A map interface. Users draw polygons (farm boundaries) on a Leaflet map. Uses `Turf.js` to calculate acreage. Saves GeoJSON to Firestore.
- `LanguageToggle.tsx`: A UI button to switch between English and Hindi globally.
- `LiveVoiceAdvisor.tsx`: Implements speech recognition and text-to-speech for hands-free AI interaction.
- `MarketDashboard.tsx`: The most complex component. Displays latest commodity prices, historical area charts, comparison bar charts, and AI sentiment analysis. Includes complex logic to seamlessly translate dynamic UI text using `mandi_translations.json`.
- `NotificationManager.tsx`: Silently runs in the background. Prompts for Firebase Cloud Messaging (FCM) permissions and registers device tokens in Firestore.
- `PlotMap.tsx`: A smaller, read-only variant of FieldManager used to display existing farm polygons.
- `Profile.tsx`: User settings. Includes default State/District preferences so the Market Dashboard knows what to load on startup.
- `SoilHealthChart.tsx`: Renders visual analytics for soil metrics using Recharts.
- `TaskManager.tsx`: A CRUD interface for farm activities, saving data to Firestore.
- `ThemeToggle.tsx`: A UI button to toggle dark/light mode.
- `WeatherAdvisoryBanner.tsx`: Displays urgent weather alerts to the user based on context.
- `WeatherWidget.tsx`: Displays current weather and forecasts for the user's location.

### `/src/lib/` (State Management, Contexts, Config)
- `AuthContext.tsx`: Manages Firebase Authentication state and automatically loads the user's Firestore profile (`users/{uid}`).
- `LanguageContext.tsx`: Provides i18n capabilities (English/Hindi). Wraps the app and provides a `translate()` function and language toggle state.
- `ThemeContext.tsx`: Toggles between light and dark modes via a CSS class on the HTML root.
- `WeatherContext.tsx`: Centralized weather fetching using `apiCache.ts`.
- `apiCache.ts`: Utility for caching API responses (like weather) in `localStorage` to prevent rate limits.
- `firebase.ts` / `firebaseUtils.ts`: Firebase App initialization and helper functions for Firestore.
- `supabase.ts`: Supabase Client initialization.
- `mandi_translations.json`: A massive JSON dictionary used for caching English-to-Hindi translations of States, Districts, Markets, and Commodities.

### `/src/services/` (API Wrappers)
- `gemini.ts`: Wraps the `@google/genai` SDK. Handles prompt structuring for crop disease scanning (Vision), general farming advice, and voice advisor logic.
- `mandiService.ts`: Wrapper for fetching agricultural market prices. Queries our Supabase DB via RPCs (`get_latest_prices`, `get_historical_prices`) and applies aggressive local caching (`cachedApiCall`). It does NOT query `data.gov.in` directly.

### `/functions/` (Firebase Cloud Functions Backend)
- `src/index.ts`: Contains the backend logic.
  - `syncMandiToSupabase`: Cron job (Pub/Sub) fetching daily market prices from `data.gov.in` and pushing to Supabase.
  - `fetchAgriNews` & `getMarketSentiment`: HTTP endpoints that pull RSS feeds and use Gemini to summarize and rate "Sentiment" (Bullish/Bearish).

### `/supabase/` (PostgreSQL Config)
- `setup.sql`: SQL definitions for the `mandi_prices` table and all the RPCs (`get_latest_prices`, `search_mandi_prices`, `get_historical_prices`, `get_market_comparison`).

### `/scripts/` and Root Operations Scripts
- `scripts/generate_translations.js`: Connects to Supabase, finds all distinct English districts/markets/commodities, feeds them to Gemini in batches to generate Hindi translations, and updates `src/lib/mandi_translations.json` with exponential backoff.
- `seedMandi.js` / `backfillMissed.js`: Root Node scripts used to scrape historical API data from `data.gov.in` and backfill the Supabase Postgres database.
- Various test scripts (`testApi.js`, `testDb.js`, `testSync.js`, `checkDbDates.js`, `check_db.js`, `checkMP.js`): Throwaway diagnostic scripts used to debug backend data synchronization.

### Root Config Files
- `App.tsx` & `main.tsx`: React entry points and router setup.
- `index.css`: Global styles and Tailwind v4 setup.
- `firebase.json` / `firestore.rules` / `firestore.indexes.json`: Firebase deployment configuration and security rules.
- `vite.config.ts` / `tsconfig.json` / `package.json`: Vite bundler configuration, TypeScript rules, and package dependencies.
- `AGENTS.md`: Agent behavior guidelines.

## 3. Data Flow & Translation Mechanics
- **Market Prices:** The frontend fetches strictly from Supabase. Supabase is kept up-to-date by Firebase Cloud Functions.
- **Translations:** Because the DB contains English data, the frontend translates UI elements on the fly. `MarketDashboard.tsx` checks `mandi_translations.json` (case-insensitively) before rendering strings. If translations are missing, `scripts/generate_translations.js` must be run to update the JSON file.

## AI Agent Action Guide
- **When adding a new UI feature:** Put it in `src/components/`. If it needs new backend data, use Firebase Firestore for user-specific data, and Supabase for public/analytical data.
- **When updating market prices logic:** Check `src/services/mandiService.ts` and `supabase/setup.sql`. We only query Supabase, not `data.gov.in` directly.
- **When translating new datasets:** Run `node scripts/generate_translations.js` and use the case-insensitive `translateName` logic. Do not manually edit the 2700+ line JSON dictionary unless necessary.
- **When modifying AI prompts:** Check `src/services/gemini.ts` for frontend AI, and `functions/src/index.ts` for backend AI (News/Sentiment).
- **Before running commands:** Avoid running `grep` manually; use the `grep_search` tool. Do not use `cat` to modify files.
