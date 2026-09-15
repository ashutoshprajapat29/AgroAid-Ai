import { useWeather } from "../lib/WeatherContext";
import { useLanguage } from "../lib/LanguageContext";
import { AlertCircle, CloudRain, Thermometer, CloudSun } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export default function WeatherAdvisoryBanner() {
  const { advisory, loading, error } = useWeather();
  const { isHindi } = useLanguage();

  if (loading || (!advisory && !error)) return null;

  const isRain = advisory?.toLowerCase().includes("rain") || advisory?.includes("बारिश");
  const isHeat = advisory?.toLowerCase().includes("heat") || advisory?.includes("गर्मी");

  return (
    <AnimatePresence>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: "auto", opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        className="overflow-hidden relative z-40"
      >
        <div className="mx-auto max-w-7xl px-3 sm:px-6 py-1.5">
          <div className={`relative overflow-hidden rounded-xl border px-3.5 py-2 shadow-md flex items-center justify-between gap-3 ${
            error
              ? "border-rose-500/40 bg-gradient-to-r from-rose-500/15 via-rose-950/20 to-transparent text-rose-300"
              : "border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-emerald-950/20 to-transparent text-amber-200"
          }`}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                error ? "bg-rose-500/20 text-rose-400" : "bg-amber-500/20 text-amber-400"
              }`}>
                {error ? (
                  <AlertCircle size={15} />
                ) : isRain ? (
                  <CloudRain size={15} />
                ) : isHeat ? (
                  <Thermometer size={15} />
                ) : (
                  <CloudSun size={15} />
                )}
              </div>
              <div className="flex items-center gap-2 truncate">
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider shrink-0 ${
                  error ? "bg-rose-500 text-white" : "bg-amber-500 text-slate-950"
                }`}>
                  {isHindi ? "मौसम चेतावनी" : "IMD Alert"}
                </span>
                <span className="text-xs font-bold truncate">
                  {error || advisory}
                </span>
              </div>
            </div>

            <div className="hidden sm:flex items-center gap-1.5 shrink-0 text-[10px] font-semibold opacity-80 text-amber-300/80">
              <span>{isHindi ? "कृषि कार्य सावधानीपूर्वक करें" : "Plan spray & harvest accordingly"}</span>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
