const https = require('https');

const url = "https://api.data.gov.in/resource/35985678-0d79-46b4-9ed6-6f13308a1d24?api-key=579b464db66ec23bdd00000113c59107356744db401634c63edc0a48&format=json&limit=5&filters[Arrival_Date]=08/06/2026";

https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      console.log(`API returned ${parsed.records?.length || 0} records for 08/06/2026`);
    } catch (e) {
      console.log("Failed to parse API response", data.substring(0, 200));
    }
  });
}).on('error', (e) => {
  console.error("Error making request", e.message);
});
