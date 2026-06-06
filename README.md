<div align="center">
  <h1>🌱 AgroAid AI</h1>
  <p><strong>Advanced Precision Farming Advisor & Market Assistant</strong></p>
</div>

## Overview
**AgroAid AI** is a comprehensive, AI-powered agricultural application designed to empower farmers with data-driven insights. Built as a mobile-first Progressive Web App (PWA), it seamlessly combines real-time market data, intelligent crop disease diagnostics, and hands-free voice assistance to modernize farm management.

## Key Features

*   📈 **Live Market Dashboard:** Fetches real-time Mandi (market) prices across India.
*   🧠 **AI Market Sentiment:** Analyzes historical price trends to provide bullish/bearish forecasts and actionable trading advice (powered by Google Gemini).
*   📰 **Agricultural News Hub:** Scrapes and translates the latest agricultural news, classifying sentiment automatically.
*   🗺️ **Field & Plot Manager:** Map out your farm plots using interactive maps (Leaflet) and track crop lifecycles with built-in task management.
*   🤖 **AgroAid Advisor:** An intelligent chatbot that answers farming questions and offers personalized crop strategies.
*   🎙️ **Live Voice Assistant:** Hands-free voice interface allowing farmers to ask questions and receive spoken advice while out in the field.
*   🌿 **Disease Scanner:** Snap a photo of a diseased leaf and instantly receive an AI-powered diagnosis and treatment plan.
*   🌐 **Multilingual Support:** Full English and Hindi support (including an offline-first translated dictionary for market and crop names) to ensure maximum accessibility.

## Architecture

*   **Frontend:** React, Vite, Tailwind CSS, Lucide Icons, React-Leaflet
*   **Backend / Database:** Supabase (PostgreSQL) for storing historical Mandi prices, caching, and market data.
*   **Serverless / Cloud:** Firebase Cloud Functions for backend web scraping and scheduled background tasks. Firebase Hosting for frontend delivery.
*   **AI Integrations:** Google Gemini 2.5 Flash API (Text generation, Vision, Translation, and Sentiment Classification).

## Run Locally

**Prerequisites:** Node.js (v18+)

1.  **Install Dependencies:**
    ```bash
    npm install
    ```

2.  **Environment Variables:**
    Create a `.env` file in the root directory and configure the following variables:
    ```env
    VITE_GEMINI_API_KEY="your_gemini_api_key"
    VITE_GEMINI_API_KEY2="your_fallback_gemini_api_key"
    VITE_SUPABASE_URL="your_supabase_project_url"
    VITE_SUPABASE_ANON_KEY="your_supabase_anon_key"
    ```

3.  **Start the Development Server:**
    ```bash
    npm run dev
    ```
    The app will be available at `http://localhost:3000`.

## Scripts

*   `npm run build`: Compiles the app and generates the PWA service workers for production.
*   `npm run generate-translations`: Runs the offline developer script (`scripts/generate_translations.js`) to bulk-translate the database of commodity and market names into Hindi using Gemini.

## Deployment
This application is fully configured for Firebase Hosting.

1.  Build the project: `npm run build`
2.  Deploy to Firebase: `npx firebase-tools deploy --only hosting`

## License
**All Rights Reserved**
Copyright (c) 2026. This code is proprietary and closed-source. Unauthorized copying, distribution, or modification is strictly prohibited.
