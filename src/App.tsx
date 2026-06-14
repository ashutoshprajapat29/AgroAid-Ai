import { AuthProvider, useAuth } from "./lib/AuthContext";
import { WeatherProvider } from "./lib/WeatherContext";
import { ThemeProvider } from "./lib/ThemeContext";
import { LanguageProvider, useLanguage } from "./lib/LanguageContext";
import { useState, useEffect, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  MessageSquare, Camera, User as UserIcon, Loader2, Leaf,
  Compass, CheckCircle2, Activity, Smartphone, ArrowLeft, Globe, ShieldCheck,
} from "lucide-react";
import ThemeToggle from "./components/ThemeToggle";
import LanguageToggle from "./components/LanguageToggle";
import NotificationManager from "./components/NotificationManager";
import { AdvisorSimulator, ScannerSimulator, PlotsSimulator } from "./components/LandingSimulators";
const DiseaseScanner  = lazy(() => import("./components/DiseaseScanner"));
const Profile         = lazy(() => import("./components/Profile"));
const WeatherWidget   = lazy(() => import("./components/WeatherWidget"));
const WeatherAdvisoryBanner = lazy(() => import("./components/WeatherAdvisoryBanner"));
const FieldManager    = lazy(() => import("./components/FieldManager"));
const TaskManager     = lazy(() => import("./components/TaskManager"));
const MarketDashboard = lazy(() => import("./components/MarketDashboard"));

type TabType = 'disease' | 'profile' | 'fields' | 'tasks' | 'market';

const NAV_CONFIG: { id: TabType; icon: React.ElementType; labelKey: string }[] = [
  { id: 'disease',  icon: Camera,        labelKey: 'nav.health'   },
  { id: 'fields',   icon: Compass,       labelKey: 'nav.plots'    },
  { id: 'tasks',    icon: CheckCircle2,  labelKey: 'nav.tasks'    },
  { id: 'market',   icon: Activity,      labelKey: 'nav.market'   },
  { id: 'profile',  icon: UserIcon,      labelKey: 'nav.profile'  },
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

/* ── Authenticated shell ───────────────────────────────────── */
function AuthenticatedApp() {
  const [activeTab, setActiveTab] = useState<TabType>('fields');
  const { t } = useLanguage();
  const NAV_ITEMS = NAV_CONFIG.map(item => ({ ...item, label: t(item.labelKey) }));

  // Tab navigation back button support
  useEffect(() => {
    // Replace initial state with current tab if there is no tab in history state
    if (!window.history.state || !window.history.state.tab) {
      window.history.replaceState({ tab: 'fields' }, '');
    }

    const handlePopState = (e: PopStateEvent) => {
      // If the pop event state contains a tab, switch to it
      if (e.state && e.state.tab) {
        setActiveTab(e.state.tab);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const handleTabChange = (tab: TabType) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    window.history.pushState({ tab }, '');
  };

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
            <WeatherWidget />
          </Suspense>
          <LanguageToggle variant="icon" />
          <ThemeToggle variant="icon" />
        </div>
      </header>

      <Suspense fallback={null}>
        <WeatherAdvisoryBanner />
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
              active={activeTab === item.id}
              onClick={() => handleTabChange(item.id)}
              icon={<item.icon size={20} />}
              label={item.label}
            />
          ))}
        </nav>

        {/* Content */}
        <main className="flex-1 overflow-hidden relative">
          <div className="h-full max-w-7xl mx-auto relative">

            <Suspense fallback={<PageLoader />}>
              {activeTab === 'disease' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="h-full overflow-y-auto p-3 md:p-6">
                  <DiseaseScanner />
                </motion.div>
              )}
              {activeTab === 'profile' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="h-full overflow-y-auto p-3 md:p-6">
                  <Profile />
                </motion.div>
              )}
              {activeTab === 'fields' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="h-full overflow-y-auto p-3 md:p-6">
                  <FieldManager />
                </motion.div>
              )}
              {activeTab === 'tasks' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="h-full overflow-y-auto p-3 md:p-6">
                  <TaskManager />
                </motion.div>
              )}
              {activeTab === 'market' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="h-full overflow-y-auto p-3 md:p-6">
                  <MarketDashboard />
                </motion.div>
              )}
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}

/* ── NavButton ─────────────────────────────────────────────── */
function NavButton({ active, onClick, icon, label }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        group relative flex flex-col items-center justify-center
        flex-1 md:flex-none md:w-full
        py-2.5 md:py-3.5 px-1
        rounded-2xl transition-all duration-300
        ${active
          ? 'text-emerald-400'
          : 'text-bento-text-muted hover:text-emerald-300 hover:bg-emerald-500/5'
        }
      `}
    >
      {active && (
        <motion.div
          layoutId="nav-active-bg"
          className="absolute inset-0 rounded-2xl bg-emerald-500/12 border border-emerald-500/20"
          style={{ boxShadow: '0 0 16px rgba(34, 197, 94, 0.12)' }}
        />
      )}
      <div className={`relative z-10 transition-transform duration-200 ${active ? 'scale-110' : 'group-hover:scale-105'}`}>
        {icon}
      </div>
      <span className={`relative z-10 text-[9px] md:text-[10px] font-semibold tracking-widest uppercase mt-0.5 transition-colors ${active ? 'text-emerald-400' : ''}`}>
        {label}
      </span>
      {active && (
        <motion.div layoutId="nav-dot" className="absolute -bottom-1 md:hidden w-1 h-1 bg-emerald-400 rounded-full" style={{ boxShadow: '0 0 6px rgba(34,197,94,0.9)' }} />
      )}
    </button>
  );
}

/* ── Landing page ──────────────────────────────────────────── */
function Landing() {
  const { login, sendOTP, verifyOTP, loading } = useAuth();
  const [lang, setLang]   = useState<'English'|'Hindi'>(() => (localStorage.getItem('preferredLanguage') as 'English'|'Hindi') || "English");
  const { setLanguage, t } = useLanguage();
  const [phone, setPhone] = useState("");
  const [otp, setOtp]     = useState("");
  const [step, setStep]   = useState<'method' | 'phone' | 'otp'>('method');
  const [error, setError] = useState("");

  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [activePreview, setActivePreview] = useState<'advisor' | 'disease' | 'plots' | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const xc = rect.width / 2;
    const yc = rect.height / 2;
    const rotateY = ((x - xc) / xc) * 8;
    const rotateX = -((y - yc) / yc) * 8;
    setTilt({ x: rotateX, y: rotateY });
  };

  const handleMouseLeave = () => {
    setTilt({ x: 0, y: 0 });
  };

  const selectLang = (l: 'English'|'Hindi') => { setLang(l); setLanguage(l); };

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (actionLoading) return;

    // Proper Indian phone number validation (exactly 10 digits starting with 6, 7, 8, or 9)
    const normalizedPhone = phone.trim();
    if (!/^[6-9]\d{9}$/.test(normalizedPhone)) {
      setError(lang === 'Hindi'
        ? "कृपया सही मोबाइल नंबर दर्ज करें"
        : "Please enter correct mobile number");
      return;
    }

    setActionLoading(true);
    setError("");
    try {
      const fp = '+91' + normalizedPhone;
      await sendOTP(fp);
      setStep('otp');
    } catch (err: any) {
      const msg = err.message || "";
      const code = err.code || "";
      if (code === 'auth/invalid-phone-number' || msg.includes('invalid-phone-number')) {
        setError(lang === 'Hindi' ? "कृपया सही मोबाइल नंबर दर्ज करें" : "Please enter correct mobile number");
      } else if (code === 'auth/quota-exceeded' || msg.includes('quota-exceeded')) {
        setError(lang === 'Hindi' ? "एसएमएस कोटा समाप्त हो गया है। कृपया बाद में प्रयास करें या गूगल लॉगिन का उपयोग करें।" : "SMS quota exceeded. Please try again later or use Google Login.");
      } else if (msg.includes('operation-not-allowed') || msg.includes('region enabled')) {
        setError(lang === 'Hindi' ? "यह सुविधा आपके क्षेत्र में उपलब्ध नहीं है।" : "Phone Login unavailable for your region. Please use Google Sign‑in.");
      } else if (msg.includes('billing-not-enabled')) {
        setError(lang === 'Hindi' ? "दैनिक सीमा समाप्त हो गई है।" : "Daily SMS quota reached. Please use Google Sign‑in.");
      } else if (msg.includes('too-many-requests')) {
        setError(lang === 'Hindi' ? "बहुत सारे प्रयास। कुछ मिनट प्रतीक्षा करें।" : "Too many attempts. Wait a few minutes or use Google Login.");
      } else {
        setError(err.message || (lang === 'Hindi' ? "ओटीपी भेजने में विफल। कृपया पुनः प्रयास करें।" : "Failed to send OTP. Please try again."));
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (actionLoading) return;
    setActionLoading(true);
    setError("");
    try {
      await verifyOTP(otp);
    } catch (err: any) {
      const msg = err.message || "";
      const code = err.code || "";
      if (code === 'auth/invalid-verification-code' || msg.includes('invalid-verification-code') || code === 'auth/code-expired' || msg.includes('code-expired')) {
        setError(lang === 'Hindi' ? "कृपया सही ओटीपी दर्ज करें" : "Please enter correct OTP");
      } else {
        setError(lang === 'Hindi' ? "कृपया सही ओटीपी दर्ज करें" : "Please enter correct OTP");
      }
    } finally {
      setActionLoading(false);
    }
  };

  // OTP individual digit boxes layout
  const otpArray = otp.split('');
  const otpBoxes = Array.from({ length: 6 }).map((_, idx) => {
    const char = otpArray[idx] || '';
    const isFocused = otp.length === idx && !actionLoading;
    return (
      <div
        key={idx}
        className={`w-11 h-14 rounded-2xl border-2 flex items-center justify-center text-xl font-extrabold transition-all duration-200 ${
          char ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5' :
          isFocused ? 'border-amber-400 scale-105 shadow-md shadow-amber-400/10' :
          'border-[var(--border-strong)] bg-[var(--bg-input)] text-bento-text-muted'
        }`}
      >
        {char}
        {isFocused && (
          <div className="w-0.5 h-6 bg-amber-400 animate-pulse" />
        )}
      </div>
    );
  });

  return (
    <div className="min-h-screen flex flex-col items-center overflow-y-auto relative bg-theme-base text-theme-main pb-16">
      {/* Grid pattern with radial gradient overlay */}
      <div className="fixed inset-0 bg-grid pointer-events-none opacity-80" />
      <div className="fixed inset-0 pointer-events-none bg-gradient-to-b from-transparent via-theme-base/60 to-theme-base z-0" />

      {/* Ambient orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[25%] w-[650px] h-[650px] bg-emerald-500/8 rounded-full blur-[140px] animate-glow-ring" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[450px] h-[450px] bg-amber-500/5 rounded-full blur-[110px]" />
        <div className="absolute top-[50%] left-[-8%] w-[300px] h-[300px] bg-emerald-700/5 rounded-full blur-[90px]" />
      </div>

      {/* Top navbar */}
      <div className="relative z-10 w-full glass-nav border-b border-emerald-500/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-green-700 flex items-center justify-center shadow-md shadow-emerald-500/25">
            <Leaf size={16} className="text-white" />
          </div>
          <span className="font-serif font-bold text-lg text-bento-text-main tracking-tight">
            Agro<span className="text-gradient-green">Aid</span> AI
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 text-[10px] font-bold tracking-widest text-emerald-400 uppercase bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_6px_rgba(34,197,94,0.9)]" />
            {lang === 'Hindi' ? 'लाइव डेटा सक्रिय' : 'Live Data Active'}
          </div>
          <div className="flex items-center gap-2">
            <LanguageToggle variant="pill" />
            <ThemeToggle variant="pill" />
          </div>
        </div>
      </div>

      {/* Hero section */}
      <div className="relative z-10 flex flex-col items-center pt-16 md:pt-24 pb-8 px-6 text-center">
        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", bounce: 0.45, duration: 0.9 }}
          className="relative mb-8 group"
        >
          {/* Pulsing glow behind */}
          <div className="absolute inset-0 bg-emerald-500/15 rounded-[2.5rem] blur-3xl scale-[1.7] animate-glow-ring" />
          {/* Animated rotating border */}
          <div className="absolute -inset-1.5 rounded-[2.2rem] bg-gradient-to-tr from-emerald-400 via-green-500 to-amber-500 opacity-60 blur-[2px] animate-spin" style={{ animationDuration: '12s' }} />
          
          <div className="relative w-24 h-24 bg-[var(--bg-card)] rounded-[2rem] flex items-center justify-center border border-emerald-500/30 shadow-2xl">
            <Leaf size={44} className="text-emerald-400 drop-shadow-md transition-transform duration-500 group-hover:scale-110" />
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.5 }}>
          <h1 className="text-5xl md:text-7xl font-serif font-extrabold tracking-tight leading-none mb-3">
            <span className="text-bento-text-main">Agro</span>
            <span className="text-gradient-green">Aid</span>
            <span className="text-bento-text-main"> AI</span>
          </h1>
          <p className="text-sm md:text-base text-bento-text-muted max-w-md mx-auto leading-relaxed font-semibold">
            {t("landing.subtitle")}
          </p>
        </motion.div>
      </div>

      {/* Language Quick-select */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="relative z-10 mb-8">
        <div className="flex p-1 rounded-full gap-1 border bg-theme-input border-theme-input shadow-inner">
          {(['Hindi', 'English'] as const).map(l => (
            <button
              key={l}
              onClick={() => selectLang(l)}
              disabled={actionLoading}
              className={`px-6 py-2 rounded-full text-xs font-black uppercase tracking-wider transition-all duration-300 disabled:opacity-50 ${
                lang === l
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 scale-105'
                  : 'text-theme-muted hover:text-emerald-400'
              }`}
            >
              {l === 'Hindi' ? 'हिन्दी' : 'English'}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Main Authentication Card */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          transform: `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          transformStyle: "preserve-3d",
          transition: "transform 0.15s cubic-bezier(0.25, 1, 0.5, 1)",
        }}
        className="relative z-10 w-full max-w-md px-4 mb-16 cursor-default"
      >
        <div className="glass-panel border-2 border-emerald-500/15 rounded-[2.5rem] p-8 md:p-10 shadow-2xl relative overflow-hidden">
          <div className="absolute -top-24 -left-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          
          <AnimatePresence mode="wait">
            {step === 'method' && (
              <motion.div key="method" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} className="space-y-6">
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-black text-bento-text-main tracking-tight">{t("auth.title")}</h2>
                  <p className="text-xs text-bento-text-muted mt-2 font-semibold leading-relaxed px-2">{t("auth.subtitle")}</p>
                </div>

                <button
                  onClick={async () => {
                    setActionLoading(true);
                    try {
                      await login();
                    } finally {
                      setActionLoading(false);
                    }
                  }}
                  disabled={actionLoading}
                  className="w-full px-6 py-4 bg-emerald-500 hover:bg-emerald-400 text-white rounded-2xl font-black text-sm uppercase tracking-wider transition-all duration-300 flex items-center justify-center gap-3 shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/35 hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                >
                  {actionLoading ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : (
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5 bg-white p-0.5 rounded-full" alt="Google" />
                  )}
                  <span>{t("auth.google")}</span>
                </button>

                <div className="relative flex items-center py-2">
                  <div className="flex-grow border-t border-theme-input" />
                  <span className="mx-4 text-[10px] font-black uppercase tracking-widest text-bento-text-muted">{t("common.or")}</span>
                  <div className="flex-grow border-t border-theme-input" />
                </div>

                <button
                  onClick={() => setStep('phone')}
                  disabled={actionLoading}
                  className="w-full px-6 py-4 bg-[var(--bg-input)] border border-[var(--border-input)] text-bento-text-main rounded-2xl font-black text-xs uppercase tracking-wider hover:bg-[var(--bg-hover)] hover:border-emerald-500/25 transition-all duration-300 flex items-center justify-center gap-3 active:scale-[0.98] cursor-pointer disabled:opacity-50"
                >
                  <Smartphone size={18} className="text-emerald-400" />
                  <span>{t("auth.phone")}</span>
                </button>
              </motion.div>
            )}

            {step === 'phone' && (
              <motion.div key="phone" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} className="space-y-5">
                <div className="flex items-center gap-2">
                  <button type="button" disabled={actionLoading} onClick={() => setStep('method')} className="p-2 hover:bg-[var(--bg-hover)] text-bento-text-muted hover:text-bento-text-main rounded-xl border border-transparent hover:border-[var(--border-input)] transition-all disabled:opacity-50">
                    <ArrowLeft size={16} />
                  </button>
                  <div>
                    <h2 className="text-xl font-black text-bento-text-main tracking-tight">{t("auth.enterPhone")}</h2>
                    <p className="text-[10px] text-bento-text-muted uppercase tracking-wider font-bold mt-0.5">{t("auth.otpHint")}</p>
                  </div>
                </div>

                <form onSubmit={handleSendOTP} className="space-y-4 pt-2">
                  <div className={`relative flex items-center bg-[var(--bg-input)] border-2 rounded-2xl overflow-hidden focus-within:border-emerald-500/40 transition-colors ${
                    error && phone.length === 10 && !/^[6-9]\d{9}$/.test(phone)
                      ? 'border-rose-500/50 bg-rose-500/5'
                      : 'border-[var(--border-strong)]'
                  }`}>
                    <div className="flex items-center gap-1 px-4 py-4 border-r border-[var(--border-input)] bg-[var(--bg-hover)] shrink-0">
                      <span className="text-base">🇮🇳</span>
                      <span className="text-sm font-black text-bento-text-main">+91</span>
                    </div>
                    <input
                      type="tel"
                      maxLength={10}
                      placeholder="9998887770"
                      value={phone}
                      onChange={e => {
                        const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                        setPhone(val);
                        if (error) setError("");
                      }}
                      disabled={actionLoading}
                      className="w-full bg-transparent px-4 py-4 text-lg font-bold text-bento-text-main placeholder:text-bento-text-muted/30 focus:outline-none disabled:opacity-50"
                      required
                    />
                  </div>
                  {error && <p className="text-rose-400 text-[11px] font-semibold px-1 leading-snug">{error}</p>}
                  <button
                    type="submit"
                    disabled={actionLoading || phone.length < 10 || !/^[6-9]\d{9}$/.test(phone)}
                    className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-white rounded-2xl font-black text-sm uppercase tracking-wider transition-all shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/35 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                  >
                    {actionLoading ? <Loader2 className="animate-spin mx-auto" size={18} /> : t("auth.sendOTP")}
                  </button>
                </form>
              </motion.div>
            )}

            {step === 'otp' && (
              <motion.div key="otp" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="space-y-5">
                <div className="flex items-center gap-2">
                  <button type="button" disabled={actionLoading} onClick={() => setStep('phone')} className="p-2 hover:bg-[var(--bg-hover)] text-bento-text-muted hover:text-bento-text-main rounded-xl border border-transparent hover:border-[var(--border-input)] transition-all disabled:opacity-50">
                    <ArrowLeft size={16} />
                  </button>
                  <div>
                    <h2 className="text-xl font-black text-bento-text-main tracking-tight">{t("auth.verifyOtp")}</h2>
                    <p className="text-[10px] text-bento-text-muted uppercase tracking-wider font-bold mt-0.5">{t("auth.otpCodeHint")}</p>
                  </div>
                </div>

                <form onSubmit={handleVerifyOTP} className="space-y-6 pt-2">
                  <div className="relative flex justify-center gap-2">
                    {otpBoxes}
                    <input
                      type="tel"
                      maxLength={6}
                      value={otp}
                      disabled={actionLoading}
                      onChange={e => {
                        const val = e.target.value.replace(/\D/g, '');
                        setOtp(val);
                        if (val.length === 6 && !actionLoading) {
                          setActionLoading(true);
                          setError("");
                          verifyOTP(val)
                            .catch((err: any) => {
                              const msg = err.message || "";
                              const code = err.code || "";
                              if (code === 'auth/invalid-verification-code' || msg.includes('invalid-verification-code') || code === 'auth/code-expired' || msg.includes('code-expired')) {
                                setError(lang === 'Hindi' ? "कृपया सही ओटीपी दर्ज करें" : "Please enter correct OTP");
                              } else {
                                setError(lang === 'Hindi' ? "कृपया सही ओटीपी दर्ज करें" : "Please enter correct OTP");
                              }
                            })
                            .finally(() => setActionLoading(false));
                        }
                      }}
                      className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10 disabled:cursor-not-allowed"
                      autoFocus
                      required
                      placeholder="123456"
                    />
                  </div>

                  {error && <p className="text-rose-400 text-xs font-semibold text-center">{error}</p>}
                  
                  <button type="submit" disabled={actionLoading || otp.length < 6} className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-white rounded-2xl font-black text-sm uppercase tracking-wider transition-all shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/35 active:scale-[0.98] disabled:opacity-50 cursor-pointer">
                    {actionLoading ? <Loader2 className="animate-spin mx-auto" size={18} /> : t("auth.verify")}
                  </button>
                  
                  <div className="text-center">
                    <button type="button" disabled={actionLoading} onClick={() => { setStep('phone'); setOtp(''); setError(''); }} className="text-[10px] font-black uppercase tracking-widest text-bento-text-muted hover:text-bento-text-main transition-colors disabled:opacity-50">
                      {t("auth.resendOrEdit")}
                    </button>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Showcase Features Bento Grid */}
      <div className="relative z-10 w-full max-w-5xl px-4 md:px-8">
        <div className="text-center mb-8">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400/80 mb-2 block">{t("Hindi") === "Hindi" ? "सुविधाएँ" : "Core Capabilities"}</span>
          <h2 className="text-2xl md:text-3xl font-serif font-black text-bento-text-main tracking-tight">{t("Hindi") === "Hindi" ? "कृषि के लिए बुद्धिमान उपकरण" : "Intelligent Tools for Modern Farming"}</h2>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="grid md:grid-cols-3 gap-6"
        >
          {[
            {
              type: "advisor",
              icon: MessageSquare,
              title: t("feature.advisor.title"),
              desc: t("feature.advisor.desc"),
              gradient: "from-emerald-400 to-green-700",
              glow: "shadow-emerald-500/10 hover:shadow-emerald-500/20",
              accent: "border-emerald-500/10 hover:border-emerald-500/30",
              badge: t("Hindi") === "Hindi" ? "वॉयस और चैट" : "Voice & Chat"
            },
            {
              type: "disease",
              icon: Camera,
              title: t("feature.disease.title"),
              desc: t("feature.disease.desc"),
              gradient: "from-rose-400 to-rose-700",
              glow: "shadow-rose-500/10 hover:shadow-rose-500/20",
              accent: "border-rose-500/10 hover:border-rose-500/30",
              badge: t("Hindi") === "Hindi" ? "एआई विजन" : "AI Vision"
            },
            {
              type: "plots",
              icon: Compass,
              title: t("feature.plots.title"),
              desc: t("feature.plots.desc"),
              gradient: "from-teal-400 to-teal-700",
              glow: "shadow-teal-500/10 hover:shadow-teal-500/20",
              accent: "border-teal-500/10 hover:border-teal-500/30",
              badge: t("Hindi") === "Hindi" ? "स्मार्ट मैपिंग" : "Smart Mapping"
            },
          ].map((card, i) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.65 + i * 0.1 }}
              onClick={() => setActivePreview(card.type as any)}
              className={`glass-panel rounded-[2rem] p-6 hover:-translate-y-2 transition-all duration-300 cursor-pointer flex flex-col justify-between ${card.accent} shadow-lg ${card.glow} relative group overflow-hidden`}
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-white/5 to-transparent rounded-bl-3xl pointer-events-none" />
              <div>
                <div className="flex justify-between items-start mb-5">
                  <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${card.gradient} flex items-center justify-center shadow-lg transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3`}>
                    <card.icon size={22} className="text-white" />
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-wider bg-[var(--bg-input)] border border-[var(--border-input)] px-2.5 py-1 rounded-lg text-bento-text-muted">
                    {card.badge}
                  </span>
                </div>
                <h3 className="text-base font-black text-bento-text-main mb-2 tracking-tight">{card.title}</h3>
                <p className="text-xs text-bento-text-muted leading-relaxed font-semibold">{card.desc}</p>
              </div>

              {/* Click call-to-action */}
              <div className="mt-5 flex justify-between items-center pt-3 border-t border-[var(--border-input)] z-10">
                <span className="text-[10px] font-bold text-emerald-400 group-hover:underline">
                  {lang === "Hindi" ? "डेमो चलाएं →" : "Try Demo →"}
                </span>
                <span className="text-[8px] font-black uppercase tracking-widest text-bento-text-muted">
                  {lang === "Hindi" ? "लाइव टेस्ट" : "Live Sandbox"}
                </span>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* Simulation Overlays */}
      <AnimatePresence>
        {activePreview === 'advisor' && (
          <AdvisorSimulator lang={lang} onClose={() => setActivePreview(null)} />
        )}
        {activePreview === 'disease' && (
          <ScannerSimulator lang={lang} onClose={() => setActivePreview(null)} />
        )}
        {activePreview === 'plots' && (
          <PlotsSimulator lang={lang} onClose={() => setActivePreview(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Root ──────────────────────────────────────────────────── */
export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <WeatherProvider>
            <MainWrapper />
          </WeatherProvider>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}

function MainWrapper() {
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

  return user ? <AuthenticatedApp /> : <Landing />;
}
