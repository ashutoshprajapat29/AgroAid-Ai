import { useState } from "react";
import { 
  Sun, 
  Cloud, 
  CloudRain, 
  CloudLightning, 
  CloudSnow, 
  MapPin, 
  Loader2,
  CalendarDays,
  Thermometer,
  Droplets
} from "lucide-react";
import { useWeather } from "../lib/WeatherContext";

const weatherCodes: Record<number, { description: string; icon: React.ReactNode }> = {
  0: { description: "Clear sky", icon: <Sun className="text-amber-500" /> },
  1: { description: "Mainly clear", icon: <Sun className="text-amber-400" /> },
  2: { description: "Partly cloudy", icon: <Cloud className="text-gray-400" /> },
  3: { description: "Overcast", icon: <Cloud className="text-gray-500" /> },
  45: { description: "Foggy", icon: <Cloud className="text-gray-300" /> },
  48: { description: "Depositing rime fog", icon: <Cloud className="text-gray-300" /> },
  51: { description: "Light drizzle", icon: <CloudRain className="text-blue-300" /> },
  53: { description: "Moderate drizzle", icon: <CloudRain className="text-blue-400" /> },
  55: { description: "Dense drizzle", icon: <CloudRain className="text-blue-500" /> },
  61: { description: "Slight rain", icon: <CloudRain className="text-blue-300" /> },
  63: { description: "Moderate rain", icon: <CloudRain className="text-blue-400" /> },
  65: { description: "Heavy rain", icon: <CloudRain className="text-blue-600" /> },
  71: { description: "Slight snow", icon: <CloudSnow className="text-blue-100" /> },
  73: { description: "Moderate snow", icon: <CloudSnow className="text-blue-200" /> },
  75: { description: "Heavy snow", icon: <CloudSnow className="text-blue-300" /> },
  95: { description: "Thunderstorm", icon: <CloudLightning className="text-purple-500" /> },
};

export default function WeatherWidget() {
  const { weather, loading, error } = useWeather();
  const [showForecast, setShowForecast] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm font-medium text-bento-text-muted animate-pulse">
        <Loader2 size={16} className="animate-spin" />
        <span>Fetching local climate...</span>
      </div>
    );
  }

  if (error || !weather) {
    return (
      <div className="flex items-center gap-2 text-sm font-medium text-bento-text-muted">
        <MapPin size={16} className="text-red-400" />
        <span>Weather Unavailable</span>
      </div>
    );
  }

  const currentInfo = weatherCodes[weather.current.code] || { description: "Unknown", icon: <Sun /> };

  return (
    <div className="relative">
      <button 
        onClick={() => setShowForecast(!showForecast)}
        className="flex items-center gap-2 md:gap-3 text-sm font-medium hover:bg-white/50 p-1.5 md:p-2 rounded-xl transition-all group"
      >
        <div className="p-1.5 md:p-2 bg-white rounded-lg shadow-sm group-hover:shadow-md transition-shadow">
          {currentInfo.icon}
        </div>
        <div className="flex flex-col items-start leading-tight">
          <div className="flex items-center gap-1.5 font-bold text-bento-text-main">
            <MapPin size={12} className="text-bento-accent" strokeWidth={3} />
            <span className="hidden md:inline">{weather.location}</span>
            <span className="md:hidden text-sm">{weather.current.temp}°</span>
          </div>
          <div className="hidden md:flex text-xs text-bento-text-muted items-center gap-2 font-semibold">
            <span>{weather.current.temp}°C</span>
            <span>•</span>
            <span className="capitalize">{currentInfo.description}</span>
          </div>
        </div>
      </button>

      {/* Forecast Popover */}
      {showForecast && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setShowForecast(false)}
          />
          <div className="absolute top-14 right-0 w-64 bg-white rounded-3xl shadow-2xl border border-bento-border p-5 z-50 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-xs font-black uppercase tracking-widest text-bento-text-muted">3-Day Forecast</h4>
              <CalendarDays size={14} className="text-bento-primary" />
            </div>
            
            <div className="space-y-4">
              {weather.forecast.slice(1).map((day, i) => {
                const dayInfo = weatherCodes[day.code] || { description: "Unknown", icon: <Sun /> };
                return (
                  <div key={i} className="flex items-center justify-between group">
                    <div className="w-10 font-bold text-xs text-bento-text-muted">{day.date}</div>
                    <div className="flex-1 flex items-center gap-3 px-3">
                      <div className="w-8 h-8 rounded-lg bg-bento-bg flex items-center justify-center group-hover:scale-110 transition-transform">
                        {dayInfo.icon}
                      </div>
                      <div className="text-[10px] font-bold text-bento-text-main truncate max-w-[80px]">
                        {dayInfo.description}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 font-black text-xs">
                      <span className="text-bento-text-main">{day.tempMax}°</span>
                      <span className="text-bento-text-muted opacity-50">/</span>
                      <span className="text-bento-text-muted">{day.tempMin}°</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 pt-4 border-t border-bento-border grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1 text-[9px] font-bold text-bento-text-muted uppercase tracking-tighter">
                  <Thermometer size={10} /> Feels Like
                </div>
                <div className="text-sm font-black text-bento-primary">{weather.current.temp}°C</div>
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1 text-[9px] font-bold text-bento-text-muted uppercase tracking-tighter">
                  <Droplets size={10} /> Humidity
                </div>
                <div className="text-sm font-black text-bento-primary">{weather.current.humidity}%</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
