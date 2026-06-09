const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = "https://skkxdkvwdgxwgyufelyn.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNra3hka3Z3ZGd4d2d5dWZlbHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDU5MDgzMiwiZXhwIjoyMDk2MTY2ODMyfQ.azZicIkAsLzEiO7E72MQd6r8Gy1Vla0r5NIl_Vi9Ivg";

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSync() {
  // Check the most recent records in mandi_prices
  const { data, error } = await supabase
    .from("mandi_prices")
    .select("*")
    .order("arrival_date", { ascending: false })
    .limit(5);

  if (error) {
    console.error("Error fetching from Supabase:", error);
    return;
  }

  console.log("Recent Mandi Prices:");
  console.table(data);

  // Check how many records for yesterday (which is what the sync does)
  const now = new Date();
  const istYesterday = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
  istYesterday.setUTCDate(istYesterday.getUTCDate() - 1);
  const day = String(istYesterday.getUTCDate()).padStart(2, "0");
  const month = String(istYesterday.getUTCMonth() + 1).padStart(2, "0");
  const year = istYesterday.getUTCFullYear();
  
  const targetDateStr1 = `${year}-${month}-${day}`;
  const targetDateStr2 = `${day}/${month}/${year}`;

  const { count: count1, error: countErr1 } = await supabase
    .from("mandi_prices")
    .select("*", { count: "exact", head: true })
    .eq("arrival_date", targetDateStr1);

  const { count: count2, error: countErr2 } = await supabase
    .from("mandi_prices")
    .select("*", { count: "exact", head: true })
    .eq("arrival_date", targetDateStr2);

  console.log(`\nRecords for ${targetDateStr1} or ${targetDateStr2}:`, (count1 || 0) + (count2 || 0));
}

checkSync();
