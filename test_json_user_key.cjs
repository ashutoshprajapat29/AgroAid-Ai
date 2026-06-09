const axios = require('axios');

async function test() {
  try {
    const response = await axios.get("https://api.data.gov.in/resource/35985678-0d79-46b4-9ed6-6f13308a1d24", {
      params: {
        "api-key": "579b464db66ec23bdd00000113c59107356744db401634c63edc0a48",
        format: "json",
        limit: 5,
        "filters[State]": "Madhya Pradesh",
        "filters[District]": "Ratlam",
        "filters[Arrival_Date]": "08/06/2026",
      },
      timeout: 10000
    });
    console.log("JSON Success! Records:", response.data.records.length);
  } catch (err) {
    console.error("JSON Error:", err.message);
  }
}
test();
