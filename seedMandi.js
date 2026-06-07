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

// Historical endpoint — data persists permanently, uses PascalCase field names
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

// Generate last N days in DD/MM/YYYY format (what the historical API expects)
function getLastNDaysFormatted(n) {
  const dates = [];
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    dates.push(`${day}/${month}/${year}`);
  }
  return dates;
}

async function run() {
  // Default: fetch last 3 days. Pass a number as CLI arg to override.
  const daysToFetch = parseInt(process.argv[2]) || 3;
  const targetDates = getLastNDaysFormatted(daysToFetch);

  console.log(`Starting manual sync to Supabase...`);
  console.log(`Fetching data for dates: ${targetDates.join(", ")}`);
  let totalUpserted = 0;

  for (const state of PRIORITY_STATES) {
    const stateRecords = [];

    for (const targetDate of targetDates) {
      let offset = 0;
      const limit = 500;

      while (true) {
        let retries = 3;
        let success = false;
        let records = [];

        while (retries > 0 && !success) {
          try {
            console.log(`Fetching ${state} date=${targetDate} offset=${offset}...`);
            const response = await axios.get(API_URL, {
              params: {
                "api-key": dataGovKey,
                format: "json",
                limit,
                offset,
                "filters[State]": state,
                "filters[Arrival_Date]": targetDate,
              },
              timeout: 45000,
            });

            records = response.data?.records || [];
            success = true;
          } catch (err) {
            retries--;
            console.error(`Fetch failed for ${state} date=${targetDate} offset=${offset}:`, err.message);
            if (retries === 0) break;
            console.log("Waiting 5 seconds before retrying...");
            await new Promise((resolve) => setTimeout(resolve, 5000));
          }
        }

        if (!success) {
          console.error(`Giving up on ${state} date=${targetDate} due to repeated network errors.`);
          break;
        }

        if (!records.length) break;

        for (const r of records) {
          // Historical endpoint uses PascalCase keys
          const arrivalStr = parseArrivalDate(r.Arrival_Date || r.arrival_date || "");

          const row = {
            state: (r.State || r.state || "").trim(),
            district: (r.District || r.district || "").trim(),
            market_name: (r.Market || r.market || "").trim(),
            commodity: (r.Commodity || r.commodity || "").trim(),
            variety: (r.Variety || r.variety || "").trim(),
            min_price: parseInt(r.Min_Price || r.min_price) || 0,
            max_price: parseInt(r.Max_Price || r.max_price) || 0,
            modal_price: parseInt(r.Modal_Price || r.modal_price) || 0,
            arrival_date: arrivalStr,
          };

          if (row.state && row.commodity && row.modal_price > 0) {
            stateRecords.push(row);
          }
        }

        if (records.length < limit) break;
        offset += limit;

        // Rate limit delay
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    // Deduplicate
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

    console.log(`[${state}] ${uniqueStateRecords.length} records processed.`);
  }

  console.log(`Sync complete! ${totalUpserted} rows pushed to Supabase.`);
  process.exit(0);
}

run();
