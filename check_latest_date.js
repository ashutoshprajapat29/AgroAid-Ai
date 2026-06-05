import { createClient } from "@supabase/supabase-js";
import fs from "fs";

async function check() {
  const envFile = fs.readFileSync(".env", "utf-8");
  const urlMatch = envFile.match(/VITE_SUPABASE_URL="(.*?)"/);
  const keyMatch = envFile.match(/VITE_SUPABASE_ANON_KEY="(.*?)"/);
  
  if (!urlMatch || !keyMatch) return console.log("Missing env vars");
  
  const supabase = createClient(urlMatch[1], keyMatch[1]);
  
  const { data, error } = await supabase
    .from("mandi_prices")
    .select("arrival_date")
    .order("arrival_date", { ascending: false })
    .limit(10);
    
  if (error) {
    console.error(error);
  } else {
    console.log("Latest dates in DB:", [...new Set(data.map(d => d.arrival_date))]);
  }
}
check();
