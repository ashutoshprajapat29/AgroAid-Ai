import https from 'https';

const RSS_FEEDS = [
  { url: "https://www.thehindubusinessline.com/economy/agri-business/feeder/default.rss", defaultSource: "The Hindu BusinessLine", lang: "en" },
  { url: "https://news.google.com/rss/search?q=agriculture+india+mandi+crop+prices+when:7d&hl=en-IN&gl=IN&ceid=IN:en", defaultSource: "Google News", lang: "en" },
  { url: "https://news.google.com/rss/search?q=%E0%A4%95%E0%A5%83%E0%A4%B7%E0%A4%BF+%E0%A4%AE%E0%A4%82%E0%A4%A1%E0%A5%80+%E0%A4%AB%E0%A4%B8%E0%A4%B2+%E0%A4%AD%E0%A4%BE%E0%A4%B5+when:7d&hl=hi&gl=IN&ceid=IN:hi", defaultSource: "Google News Hindi", lang: "hi" },
  { url: "https://hindi.krishijagran.com/feeds/rss", defaultSource: "Krishi Jagran Hindi", lang: "hi" },
  { url: "https://krishijagran.com/feeds/rss", defaultSource: "Krishi Jagran", lang: "en" },
];

function cleanXmlText(str) {
  if (!str) return "";
  let text = str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8216;|&#8217;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&#8230;/g, "...");

  // Strip all HTML tags completely after entity decoding
  text = text.replace(/<[^>]*>/g, "");
  // Strip any raw URLs
  text = text.replace(/https?:\/\/\S+/g, "");

  return text.replace(/\s+/g, " ").trim();
}

const COMMODITY_TAXONOMY = [
  { name: "Wheat", hi: "गेहूँ", patterns: [/\bwheat\b/i, /\bgehu\b/i, /गेहूं/, /गेहूँ/] },
  { name: "Paddy / Rice", hi: "धान / चावल", patterns: [/\bpaddy\b/i, /\brice\b/i, /\bdhan\b/i, /धान/, /चावल/, /बासमती/, /\bbasmati\b/i] },
  { name: "Soybean", hi: "सोयाबीन", patterns: [/\bsoybean\b/i, /\bsoya\b/i, /सोयाबीन/, /सोया/] },
  { name: "Cotton", hi: "कपास", patterns: [/\bcotton\b/i, /\bkapas\b/i, /\bnarma\b/i, /कपास/, /नरमा/, /सूत/] },
  { name: "Mustard", hi: "सरसों", patterns: [/\bmustard\b/i, /\bsarson\b/i, /\brapeseed\b/i, /सरसों/, /राई/, /तारामीरा/] },
  { name: "Onion", hi: "प्याज", patterns: [/\bonion\b/i, /\bpyaz\b/i, /प्याज/, /कांदा/] },
  { name: "Potato", hi: "आलू", patterns: [/\bpotato\b/i, /\baloo\b/i, /आलू/] },
  { name: "Tomato", hi: "टमाटर", patterns: [/\btomato\b/i, /\btamatar\b/i, /टमाटर/] },
  { name: "Maize / Corn", hi: "मक्का", patterns: [/\bmaize\b/i, /\bcorn\b/i, /\bmakka\b/i, /मक्का/, /भुट्टा/] },
  { name: "Gram / Chana", hi: "चना", patterns: [/\bchana\b/i, /\bchickpea\b/i, /\bgram\b/i, /चना/, /छोले/, /काबुली/] },
  { name: "Pulses / Dal", hi: "दालें / दलहन", patterns: [/\bpulses?\b/i, /\bdal\b/i, /\btur\b/i, /\barhar\b/i, /\bmoong\b/i, /\burad\b/i, /\bmasoor\b/i, /दलहन/, /दाल/, /अरहर/, /मूंग/, /उड़द/, /मसूर/] },
  { name: "Garlic & Ginger", hi: "लहसुन व अदरक", patterns: [/\bgarlic\b/i, /\bginger\b/i, /\blahsun\b/i, /\badrak\b/i, /लहसुन/, /अदरक/] },
  { name: "Spices", hi: "मसाले", patterns: [/\bspices?\b/i, /\bjeera\b/i, /\bcumin\b/i, /\bcoriander\b/i, /\bdhaniya\b/i, /\bturmeric\b/i, /\bhaldi\b/i, /\bchilli\b/i, /\bcardamom\b/i, /मसाले/, /जीरा/, /हल्दी/, /धनिया/, /मिर्च/, /इलायची/] },
  { name: "Sugarcane", hi: "गन्ना", patterns: [/\bsugarcane\b/i, /\bsugar\b/i, /\bganna\b/i, /गन्ना/, /चीनी/, /गुड़/, /\bjaggery\b/i] },
  { name: "Edible Oils", hi: "खाद्य तेल", patterns: [/\bedible oils?\b/i, /\boilseeds?\b/i, /\bpalm oil\b/i, /तिलहन/, /खाद्य तेल/, /तेल/] },
  { name: "Fruits & Vegetables", hi: "फल व सब्जियां", patterns: [/\bfruits?\b/i, /\bvegetables?\b/i, /\bapple\b/i, /\bmango\b/i, /\bbanana\b/i, /फल/, /सब्ज/] },
  { name: "Dairy & Livestock", hi: "डेयरी व पशुपालन", patterns: [/\bmilk\b/i, /\bdairy\b/i, /\bcattle\b/i, /\blivestock\b/i, /\bpoultry\b/i, /दूध/, /डेयरी/, /पशु/, /गोपालन/] },
  { name: "Fertilizer & Seeds", hi: "उर्वरक व बीज", patterns: [/\bfertilizer\b/i, /\burea\b/i, /\bdap\b/i, /\bseeds?\b/i, /खाद/, /उर्वरक/, /यूरिया/, /बीज/] },
  { name: "Weather & Monsoon", hi: "मौसम व मानसून", patterns: [/\bmonsoon\b/i, /\brainfall\b/i, /\bweather\b/i, /\bdrought\b/i, /\bflood\b/i, /\brain\b/i, /बारिश/, /मानसून/, /मौसम/, /सूखा/, /बाढ़/] },
  { name: "Policy & MSP", hi: "नीति व एमएसपी", patterns: [/\bmsp\b/i, /\bprocurement\b/i, /\bsubsidy\b/i, /\bscheme\b/i, /\bkisan\b/i, /एमएसपी/, /सब्सिडी/, /खरीद/, /योजना/, /नीति/] }
];

function classifyCommodity(text) {
  for (const item of COMMODITY_TAXONOMY) {
    for (const pat of item.patterns) {
      if (pat.test(text)) {
        return { commodity: item.name, commodity_hi: item.hi };
      }
    }
  }
  return { commodity: "General Agriculture", commodity_hi: "सामान्य कृषि" };
}

function classifySentiment(text) {
  const posRegex = /\b(surge|jump|ris(e|ing|en)|gains?|hike|rally|higher|boom|record|bumper|profit|bullish|relief|boost|upswing)\b|तेजी|उछाल|बढ़ोतरी|रिकॉर्ड|मुनाफा|बंपर|खुश|राहत|मजबूत|वृद्धि|ऊंचे|फायदा/i;
  const negRegex = /\b(crash|falls?|falling|fallen|drop|plunge|slump|decline|loss(es)?|pest|damage|rot|delay|drought|flood|dip|bearish|slashing|glut)\b|गिरावट|मंदी|नुकसान|घाटा|कीट|रोग|सूखा|बाढ़|कमी|गिरे|कम|चुनौती|संकट|असर/i;

  if (posRegex.test(text)) return "Positive";
  if (negRegex.test(text)) return "Negative";
  return "Neutral";
}

function generateImpact(desc, title, commodity, commodity_hi, sentiment, isHindi) {
  const cleanedDesc = (desc || "")
    .replace(/<[^>]*>/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .trim();

  // If desc is missing, too short, contains raw html leftovers, or basically just the headline repeating
  const normTitle = (title || "").toLowerCase().replace(/[^a-z0-9\u0900-\u097F]/g, "").slice(0, 25);
  const normDesc = cleanedDesc.toLowerCase().replace(/[^a-z0-9\u0900-\u097F]/g, "").slice(0, 25);
  const isRedundant = !cleanedDesc ||
    cleanedDesc.length < 30 ||
    cleanedDesc.startsWith("<") ||
    (normTitle && normDesc && (normTitle === normDesc || normDesc.includes(normTitle)));

  if (!isRedundant) {
    const trimmed = cleanedDesc.slice(0, 180);
    return trimmed.endsWith(".") ? trimmed : trimmed + "...";
  }

  if (isHindi) {
    if (sentiment === "Positive") {
      return `इस घटनाक्रम से ${commodity_hi} के बाजार भाव व मांग में सकारात्मक रुझान देखने को मिल सकता है।`;
    } else if (sentiment === "Negative") {
      return `इस खबर से ${commodity_hi} की स्थानीय आवक व मंडी कीमतों पर दबाव रहने की संभावना है।`;
    }
    return `${commodity_hi} से जुड़ी नवीनतम गतिविधियों पर किसान मंडी भाव व आगामी नीतियों के अनुसार निर्णय लें।`;
  } else {
    if (sentiment === "Positive") {
      return `Positive developments indicate supportive price momentum and steady trade demand for ${commodity}.`;
    } else if (sentiment === "Negative") {
      return `Market signals suggest cautious arrivals or downward price pressure for ${commodity}.`;
    }
    return `Stay updated on mandi arrivals and trading volume trends regarding ${commodity}.`;
  }
}

function getRelativeTime(dateStr, isHindi = false) {
  if (!dateStr) return isHindi ? "ताज़ा" : "Recent";
  try {
    const timestamp = Date.parse(dateStr);
    if (isNaN(timestamp)) return isHindi ? "ताज़ा" : "Recent";
    const diffMs = Date.now() - timestamp;
    if (diffMs < 0 || diffMs < 60 * 1000) return isHindi ? "अभी-अभी" : "Just now";
    const mins = Math.floor(diffMs / (60 * 1000));
    const hours = Math.floor(diffMs / (60 * 60 * 1000));
    const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    if (mins < 60) return isHindi ? `${mins} मिनट पहले` : `${mins}m ago`;
    if (hours < 24) return isHindi ? `${hours} घंटे पहले` : `${hours}h ago`;
    if (days === 1) return isHindi ? "कल" : "Yesterday";
    return isHindi ? `${days} दिन पहले` : `${days}d ago`;
  } catch {
    return isHindi ? "ताज़ा" : "Recent";
  }
}

function fetchFeed(url) {
  return new Promise((resolve) => {
    https.get(url, { headers: { "User-Agent": "AgroAid-AI/2.0 (+https://agroaid.app)" } }, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => resolve(data));
    }).on("error", () => resolve(""));
  });
}

let devNewsCache = {
  English: { ts: 0, items: [] },
  Hindi: { ts: 0, items: [] },
};

export async function getLiveAgriNews(language = "English", force = false) {
  const isHindi = language === "Hindi";
  const now = Date.now();
  const cacheKey = isHindi ? "Hindi" : "English";

  // In-memory cache for 30 minutes in dev server
  if (!force && devNewsCache[cacheKey].items.length > 0 && (now - devNewsCache[cacheKey].ts) < 30 * 60 * 1000) {
    return devNewsCache[cacheKey].items;
  }

  const feedResults = await Promise.allSettled(
    RSS_FEEDS.map(async (f) => {
      const xml = await fetchFeed(f.url);
      const items = [];
      const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
      let match;
      while ((match = itemRegex.exec(xml)) !== null) {
        const itemXml = match[1];
        const title = cleanXmlText(itemXml.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "");
        if (!title || title.length < 8) continue;

        const desc = cleanXmlText(itemXml.match(/<description>([\s\S]*?)<\/description>/)?.[1] || "");
        const link = cleanXmlText(itemXml.match(/<link>([\s\S]*?)<\/link>/)?.[1] || "");
        const pubDate = cleanXmlText(itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || "");
        const itemSource = cleanXmlText(itemXml.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] || "") || f.defaultSource;

        const fullContent = `${title} ${desc}`;
        const { commodity, commodity_hi } = classifyCommodity(fullContent);
        const sentiment = classifySentiment(fullContent);
        const impact = generateImpact(desc, title, commodity, commodity_hi, sentiment, isHindi);
        const timeAgo = getRelativeTime(pubDate, isHindi);

        const cleanSlug = title.toLowerCase().replace(/[^a-z0-9\u0900-\u097F]/g, "").slice(0, 30);
        const id = `${cleanSlug}-${Date.parse(pubDate) || items.length}`;

        let publishedAt = new Date().toISOString();
        if (pubDate) {
          const parsed = Date.parse(pubDate);
          if (!isNaN(parsed)) {
            // Discard articles older than 7 days (or future timestamps beyond 24 hours)
            const ageMs = now - parsed;
            if (ageMs > 7 * 24 * 60 * 60 * 1000 || ageMs < -24 * 60 * 60 * 1000) {
              continue;
            }
            publishedAt = new Date(parsed).toISOString();
          }
        }

        items.push({
          id,
          title,
          impact,
          sentiment,
          commodity,
          commodity_hi,
          source: itemSource,
          link,
          pubDate,
          publishedAt,
          timeAgo,
        });
      }
      return items;
    })
  );

  const allArticles = [];
  const seenTitles = new Set();

  for (const result of feedResults) {
    if (result.status === "fulfilled") {
      for (const item of result.value) {
        const normTitle = item.title.toLowerCase().replace(/[^a-z0-9\u0900-\u097F]/g, "").slice(0, 45);
        if (!seenTitles.has(normTitle)) {
          seenTitles.add(normTitle);
          allArticles.push(item);
        }
      }
    }
  }

  // Sort: When in Hindi, prioritize Hindi articles at top while preserving recency; otherwise pure recency descending
  allArticles.sort((a, b) => {
    const timeA = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const timeB = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    if (isHindi) {
      const isHindiA = /[\u0900-\u097F]/.test(a.title) ? 1 : 0;
      const isHindiB = /[\u0900-\u097F]/.test(b.title) ? 1 : 0;
      if (isHindiA !== isHindiB) return isHindiB - isHindiA;
    }
    return timeB - timeA;
  });

  devNewsCache[cacheKey] = { ts: now, items: allArticles };
  return allArticles;
}
