import { Suspense, lazy } from "react";
import { Outlet, NavLink, Navigate } from "react-router-dom";
import { motion } from "motion/react";
import {
  Camera, User as UserIcon, Leaf,
  Compass, CheckCircle2, Activity,
} from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import { useLanguage } from "../lib/LanguageContext";
import ThemeToggle from "../components/ThemeToggle";
import LanguageToggle from "../components/LanguageToggle";
import NotificationManager from "../components/NotificationManager";

// Lazy imports for header widgets
const LazyWeatherWidget = lazy(() => import("../components/WeatherWidget"));
const LazyWeatherAdvisoryBanner = lazy(() => import("../components/WeatherAdvisoryBanner"));

type NavItemId = 'health' | 'fields' | 'tasks' | 'market' | 'profile';

const NAV_CONFIG: { id: NavItemId; to: string; icon: React.ElementType; labelKey: string }[] = [
  { id: 'health',   to: '/health',   icon: Camera,       labelKey: 'nav.health'  },
  { id: 'fields',   to: '/fields',   icon: Compass,      labelKey: 'nav.plots'   },
  { id: 'tasks',    to: '/tasks',    icon: CheckCircle2, labelKey: 'nav.tasks'   },
  { id: 'market',   to: '/market',   icon: Activity,     labelKey: 'nav.market'  },
  { id: 'profile',  to: '/profile',  icon: UserIcon,     labelKey: 'nav.profile' },
];

/* ── Loading fallback ──────────────────────────────────────── */
function PageLoader() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
        <p className="text-xs text-bento-text-muted font-medium tracking-wide">Loading…</p>
      </div>
    </div>
  );
}

/* ── NavButton using NavLink ──────────────────────────────── */
function NavButton({ to, icon, label }: {
  to: string; icon: React.ReactNode; label: string;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `
        group relative flex flex-col items-center justify-center
        flex-1 md:flex-none md:w-full
        py-2.5 md:py-3.5 px-1
        rounded-2xl transition-all duration-300
        ${isActive
          ? 'text-emerald-400'
          : 'text-bento-text-muted hover:text-emerald-300 hover:bg-emerald-500/5'
        }
      `}
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.div
              layoutId="nav-active-bg"
              className="absolute inset-0 rounded-2xl bg-emerald-500/12 border border-emerald-500/20"
              style={{ boxShadow: '0 0 16px rgba(34, 197, 94, 0.12)' }}
            />
          )}
          <div className={`relative z-10 transition-transform duration-200 ${isActive ? 'scale-110' : 'group-hover:scale-105'}`}>
            {icon}
          </div>
          <span className={`relative z-10 text-[9px] md:text-[10px] font-semibold tracking-widest uppercase mt-0.5 transition-colors ${isActive ? 'text-emerald-400' : ''}`}>
            {label}
          </span>
          {isActive && (
            <motion.div layoutId="nav-dot" className="absolute -bottom-1 md:hidden w-1 h-1 bg-emerald-400 rounded-full" style={{ boxShadow: '0 0 6px rgba(34,197,94,0.9)' }} />
          )}
        </>
      )}
    </NavLink>
  );
}

/* ── RequireAuth guard ─────────────────────────────────────── */
export function RequireAuth() {
  const { user, loading } = useAuth();
  const { t } = useLanguage();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-theme-base">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-green-700 flex items-center justify-center shadow-2xl shadow-emerald-500/30">
              <Leaf size={32} className="text-white" />
            </div>
            <div className="absolute inset-0 rounded-2xl border-2 border-emerald-500/30 animate-ping" />
          </div>
          <p className="text-sm font-medium text-theme-muted">{t("app.loading")}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return <AppLayout />;
}

/* ── App Layout Shell ──────────────────────────────────────── */
function AppLayout() {
  const { t } = useLanguage();
  const NAV_ITEMS = NAV_CONFIG.map(item => ({ ...item, label: t(item.labelKey) }));

  return (
    <div className="h-screen h-[100dvh] flex flex-col overflow-hidden relative bg-theme-base text-theme-main">
      {/* Ambient glow layer */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-emerald-500/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[350px] h-[350px] bg-amber-500/4 rounded-full blur-[90px]" />
      </div>

      <NotificationManager />

      {/* Header */}
      <header className="relative z-[60] h-[60px] md:h-[66px] px-4 md:px-6 flex items-center justify-between glass-nav border-b">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-green-700 flex items-center justify-center shadow-lg shadow-emerald-500/25">
            <Leaf size={16} className="text-white" />
          </div>
          <span className="font-serif font-bold text-[17px] tracking-tight text-bento-text-main">
            Agro<span className="text-gradient-green">Aid</span> AI
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Suspense fallback={<div className="w-28 h-7 skeleton rounded-full" />}>
            <LazyWeatherWidget />
          </Suspense>
          <LanguageToggle variant="icon" />
          <ThemeToggle variant="icon" />
        </div>
      </header>

      <Suspense fallback={null}>
        <LazyWeatherAdvisoryBanner />
      </Suspense>

      {/* Layout */}
      <div className="relative z-10 flex-1 flex flex-col-reverse md:flex-row overflow-hidden">

        {/* Sidebar / bottom nav */}
        <nav className="
          shrink-0 glass-nav
          border-t border-emerald-500/10
          px-1 py-2 pb-safe
          flex flex-row justify-around items-center
          gap-0.5
          overflow-x-auto scrollbar-hide
          md:flex-col md:justify-start md:items-stretch
          md:w-[86px] md:px-2 md:py-5 md:gap-1
          md:border-t-0 md:border-r md:border-emerald-500/10
          z-[55]
        ">
          {NAV_ITEMS.map(item => (
            <NavButton
              key={item.id}
              to={item.to}
              icon={<item.icon size={20} />}
              label={item.label}
            />
          ))}
        </nav>

        {/* Content */}
        <main className="flex-1 overflow-hidden relative">
          <div className="h-full max-w-7xl mx-auto relative">
            <Suspense fallback={<PageLoader />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}

export default AppLayout;
