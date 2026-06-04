import { useState, useEffect, useCallback, useRef } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, BarChart, Bar, Cell,
} from "recharts";
import { motion, AnimatePresence } from "motion/react";
import {
  TrendingUp, TrendingDown, Minus, MapPin,
  IndianRupee, RefreshCw, ChevronDown, Newspaper,
  Brain, Loader2, AlertCircle, BarChart2, Search,
  ArrowUpRight, ArrowDownRight, Navigation,
  Store, Filter, X, ChevronLeft, ExternalLink, Clock,
} from "lucide-react";
import {
  fetchLatestPrices, fetchPriceHistory, fetchMarketNews,
  fetchMarketSentiment, fetchNearbyPrices, searchMandiPrices,
  fetchMarketComparison,
  INDIA_STATES_DISTRICTS,
  COMMON_COMMODITIES, COMMON_COMMODITIES_HI,
  MandiPrice, PriceHistory, NewsItem, SentimentResult, MarketCompare,
} from "../services/mandiService";
import { useLanguage } from "../lib/LanguageContext";

// ─── Time Range type ──────────────────────────────────────────────────────────
type TimeRange = "1D" | "7D" | "30D" | "1Y";
const TIME_RANGES: { key: TimeRange; label: string; labelHi: string }[] = [
  { key: "1D",  label: "1D",  labelHi: "1दिन" },
  { key: "7D",  label: "7D",  labelHi: "7दिन" },
  { key: "30D", label: "1M",  labelHi: "1माह" },
  { key: "1Y",  label: "1Y",  labelHi: "1साल" },
];

// ─── Custom Tooltip for Chart ─────────────────────────────────────────────────
function PriceTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-2xl p-4 border text-sm shadow-2xl"
      style={{
        background: "var(--bg-card)",
        borderColor: "var(--border-card)",
        backdropFilter: "blur(12px)",
      }}
    >
      <p className="font-black text-xs uppercase tracking-widest mb-2" style={{ color: "var(--text-subtle)" }}>
        {label}
      </p>
      <div className="space-y-1">
        {payload.map((entry: any) => (
          <div key={entry.name} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
            <span style={{ color: "var(--text-muted)" }} className="text-xs">{entry.name}:</span>
            <span className="font-bold text-xs" style={{ color: entry.color }}>
              ₹{entry.value?.toLocaleString("en-IN")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Bar Chart Tooltip (Market Comparison) ────────────────────────────────────
function MarketBarTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div
      className="rounded-2xl p-4 border text-sm shadow-2xl"
      style={{
        background: "var(--bg-card)",
        borderColor: "var(--border-card)",
        backdropFilter: "blur(12px)",
      }}
    >
      <p className="font-black text-xs uppercase tracking-widest mb-2" style={{ color: "var(--text-main)" }}>
        {d.market_name}
      </p>
      <p className="text-[9px] mb-2" style={{ color: "var(--text-subtle)" }}>{d.district}</p>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>Modal:</span>
          <span className="text-xs font-bold text-emerald-400">₹{d.modal_price?.toLocaleString("en-IN")}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-400" />
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>Min:</span>
          <span className="text-xs font-bold text-blue-400">₹{d.min_price?.toLocaleString("en-IN")}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-rose-400" />
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>Max:</span>
          <span className="text-xs font-bold text-rose-400">₹{d.max_price?.toLocaleString("en-IN")}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Sentiment Badge ──────────────────────────────────────────────────────────
function SentimentBadge({ s, isHindi }: { s: SentimentResult; isHindi: boolean }) {
  const config = {
    Bullish: { bg: "bg-emerald-500/15", border: "border-emerald-500/30", text: "text-emerald-400", icon: TrendingUp, label: isHindi ? "तेज़ी" : "Bullish", dot: "bg-emerald-400" },
    Bearish: { bg: "bg-rose-500/15",    border: "border-rose-500/30",    text: "text-rose-400",    icon: TrendingDown, label: isHindi ? "मंदी" : "Bearish", dot: "bg-rose-400" },
    Stable:  { bg: "bg-amber-500/15",   border: "border-amber-500/30",   text: "text-amber-400",   icon: Minus,        label: isHindi ? "स्थिर" : "Stable",  dot: "bg-amber-400" },
  }[s.sentiment] ?? { bg: "bg-slate-500/15", border: "border-slate-500/20", text: "text-slate-400", icon: Minus, label: s.sentiment, dot: "bg-slate-400" };

  const Icon = config.icon;
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold ${config.bg} ${config.border} ${config.text}`}>
      <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${config.dot}`} />
      <Icon size={12} />
      {config.label}
      <span className="opacity-60 ml-0.5">· {s.confidence}%</span>
    </div>
  );
}

// ─── News Card ────────────────────────────────────────────────────────────────
function NewsCard({ item, index }: { item: NewsItem; index: number }) {
  const sentConf = {
    Positive: { bg: "bg-emerald-500/10", border: "border-emerald-500/20", badge: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", dot: "bg-emerald-400" },
    Negative: { bg: "bg-rose-500/10",    border: "border-rose-500/20",    badge: "bg-rose-500/20 text-rose-400 border-rose-500/30",          dot: "bg-rose-400"    },
    Neutral:  { bg: "bg-amber-500/10",   border: "border-amber-500/20",   badge: "bg-amber-500/20 text-amber-400 border-amber-500/30",        dot: "bg-amber-400"   },
  }[item.sentiment];

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.1 }}
      className={`rounded-2xl p-4 border ${sentConf.bg} ${sentConf.border}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${sentConf.badge}`}>
          <div className={`inline-block w-1 h-1 rounded-full mr-1 ${sentConf.dot}`} />
          {item.sentiment}
        </span>
        {item.commodity && item.commodity !== "General" && (
          <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border" style={{ background: "var(--bg-input)", borderColor: "var(--border-input)", color: "var(--text-subtle)" }}>
            {item.commodity}
          </span>
        )}
      </div>
      <h4 className="text-sm font-bold leading-snug mb-1.5" style={{ color: "var(--text-main)" }}>
        {item.title}
      </h4>
      <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
        {item.impact}
      </p>
      {item.source && (
        <div className="flex items-center justify-between mt-2 pt-2 border-t" style={{ borderColor: "var(--border-card)" }}>
          <span className="text-[8px] font-bold uppercase tracking-widest" style={{ color: "var(--text-subtle)" }}>
            {item.source}
          </span>
          {item.link && (
            <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-[8px] font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-0.5 transition-colors">
              Read <ExternalLink size={8} />
            </a>
          )}
        </div>
      )}
    </motion.div>
  );
}

// ─── Price Card ───────────────────────────────────────────────────────────────
function PriceCard({ item, selected, onClick, sentiment }: {
  item: MandiPrice;
  selected: boolean;
  onClick: () => void;
  sentiment?: SentimentResult;
}) {
  const change = item.max_price - item.min_price;
  const changePercent = item.min_price > 0 ? ((change / item.min_price) * 100).toFixed(1) : "0";
  const formatName = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

  return (
    <motion.button
      layout
      onClick={onClick}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      className={`relative w-full text-left rounded-[1.5rem] p-5 border transition-all duration-300 overflow-hidden ${
        selected
          ? "border-emerald-500/40 bg-emerald-500/8"
          : "hover:border-emerald-500/20"
      }`}
      style={!selected ? { background: "var(--bg-card)", borderColor: "var(--border-card)" } : undefined}
    >
      {selected && (
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/6 to-transparent pointer-events-none" />
      )}

      <div className="relative z-10">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h3 className="font-black text-base tracking-tight" style={{ color: "var(--text-main)" }}>
              {formatName(item.commodity)}
            </h3>
            <p className="text-[10px] font-semibold uppercase tracking-wider mt-0.5" style={{ color: "var(--text-muted)" }}>
              {item.market_name || item.variety || item.district}
            </p>
          </div>
          {sentiment && <SentimentBadge s={sentiment} isHindi={false} />}
        </div>

        <div className="flex items-baseline gap-1 mb-3">
          <IndianRupee size={18} className="text-emerald-400 mb-0.5 shrink-0" />
          <span className="text-3xl font-extrabold text-emerald-400 tracking-tighter">
            {item.modal_price.toLocaleString("en-IN")}
          </span>
          <span className="text-xs font-bold ml-1" style={{ color: "var(--text-subtle)" }}>/qtl</span>
        </div>

        <div className="grid grid-cols-3 gap-2 pt-3 border-t" style={{ borderColor: "var(--border-card)" }}>
          {[
            { label: "Min", value: item.min_price, color: "text-blue-400" },
            { label: "Modal", value: item.modal_price, color: "text-emerald-400" },
            { label: "Max", value: item.max_price, color: "text-rose-400" },
          ].map((m) => (
            <div key={m.label} className="text-center">
              <p className="text-[8px] font-black uppercase tracking-widest mb-0.5" style={{ color: "var(--text-subtle)" }}>{m.label}</p>
              <p className={`text-xs font-black ${m.color}`}>{m.value.toLocaleString("en-IN")}</p>
            </div>
          ))}
        </div>

        <div className="mt-2 flex items-center gap-1">
          {parseFloat(changePercent) > 3 ? (
            <ArrowUpRight size={12} className="text-rose-400" />
          ) : parseFloat(changePercent) < -3 ? (
            <ArrowDownRight size={12} className="text-emerald-400" />
          ) : (
            <Minus size={12} style={{ color: "var(--text-subtle)" }} />
          )}
          <span className="text-[10px] font-bold" style={{ color: "var(--text-muted)" }}>
            ₹{change.toLocaleString("en-IN")} spread · {changePercent}%
          </span>
        </div>
      </div>
    </motion.button>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function SkeletonPriceCard() {
  return (
    <div className="rounded-[1.5rem] p-5 border" style={{ background: "var(--bg-card)", borderColor: "var(--border-card)" }}>
      <div className="w-24 h-4 skeleton rounded mb-2" />
      <div className="w-16 h-3 skeleton rounded mb-4" />
      <div className="w-32 h-8 skeleton rounded mb-4" />
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => <div key={i} className="h-8 skeleton rounded" />)}
      </div>
    </div>
  );
}

// ─── Dropdown ─────────────────────────────────────────────────────────────────
function Dropdown({ label, value, options, onChange, icon: Icon }: {
  label: string; value: string; options: string[];
  onChange: (v: string) => void; icon: React.ElementType;
}) {
  return (
    <div className="relative">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={11} style={{ color: "var(--text-subtle)" }} />
        <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: "var(--text-subtle)" }}>{label}</span>
      </div>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-xl px-3 py-2.5 pr-8 text-sm font-semibold border focus:outline-none focus:border-emerald-500/50 transition-colors"
          style={{
            background: "var(--bg-input)",
            borderColor: "var(--border-input)",
            color: "var(--text-main)",
          }}
        >
          {options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--text-subtle)" }} />
      </div>
    </div>
  );
}

// ─── BAR CHART COLORS ─────────────────────────────────────────────────────────
const BAR_COLORS = [
  "#22c55e", "#10b981", "#14b8a6", "#06b6d4",
  "#0ea5e9", "#3b82f6", "#6366f1", "#8b5cf6",
  "#a855f7", "#d946ef", "#ec4899", "#f43f5e",
  "#f97316", "#eab308", "#84cc16",
];

// ─── Main Component ───────────────────────────────────────────────────────────
export default function MarketDashboard() {
  const { isHindi, language } = useLanguage();

  // Filters
  const [selectedState, setSelectedState] = useState(() => {
    return localStorage.getItem("farmguide_state") || "Madhya Pradesh";
  });
  const [selectedDistrict, setSelectedDistrict] = useState(() => {
    return localStorage.getItem("farmguide_district") || "Ratlam";
  });
  const [selectedCommodity, setSelectedCommodity] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState<"commodity" | "market">("commodity");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<MandiPrice[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const prevLocation = useRef("");

  // Commodity Detail View
  const [detailCommodity, setDetailCommodity] = useState<MandiPrice | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>("30D");

  // Geolocation
  const [locating, setLocating] = useState(false);
  const [locationName, setLocationName] = useState("");

  // Data
  const [prices, setPrices]             = useState<MandiPrice[]>([]);
  const [priceHistory, setPriceHistory] = useState<PriceHistory[]>([]);
  const [news, setNews]                 = useState<NewsItem[]>([]);
  const [sentiment, setSentiment]       = useState<SentimentResult | null>(null);
  const [marketComparison, setMarketComparison] = useState<MarketCompare[]>([]);

  // Loading states
  const [loadingPrices,    setLoadingPrices]    = useState(true);
  const [loadingHistory,   setLoadingHistory]   = useState(false);
  const [loadingNews,      setLoadingNews]       = useState(true);
  const [loadingSentiment, setLoadingSentiment] = useState(false);
  const [loadingComparison, setLoadingComparison] = useState(false);
  const [lastFetched, setLastFetched]           = useState<Date | null>(null);

  // Error state
  const [priceError, setPriceError] = useState("");

  const districts = INDIA_STATES_DISTRICTS[selectedState] ?? [];
  const states    = Object.keys(INDIA_STATES_DISTRICTS);

  const formatCommodityName = (s: string) => {
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  };

  // ── Geolocation: detect nearby mandis ─────────────────────────────────────
  const detectLocation = useCallback(async () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
      );
      const result = await fetchNearbyPrices(pos.coords.latitude, pos.coords.longitude);
      setSelectedState(result.state);
      setSelectedDistrict(result.district);
      setLocationName(`${result.district}, ${result.state}`);
      if (result.prices.length > 0) {
        setPrices(result.prices);
        setLastFetched(new Date());
        if (result.prices.length > 0 && !selectedCommodity) {
          setSelectedCommodity(result.prices[0].commodity);
        }
      }
    } catch (e) {
      console.warn("Location detection failed:", e);
    } finally {
      setLocating(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Search ────────────────────────────────────────────────────────────────
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setShowSearchResults(true);
    try {
      const results = await searchMandiPrices(searchQuery.trim(), searchType);
      setSearchResults(results);
    } catch (e) {
      console.error("Search failed:", e);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, searchType]);

  const clearSearch = () => {
    setSearchQuery("");
    setSearchResults([]);
    setShowSearchResults(false);
  };

  // ── Load prices ─────────────────────────────────────────────────────────────
  const loadPrices = useCallback(async (forceRefresh = false) => {
    const locationKey = `${selectedState}_${selectedDistrict}`;
    if (!forceRefresh && prevLocation.current === locationKey && prices.length > 0) return;
    prevLocation.current = locationKey;

    setLoadingPrices(true);
    setSentiment(null);
    setPriceError("");
    try {
      if (forceRefresh) {
        localStorage.removeItem(`agroaid_cache_mandi_v2_${selectedState}_${selectedDistrict}`.replace(/\s+/g, "_").toLowerCase());
      }
      const data = await fetchLatestPrices(selectedState, selectedDistrict, language);
      setPrices(data);
      setLastFetched(new Date());
      if (data.length > 0 && !selectedCommodity) setSelectedCommodity(data[0].commodity);
      if (data.length === 0) {
        setPriceError(isHindi
          ? "इस जिले के लिए कोई डेटा नहीं मिला। कृपया दूसरा जिला आज़माएं।"
          : "No data found for this district. The data.gov.in API may be slow — try another district.");
      }
    } catch (e) {
      setPriceError(isHindi
        ? "सर्वर से डेटा लोड करने में समस्या हुई। कृपया बाद में पुनः प्रयास करें।"
        : "Failed to load data from server. Please try again later.");
    } finally {
      setLoadingPrices(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedState, selectedDistrict, language, isHindi]);

  // ── Load news ─────────────────────────────────────────────────────────────
  const loadNews = useCallback(async () => {
    setLoadingNews(true);
    try {
      const data = await fetchMarketNews(language);
      setNews(data);
    } finally {
      setLoadingNews(false);
    }
  }, [language]);

  useEffect(() => { loadPrices(); }, [loadPrices]);
  useEffect(() => { loadNews(); },   [loadNews]);

  // ── Persist to localStorage & Auto-detect location ────────────────────────
  useEffect(() => {
    const hasVisited = localStorage.getItem("farmguide_state");
    if (!hasVisited) {
      detectLocation();
    }
    localStorage.setItem("farmguide_state", selectedState);
    localStorage.setItem("farmguide_district", selectedDistrict);
  }, [selectedState, selectedDistrict, detectLocation]);

  // ── Open Commodity Detail View ────────────────────────────────────────────
  const openCommodityDetail = useCallback((item: MandiPrice) => {
    setDetailCommodity(item);
    setSelectedCommodity(item.commodity);
    setTimeRange("30D");
    setSentiment(null);
  }, []);

  const closeCommodityDetail = useCallback(() => {
    setDetailCommodity(null);
    setSentiment(null);
    setPriceHistory([]);
    setMarketComparison([]);
  }, []);

  // ── Load price history + market comparison when detail view opens / range changes
  useEffect(() => {
    if (!detailCommodity) return;
    const commodity = detailCommodity.commodity;

    // Load price history
    (async () => {
      setLoadingHistory(true);
      setPriceHistory([]);
      try {
        const hist = await fetchPriceHistory(commodity, selectedState, selectedDistrict, timeRange);
        setPriceHistory(hist);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingHistory(false);
      }
    })();

    // Load market comparison (same commodity across mandis)
    (async () => {
      setLoadingComparison(true);
      setMarketComparison([]);
      try {
        const data = await fetchMarketComparison(commodity, selectedState);
        setMarketComparison(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingComparison(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailCommodity, timeRange, selectedState, selectedDistrict]);

  // ── Manual sentiment trigger ──────────────────────────────────────────────
  const runSentimentAnalysis = async () => {
    if (!selectedCommodity || loadingSentiment) return;
    setLoadingSentiment(true);
    setSentiment(null);
    try {
      const s = await fetchMarketSentiment(selectedCommodity, priceHistory, news, language);
      setSentiment(s);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSentiment(false);
    }
  };

  // ── Chart data ────────────────────────────────────────────────────────────
  const chartData = priceHistory.map((p) => ({
    date: new Date(p.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
    fullDate: p.date,
    Modal: p.modal_price,
    Min: p.min_price,
    Max: p.max_price,
  }));

  const avgModal = priceHistory.length > 0
    ? Math.round(priceHistory.reduce((s, p) => s + p.modal_price, 0) / priceHistory.length)
    : 0;

  const priceChangeRange = priceHistory.length >= 2
    ? priceHistory[priceHistory.length - 1].modal_price - priceHistory[0].modal_price
    : 0;
  const priceChangePct = priceHistory.length >= 2 && priceHistory[0].modal_price > 0
    ? ((priceChangeRange / priceHistory[0].modal_price) * 100).toFixed(1)
    : "0";

  // Display prices — show search results or regular prices
  const displayPrices = showSearchResults ? searchResults : prices;
  const displayTitle = showSearchResults
    ? (isHindi ? `"${searchQuery}" के परिणाम` : `Results for "${searchQuery}"`)
    : (isHindi ? "आज के मंडी भाव" : "Today's Mandi Rates");

  const barChartData = marketComparison.map((c) => ({
    ...c,
    shortName: (c.market_name || "").slice(0, 12),
  }));

  // ── Filtered news for selected commodity ──────────────────────────────────
  const detailNews = detailCommodity
    ? news.filter(
        (n) =>
          !n.commodity ||
          n.commodity === "General" ||
          n.commodity.toLowerCase() === detailCommodity.commodity.toLowerCase()
      )
    : [];

  return (
    <div className="max-w-[1400px] mx-auto pb-20 space-y-5">

      {/* ── HERO HEADER ──────────────────────────────────────────────────────── */}
      <header className="rounded-[2rem] p-7 md:p-10 relative overflow-hidden bg-gradient-to-br from-[#061a0e] via-[#082012] to-[#0a2a16] border border-emerald-500/18">
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/8 rounded-full -mr-40 -mt-40 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-56 h-56 bg-amber-500/6 rounded-full -ml-28 -mb-28 blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="p-4 bg-emerald-500/12 rounded-2xl border border-emerald-500/20 backdrop-blur-md shadow-lg shadow-emerald-500/10">
              <BarChart2 size={36} className="text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_4px_rgba(34,197,94,0.8)]" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400/70">
                  {isHindi ? "लाइव सरकारी डेटा" : "Live Government Data · Agmarknet"}
                </span>
              </div>
              <h1 className="text-3xl md:text-4xl font-serif font-extrabold text-white tracking-tight">
                {isHindi ? "मंडी बाज़ार भाव" : "Mandi Market Prices"}
              </h1>
              <p className="text-sm text-emerald-100/50 mt-1 font-medium">
                {isHindi
                  ? "सरकारी मंडी भाव · फसल तुलना · ऐतिहासिक रुझान"
                  : "Real-time wholesale prices · Crop comparison · Price trends"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {locationName && (
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl border bg-emerald-500/10 border-emerald-500/20">
                <Navigation size={12} className="text-emerald-400" />
                <span className="text-xs font-bold text-emerald-400">{locationName}</span>
              </div>
            )}
            {lastFetched && (
              <span className="text-[10px] font-semibold text-emerald-400/60 hidden md:block">
                {isHindi ? "अपडेट:" : "Updated:"} {lastFetched.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <button
              onClick={() => loadPrices(true)}
              disabled={loadingPrices}
              className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg shadow-emerald-500/25 active:scale-95"
            >
              <RefreshCw size={14} className={loadingPrices ? "animate-spin" : ""} />
              {isHindi ? "ताज़ा करें" : "Refresh"}
            </button>
          </div>
        </div>
      </header>

      {/* ── FILTER & SEARCH BAR ───────────────────────────────────────────── */}
      <div
        className="rounded-2xl p-4 border space-y-3"
        style={{ background: "var(--bg-card)", borderColor: "var(--border-card)" }}
      >
        {/* Location row */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3">
          <Dropdown
            label={isHindi ? "राज्य" : "State"}
            value={selectedState}
            options={states}
            icon={MapPin}
            onChange={(v) => {
              setSelectedState(v);
              const firstDist = INDIA_STATES_DISTRICTS[v]?.[0] ?? "";
              setSelectedDistrict(firstDist);
              setLocationName("");
              closeCommodityDetail();
            }}
          />
          <Dropdown
            label={isHindi ? "जिला" : "District"}
            value={selectedDistrict}
            options={districts}
            icon={MapPin}
            onChange={(v) => { setSelectedDistrict(v); setLocationName(""); closeCommodityDetail(); }}
          />
          <div className="flex items-end">
            <button
              onClick={detectLocation}
              disabled={locating}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border font-bold text-sm transition-all hover:border-emerald-500/40 active:scale-95 disabled:opacity-50"
              style={{ background: "var(--bg-input)", borderColor: "var(--border-input)", color: "var(--text-main)" }}
            >
              {locating ? (
                <Loader2 size={14} className="animate-spin text-emerald-400" />
              ) : (
                <Navigation size={14} className="text-emerald-400" />
              )}
              {isHindi ? "मेरा स्थान" : "My Location"}
            </button>
          </div>
        </div>

        {/* Search row */}
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center gap-1.5 mb-1">
              <Search size={11} style={{ color: "var(--text-subtle)" }} />
              <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: "var(--text-subtle)" }}>
                {isHindi ? "खोजें" : "Search"}
              </span>
            </div>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder={isHindi ? "फसल या मंडी का नाम…" : "Search commodity or market name…"}
                className="w-full rounded-xl px-3 py-2.5 pr-10 text-sm font-semibold border focus:outline-none focus:border-emerald-500/50 transition-colors"
                style={{ background: "var(--bg-input)", borderColor: "var(--border-input)", color: "var(--text-main)" }}
              />
              {searchQuery && (
                <button onClick={clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <X size={14} style={{ color: "var(--text-subtle)" }} />
                </button>
              )}
            </div>
          </div>

          {/* Search type toggle */}
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <Filter size={11} style={{ color: "var(--text-subtle)" }} />
              <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: "var(--text-subtle)" }}>
                {isHindi ? "प्रकार" : "Type"}
              </span>
            </div>
            <div className="flex rounded-xl border overflow-hidden" style={{ borderColor: "var(--border-input)" }}>
              {([
                { key: "commodity" as const, label: isHindi ? "फसल" : "Crop", icon: Store },
                { key: "market" as const, label: isHindi ? "मंडी" : "Mandi", icon: MapPin },
              ]).map((t) => (
                <button
                  key={t.key}
                  onClick={() => setSearchType(t.key)}
                  className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold transition-all ${
                    searchType === t.key
                      ? "bg-emerald-500/20 text-emerald-400"
                      : ""
                  }`}
                  style={searchType !== t.key ? { background: "var(--bg-input)", color: "var(--text-muted)" } : undefined}
                >
                  <t.icon size={12} />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleSearch}
            disabled={!searchQuery.trim() || isSearching}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-emerald-500/25 active:scale-95"
          >
            {isSearching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {isHindi ? "खोजें" : "Search"}
          </button>
        </div>

        {/* Quick commodity pills */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
          {COMMON_COMMODITIES.slice(0, 8).map((c) => (
            <button
              key={c}
              onClick={() => { setSearchQuery(c); setSearchType("commodity"); }}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all hover:border-emerald-500/30 hover:text-emerald-400`}
              style={{ background: "var(--bg-input)", borderColor: "var(--border-input)", color: "var(--text-muted)" }}
            >
              {isHindi ? (COMMON_COMMODITIES_HI[c] ?? c) : c}
            </button>
          ))}
        </div>
      </div>

      {/* ── SEARCH RESULTS BANNER ─────────────────────────────────────────── */}
      {showSearchResults && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between px-4 py-3 rounded-xl border bg-emerald-500/8 border-emerald-500/20"
        >
          <div className="flex items-center gap-2">
            <Search size={14} className="text-emerald-400" />
            <span className="text-sm font-bold" style={{ color: "var(--text-main)" }}>
              {isSearching
                ? (isHindi ? "खोज रहे हैं…" : "Searching…")
                : (isHindi ? `${searchResults.length} परिणाम मिले` : `${searchResults.length} results found`)}
            </span>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              "{searchQuery}" · {searchType === "commodity" ? (isHindi ? "फसल" : "Crop") : (isHindi ? "मंडी" : "Market")}
            </span>
          </div>
          <button onClick={clearSearch} className="flex items-center gap-1 text-xs font-bold text-emerald-400 hover:text-emerald-300 transition-colors">
            <X size={12} />
            {isHindi ? "बंद करें" : "Clear"}
          </button>
        </motion.div>
      )}

      {/* ── MAIN LAYOUT ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-5">

        {/* LEFT: Prices + Detail View */}
        <div className="space-y-5">

          {/* ── COMMODITY DETAIL VIEW ───────────────────────────────────────── */}
          <AnimatePresence mode="wait">
            {detailCommodity && (
              <motion.div
                key="detail"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                className="space-y-5"
              >
                {/* Detail Header */}
                <div className="rounded-2xl p-6 border" style={{ background: "var(--bg-card)", borderColor: "var(--border-card)" }}>
                  <div className="flex items-center justify-between mb-4">
                    <button
                      onClick={closeCommodityDetail}
                      className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 hover:text-emerald-300 transition-colors"
                    >
                      <ChevronLeft size={14} />
                      {isHindi ? "सभी फसलें" : "All Commodities"}
                    </button>
                    {sentiment && <SentimentBadge s={sentiment} isHindi={isHindi} />}
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-2xl font-black tracking-tight" style={{ color: "var(--text-main)" }}>
                        {isHindi ? (COMMON_COMMODITIES_HI[detailCommodity.commodity] ?? formatCommodityName(detailCommodity.commodity)) : formatCommodityName(detailCommodity.commodity)}
                      </h2>
                      <p className="text-xs font-medium mt-1" style={{ color: "var(--text-muted)" }}>
                        {detailCommodity.market_name} · {detailCommodity.district}, {detailCommodity.state}
                      </p>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <IndianRupee size={22} className="text-emerald-400" />
                      <span className="text-4xl font-extrabold text-emerald-400 tracking-tighter">
                        {detailCommodity.modal_price.toLocaleString("en-IN")}
                      </span>
                      <span className="text-sm font-bold ml-1" style={{ color: "var(--text-subtle)" }}>/qtl</span>
                    </div>
                  </div>

                  {/* Stat pills */}
                  <div className="flex gap-2 flex-wrap mt-4">
                    {[
                      { label: "Min", value: `₹${detailCommodity.min_price.toLocaleString("en-IN")}`, color: "text-blue-400" },
                      { label: "Modal", value: `₹${detailCommodity.modal_price.toLocaleString("en-IN")}`, color: "text-emerald-400" },
                      { label: "Max", value: `₹${detailCommodity.max_price.toLocaleString("en-IN")}`, color: "text-rose-400" },
                      ...(avgModal > 0 ? [{ label: isHindi ? "औसत" : "Avg", value: `₹${avgModal.toLocaleString("en-IN")}`, color: "text-amber-400" }] : []),
                      ...(priceHistory.length >= 2 ? [{
                        label: isHindi ? "बदलाव" : "Change",
                        value: `${priceChangeRange >= 0 ? "+" : ""}₹${priceChangeRange.toLocaleString("en-IN")} (${priceChangePct}%)`,
                        color: priceChangeRange >= 0 ? "text-rose-400" : "text-emerald-400"
                      }] : []),
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className="px-3 py-1.5 rounded-xl border text-center"
                        style={{ background: "var(--bg-input)", borderColor: "var(--border-input)" }}
                      >
                        <p className="text-[8px] font-black uppercase tracking-widest mb-0.5" style={{ color: "var(--text-subtle)" }}>{stat.label}</p>
                        <p className={`text-xs font-black ${stat.color}`}>{stat.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Time-Range Price Chart */}
                <div className="rounded-2xl p-6 border" style={{ background: "var(--bg-card)", borderColor: "var(--border-card)" }}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                    <div className="flex items-center gap-2">
                      <Clock size={14} className="text-emerald-400" />
                      <span className="text-xs font-black uppercase tracking-widest" style={{ color: "var(--text-subtle)" }}>
                        {isHindi ? "मूल्य इतिहास" : "Price History"}
                      </span>
                    </div>
                    {/* Time range selector */}
                    <div className="flex rounded-xl border overflow-hidden" style={{ borderColor: "var(--border-input)" }}>
                      {TIME_RANGES.map((r) => (
                        <button
                          key={r.key}
                          onClick={() => setTimeRange(r.key)}
                          className={`px-3 py-1.5 text-[11px] font-bold transition-all ${
                            timeRange === r.key
                              ? "bg-emerald-500/20 text-emerald-400"
                              : ""
                          }`}
                          style={timeRange !== r.key ? { background: "var(--bg-input)", color: "var(--text-muted)" } : undefined}
                        >
                          {isHindi ? r.labelHi : r.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {loadingHistory ? (
                    <div className="h-64 flex items-center justify-center">
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="animate-spin text-emerald-400" size={24} />
                        <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                          {isHindi ? "इतिहास लोड हो रहा है…" : "Loading price history…"}
                        </p>
                      </div>
                    </div>
                  ) : chartData.length === 0 ? (
                    <div className="h-64 flex items-center justify-center">
                      <div className="text-center">
                        <AlertCircle size={24} className="mx-auto mb-2" style={{ color: "var(--text-subtle)" }} />
                        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                          {isHindi ? "इस अवधि के लिए कोई डेटा नहीं मिला।" : "No data available for this period."}
                        </p>
                        <p className="text-xs mt-1" style={{ color: "var(--text-subtle)" }}>
                          {isHindi ? "दूसरी अवधि आज़माएं।" : "Try a different time range."}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={260}>
                      <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                        <defs>
                          <linearGradient id="modalGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="minGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.15} />
                            <stop offset="100%" stopColor="#60a5fa" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="maxGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f87171" stopOpacity={0.15} />
                            <stop offset="100%" stopColor="#f87171" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(34,197,94,0.06)" vertical={false} />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 9, fill: "var(--text-subtle)", fontWeight: 600 }}
                          tickLine={false}
                          axisLine={false}
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          tick={{ fontSize: 9, fill: "var(--text-subtle)", fontWeight: 600 }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v) => `₹${(v / 1000).toFixed(1)}k`}
                          width={48}
                        />
                        <Tooltip content={<PriceTooltip />} />
                        {avgModal > 0 && (
                          <ReferenceLine
                            y={avgModal}
                            stroke="#f59e0b"
                            strokeDasharray="4 4"
                            strokeOpacity={0.5}
                            label={{ value: "Avg", fontSize: 9, fill: "#f59e0b", position: "right" }}
                          />
                        )}
                        <Area type="monotone" dataKey="Max"   stroke="#f87171" strokeWidth={1.5} fill="url(#maxGrad)"   dot={false} strokeOpacity={0.7} />
                        <Area type="monotone" dataKey="Modal" stroke="#22c55e" strokeWidth={2.5} fill="url(#modalGrad)" dot={false} />
                        <Area type="monotone" dataKey="Min"   stroke="#60a5fa" strokeWidth={1.5} fill="url(#minGrad)"   dot={false} strokeOpacity={0.7} />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}

                  {/* Legend */}
                  <div className="flex items-center gap-4 mt-3 justify-center">
                    {[
                      { color: "#22c55e", label: isHindi ? "औसत भाव" : "Modal Price" },
                      { color: "#f87171", label: isHindi ? "अधिकतम" : "Max Price" },
                      { color: "#60a5fa", label: isHindi ? "न्यूनतम" : "Min Price" },
                      { color: "#f59e0b", label: isHindi ? "औसत" : "Avg", dashed: true },
                    ].map((l) => (
                      <div key={l.label} className="flex items-center gap-1.5">
                        <div
                          className="h-[2px] w-5 rounded"
                          style={{
                            background: l.color,
                            opacity: l.dashed ? 0.7 : 1,
                            backgroundImage: l.dashed ? `repeating-linear-gradient(90deg, ${l.color} 0, ${l.color} 4px, transparent 4px, transparent 8px)` : undefined,
                          }}
                        />
                        <span className="text-[9px] font-bold" style={{ color: "var(--text-subtle)" }}>{l.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Market Comparison Bar Chart — Same Commodity, Different Mandis */}
                <div className="rounded-2xl p-6 border" style={{ background: "var(--bg-card)", borderColor: "var(--border-card)" }}>
                  <div className="flex items-center gap-3 mb-5">
                    <div className="p-2 rounded-xl bg-teal-500/12 border border-teal-500/20">
                      <BarChart2 size={16} className="text-teal-400" />
                    </div>
                    <div>
                      <h3 className="font-black text-sm" style={{ color: "var(--text-main)" }}>
                        {isHindi ? "मंडी तुलना" : "Market Comparison"}
                      </h3>
                      <p className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>
                        {isHindi
                          ? `${formatCommodityName(detailCommodity.commodity)} · ${selectedState} · अलग-अलग मंडियाँ`
                          : `${formatCommodityName(detailCommodity.commodity)} · ${selectedState} · Across Markets`}
                      </p>
                    </div>
                  </div>

                  {loadingComparison ? (
                    <div className="h-64 flex items-center justify-center">
                      <Loader2 className="animate-spin text-teal-400" size={24} />
                    </div>
                  ) : barChartData.length === 0 ? (
                    <div className="h-48 flex items-center justify-center">
                      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                        {isHindi ? "तुलना डेटा उपलब्ध नहीं है।" : "No comparison data available."}
                      </p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={Math.max(260, barChartData.length * 38)}>
                      <BarChart data={barChartData} layout="vertical" margin={{ top: 0, right: 40, left: 10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(34,197,94,0.06)" horizontal={false} />
                        <XAxis
                          type="number"
                          tick={{ fontSize: 9, fill: "var(--text-subtle)", fontWeight: 600 }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v) => `₹${(v / 1000).toFixed(1)}k`}
                        />
                        <YAxis
                          type="category"
                          dataKey="shortName"
                          tick={{ fontSize: 10, fill: "var(--text-main)", fontWeight: 700 }}
                          tickLine={false}
                          axisLine={false}
                          width={100}
                        />
                        <Tooltip content={<MarketBarTooltip />} cursor={{ fill: "rgba(34,197,94,0.04)" }} />
                        <Bar dataKey="modal_price" radius={[0, 8, 8, 0]} barSize={22}>
                          {barChartData.map((_, idx) => (
                            <Cell key={idx} fill={BAR_COLORS[idx % BAR_COLORS.length]} fillOpacity={0.85} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* AI Sentiment Panel */}
                <div
                  className="rounded-2xl p-6 border"
                  style={{ background: "var(--bg-card)", borderColor: "var(--border-card)" }}
                >
                  <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-violet-500/15 border border-violet-500/20">
                        <Brain size={18} className="text-violet-400" />
                      </div>
                      <div>
                        <h3 className="font-black text-sm" style={{ color: "var(--text-main)" }}>
                          {isHindi ? "AI बाज़ार भावना" : "AI Market Sentiment"}
                        </h3>
                        <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                          {isHindi ? "AI द्वारा संचालित विश्लेषण" : "AI-powered market analysis"}
                        </p>
                      </div>
                      {sentiment && !loadingSentiment && <SentimentBadge s={sentiment} isHindi={isHindi} />}
                    </div>

                    {!sentiment && !loadingSentiment && (
                      <button
                        onClick={runSentimentAnalysis}
                        disabled={loadingHistory}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm border border-violet-500/30 bg-violet-500/15 text-violet-400 hover:bg-violet-500/25 disabled:opacity-50 transition-all active:scale-95"
                      >
                        <Brain size={14} />
                        {isHindi ? "विश्लेषण करें" : "Analyse"}
                      </button>
                    )}
                  </div>

                  {loadingSentiment ? (
                    <div className="flex items-center gap-3 py-4">
                      <Loader2 className="animate-spin text-violet-400 shrink-0" size={18} />
                      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                        {isHindi ? "बाज़ार का विश्लेषण हो रहा है…" : "Analyzing market patterns…"}
                      </p>
                    </div>
                  ) : sentiment ? (
                    <div className="space-y-4">
                      {/* Confidence bar */}
                      <div>
                        <div className="flex justify-between text-[9px] font-black uppercase tracking-widest mb-1.5" style={{ color: "var(--text-subtle)" }}>
                          <span>{isHindi ? "विश्वास स्तर" : "Confidence"}</span>
                          <span>{sentiment.confidence}%</span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-input)" }}>
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${sentiment.confidence}%` }}
                            transition={{ duration: 0.8, ease: "easeOut" }}
                            className={`h-full rounded-full ${
                              sentiment.sentiment === "Bullish" ? "bg-emerald-500" :
                              sentiment.sentiment === "Bearish" ? "bg-rose-500" : "bg-amber-500"
                            }`}
                          />
                        </div>
                      </div>

                      {/* Why */}
                      <div className="rounded-xl p-4 border" style={{ background: "var(--bg-input)", borderColor: "var(--border-input)" }}>
                        <p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: "var(--text-subtle)" }}>
                          {isHindi ? "विश्लेषण" : "Analysis"}
                        </p>
                        <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>{sentiment.why}</p>
                      </div>

                      {/* Action */}
                      <div className="rounded-xl p-4 border border-emerald-500/20 bg-emerald-500/8">
                        <p className="text-[9px] font-black uppercase tracking-widest mb-1.5 text-emerald-500/70">
                          {isHindi ? "सुझाई गई कार्रवाई" : "Recommended Action"}
                        </p>
                        <p className="text-sm font-semibold text-emerald-400">{sentiment.action}</p>
                      </div>

                      {/* Re-analyse */}
                      <button
                        onClick={runSentimentAnalysis}
                        disabled={loadingSentiment}
                        className="flex items-center gap-1.5 text-[10px] font-bold text-violet-400/60 hover:text-violet-400 transition-colors disabled:opacity-40"
                      >
                        <RefreshCw size={10} />
                        {isHindi ? "दोबारा विश्लेषण करें" : "Re-analyse"}
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center py-6 gap-3 text-center">
                      <div className="w-12 h-12 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                        <Brain size={20} className="text-violet-400/50" />
                      </div>
                      <p className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>
                        {isHindi
                          ? "\"विश्लेषण करें\" पर क्लिक करके AI भावना रिपोर्ट देखें"
                          : "Click \"Analyse\" to get AI-powered sentiment report"}
                      </p>
                    </div>
                  )}
                </div>

                {/* Related News for this commodity */}
                {detailNews.length > 0 && (
                  <div className="rounded-2xl p-5 border" style={{ background: "var(--bg-card)", borderColor: "var(--border-card)" }}>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 rounded-xl bg-amber-500/12 border border-amber-500/20">
                        <Newspaper size={16} className="text-amber-400" />
                      </div>
                      <h3 className="font-black text-sm" style={{ color: "var(--text-main)" }}>
                        {isHindi ? "संबंधित समाचार" : "Related News"}
                      </h3>
                    </div>
                    <div className="space-y-3">
                      {detailNews.slice(0, 3).map((item, i) => <NewsCard key={i} item={item} index={i} />)}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Price Cards Grid (hidden when detail view is open) ──────────── */}
          {!detailCommodity && (
            <div>
              <h2 className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: "var(--text-subtle)" }}>
                {displayTitle} {!showSearchResults && `· ${selectedDistrict}, ${selectedState}`}
              </h2>
              {loadingPrices && !showSearchResults ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {Array.from({ length: 6 }).map((_, i) => <SkeletonPriceCard key={i} />)}
                </div>
              ) : displayPrices.length === 0 ? (
                <div className="rounded-2xl p-12 text-center border" style={{ background: "var(--bg-card)", borderColor: "var(--border-card)" }}>
                  <AlertCircle size={32} className="mx-auto mb-3" style={{ color: "var(--text-muted)" }} />
                  <p className="font-semibold" style={{ color: "var(--text-muted)" }}>
                    {priceError || (isHindi ? "कोई डेटा नहीं मिला।" : "No market data found.")}
                  </p>
                  <p className="text-sm mt-1" style={{ color: "var(--text-subtle)" }}>
                    {showSearchResults
                      ? (isHindi ? "दूसरा नाम आज़माएं।" : "Try a different search term.")
                      : (isHindi ? "दूसरा जिला आज़माएं।" : "Try another district.")}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <AnimatePresence>
                    {displayPrices.slice(0, 12).map((item, idx) => (
                      <motion.div
                        key={item.commodity + item.market_name + idx}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.04 }}
                      >
                        <PriceCard
                          item={item}
                          selected={selectedCommodity === item.commodity}
                          onClick={() => openCommodityDetail(item)}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT: News Sidebar ─────────────────────────────────────────────── */}
        <div className="space-y-4">
          <div
            className="rounded-2xl p-5 border sticky top-4"
            style={{ background: "var(--bg-card)", borderColor: "var(--border-card)" }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-xl bg-amber-500/12 border border-amber-500/20">
                <Newspaper size={16} className="text-amber-400" />
              </div>
              <div>
                <h3 className="font-black text-sm" style={{ color: "var(--text-main)" }}>
                  {isHindi ? "कृषि समाचार" : "Agri News Feed"}
                </h3>
                <p className="text-[9px] font-semibold uppercase tracking-widest mt-0.5" style={{ color: "var(--text-subtle)" }}>
                  {isHindi ? "बाज़ार प्रभाव समाचार" : "Market impact news"}
                </p>
              </div>
            </div>

            {loadingNews ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="rounded-2xl p-4 border" style={{ background: "var(--bg-input)", borderColor: "var(--border-input)" }}>
                    <div className="w-16 h-3 skeleton rounded mb-2" />
                    <div className="w-full h-3 skeleton rounded mb-1.5" />
                    <div className="w-4/5 h-3 skeleton rounded mb-1.5" />
                    <div className="w-3/5 h-3 skeleton rounded" />
                  </div>
                ))}
              </div>
            ) : news.length === 0 ? (
              <div className="text-center py-8">
                <Newspaper size={24} className="mx-auto mb-2" style={{ color: "var(--text-subtle)" }} />
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {isHindi ? "समाचार लोड नहीं हुए।" : "Could not load news."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {news.map((item, i) => <NewsCard key={i} item={item} index={i} />)}
              </div>
            )}

            {/* Legend */}
            <div className="mt-4 pt-4 border-t grid grid-cols-3 gap-2" style={{ borderColor: "var(--border-card)" }}>
              {[
                { color: "bg-emerald-400", label: isHindi ? "सकारात्मक" : "Positive" },
                { color: "bg-rose-400",    label: isHindi ? "नकारात्मक" : "Negative" },
                { color: "bg-amber-400",   label: isHindi ? "तटस्थ" : "Neutral" },
              ].map((l) => (
                <div key={l.label} className="flex items-center gap-1">
                  <div className={`w-1.5 h-1.5 rounded-full ${l.color}`} />
                  <span className="text-[8px] font-semibold" style={{ color: "var(--text-subtle)" }}>{l.label}</span>
                </div>
              ))}
            </div>

            {/* Data source */}
            <p className="text-[8px] mt-4 leading-relaxed" style={{ color: "var(--text-subtle)" }}>
              {isHindi
                ? "* मंडी भाव: data.gov.in (Agmarknet)। समाचार: Krishi Jagran, ET Agriculture। AI विश्लेषण सलाहकार उद्देश्य के लिए है।"
                : "* Mandi prices sourced from data.gov.in (Agmarknet). News: Krishi Jagran, ET Agriculture. AI analysis is advisory."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
