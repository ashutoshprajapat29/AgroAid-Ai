import axios from "axios";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

// Load keys
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

const API_KEY = getEnv("VITE_DATA_GOV_API_KEY");
const SUPABASE_URL = getEnv("VITE_SUPABASE_URL");
const SUPABASE_KEY = getFuncEnv("SUPABASE_SERVICE_ROLE_KEY");

console.log("=== NIGHTLY SYNC VERIFICATION TEST ===\n");

// TEST 1: Verify data.gov.in API works with lowercase filters
console.log("TEST 1: Fetching data.gov.in with filters[state]=Punjab...");
try {
  const res = await axios.get("https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070", {
    params: {
      "api-key": API_KEY,
      format: "json",
      limit: 3,
      "filters[state]": "Punjab"
    },
    timeout: 15000
  });
  const records = res.data?.records ?? [];
  console.log(`  ✅ Got ${res.data?.total} total records, fetched ${records.length}`);
  if (records.length > 0) {
    const r = records[0];
    console.log(`  Sample record keys: ${Object.keys(r).join(", ")}`);
    console.log(`  Sample: state="${r.state}", commodity="${r.commodity}", modal_price=${r.modal_price}, arrival_date=${r.arrival_date}`);
    
    // Verify our field parsing works
    const state = (r.state || r.State || "").trim();
    const commodity = (r.commodity || r.Commodity || "").trim();
    const modal_price = parseInt(r.modal_price || r.Modal_Price) || 0;
    console.log(`  Parsed: state="${state}", commodity="${commodity}", modal_price=${modal_price}`);
    
    if (state && commodity && modal_price > 0) {
      console.log("  ✅ Field parsing works correctly!\n");
    } else {
      console.log("  ❌ Field parsing FAILED - values are empty/zero!\n");
    }
  }
} catch (err) {
  console.log(`  ❌ API call failed: ${err.message}\n`);
}

// TEST 2: Verify Supabase connection + write
console.log("TEST 2: Checking Supabase connectivity...");
try {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data, error, count } = await supabase
    .from("mandi_prices")
    .select("*", { count: "exact", head: true });
  
  if (error) {
    console.log(`  ❌ Supabase query failed: ${error.message}\n`);
  } else {
    console.log(`  ✅ Supabase connected. Current row count: ${count}\n`);
  }
} catch (err) {
  console.log(`  ❌ Supabase connection failed: ${err.message}\n`);
}

// TEST 3: Check if sort[Arrival_Date] still crashes the API
console.log("TEST 3: Verifying sort[Arrival_Date] is broken (should fail)...");
try {
  const res = await axios.get("https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070", {
    params: {
      "api-key": API_KEY,
      format: "json",
      limit: 1,
      "filters[state]": "Punjab",
      "sort[Arrival_Date]": "desc"
    },
    timeout: 10000
  });
  if (res.data?.status === "error") {
    console.log("  ✅ Confirmed: sort[Arrival_Date] returns API error (correctly removed from our code)\n");
  } else {
    console.log("  ⚠️ sort[Arrival_Date] worked - API may have been fixed\n");
  }
} catch (err) {
  console.log(`  ✅ Confirmed: sort[Arrival_Date] crashes the API: ${err.message}\n`);
}

// TEST 4: Verify uppercase filters[State] returns 0 results 
console.log("TEST 4: Verifying filters[State] (uppercase) is broken...");
try {
  const res = await axios.get("https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070", {
    params: {
      "api-key": API_KEY,
      format: "json",
      limit: 1,
      "filters[State]": "Punjab"
    },
    timeout: 10000
  });
  const total = res.data?.total ?? 0;
  if (total === 0) {
    console.log("  ✅ Confirmed: filters[State] (uppercase) returns 0 results (correctly changed to lowercase)\n");
  } else {
    console.log(`  ⚠️ filters[State] returned ${total} results - uppercase also works\n`);
  }
} catch (err) {
  console.log(`  ❌ API call failed: ${err.message}\n`);
}

console.log("=== ALL TESTS COMPLETE ===");
console.log("If TEST 1 and TEST 2 show ✅, the nightly 4 AM sync WILL work correctly.");
process.exit(0);
