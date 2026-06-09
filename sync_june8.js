import { createClient } from "@supabase/supabase-js";
import axios from "axios";
import fs from "fs";

// Load keys
const envFile = fs.readFileSync(".env", "utf-8");
const funcEnvFile = fs.readFileSync("functions/.env", "utf-8");
const getEnv = (src, key) => {
  const match = src.match(new RegExp(`${key}="(.*?)"`));
  return match ? match[1] : null;
};

const supabaseUrl = getEnv(envFile, "VITE_SUPABASE_URL");
const supabaseServiceKey = getEnv(funcEnvFile, "SUPABASE_SERVICE_ROLE_KEY");
const dataGovKey = getEnv(envFile, "VITE_DATA_GOV_API_KEY");

if (!supabaseUrl || !supabaseServiceKey || !dataGovKey) {
  console.error("Missing keys. Check .env and functions/.env");
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
const API_URL = "https://api.data.gov.in/resource/35985678-0d79-46b4-9ed6-6f13308a1d24";
const TARGET_DATE = "08/06/2026";

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
  console.log(`\n🌾 Fetching mandi data for ${TARGET_DATE} from data.gov.in...\n`);
  let totalUpserted = 0;
  let totalErrors = 0;

  for (const state of PRIORITY_STATES) {
    const stateRecords = [];
    let offset = 0;
    const limit = 500;

    while (true) {
      let retries = 3;
      let success = false;
      let records = [];

      while (retries > 0 && !success) {
        try {
          console.log(`  Fetching ${state} offset=${offset}...`);
          const response = await axios.get(API_URL, {
            params: {
              "api-key": dataGovKey,
              format: "json",
              limit,
              offset,
              "filters[State]": state,
              "filters[Arrival_Date]": TARGET_DATE,
            },
            timeout: 120000,
          });

          records = response.data?.records ?? [];
          success = true;
        } catch (err) {
          retries--;
          console.warn(`  ⚠️ Fetch failed for ${state} offset=${offset}. Retries left: ${retries}. Error: ${err.message}`);
          if (retries === 0) {
            totalErrors++;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      }

      if (!success) break;
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
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Deduplicate
    const uniqueMap = new Map();
    for (const r of stateRecords) {
      const key = `${r.state}|${r.district}|${r.market_name}|${r.commodity}|${r.variety}|${r.arrival_date}`;
      uniqueMap.set(key, r);
    }
    const uniqueRecords = Array.from(uniqueMap.values());

    // Upsert to Supabase
    for (let i = 0; i < uniqueRecords.length; i += 500) {
      const batch = uniqueRecords.slice(i, i + 500);
      try {
        const { error } = await supabaseAdmin
          .from("mandi_prices")
          .upsert(batch, {
            onConflict: "state,district,market_name,commodity,variety,arrival_date",
          });

        if (error) {
          console.error(`  ❌ Upsert error for ${state}: ${error.message}`);
          totalErrors++;
        } else {
          totalUpserted += batch.length;
        }
      } catch (err) {
        console.error(`  ❌ Upsert exception for ${state}: ${err.message}`);
        totalErrors++;
      }
    }

    console.log(`  ✅ [${state}] ${uniqueRecords.length} records upserted`);
  }

  console.log(`\n🏁 Sync complete! ${totalUpserted} rows upserted, ${totalErrors} errors.\n`);
  process.exit(0);
}

run();
