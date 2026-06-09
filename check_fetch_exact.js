import fs from 'fs';

async function test() {
  const url = `https://api.data.gov.in/resource/35985678-0d79-46b4-9ed6-6f13308a1d24?api-key=579b464db66ec23bdd00000113c59107356744db401634c63edc0a48&format=csv&filters%5BState%5D=Madhya%20Pradesh&filters%5BDistrict%5D=Ratlam&filters%5BArrival_Date%5D=08%2F06%2F2026`;
  
  console.log("Fetching exact user sample URL...");
  try {
    const res = await fetch(url);
    if (!res.ok) {
        console.log("Error status:", res.status);
        const text = await res.text();
        console.log("Error response:", text);
        return;
    }
    const data = await res.text();
    console.log("Response Data length:", data.length);
    console.log("Response Data snippet:\n", data.substring(0, 500));
  } catch(e) {
    console.log("Error:", e);
  }
}

test();
