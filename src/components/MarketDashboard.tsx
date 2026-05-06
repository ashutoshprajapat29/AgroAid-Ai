import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus, Activity, MapPin, Loader2, IndianRupee } from 'lucide-react';
import { getMarketPrices, MarketPrice } from '../services/gemini';
import { motion } from 'motion/react';

// Simple session cache to prevent redundant API calls
const marketCache: Record<string, { data: MarketPrice[], timestamp: number }> = {};
const CACHE_DURATION_MS = 1000 * 60 * 60; // 1 hour

export default function MarketDashboard() {
  const [prices, setPrices] = useState<MarketPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState('Maharashtra, India');
  const [searchLoc, setSearchLoc] = useState('Maharashtra, India');

  useEffect(() => {
    fetchPrices(location);
  }, [location]);

  const fetchPrices = async (loc: string) => {
    setLoading(true);
    
    // Check cache first
    const normalizedLoc = loc.toLowerCase().trim();
    if (marketCache[normalizedLoc] && Date.now() - marketCache[normalizedLoc].timestamp < CACHE_DURATION_MS) {
      setPrices(marketCache[normalizedLoc].data);
      setLoading(false);
      return;
    }

    const data = await getMarketPrices(loc);
    
    // Save to cache
    if (data && data.length > 0) {
      marketCache[normalizedLoc] = { data, timestamp: Date.now() };
    }
    
    setPrices(data);
    setLoading(false);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchLoc.trim()) {
      setLocation(searchLoc);
    }
  };

  const renderTrendIcon = (trend: string) => {
    switch(trend) {
      case 'up': return <TrendingUp size={20} className="text-rose-500" />;
      case 'down': return <TrendingDown size={20} className="text-emerald-500" />;
      default: return <Minus size={20} className="text-zinc-400" />;
    }
  };

  return (
    <div className="max-w-7xl mx-auto pb-20 px-4 md:px-0">
      <header className="mb-10 p-10 bento-card border-none bg-gradient-to-br from-[#123524] via-[#255239] to-[#3e7b27] text-white shadow-[0_20px_50px_rgba(18,53,36,0.2)] relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full -mr-48 -mt-48 blur-3xl group-hover:scale-125 transition-transform duration-1000" />
        
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          <div className="flex items-center gap-6">
            <div className="p-5 bg-white/10 rounded-[32px] backdrop-blur-xl border border-white/20 shadow-inner">
              <Activity size={40} className="text-emerald-50" />
            </div>
            <div>
              <h1 className="text-4xl md:text-5xl font-serif font-bold tracking-tight mb-2 leading-tight">Market & Economics</h1>
              <p className="text-emerald-50/80 font-bold tracking-wide flex items-center gap-2">
                Real-time wholesale Mandi prices to plan your harvest and maximize profit.
              </p>
            </div>
          </div>

          <form onSubmit={handleSearch} className="flex items-center bg-white/10 backdrop-blur-md p-2 rounded-2xl border border-white/20">
            <MapPin className="text-emerald-200 ml-3 mr-2" size={20} />
            <input 
              type="text" 
              value={searchLoc}
              onChange={(e) => setSearchLoc(e.target.value)}
              className="bg-transparent border-none outline-none text-white placeholder-emerald-100/50 font-bold w-48 md:w-64"
              placeholder="Enter District/State..."
            />
            <button type="submit" className="bg-white text-[#123524] px-6 py-2.5 rounded-xl font-bold hover:bg-emerald-50 transition-colors shadow-lg">
              Check
            </button>
          </form>
        </div>
      </header>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 text-emerald-800">
          <Loader2 size={48} className="animate-spin mb-4 text-[#3e7b27]" />
          <p className="font-bold text-lg animate-pulse">Fetching live prices for {location}...</p>
        </div>
      ) : prices.length === 0 ? (
        <div className="text-center py-20 glass-panel rounded-3xl">
          <p className="text-zinc-500 font-bold">Could not retrieve market data. Please try another location.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {prices.map((item, idx) => (
            <motion.div 
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="glass-panel p-8 rounded-[2rem] hover:shadow-[0_12px_40px_rgba(18,53,36,0.08)] transition-all duration-300 hover:-translate-y-1 relative overflow-hidden"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-2xl font-black text-zinc-800 tracking-tight">{item.crop}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{location}</span>
                  </div>
                </div>
                <div className={`p-3 rounded-2xl ${item.trend === 'up' ? 'bg-rose-50 text-rose-500' : item.trend === 'down' ? 'bg-emerald-50 text-emerald-500' : 'bg-zinc-50 text-zinc-500'}`}>
                  {renderTrendIcon(item.trend)}
                </div>
              </div>

              <div className="flex items-baseline gap-2 mb-6">
                <IndianRupee size={28} className="text-[#123524] font-black" />
                <span className="text-5xl font-black text-[#123524] tracking-tighter">{item.price.toLocaleString('en-IN')}</span>
                <span className="text-sm font-bold text-zinc-400 uppercase tracking-widest ml-1">/ {item.unit}</span>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-6 border-t border-zinc-100">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1">Market Demand</p>
                  <span className={`text-sm font-bold px-3 py-1 rounded-full ${item.demand === 'high' ? 'bg-rose-100 text-rose-700' : item.demand === 'low' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                    {item.demand.charAt(0).toUpperCase() + item.demand.slice(1)}
                  </span>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1">Status</p>
                  <p className="text-sm font-bold text-zinc-700">
                    {item.trend === 'up' ? 'Prices Rising' : item.trend === 'down' ? 'Prices Dropping' : 'Stable'}
                  </p>
                </div>
              </div>

              {item.trend === 'up' && item.demand === 'high' && (
                <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/10 rounded-bl-full -mr-16 -mt-16 pointer-events-none" />
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
