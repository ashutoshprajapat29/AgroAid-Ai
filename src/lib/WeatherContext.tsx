import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface WeatherForecast {
  date: string;
  tempMax: number;
  tempMin: number;
  description: string;
  code: number;
}

interface WeatherData {
  current: {
    temp: number;
    humidity: number;
    description: string;
    code: number;
  };
  forecast: Array<{
    date: string;
    tempMax: number;
    tempMin: number;
    description: string;
    code: number;
  }>;
  location: string;
}

interface WeatherContextType {
  weather: WeatherData | null;
  advisory: string | null;
  loading: boolean;
  error: string | null;
}

const WeatherContext = createContext<WeatherContextType | undefined>(undefined);

export function WeatherProvider({ children }: { children: ReactNode }) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [advisory, setAdvisory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const generateAdvisory = (current: any, daily: any) => {
    // Check for rain in next 5 days
    const willRain = daily.weather_code.slice(0, 5).some((code: number) => [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99].includes(code));
    const isHot = daily.temperature_2m_max.slice(0, 3).some((temp: number) => temp > 35);
    const isCold = daily.temperature_2m_min.slice(0, 3).some((temp: number) => temp < 10);

    let msg = "Conditions look excellent for farming today.";
    
    if (willRain) {
      msg = "Warning: There are chances of rain in the upcoming 5 days. Secure your harvest.";
    } else if (isHot) {
      msg = "Heavy heat alert! Move sensitive livestock to shade and irrigate more.";
    } else if (isCold) {
      msg = "Frost warning in effect. Protect sensitive crops tonight.";
    }

    setAdvisory(msg);
  };

  useEffect(() => {
    if (!navigator.geolocation) {
      setError("Geolocation not supported");
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          
          const weatherRes = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`
          );
          if (!weatherRes.ok) throw new Error(`Weather API error: ${weatherRes.status}`);
          const weatherData = await weatherRes.json();

          const locationRes = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
          );
          if (!locationRes.ok) throw new Error(`Geocode API error: ${locationRes.status}`);
          const locationData = await locationRes.json();
          const cityName = locationData.city || locationData.locality || locationData.principalSubdivision || "My Farm";
          
          const processedForecast = weatherData.daily.time.slice(0, 4).map((time: string, i: number) => {
            return {
              date: new Date(time).toLocaleDateString("en-US", { weekday: "short" }),
              tempMax: Math.round(weatherData.daily.temperature_2m_max[i]),
              tempMin: Math.round(weatherData.daily.temperature_2m_min[i]),
              description: "Weather", // Will be mapped by ID in component
              code: weatherData.daily.weather_code[i],
            };
          });

          const data: WeatherData = {
            current: {
              temp: Math.round(weatherData.current.temperature_2m),
              humidity: Math.round(weatherData.current.relative_humidity_2m),
              description: "Current",
              code: weatherData.current.weather_code
            },
            forecast: processedForecast,
            location: cityName
          };

          setWeather(data);
          generateAdvisory(weatherData.current, weatherData.daily);
        } catch (err) {
          setError("Failed to sync climate data");
        } finally {
          setLoading(false);
        }
      },
      () => {
        setError("Location access denied");
        setLoading(false);
      }
    );
  }, []);

  return (
    <WeatherContext.Provider value={{ weather, advisory, loading, error }}>
      {children}
    </WeatherContext.Provider>
  );
}

export function useWeather() {
  const context = useContext(WeatherContext);
  if (context === undefined) {
    throw new Error('useWeather must be used within a WeatherProvider');
  }
  return context;
}
