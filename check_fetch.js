import fs from 'fs';

async function test() {
  const envFile = fs.readFileSync(".env", "utf-8");
  const match = envFile.match(/VITE_DATA_GOV_API_KEY="(.*?)"/);
  const key = match ? match[1] : null;

  const url26 = `https://api.data.gov.in/resource/35985678-0d79-46b4-9ed6-6f13308a1d24?api-key=${key}&format=json&limit=5&filters[Arrival_Date]=08/06/2026`;
  const url24 = `https://api.data.gov.in/resource/35985678-0d79-46b4-9ed6-6f13308a1d24?api-key=${key}&format=json&limit=5&filters[Arrival_Date]=08/06/2024`;
  
  try {
    const res26 = await fetch(url26);
    const data26 = await res26.json();
    console.log("2026 Records length:", data26.records ? data26.records.length : 0);

    const res24 = await fetch(url24);
    const data24 = await res24.json();
    console.log("2024 Records length:", data24.records ? data24.records.length : 0);
  } catch(e) {
    console.log("Error:", e);
  }
}

test();
