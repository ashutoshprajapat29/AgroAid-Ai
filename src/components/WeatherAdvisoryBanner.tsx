import { useWeather } from "../lib/WeatherContext";
import { AlertCircle, CloudRain, Thermometer, CloudSun } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export default function WeatherAdvisoryBanner() {
  const { advisory, loading, error } = useWeather();

  if (loading || (!advisory && !error)) return null;

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: "auto", opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        className="overflow-hidden"
      >
        <div className={`px-4 py-0.5 border-b flex items-center justify-center gap-2 text-center ${error ? 'bg-red-50 text-red-700 border-red-100' : 'bg-amber-50 text-amber-800 border-amber-100'}`}>
          {error ? (
            <AlertCircle size={14} className="shrink-0" />
          ) : advisory?.includes('rain') ? (
            <CloudRain size={14} className="shrink-0 text-blue-500" />
          ) : advisory?.includes('heat') ? (
            <Thermometer size={14} className="shrink-0 text-orange-500" />
          ) : (
            <CloudSun size={14} className="shrink-0 text-amber-500" />
          )}
          
          <span className="text-[10px] md:text-xs font-black uppercase tracking-tight leading-tight">
            {error || advisory}
          </span>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
