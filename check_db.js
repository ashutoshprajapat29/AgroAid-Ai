import { createClient } from "@supabase/supabase-js";
import fs from "fs";

async function check() {
  const envFile = fs.readFileSync(".env", "utf-8");
  const urlMatch = envFile.match(/VITE_SUPABASE_URL="(.*?)"/);
  const keyMatch = envFile.match(/VITE_SUPABASE_ANON_KEY="(.*?)"/);
  
  if (!urlMatch || !keyMatch) return console.log("Missing env vars");
  
  const supabase = createClient(urlMatch[1], keyMatch[1]);
  
  // 1. Check all distinct commodities in Ratlam
  const { data: ratlamData } = await supabase
    .from("mandi_prices")
    .select("market_name, commodity")
    .eq("district", "Ratlam");
    
  if (ratlamData) {
    const markets = [...new Set(ratlamData.map(r => r.market_name))];
    console.log("Markets in Ratlam:", markets);
    
    for (const m of markets) {
        const comms = [...new Set(ratlamData.filter(r => r.market_name === m).map(r => r.commodity))];
        console.log(`Commodities in ${m}:`, comms.length, comms.slice(0, 10).join(", "), comms.length > 10 ? "..." : "");
        const soya = comms.filter(c => c.toLowerCase().includes("soya"));
        if (soya.length > 0) console.log(`  => Found Soya in ${m}:`, soya);
    }
  }
}
check();
