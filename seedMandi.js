import { createClient } from "@supabase/supabase-js";
import axios from "axios";
import fs from "fs";

// Load keys from .env
const envFile = fs.readFileSync(".env", "utf-8");
const getEnv = (key) => {
  const match = envFile.match(new RegExp(`${key}="(.*?)"`));
  return match ? match[1] : null;
};

const supabaseUrl = getEnv("VITE_SUPABASE_URL");
// For admin writes, we ideally use the service_role key, but since RLS is loose right now or we are just testing,
// Let's grab the service role from functions/.env
const funcEnvFile = fs.readFileSync("functions/.env", "utf-8");
const getFuncEnv = (key) => {
  const match = funcEnvFile.match(new RegExp(`${key}="(.*?)"`));
  return match ? match[1] : null;
};
const supabaseServiceKey = getFuncEnv("SUPABASE_SERVICE_ROLE_KEY");
const dataGovKey = getEnv("VITE_DATA_GOV_API_KEY");

if (!supabaseUrl || !supabaseServiceKey || !dataGovKey) {
  console.error("Missing keys. Make sure .env and functions/.env are correctly populated.");
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
const API_URL = "https://api.data.gov.in/resource/35985678-0d79-46b4-9ed6-6f13308a1d24";

const PRIORITY_STATES = [
  "Madhya Pradesh", "Rajasthan", "Maharashtra", "Gujarat",
  "Uttar Pradesh", "Bihar", "Haryana", "Punjab",
  "Uttarakhand", "Himachal Pradesh", "Delhi", "Chandigarh",
];

function parseArrivalDate(dateStr) {
  if (!dateStr) return new Date().toISOString().split("T")[0];
  if (dateStr.includes("/")) {
    const parts = dateStr.split("/");
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
    }
  }
  return dateStr;
}

async function run() {
  console.log("Starting instant manual sync to Supabase...");
  let totalUpserted = 0;

  for (const state of PRIORITY_STATES) {
    let offset = 0;
    const limit = 500;
    const stateRecords = [];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoffDateStr = thirtyDaysAgo.toISOString().split("T")[0];

    while (true) {
      let retries = 3;
      let success = false;
      let records = [];

      while (retries > 0 && !success) {
        try {
          console.log(`Fetching ${state} offset ${offset}...`);
          const response = await axios.get(API_URL, {
            params: {
              "api-key": dataGovKey,
              format: "json",
              limit,
              offset,
              "filters[State]": state,
              "sort[Arrival_Date]": "desc" // Ensure newest first
            },
            timeout: 45000,
          });

          records = response.data?.records || [];
          success = true;
        } catch (err) {
          retries--;
          console.error(`Fetch failed for ${state} offset=${offset}:`, err.message);
          if (retries === 0) break;
          console.log("Waiting 5 seconds before retrying...");
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      }

      if (!success) {
        console.error(`Giving up on ${state} due to repeated network errors.`);
        break;
      }

      if (!records.length) break;

      let reachedOlderData = false;

      for (const r of records) {
        const arrivalStr = parseArrivalDate(r.Arrival_Date || "");
        
        // Stop processing if we reach data older than our 30 day window
        if (arrivalStr < cutoffDateStr) {
            reachedOlderData = true;
            continue; // Skip appending old data
        }

        const row = {
          state: (r.State || "").trim(),
          district: (r.District || "").trim(),
          market_name: (r.Market || "").trim(),
          commodity: (r.Commodity || "").trim(),
          variety: (r.Variety || "").trim(),
          min_price: parseInt(r.Min_Price) || 0,
          max_price: parseInt(r.Max_Price) || 0,
          modal_price: parseInt(r.Modal_Price) || 0,
          arrival_date: arrivalStr,
        };

        if (row.state && row.commodity && row.modal_price > 0) {
          stateRecords.push(row);
        }
      }
      
      // If we saw data older than 30 days, we don't need to fetch the next page!
      if (reachedOlderData) {
        console.log(`Reached data older than 30 days for ${state}. Stopping pagination.`);
        break;
      }

      if (records.length < limit) break;
      offset += limit;
      
      // Add a 1 second delay to prevent 429 Rate Limit from data.gov.in
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Deduplicate records to prevent "ON CONFLICT DO UPDATE command cannot affect row a second time"
    const uniqueRecordsMap = new Map();
    for (const r of stateRecords) {
      const key = `${r.state}|${r.district}|${r.market_name}|${r.commodity}|${r.variety}|${r.arrival_date}`;
      uniqueRecordsMap.set(key, r);
    }
    const uniqueStateRecords = Array.from(uniqueRecordsMap.values());

    // Batch upsert into Supabase (max 500 rows per call)
    for (let i = 0; i < uniqueStateRecords.length; i += 500) {
      const batch = uniqueStateRecords.slice(i, i + 500);
      try {
        const { error } = await supabaseAdmin
          .from("mandi_prices")
          .upsert(batch, {
            onConflict: "state,district,market_name,commodity,variety,arrival_date",
          });

        if (error) {
          console.error(`Upsert error for ${state}:`, error.message);
        } else {
          totalUpserted += batch.length;
        }
      } catch (err) {
        console.error(`Upsert exception for ${state}:`, err.message);
      }
    }

    console.log(`[${state}] ${stateRecords.length} records processed.`);
  }

  console.log(`Sync complete! ${totalUpserted} rows pushed to Supabase.`);
  process.exit(0);
}

run();
