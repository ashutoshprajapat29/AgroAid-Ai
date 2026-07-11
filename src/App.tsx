import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./lib/AuthContext";
import { WeatherProvider } from "./lib/WeatherContext";
import { ThemeProvider } from "./lib/ThemeContext";
import { LanguageProvider } from "./lib/LanguageContext";
import { RequireAuth } from "./layouts/AppLayout";

// Lazy-loaded pages for code-splitting
const LandingPage  = lazy(() => import("./pages/LandingPage"));
const FieldsPage   = lazy(() => import("./pages/FieldsPage"));
const HealthPage   = lazy(() => import("./pages/HealthPage"));
const TasksPage    = lazy(() => import("./pages/TasksPage"));
const MarketPage   = lazy(() => import("./pages/MarketPage"));
const ProfilePage  = lazy(() => import("./pages/ProfilePage"));

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <WeatherProvider>
            <BrowserRouter>
              <Suspense fallback={<AppLoadingScreen />}>
                <Routes>
                  {/* Public route: Landing / Login */}
                  <Route path="/" element={<LandingPage />} />

                  {/* Protected routes: wrapped in RequireAuth layout */}
                  <Route element={<RequireAuth />}>
                    <Route path="/fields"  element={<FieldsPage />}  />
                    <Route path="/health"  element={<HealthPage />}  />
                    <Route path="/tasks"   element={<TasksPage />}   />
                    <Route path="/market"  element={<MarketPage />}  />
                    <Route path="/profile" element={<ProfilePage />} />
                  </Route>

                  {/* Catch-all: redirect to market (auth guard will bounce to / if not logged in) */}
                  <Route path="*" element={<Navigate to="/market" replace />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </WeatherProvider>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}

/* ── Global loading screen (shown while lazy chunks load) ── */
function AppLoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-theme-base">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
        <p className="text-xs text-bento-text-muted font-medium tracking-wide">Loading…</p>
      </div>
    </div>
  );
}
