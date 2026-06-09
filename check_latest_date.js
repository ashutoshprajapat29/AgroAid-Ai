import axios from "axios";
import fs from "fs";

async function checkDate() {
  const envFile = fs.readFileSync(".env", "utf-8");
  const match = envFile.match(/VITE_DATA_GOV_API_KEY="(.*?)"/);
  const key = match ? match[1] : null;

  const datesToTry = ["08/06/2024", "08/06/2026", "08-06-2024", "08-06-2026"];
  
  for(const date of datesToTry) {
      try {
        const res = await axios.get("https://api.data.gov.in/resource/35985678-0d79-46b4-9ed6-6f13308a1d24", {
          params: {
            "api-key": key,
            format: "json",
            limit: 5,
            "filters[Arrival_Date]": date
          }
        });
        
        const records = res.data.records || [];
        console.log(`Checking date ${date}: Found ${res.data.total_docs || records.length} records`);
      } catch (e) {
        if(e.response) {
            console.log(`Error checking date ${date}: status`, e.response.status, e.response.data);
        } else {
            console.log(`Error checking date ${date}:`, e.message);
        }
      }
  }
}
checkDate();
