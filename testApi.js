async function run() {
  const API_KEY = "579b464db66ec23bdd00000113c59107356744db401634c63edc0a48"; // from .env
  const API_URL = "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070";
  
  const d = new Date();
  d.setDate(d.getDate() - 5);
  const dateStr = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth()+1).toString().padStart(2, '0')}/${d.getFullYear()}`;
  
  console.log("Fetching for date:", dateStr);

  try {
    const url = new URL(API_URL);
    url.searchParams.append("api-key", API_KEY);
    url.searchParams.append("format", "json");
    url.searchParams.append("limit", "5");
    url.searchParams.append("filters[State]", "Madhya Pradesh");
    url.searchParams.append("filters[Arrival_Date]", dateStr);

    const response = await fetch(url.toString());
    const data = await response.json();
    console.log("Records found:", data.records?.length || 0);
    console.log(data.records);
  } catch (e) {
    console.error(e.message);
  }
}

run();
