import axios from "axios";
import fs from "fs";

const envFile = fs.readFileSync(".env", "utf-8");
const getEnv = (key) => {
  const match = envFile.match(new RegExp(`${key}="(.*?)"`));
  return match ? match[1] : null;
};
const API_KEY = getEnv("VITE_DATA_GOV_API_KEY");

async function checkMP() {
  console.log("Fetching MP data...");
  const res = await axios.get("https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070", {
    params: {
      "api-key": API_KEY,
      format: "json",
      limit: 1000,
      "filters[state]": "Madhya Pradesh",
    }
  });

  const records = res.data.records || [];
  console.log(`Total MP records fetched: ${records.length}`);
  
  const ratlamRecords = records.filter(r => 
    (r.district || r.District || "").toLowerCase() === "ratlam"
  );
  
  console.log(`Total Ratlam records in this batch: ${ratlamRecords.length}`);
  if (ratlamRecords.length > 0) {
    console.log("Sample Ratlam record:", ratlamRecords[0]);
  } else {
    // See what districts ARE returned
    const districts = [...new Set(records.map(r => r.district || r.District))];
    console.log(`Districts returned for MP: ${districts.slice(0, 10).join(", ")}...`);
  }
}

checkMP();
