import { useState } from "react";
import {
  Sun, Cloud, CloudRain, CloudLightning, CloudSnow,
  MapPin, Loader2, CalendarDays, Thermometer, Droplets
} from "lucide-react";
import { useWeather } from "../lib/WeatherContext";

const weatherCodes: Record<number, { description: string; icon: React.ReactNode }> = {
  0:  { description: "Clear sky",        icon: <Sun className="text-amber-400" /> },
  1:  { description: "Mainly clear",     icon: <Sun className="text-amber-400" /> },
  2:  { description: "Partly cloudy",    icon: <Cloud className="text-slate-400" /> },
  3:  { description: "Overcast",         icon: <Cloud className="text-slate-500" /> },
  45: { description: "Foggy",            icon: <Cloud className="text-slate-400" /> },
  48: { description: "Rime fog",         icon: <Cloud className="text-slate-400" /> },
  51: { description: "Light drizzle",    icon: <CloudRain className="text-blue-300" /> },
  53: { description: "Mod. drizzle",     icon: <CloudRain className="text-blue-400" /> },
  55: { description: "Dense drizzle",    icon: <CloudRain className="text-blue-500" /> },
  61: { description: "Light rain",       icon: <CloudRain className="text-blue-300" /> },
  63: { description: "Moderate rain",    icon: <CloudRain className="text-blue-400" /> },
  65: { description: "Heavy rain",       icon: <CloudRain className="text-blue-500" /> },
  71: { description: "Light snow",       icon: <CloudSnow className="text-sky-200" /> },
  73: { description: "Mod. snow",        icon: <CloudSnow className="text-sky-300" /> },
  75: { description: "Heavy snow",       icon: <CloudSnow className="text-sky-400" /> },
  95: { description: "Thunderstorm",     icon: <CloudLightning className="text-violet-400" /> },
};

export default function WeatherWidget() {
  const { weather, loading, error } = useWeather();
  const [showForecast, setShowForecast] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm font-medium text-bento-text-muted animate-pulse">
        <Loader2 size={14} className="animate-spin text-emerald-500" />
        <span className="hidden md:inline text-xs">Fetching climate…</span>
      </div>
    );
  }

  if (error || !weather) {
    return (
      <div className="flex items-center gap-1.5 text-xs font-medium text-bento-text-muted">
        <MapPin size={12} className="text-rose-400" />
        <span className="hidden md:inline">Weather unavailable</span>
      </div>
    );
  }

  const info = weatherCodes[weather.current.code] || { description: "Unknown", icon: <Sun /> };

  return (
    <div className="relative">
      <button
        onClick={() => setShowForecast(!showForecast)}
        className="flex items-center gap-2 p-1.5 md:p-2 rounded-xl hover:bg-emerald-500/8 transition-all group"
      >
        <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-white/5 border border-white/8 flex items-center justify-center group-hover:border-emerald-500/20 transition-colors">
          {info.icon}
        </div>
        <div className="hidden md:flex flex-col items-start leading-tight">
          <div className="flex items-center gap-1 text-xs font-semibold text-bento-text-main">
            <MapPin size={10} className="text-emerald-400" strokeWidth={3} />
            {weather.location}
          </div>
          <div className="text-[10px] text-bento-text-muted font-medium">
            {weather.current.temp}°C · {info.description}
          </div>
        </div>
        <div className="md:hidden text-sm font-bold text-bento-text-main">
          {weather.current.temp}°
        </div>
      </button>

      {/* Forecast popover */}
      {showForecast && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowForecast(false)} />
          <div className="absolute top-12 md:top-14 right-0 w-64 glass-panel rounded-2xl p-5 z-50 animate-in fade-in zoom-in-95 duration-200 border border-emerald-500/15">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-bento-text-muted">3-Day Forecast</h4>
              <CalendarDays size={13} className="text-emerald-400" />
            </div>

            <div className="space-y-3">
              {weather.forecast.slice(1).map((day, i) => {
                const dayInfo = weatherCodes[day.code] || { description: "Unknown", icon: <Sun /> };
                return (
                  <div key={i} className="flex items-center justify-between group">
                    <div className="w-8 text-[10px] font-bold text-bento-text-muted">{day.date}</div>
                    <div className="flex-1 flex items-center gap-2.5 px-2">
                      <div className="w-7 h-7 rounded-lg bg-white/4 border border-white/6 flex items-center justify-center group-hover:border-emerald-500/15 transition-colors">
                        {dayInfo.icon}
                      </div>
                      <span className="text-[10px] font-medium text-bento-text-muted truncate max-w-[70px]">
                        {dayInfo.description}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-xs font-bold">
                      <span className="text-bento-text-main">{day.tempMax}°</span>
                      <span className="text-bento-text-muted opacity-40">/</span>
                      <span className="text-bento-text-muted">{day.tempMin}°</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 pt-4 border-t border-emerald-500/10 grid grid-cols-2 gap-3">
              <div>
                <div className="flex items-center gap-1 text-[9px] font-bold text-bento-text-muted uppercase tracking-tight mb-1">
                  <Thermometer size={10} className="text-emerald-400" /> Feels Like
                </div>
                <div className="text-sm font-bold text-emerald-400">{weather.current.temp}°C</div>
              </div>
              <div>
                <div className="flex items-center gap-1 text-[9px] font-bold text-bento-text-muted uppercase tracking-tight mb-1">
                  <Droplets size={10} className="text-blue-400" /> Humidity
                </div>
                <div className="text-sm font-bold text-blue-400">{weather.current.humidity}%</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
