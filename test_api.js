import axios from "axios";
import fs from "fs";

async function test() {
  const envFile = fs.readFileSync(".env", "utf-8");
  const match = envFile.match(/VITE_DATA_GOV_API_KEY="(.*?)"/);
  const key = match ? match[1] : null;

  try {
    const res = await axios.get("https://api.data.gov.in/resource/35985678-0d79-46b4-9ed6-6f13308a1d24", {
      params: {
        "api-key": key,
        format: "json",
        limit: 5,
        offset: 100000,
        "filters[State]": "Madhya Pradesh",
        "sort[Arrival_Date]": "desc"
      }
    });
    console.log("Dates at offset 100,000:", res.data.records.map(r => r.Arrival_Date));
  } catch (e) {
    console.log("Error limit 500:", e.message);
  }
}
test();
