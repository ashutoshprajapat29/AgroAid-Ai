import { createClient } from "@supabase/supabase-js";
import axios from "axios";
import fs from "fs";

// Load keys from .env
const envFile = fs.readFileSync(".env", "utf-8");
const getEnv = (key) => {
  const match = envFile.match(new RegExp(`${key}="(.*?)"`));
  return match ? match[1] : null;
};
const funcEnvFile = fs.readFileSync("functions/.env", "utf-8");
const getFuncEnv = (key) => {
  const match = funcEnvFile.match(new RegExp(`${key}="(.*?)"`));
  return match ? match[1] : null;
};

const supabaseUrl = getEnv("VITE_SUPABASE_URL");
const supabaseServiceKey = getFuncEnv("SUPABASE_SERVICE_ROLE_KEY");
const dataGovKey = getEnv("VITE_DATA_GOV_API_KEY");

if (!supabaseUrl || !supabaseServiceKey || !dataGovKey) {
  console.error("Missing keys");
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Use the HISTORICAL dataset which contains all past dates, including the ones we missed
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

// Generate the last 4 dates in DD/MM/YYYY format required by the API
function getLast4DaysFormatted() {
    const dates = [];
    for (let i = 0; i < 4; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        dates.push(`${day}/${month}/${year}`);
    }
    return dates;
}

async function run() {
  console.log("Starting targeted historical backfill for the missed days...");
  let totalUpserted = 0;
  
  const targetDates = getLast4DaysFormatted();
  console.log(`Target dates to fetch: ${targetDates.join(", ")}`);

  for (const state of PRIORITY_STATES) {
    for (const targetDate of targetDates) {
      let offset = 0;
      const limit = 500;
      const stateRecords = [];

      while (true) {
        let retries = 3;
        let success = false;
        let records = [];

        while (retries > 0 && !success) {
          try {
            console.log(`Fetching ${state} for date ${targetDate} offset ${offset}...`);
            const response = await axios.get(API_URL, {
              params: {
                "api-key": dataGovKey,
                format: "json",
                limit,
                offset,
                "filters[state]": state,
                "filters[arrival_date]": targetDate
              },
              timeout: 45000,
            });

            records = response.data?.records || [];
            success = true;
          } catch (err) {
            retries--;
            console.error(`Fetch failed:`, err.message);
            if (retries === 0) break;
            await new Promise((resolve) => setTimeout(resolve, 5000));
          }
        }

        if (!success || !records.length) break;

        for (const r of records) {
          const arrivalStr = parseArrivalDate(r.arrival_date || r.Arrival_Date || "");
          const row = {
            state: (r.state || r.State || "").trim(),
            district: (r.district || r.District || "").trim(),
            market_name: (r.market || r.Market || "").trim(),
            commodity: (r.commodity || r.Commodity || "").trim(),
            variety: (r.variety || r.Variety || "").trim(),
            min_price: parseInt(r.min_price || r.Min_Price) || 0,
            max_price: parseInt(r.max_price || r.Max_Price) || 0,
            modal_price: parseInt(r.modal_price || r.Modal_Price) || 0,
            arrival_date: arrivalStr,
          };
          if (row.state && row.commodity && row.modal_price > 0) {
            stateRecords.push(row);
          }
        }

        if (records.length < limit) break;
        offset += limit;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      if (stateRecords.length > 0) {
        // Upsert this date batch
        const uniqueRecordsMap = new Map();
        for (const r of stateRecords) {
          const key = `${r.state}|${r.district}|${r.market_name}|${r.commodity}|${r.variety}|${r.arrival_date}`;
          uniqueRecordsMap.set(key, r);
        }
        const batch = Array.from(uniqueRecordsMap.values());
        
        for (let i = 0; i < batch.length; i += 500) {
            const chunk = batch.slice(i, i + 500);
            const { error } = await supabaseAdmin.from("mandi_prices").upsert(chunk, {
                onConflict: "state,district,market_name,commodity,variety,arrival_date",
            });
            if (!error) totalUpserted += chunk.length;
        }
        console.log(`  -> Saved ${batch.length} records for ${state} on ${targetDate}`);
      }
    }
  }

  console.log(`Backfill complete! ${totalUpserted} missed rows pushed to Supabase.`);
  process.exit(0);
}

run();
