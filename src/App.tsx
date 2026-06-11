import { AuthProvider, useAuth } from "./lib/AuthContext";
import { WeatherProvider } from "./lib/WeatherContext";
import { ThemeProvider } from "./lib/ThemeContext";
import { LanguageProvider, useLanguage } from "./lib/LanguageContext";
import { useState, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  MessageSquare, Camera, User as UserIcon, Loader2, Leaf,
  Compass, CheckCircle2, Activity, Smartphone,
} from "lucide-react";
import ThemeToggle from "./components/ThemeToggle";
import LanguageToggle from "./components/LanguageToggle";
import NotificationManager from "./components/NotificationManager";
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

  return (
    <div className="h-screen h-[100dvh] flex flex-col overflow-hidden relative" style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-main)' }}>
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
              onClick={() => setActiveTab(item.id)}
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

  const selectLang = (l: 'English'|'Hindi') => { setLang(l); setLanguage(l); };

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    try {
      let fp = phone.trim();
      if (!fp.startsWith('+')) {
        if (fp.length === 10) fp = '+91' + fp;
        else { setError("Please include your country code (e.g., +919998887770)"); return; }
      }
      await sendOTP(fp); setStep('otp');
    } catch (err: any) {
      const msg = err.message || "";
      if (msg.includes('operation-not-allowed') || msg.includes('region enabled'))
        setError("Phone Login unavailable for your region. Please use Google Sign‑in.");
      else if (msg.includes('billing-not-enabled'))
        setError("Daily SMS quota reached. Please use Google Sign‑in.");
      else if (msg.includes('too-many-requests'))
        setError("Too many attempts. Wait a few minutes or use Google Login.");
      else setError(msg || "Failed to send OTP");
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    try { await verifyOTP(otp); }
    catch (err: any) { setError(err.message || "Invalid OTP"); }
  };

  return (
    <div className="min-h-screen flex flex-col items-center overflow-y-auto relative" style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-main)' }}>
      {/* Grid pattern */}
      <div className="fixed inset-0 bg-grid pointer-events-none" />

      {/* Ambient orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-15%] left-[25%] w-[650px] h-[650px] bg-emerald-500/7 rounded-full blur-[130px] animate-glow-ring" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[450px] h-[450px] bg-amber-500/5 rounded-full blur-[110px]" />
        <div className="absolute top-[50%] left-[-8%] w-[300px] h-[300px] bg-emerald-700/5 rounded-full blur-[80px]" />
      </div>

      {/* Top bar */}
      <div className="relative z-10 w-full glass-nav border-b border-emerald-500/10 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-400 to-green-700 flex items-center justify-center shadow-md shadow-emerald-500/25">
            <Leaf size={14} className="text-white" />
          </div>
          <span className="font-serif font-bold text-[16px] text-bento-text-main">
            Agro<span className="text-gradient-green">Aid</span> AI
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_4px_rgba(34,197,94,0.8)]" />
            {lang === 'Hindi' ? 'Gemini AI द्वारा · लाइव डेटा' : 'Powered by Gemini AI · Live Data'}
          </div>
          <LanguageToggle variant="pill" />
          <ThemeToggle variant="pill" />
        </div>
      </div>

      {/* Hero */}
      <div className="relative z-10 flex flex-col items-center pt-14 md:pt-20 pb-10 px-6 text-center">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", bounce: 0.45, duration: 0.9 }}
          className="relative mb-8"
        >
          <div className="absolute inset-0 bg-emerald-500/18 rounded-[2.5rem] blur-3xl scale-[1.6] animate-glow-ring" />
          <div className="relative w-24 h-24 bg-gradient-to-br from-emerald-400 via-green-500 to-green-800 rounded-[2rem] flex items-center justify-center border border-emerald-400/20 shadow-2xl shadow-emerald-500/30">
            <Leaf size={46} className="text-white drop-shadow-lg" />
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.6 }}>
          <h1 className="text-5xl md:text-7xl font-serif font-extrabold tracking-tight leading-none mb-4">
            <span className="text-bento-text-main">Agro</span>
            <span className="text-gradient-green">Aid</span>
            <span className="text-bento-text-main"> AI</span>
          </h1>
          <p className="text-base md:text-lg text-bento-text-muted max-w-md mx-auto leading-relaxed font-medium">
            {t("landing.subtitle")}
          </p>
        </motion.div>
      </div>

      {/* Language toggle */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="relative z-10 mb-7">
        <div className="flex p-1 rounded-full gap-1 border" style={{ background: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
          {(['Hindi', 'English'] as const).map(l => (
            <button
              key={l}
              onClick={() => selectLang(l)}
              className={`px-6 py-2 rounded-full text-sm font-bold transition-all duration-300 ${
                lang === l
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                  : 'hover:text-emerald-400'
              }`}
              style={lang !== l ? { color: 'var(--text-muted)' } : undefined}
            >
              {l === 'Hindi' ? 'हिन्दी' : 'English'}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Auth card */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.5 }}
        className="relative z-10 w-full max-w-md px-4 mb-14"
      >
        <div className="glass-panel rounded-[2rem] p-8 md:p-10">
          <AnimatePresence mode="wait">

            {step === 'method' && (
              <motion.div key="method" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} className="space-y-4">
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-bold text-bento-text-main">{t("auth.title")}</h2>
                  <p className="text-sm text-bento-text-muted mt-1.5">{t("auth.subtitle")}</p>
                </div>

                <button
                  onClick={() => login()}
                  disabled={loading}
                  className="w-full px-6 py-4 bg-emerald-500 hover:bg-emerald-400 text-white rounded-2xl font-bold transition-all duration-300 flex items-center justify-center gap-3 shadow-xl shadow-emerald-500/25 hover:shadow-emerald-500/35 hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50"
                >
                  {loading
                    ? <Loader2 className="animate-spin" size={20} />
                    : <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5 bg-white p-0.5 rounded-full" alt="" />}
                  <span>{t("auth.google")}</span>
                </button>

                <div className="relative flex items-center py-4">
                  <div className="flex-grow border-t" style={{ borderColor: 'var(--border-input)' }} />
                  <span className="mx-4 text-[11px] font-bold uppercase tracking-widest text-bento-text-muted">{t("common.or")}</span>
                  <div className="flex-grow border-t" style={{ borderColor: 'var(--border-input)' }} />
                </div>

                <button
                  onClick={() => setStep('phone')}
                  className="w-full px-6 py-4 bg-[var(--bg-input)] border border-[var(--border-input)] text-bento-text-main rounded-2xl font-bold hover:bg-[var(--bg-hover)] hover:border-emerald-500/25 transition-all duration-300 flex items-center justify-center gap-3 active:scale-[0.98]"
                >
                  <Smartphone size={20} className="text-emerald-400" />
                  <span>{t("auth.phone")}</span>
                </button>
              </motion.div>
            )}

            {step === 'phone' && (
              <motion.div key="phone" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}>
                <h2 className="text-xl font-bold text-bento-text-main mb-1">{t("auth.enterPhone")}</h2>
                <p className="text-[11px] text-bento-text-muted mb-6 uppercase tracking-widest font-semibold">{t("auth.otpHint")}</p>
                <form onSubmit={handleSendOTP} className="space-y-4">
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-bento-text-muted font-bold text-sm">+91</span>
                    <input
                      type="tel" placeholder="9998887770" value={phone}
                      onChange={e => setPhone(e.target.value)}
                      className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-2xl pl-14 pr-4 py-4 text-lg font-bold text-bento-text-main placeholder:text-bento-text-muted/40 focus:border-emerald-500/40 focus:bg-[var(--bg-hover)] outline-none transition-all"
                      required
                    />
                  </div>
                  {error && <p className="text-rose-400 text-xs font-semibold">{error}</p>}
                  <button type="submit" disabled={loading} className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-white rounded-2xl font-bold transition-all shadow-lg shadow-emerald-500/25 active:scale-[0.98] disabled:opacity-50">
                    {loading ? <Loader2 className="animate-spin mx-auto" size={20} /> : t("auth.sendOTP")}
                  </button>
                  <button type="button" onClick={() => setStep('method')} className="w-full text-[11px] font-semibold text-bento-text-muted uppercase tracking-widest hover:text-bento-text-main transition-colors">
                    {t("auth.back")}
                  </button>
                </form>
              </motion.div>
            )}

            {step === 'otp' && (
              <motion.div key="otp" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}>
                <h2 className="text-xl font-bold text-bento-text-main mb-1">{t("auth.verifyOtp")}</h2>
                <p className="text-[11px] text-bento-text-muted mb-6 uppercase tracking-widest font-semibold">{t("auth.otpCodeHint")}</p>
                <form onSubmit={handleVerifyOTP} className="space-y-4">
                  <input
                    type="text" placeholder="123456" maxLength={6} value={otp}
                    onChange={e => setOtp(e.target.value)}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-2xl px-4 py-4 text-2xl font-bold text-center tracking-[0.5em] text-bento-text-main placeholder:text-bento-text-muted/30 focus:border-emerald-500/40 outline-none transition-all"
                    required
                  />
                  {error && <p className="text-rose-400 text-xs font-semibold">{error}</p>}
                  <button type="submit" disabled={loading} className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-white rounded-2xl font-bold transition-all shadow-lg shadow-emerald-500/25 active:scale-[0.98] disabled:opacity-50">
                    {loading ? <Loader2 className="animate-spin mx-auto" size={20} /> : t("auth.verify")}
                  </button>
                  <button type="button" onClick={() => setStep('phone')} className="w-full text-[11px] font-semibold text-bento-text-muted uppercase tracking-widest hover:text-bento-text-main transition-colors">
                    {t("auth.resendOrEdit")}
                  </button>
                </form>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </motion.div>

      {/* Feature cards */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
        className="relative z-10 w-full max-w-5xl px-4 md:px-8 pb-16 grid md:grid-cols-3 gap-4"
      >
        {[
          { icon: MessageSquare, title: t("feature.advisor.title"), desc: t("feature.advisor.desc"), gradient: "from-emerald-500 to-green-700",  shadow: "shadow-emerald-500/20" },
          { icon: Camera,        title: t("feature.disease.title"), desc: t("feature.disease.desc"), gradient: "from-rose-500 to-rose-700",     shadow: "shadow-rose-500/20"    },
          { icon: Compass,       title: t("feature.plots.title"),   desc: t("feature.plots.desc"),   gradient: "from-teal-500 to-teal-700",     shadow: "shadow-teal-500/20"    },
        ].map((card, i) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.75 + i * 0.1 }}
            className="glass-panel rounded-[1.75rem] p-6 group hover:-translate-y-1.5 transition-all duration-300 hover:border-emerald-500/22 cursor-default"
          >
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${card.gradient} flex items-center justify-center mb-4 shadow-lg ${card.shadow} transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3`}>
              <card.icon size={22} className="text-white" />
            </div>
            <h3 className="text-base font-bold text-bento-text-main mb-2">{card.title}</h3>
            <p className="text-sm text-bento-text-muted leading-relaxed">{card.desc}</p>
          </motion.div>
        ))}
      </motion.div>
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
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-base)' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-green-700 flex items-center justify-center shadow-2xl shadow-emerald-500/30">
              <Leaf size={32} className="text-white" />
            </div>
            <div className="absolute inset-0 rounded-2xl border-2 border-emerald-500/30 animate-ping" />
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>{t("app.loading")}</p>
        </div>
      </div>
    );
  }

  return user ? <AuthenticatedApp /> : <Landing />;
}
