import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus, Activity, MapPin, IndianRupee, RefreshCw } from 'lucide-react';
import { getMarketPrices, MarketPrice } from '../services/gemini';
import { motion } from 'motion/react';

const marketCache: Record<string, { data: MarketPrice[]; timestamp: number }> = {};
const CACHE_DURATION_MS = 1000 * 60 * 60;

function SkeletonCard() {
  return (
    <div className="glass-panel rounded-[1.75rem] p-6">
      <div className="flex justify-between items-start mb-5">
        <div>
          <div className="w-24 h-5 skeleton rounded mb-2" />
          <div className="w-16 h-3 skeleton rounded" />
        </div>
        <div className="w-10 h-10 skeleton rounded-xl" />
      </div>
      <div className="w-36 h-10 skeleton rounded mb-5" />
      <div className="border-t border-emerald-500/8 pt-4 grid grid-cols-2 gap-4">
        <div className="w-16 h-8 skeleton rounded" />
        <div className="w-16 h-8 skeleton rounded" />
      </div>
    </div>
  );
}

export default function MarketDashboard() {
  const [prices, setPrices]     = useState<MarketPrice[]>([]);
  const [loading, setLoading]   = useState(true);
  const [location, setLocation] = useState('Maharashtra, India');
  const [searchLoc, setSearchLoc] = useState('Maharashtra, India');

  useEffect(() => { fetchPrices(location); }, [location]);

  const fetchPrices = async (loc: string) => {
    setLoading(true);
    const key = loc.toLowerCase().trim();
    if (marketCache[key] && Date.now() - marketCache[key].timestamp < CACHE_DURATION_MS) {
      setPrices(marketCache[key].data);
      setLoading(false);
      return;
    }
    const data = await getMarketPrices(loc);
    if (data?.length) marketCache[key] = { data, timestamp: Date.now() };
    setPrices(data);
    setLoading(false);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchLoc.trim()) setLocation(searchLoc);
  };

  const trendIcon = (trend: string) => {
    if (trend === 'up')   return <TrendingUp  size={18} className="text-rose-400"    />;
    if (trend === 'down') return <TrendingDown size={18} className="text-emerald-400" />;
    return <Minus size={18} className="text-slate-400" />;
  };

  const trendBg = (trend: string) =>
    trend === 'up'   ? 'bg-rose-500/12 border-rose-500/20 text-rose-400'    :
    trend === 'down' ? 'bg-emerald-500/12 border-emerald-500/20 text-emerald-400' :
                       'bg-[var(--bg-card)] border-[var(--border-color)] text-slate-400';

  const demandBadge = (demand: string) =>
    demand === 'high' ? 'bg-rose-500/15 text-rose-300 border border-rose-500/20'     :
    demand === 'low'  ? 'bg-blue-500/15 text-blue-300 border border-blue-500/20'     :
                        'bg-amber-500/15 text-amber-300 border border-amber-500/20';

  return (
    <div className="max-w-7xl mx-auto pb-20">

      {/* Hero header */}
      <header className="mb-8 p-7 md:p-10 rounded-[2rem] relative overflow-hidden bg-gradient-to-br from-[#061a0e] via-[#082012] to-[#0a2a16] border border-emerald-500/18">
        {/* decorative blobs */}
        <div className="absolute top-0 right-0 w-72 h-72 bg-emerald-500/8 rounded-full -mr-36 -mt-36 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-amber-500/5 rounded-full -ml-24 -mb-24 blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="p-4 bg-emerald-500/12 rounded-2xl border border-emerald-500/20 backdrop-blur-md">
              <Activity size={36} className="text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_4px_rgba(34,197,94,0.8)]" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400/70">Live Mandi Prices</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-serif font-extrabold text-bento-text-main tracking-tight">Market &amp; Economics</h1>
              <p className="text-sm text-emerald-100/50 mt-1 font-medium">Real-time wholesale data · Plan your harvest</p>
            </div>
          </div>

          <form onSubmit={handleSearch} className="flex items-center bg-[var(--bg-input)] backdrop-blur-md p-2 rounded-2xl border border-[var(--border-input)] gap-2">
            <MapPin className="text-emerald-400 ml-2 shrink-0" size={18} />
            <input
              type="text"
              value={searchLoc}
              onChange={e => setSearchLoc(e.target.value)}
              className="bg-transparent border-none outline-none text-bento-text-main placeholder-emerald-100/30 font-semibold w-44 md:w-56 text-sm"
              placeholder="District / State…"
            />
            <button
              type="submit"
              className="bg-emerald-500 hover:bg-emerald-400 text-white px-5 py-2 rounded-xl font-bold text-sm transition-colors shadow-lg shadow-emerald-500/20 flex items-center gap-1.5"
            >
              <RefreshCw size={14} /> Check
            </button>
          </form>
        </div>
      </header>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : prices.length === 0 ? (
        <div className="glass-panel rounded-3xl p-20 text-center">
          <Activity size={40} className="mx-auto text-bento-text-muted mb-4" />
          <p className="text-bento-text-muted font-semibold">Could not retrieve market data.</p>
          <p className="text-sm text-bento-text-muted/60 mt-1">Please try another location.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {prices.map((item, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.07, duration: 0.35 }}
              className="glass-panel rounded-[1.75rem] p-6 hover:-translate-y-1 transition-all duration-300 group relative overflow-hidden"
            >
              {/* Accent glow on hot items */}
              {item.trend === 'up' && item.demand === 'high' && (
                <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/8 rounded-bl-[3rem] pointer-events-none -mr-8 -mt-8" />
              )}

              <div className="flex justify-between items-start mb-5 relative z-10">
                <div>
                  <h3 className="text-xl font-bold text-bento-text-main tracking-tight">{item.crop}</h3>
                  <div className="flex items-center gap-1 mt-1">
                    <MapPin size={10} className="text-bento-text-muted" />
                    <span className="text-[10px] font-semibold text-bento-text-muted uppercase tracking-wider">{location}</span>
                  </div>
                </div>
                <div className={`p-2.5 rounded-xl border ${trendBg(item.trend)}`}>
                  {trendIcon(item.trend)}
                </div>
              </div>

              <div className="flex items-baseline gap-1.5 mb-5 relative z-10">
                <IndianRupee size={22} className="text-emerald-400 mb-0.5" />
                <span className="text-4xl font-extrabold text-emerald-400 tracking-tighter">{item.price.toLocaleString('en-IN')}</span>
                <span className="text-xs font-bold text-bento-text-muted uppercase tracking-wide ml-0.5">/ {item.unit}</span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-4 border-t border-emerald-500/10 relative z-10">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-bento-text-muted mb-1.5">Market Demand</p>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${demandBadge(item.demand)}`}>
                    {item.demand.charAt(0).toUpperCase() + item.demand.slice(1)}
                  </span>
                </div>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-bento-text-muted mb-1.5">Status</p>
                  <p className={`text-sm font-bold ${item.trend === 'up' ? 'text-rose-400' : item.trend === 'down' ? 'text-emerald-400' : 'text-slate-400'}`}>
                    {item.trend === 'up' ? '↑ Rising' : item.trend === 'down' ? '↓ Dropping' : '— Stable'}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
