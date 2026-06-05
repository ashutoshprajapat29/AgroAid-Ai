import { createClient } from "@supabase/supabase-js";
import axios from "axios";
import fs from "fs";

// Load keys from .env
const envFile = fs.readFileSync("../.env", "utf-8");
const getEnv = (key) => {
  const match = envFile.match(new RegExp(`${key}="(.*?)"`));
  return match ? match[1] : null;
};

const supabaseUrl = getEnv("VITE_SUPABASE_URL");
// For admin writes, we ideally use the service_role key, but since RLS is loose right now or we are just testing,
// Let's grab the service role from functions/.env
const funcEnvFile = fs.readFileSync(".env", "utf-8");
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

console.log("Using URL:", supabaseUrl);
console.log("Using Key starting with:", supabaseServiceKey.substring(0, 40));

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
const API_URL = "https://api.data.gov.in/resource/35985678-0d79-46b4-9ed6-6f13308a1d24";

// Just run a small subset to give instant data without taking 5 minutes
const PRIORITY_STATES = [
  "Madhya Pradesh", "Rajasthan"
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

    // only fetch the first 1000 records for immediate test
    while (offset < 1000) {
      try {
        console.log(`Fetching ${state} offset ${offset}...`);
        const response = await axios.get(API_URL, {
          params: {
            "api-key": dataGovKey,
            format: "json",
            limit,
            offset,
            "filters[State]": state,
          },
          timeout: 20000,
        });

        const records = response.data?.records || [];
        if (!records.length) break;

        for (const r of records) {
          const row = {
            state: (r.State || "").trim(),
            district: (r.District || "").trim(),
            market_name: (r.Market || "").trim(),
            commodity: (r.Commodity || "").trim(),
            variety: (r.Variety || "").trim(),
            min_price: parseInt(r.Min_Price) || 0,
            max_price: parseInt(r.Max_Price) || 0,
            modal_price: parseInt(r.Modal_Price) || 0,
            arrival_date: parseArrivalDate(r.Arrival_Date || ""),
          };

          if (row.state && row.commodity && row.modal_price > 0) {
            stateRecords.push(row);
          }
        }

        if (records.length < limit) break;
        offset += limit;
      } catch (err) {
        console.error(`Fetch failed for ${state} offset=${offset}:`, err.message);
        break;
      }
    }

    // Batch upsert into Supabase (max 500 rows per call)
    for (let i = 0; i < stateRecords.length; i += 500) {
      const batch = stateRecords.slice(i, i + 500);
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
