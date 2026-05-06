import { AuthProvider, useAuth } from "./lib/AuthContext";
import { WeatherProvider } from "./lib/WeatherContext";
import { useState, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Sprout, 
  MessageSquare, 
  Camera, 
  User as UserIcon, 
  ChevronRight,
  Loader2,
  Leaf,
  MapPin,
  BookOpen,
  Database,
  Mic,
  FlaskConical,
  Compass,
  Smartphone,
  CheckCircle2,
  Activity
} from "lucide-react";

// Components
import FarmingAdvisor from "./components/FarmingAdvisor";
import NotificationManager from "./components/NotificationManager";
const DiseaseScanner = lazy(() => import("./components/DiseaseScanner"));
const Profile = lazy(() => import("./components/Profile"));
const WeatherWidget = lazy(() => import("./components/WeatherWidget"));
const WeatherAdvisoryBanner = lazy(() => import("./components/WeatherAdvisoryBanner"));
const LiveVoiceAdvisor = lazy(() => import("./components/LiveVoiceAdvisor"));
const FieldManager = lazy(() => import("./components/FieldManager"));
const TaskManager = lazy(() => import("./components/TaskManager"));
const MarketDashboard = lazy(() => import("./components/MarketDashboard"));

function AuthenticatedApp() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'advisor' | 'disease' | 'profile' | 'voice' | 'fields' | 'tasks' | 'market'>('advisor');

  return (
    <div className="h-screen h-[100dvh] bg-bento-bg text-bento-text-main flex flex-col overflow-hidden">
      <NotificationManager />
      
      {/* App Header */}
      <header className="h-[60px] md:h-[72px] px-4 md:px-8 flex justify-between items-center glass-nav sticky top-0 z-[60]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-bento-primary to-bento-accent flex items-center justify-center text-white shadow-lg shadow-bento-primary/20">
            <Leaf size={18} />
          </div>
          <div className="text-xl md:text-2xl font-serif font-bold text-bento-primary tracking-tight">AgroAid AI</div>
        </div>
        
        <div className="flex items-center gap-2 md:gap-6">
          <Suspense fallback={<div className="w-10 h-10 bg-zinc-100 rounded-full animate-pulse" />}>
            <WeatherWidget />
          </Suspense>
        </div>
      </header>

      {/* Live Climate Monitoring Message */}
      <Suspense fallback={null}>
        <WeatherAdvisoryBanner />
      </Suspense>

      {/* Main Container */}
      <div className="flex-1 relative flex flex-col-reverse md:flex-row overflow-hidden">
        {/* Navigation Rail */}
        <nav className="shrink-0 glass-panel border-t border-white/50 px-2 md:px-3 py-2 md:py-0 flex justify-around md:relative md:w-[104px] md:flex-col md:border-r md:border-t-0 md:pt-8 pb-safe md:pb-0 gap-1 md:gap-3 overflow-x-auto scrollbar-hide z-[55] relative shadow-[0_-10px_40px_rgba(18,53,36,0.04)] md:shadow-[10px_0_40px_rgba(18,53,36,0.04)]">
          <NavButton active={activeTab === 'advisor'} onClick={() => setActiveTab('advisor')} icon={<MessageSquare size={20} className="md:w-[22px] md:h-[22px]" />} label="Advise" colorClass="bg-gradient-to-br from-[#123524] to-[#3e7b27]" />
          <NavButton active={activeTab === 'disease'} onClick={() => setActiveTab('disease')} icon={<Camera size={20} className="md:w-[22px] md:h-[22px]" />} label="Health" colorClass="bg-gradient-to-br from-rose-600 to-rose-800" />
          <NavButton active={activeTab === 'fields'} onClick={() => setActiveTab('fields')} icon={<Compass size={20} className="md:w-[22px] md:h-[22px]" />} label="Plots" colorClass="bg-gradient-to-br from-teal-600 to-teal-800" />
          <NavButton active={activeTab === 'tasks'} onClick={() => setActiveTab('tasks')} icon={<CheckCircle2 size={20} className="md:w-[22px] md:h-[22px]" />} label="Tasks" colorClass="bg-gradient-to-br from-amber-500 to-amber-700" />
          <NavButton active={activeTab === 'market'} onClick={() => setActiveTab('market')} icon={<Activity size={20} className="md:w-[22px] md:h-[22px]" />} label="Market" colorClass="bg-gradient-to-br from-emerald-500 to-emerald-700" />
          <NavButton active={activeTab === 'voice'} onClick={() => setActiveTab('voice')} icon={<Mic size={20} className="md:w-[22px] md:h-[22px]" />} label="Voice" colorClass="bg-gradient-to-br from-zinc-700 to-zinc-900" />
          <NavButton active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} icon={<UserIcon size={20} className="md:w-[22px] md:h-[22px]" />} label="Profile" colorClass="bg-gradient-to-br from-[#3e7b27] to-[#123524]" />
        </nav>

        {/* Content Area */}
        <main className="flex-1 overflow-hidden bg-bento-bg">
          <div className="max-w-7xl mx-auto h-full relative">
            <div className={`h-full transition-opacity duration-300 ${activeTab === 'advisor' ? 'opacity-100 relative z-10' : 'opacity-0 absolute inset-0 pointer-events-none -z-10'}`}>
              <FarmingAdvisor isActive={activeTab === 'advisor'} />
            </div>
            
            <Suspense fallback={
              <div className="h-full flex items-center justify-center">
                <Loader2 className="animate-spin text-bento-primary" size={32} />
              </div>
            }>
              {activeTab === 'disease' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full overflow-y-auto p-2 md:p-4"><DiseaseScanner /></motion.div>
              )}
              {activeTab === 'profile' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full overflow-y-auto p-2 md:p-4"><Profile /></motion.div>
              )}
              {activeTab === 'fields' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full overflow-y-auto p-2 md:p-4"><FieldManager /></motion.div>
              )}
              {activeTab === 'tasks' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full overflow-y-auto p-2 md:p-4"><TaskManager /></motion.div>
              )}
              {activeTab === 'market' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full overflow-y-auto p-2 md:p-4"><MarketDashboard /></motion.div>
              )}
              {activeTab === 'voice' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full overflow-y-auto p-2 md:p-4"><LiveVoiceAdvisor /></motion.div>
              )}
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}

function NavButton({ active, onClick, icon, label, colorClass }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string, colorClass: string }) {
  return (
    <button 
      onClick={onClick}
      className={`group relative flex flex-col items-center justify-center flex-1 py-2.5 md:py-4 transition-all duration-300 rounded-2xl md:rounded-[24px] md:mb-1 ${active ? `bg-white md:${colorClass} md:text-white shadow-[0_8px_24px_rgba(18,53,36,0.12)] md:shadow-lg scale-105 z-10` : 'text-bento-text-muted hover:bg-white/60 hover:-translate-y-0.5'}`}
    >
      <div className={`p-1.5 transition-colors duration-300 ${active ? (label === 'Health' ? 'text-rose-600 md:text-inherit' : label === 'Plots' ? 'text-teal-600 md:text-inherit' : label === 'Tasks' ? 'text-amber-600 md:text-inherit' : label === 'Market' ? 'text-emerald-600 md:text-inherit' : label === 'Voice' ? 'text-zinc-800 md:text-inherit' : label === 'Profile' ? 'text-[#3e7b27] md:text-inherit' : 'text-bento-primary md:text-inherit') : 'group-hover:text-bento-primary'}`}>
        {icon}
      </div>
      <span className={`text-[10px] md:text-xs mt-0.5 font-bold tracking-wide transition-colors ${active ? 'text-bento-text-main md:text-white' : 'text-bento-text-muted opacity-80 group-hover:opacity-100 group-hover:text-bento-text-main'}`}>{label}</span>
      {active && <motion.div layoutId="nav-glow" className="absolute -bottom-1.5 md:hidden w-1.5 h-1.5 bg-current rounded-full" />}
    </button>
  );
}

function Landing() {
  const { login, sendOTP, verifyOTP, loading } = useAuth();
  const [lang, setLang] = useState(localStorage.getItem('preferredLanguage') || "Hindi");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<'method' | 'phone' | 'otp'>('method');
  const [error, setError] = useState("");

  const selectLang = (l: string) => {
    setLang(l);
    localStorage.setItem('preferredLanguage', l);
  };

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      // Ensure phone starts with +
      let formattedPhone = phone.trim();
      if (!formattedPhone.startsWith('+')) {
        // Simple heuristic: if length is 10, assume +91. Otherwise, warn.
        if (formattedPhone.length === 10) {
          formattedPhone = '+91' + formattedPhone;
        } else {
          setError("Please include your country code (e.g., +919998887770)");
          return;
        }
      }
      await sendOTP(formattedPhone);
      setStep('otp');
    } catch (err: any) {
      const msg = err.message || "";
      if (msg.includes('auth/operation-not-allowed') || msg.includes('region enabled')) {
        setError("Phone Login is currently unavailable for your region or not enabled in Firebase. Please use 'Continue with Google' instead.");
      } else if (msg.includes('auth/billing-not-enabled')) {
        setError("The daily SMS quota for this app has been reached. Please use 'Continue with Google' for now.");
      } else if (msg.includes('too-many-requests') || msg.includes('auth/too-many-requests')) {
        setError("Too many attempts. Please wait a few minutes and try again, or use Google Login.");
      } else {
        setError(msg || "Failed to send OTP");
      }
      console.error("OTP Send Failure:", err);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await verifyOTP(otp);
    } catch (err: any) {
      setError(err.message || "Invalid OTP");
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f8f5] flex flex-col items-center py-12 px-6 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] overflow-y-auto relative">
      <div className="absolute top-0 left-0 right-0 h-[50vh] bg-gradient-to-b from-[#eaf1ea] to-transparent -z-10" />
      <div className="absolute -top-40 -right-40 w-96 h-96 bg-[#c2dac2] rounded-full blur-[100px] opacity-40 -z-10" />
      <div className="absolute top-40 -left-40 w-72 h-72 bg-[#fbe7a1] rounded-full blur-[100px] opacity-30 -z-10" />

      <div className="mb-10 text-center relative z-10">
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", bounce: 0.5 }}
          className="w-24 h-24 bg-gradient-to-br from-[#123524] to-[#3e7b27] rounded-[2rem] flex items-center justify-center text-white mx-auto mb-6 shadow-2xl shadow-[#3e7b27]/30 border border-white/20 relative"
        >
          <Leaf size={48} />
          <div className="absolute inset-0 bg-white/20 rounded-[2rem] blur-xl -z-10"></div>
        </motion.div>
        <h1 className="text-4xl md:text-6xl font-serif font-bold text-[#0c1811] mb-5 tracking-tight">AgroAid AI</h1>
        <p className="text-lg md:text-xl text-[#5e7264] max-w-md mx-auto leading-relaxed font-medium">
          {lang === 'Hindi' 
            ? "किसानों को AI-संचालित जानकारी और सीधे बाज़ार से सशक्त बनाना।" 
            : "Empowering farmers with AI-driven insights and precision agriculture tools."}
        </p>
      </div>

      <div className="flex bg-white/50 backdrop-blur-md p-1.5 rounded-full shadow-sm mb-10 border border-white/60 relative z-10">
        <button 
          onClick={() => selectLang('Hindi')}
          className={`px-8 py-2.5 rounded-full font-bold transition-all duration-300 ${lang === 'Hindi' ? 'bg-[#123524] text-white shadow-lg' : 'text-[#5e7264] hover:text-[#123524]'}`}
        >
          हिन्दी
        </button>
        <button 
          onClick={() => selectLang('English')}
          className={`px-8 py-2.5 rounded-full font-bold transition-all duration-300 ${lang === 'English' ? 'bg-[#123524] text-white shadow-lg' : 'text-[#5e7264] hover:text-[#123524]'}`}
        >
          English
        </button>
      </div>

      <div className="w-full max-w-md glass-panel p-8 md:p-10 rounded-[2.5rem] mb-16 relative z-10">
        <AnimatePresence mode="wait">
          {step === 'method' && (
            <motion.div 
              key="method"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-4"
            >
              <h2 className="text-2xl font-serif font-bold text-bento-primary mb-8 text-center">Sign in to your farm</h2>
              <button 
                onClick={() => login()}
                disabled={loading}
                className="w-full px-8 py-4 bg-gradient-to-br from-[#0c1811] to-[#123524] text-white rounded-2xl font-bold hover:-translate-y-0.5 hover:shadow-xl transition-all duration-300 flex items-center justify-center gap-4 active:scale-[0.98] disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin" /> : <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5 bg-white p-0.5 rounded-full" alt=""/>}
                <span>Continue with Google</span>
              </button>

              <div className="relative flex items-center py-5">
                <div className="flex-grow border-t border-[#c2dac2]"></div>
                <span className="flex-shrink mx-4 text-[#8b997c] text-xs font-black uppercase tracking-widest">or</span>
                <div className="flex-grow border-t border-[#c2dac2]"></div>
              </div>

              <button 
                onClick={() => setStep('phone')}
                className="w-full px-8 py-4 bg-white/80 border border-[#c2dac2] text-bento-text-main rounded-2xl font-bold hover:bg-white hover:shadow-md transition-all duration-300 flex items-center justify-center gap-3 active:scale-[0.98]"
              >
                <Smartphone size={20} className="text-[#3e7b27]" />
                <span>Continue with Phone</span>
              </button>
            </motion.div>
          )}

          {step === 'phone' && (
            <motion.div 
              key="phone"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <h2 className="text-xl font-black text-zinc-800 mb-2">Enter Mobile Number</h2>
              <p className="text-xs text-zinc-400 mb-6 font-bold uppercase tracking-widest">We'll send you a verification code</p>
              
              <form onSubmit={handleSendOTP} className="space-y-4">
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 font-bold">+91</span>
                  <input 
                    type="tel"
                    placeholder="9998887770"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl pl-14 pr-4 py-4 focus:border-teal-500 outline-none font-bold text-lg"
                    required
                  />
                </div>
                {error && <p className="text-rose-500 text-xs font-bold">{error}</p>}
                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 bg-teal-600 text-white rounded-2xl font-black hover:bg-teal-700 transition-all shadow-lg shadow-teal-600/20 active:scale-[0.98] disabled:opacity-50"
                >
                  {loading ? <Loader2 className="animate-spin mx-auto" /> : "Send OTP"}
                </button>
                <button 
                  type="button"
                  onClick={() => setStep('method')}
                  className="w-full text-xs font-black text-zinc-400 uppercase tracking-widest hover:text-zinc-600 transition-colors"
                >
                  Back
                </button>
              </form>
            </motion.div>
          )}

          {step === 'otp' && (
            <motion.div 
              key="otp"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <h2 className="text-xl font-black text-zinc-800 mb-2">Verify OTP</h2>
              <p className="text-xs text-zinc-400 mb-6 font-bold uppercase tracking-widest">Enter the 6-digit code sent to your phone</p>
              
              <form onSubmit={handleVerifyOTP} className="space-y-4">
                <input 
                  type="text"
                  placeholder="123456"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-4 py-4 focus:border-teal-500 outline-none font-bold text-center text-2xl tracking-[0.5em]"
                  required
                />
                {error && <p className="text-rose-500 text-xs font-bold">{error}</p>}
                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 bg-teal-600 text-white rounded-2xl font-black hover:bg-teal-700 transition-all shadow-lg shadow-teal-600/20 active:scale-[0.98] disabled:opacity-50"
                >
                  {loading ? <Loader2 className="animate-spin mx-auto" /> : "Verify & Sign In"}
                </button>
                <button 
                  type="button"
                  onClick={() => setStep('phone')}
                  className="w-full text-xs font-black text-zinc-400 uppercase tracking-widest hover:text-zinc-600 transition-colors"
                >
                  Resend or Edit Number
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="grid md:grid-cols-3 gap-6 max-w-5xl w-full relative z-10 px-4 md:px-0">
        <FeatureCard 
          icon={<MessageSquare className="text-white" />} 
          title="Smart Advisor" 
          desc="Get crop suggestions based on your soil and location."
          colorClass="bg-[#3e7b27]" 
        />
        <FeatureCard 
          icon={<Camera className="text-white" />} 
          title="Disease Scanner" 
          desc="Identify plant diseases instantly with AI vision."
          colorClass="bg-rose-600" 
        />
        <FeatureCard 
          icon={<Compass className="text-white" />} 
          title="Plot Manager" 
          desc="Map your fields and track specific plot activities."
          colorClass="bg-teal-600" 
        />
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, desc, colorClass }: { icon: React.ReactNode, title: string, desc: string, colorClass: string }) {
  return (
    <div className="glass-panel p-8 rounded-[2rem] hover:shadow-[0_20px_40px_rgba(18,53,36,0.08)] transition-all duration-300 hover:-translate-y-1 group">
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 shadow-lg ${colorClass} transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3`}>
        {icon}
      </div>
      <h3 className="text-xl font-serif font-bold mb-3 text-[#123524]">{title}</h3>
      <p className="text-[15px] text-[#5e7264] leading-relaxed">{desc}</p>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <WeatherProvider>
        <MainWrapper />
      </WeatherProvider>
    </AuthProvider>
  );
}

function MainWrapper() {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen bg-[#fbfbf8] flex items-center justify-center">
        <Loader2 className="animate-spin text-[#5d8d49]" size={40} />
      </div>
    );
  }

  return user ? <AuthenticatedApp /> : <Landing />;
}

