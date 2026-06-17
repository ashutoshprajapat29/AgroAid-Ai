import { useState, useEffect } from "react";
import { useAuth } from "../lib/AuthContext";
import { User, Mail, ShieldCheck, Save, Loader2, LogOut, Globe, Layers, Palette } from "lucide-react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { handleFirestoreError, OperationType } from "../lib/firebaseUtils";
import { motion, AnimatePresence } from "motion/react";
import ThemeToggle from "./ThemeToggle";
import { useLanguage } from "../lib/LanguageContext";

export default function Profile() {
  const { user, profile, updateProfile, logout } = useAuth();
  const { t, setLanguage } = useLanguage();
  const [formData, setFormData] = useState({
    displayName: profile?.displayName || "",
    preferredLanguage: profile?.preferredLanguage || "English"
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [stats, setStats] = useState({ plots: 0, reports: 0 });

  useEffect(() => {
    if (profile) {
      setFormData({
        displayName: profile.displayName || "",
        preferredLanguage: profile.preferredLanguage || "English"
      });
    }
  }, [profile]);

  useEffect(() => {
    async function fetchStats() {
      if (!user) return;
      try {
        const fieldsSnap = await getDocs(collection(db, "users", user.uid, "fields"));
        const reportsSnap = await getDocs(collection(db, "users", user.uid, "soil_reports"));
        setStats({ plots: fieldsSnap.size, reports: reportsSnap.size });
      } catch (err) { 
        handleFirestoreError(err, OperationType.GET, `users/${user.uid}/fields`); 
      }
    }
    fetchStats();
  }, [user]);

  const languages = ["English", "Hindi"];

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setSuccess(false);
    try {
      await updateProfile(formData);
      // Sync language context with profile preference
      if (formData.preferredLanguage === 'Hindi' || formData.preferredLanguage === 'English') {
        setLanguage(formData.preferredLanguage as 'Hindi' | 'English');
      }
      setSuccess(true); setTimeout(() => setSuccess(false), 3000);
    }
    catch { /* handled */ }
    finally { setLoading(false); }
  };

  return (
    <div className="max-w-6xl mx-auto px-1 pb-24 md:pb-12">
      {/* Page Title & Subtitle */}
      <div className="mb-6 md:mb-8 text-left">
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-bento-text-main">
          {t("profile.title")}
        </h1>
        <p className="text-xs md:text-sm font-semibold text-bento-text-muted mt-1 uppercase tracking-wider">
          {t("profile.subtitle")}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Identity & Impact Stats */}
        <div className="lg:col-span-5 space-y-6">
          {/* Identity card */}
          <div className="rounded-[2rem] p-8 relative overflow-hidden flex flex-col items-center text-center bg-gradient-to-br from-[#061408] via-[#091b0c] to-[#0a200f] border border-emerald-500/18 shadow-2xl">
            {/* Elegant glass blobs for depth */}
            <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 rounded-full -mr-20 -mt-20 blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-36 h-36 bg-amber-500/5 rounded-full -ml-16 -mb-16 blur-2xl pointer-events-none" />

            {/* Profile Avatar */}
            <div className="relative mb-5">
              {profile?.photoURL ? (
                <img 
                  src={profile.photoURL} 
                  alt={profile.displayName} 
                  referrerPolicy="no-referrer"
                  className="w-24 h-24 md:w-28 md:h-28 rounded-[2rem] border-2 border-emerald-500/30 shadow-2xl object-cover" 
                />
              ) : (
                <div className="w-24 h-24 md:w-28 md:h-28 rounded-[2rem] bg-emerald-500/15 border-2 border-emerald-500/30 flex items-center justify-center shadow-inner">
                  <User size={42} className="text-emerald-400" />
                </div>
              )}
              <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/40 border-2 border-[#091b0c]">
                <ShieldCheck size={16} className="text-white" />
              </div>
            </div>

            {/* Profile Info */}
            <div className="space-y-2.5 w-full">
              <div className="flex justify-center items-center gap-2 flex-wrap">
                <span className="text-[9px] font-black uppercase tracking-widest bg-emerald-500/15 text-emerald-400 px-3.5 py-1 rounded-full border border-emerald-500/25">
                  {t("profile.verified_farmer")}
                </span>
                <span 
                  className="text-[9px] font-black uppercase tracking-widest text-bento-text-muted px-3.5 py-1 rounded-full border flex items-center gap-1.5" 
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border-input)' }}
                >
                  <Globe size={11} className="text-emerald-400" /> {formData.preferredLanguage}
                </span>
              </div>
              <h2 className="text-2xl font-extrabold tracking-tight text-white">
                {profile?.displayName || t("profile.guardian")}
              </h2>
              <p className="text-emerald-400/70 font-semibold flex items-center justify-center gap-2 text-xs truncate max-w-full">
                <Mail size={13} className="shrink-0" />
                {profile?.email}
              </p>
            </div>
          </div>

          {/* Stats & Quote */}
          <div className="glass-panel rounded-[2rem] p-7 md:p-8 flex flex-col justify-between shadow-lg border border-[var(--border-card)]">
            <div>
              <h3 className="text-[10px] font-black uppercase tracking-widest text-bento-text-muted mb-6">
                {t("profile.impact")}
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: t("profile.mapped_plots"), value: stats.plots, icon: Layers, color: "emerald" },
                  { label: t("profile.health_audits"), value: stats.reports, icon: ShieldCheck, color: "indigo" },
                ].map(stat => (
                  <div key={stat.label} className="p-4 rounded-2xl bg-[var(--bg-input)] border border-[var(--border-input)] flex flex-col items-start gap-2.5 transition-all hover:translate-y-[-2px]">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                      stat.color === 'emerald' 
                        ? 'bg-emerald-500/12 text-emerald-400 border border-emerald-500/20' 
                        : 'bg-indigo-500/12 text-indigo-400 border border-indigo-500/20'
                    }`}>
                      <stat.icon size={18} />
                    </div>
                    <div>
                      <p className="text-2xl font-extrabold text-bento-text-main leading-none mb-1">{stat.value}</p>
                      <p className="text-[9px] font-black uppercase tracking-wider text-bento-text-muted leading-tight">{stat.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="mt-6 p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl italic text-[11px] font-bold text-bento-text-muted leading-relaxed text-center">
              "{t("profile.quote")}"
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Redesigned Settings Panel */}
        <form onSubmit={handleSave} className="lg:col-span-7 space-y-6">
          <div className="glass-panel rounded-[2rem] p-7 md:p-9 shadow-lg border border-[var(--border-card)] relative">
            <div className="flex items-center gap-3.5 mb-8">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center border" style={{ background: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
                <User size={20} className="text-emerald-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-bento-text-main">{t("profile.settings")}</h2>
                <p className="text-[10px] font-bold uppercase tracking-wider text-bento-text-muted">Configure Preferences</p>
              </div>
            </div>

            <div className="space-y-6">
              {/* Display Name Input */}
              <div className="space-y-2">
                <label className="block text-[10px] font-black uppercase tracking-widest text-bento-text-muted">
                  {t("profile.display_name")}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={formData.displayName}
                    onChange={e => setFormData({ ...formData, displayName: e.target.value })}
                    className="w-full theme-input rounded-2xl px-5 py-4 font-bold text-sm tracking-wide bg-[var(--bg-input)] border border-[var(--border-input)] text-bento-text-main focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"
                    placeholder="Enter display name…"
                  />
                </div>
              </div>

              {/* Language Dropdown Select */}
              <div className="space-y-2">
                <label className="block text-[10px] font-black uppercase tracking-widest text-bento-text-muted">
                  {t("profile.language")}
                </label>
                <div className="relative">
                  <select
                    value={formData.preferredLanguage}
                    onChange={e => setFormData({ ...formData, preferredLanguage: e.target.value })}
                    className="w-full theme-input rounded-2xl px-5 py-4 font-bold text-sm bg-[var(--bg-input)] border border-[var(--border-input)] text-bento-text-main appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"
                  >
                    {languages.map(l => (
                      <option key={l} value={l} className="bg-[var(--bg-surface)] text-bento-text-main font-bold">
                        {l}
                      </option>
                    ))}
                  </select>
                  <Globe size={18} className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-bento-text-muted" />
                </div>
              </div>

              {/* Theme / Appearance Preferences */}
              <div className="pt-5 border-t border-[var(--border-input)]">
                <label className="block text-[10px] font-black uppercase tracking-widest text-bento-text-muted mb-3.5">
                  {t("profile.appearance")}
                </label>
                <div className="flex items-center justify-between bg-[var(--bg-input)] border border-[var(--border-input)] rounded-2xl px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/20">
                      <Palette size={16} />
                    </div>
                    <span className="text-sm font-bold text-bento-text-main">
                      {t("profile.color_theme")}
                    </span>
                  </div>
                  <ThemeToggle variant="pill" />
                </div>
              </div>
            </div>

            {/* Actions: Save Changes & Sign Out */}
            <div className="mt-8 pt-7 border-t border-[var(--border-input)] flex flex-col sm:flex-row gap-4 items-center justify-between">
              {/* Save Button & Success alert */}
              <div className="flex items-center gap-3 w-full sm:w-auto flex-wrap">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full sm:w-auto min-w-[170px] px-7 py-4 bg-emerald-500 hover:bg-emerald-400 text-white rounded-2xl font-black transition-all flex items-center justify-center gap-2.5 shadow-xl shadow-emerald-500/20 hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 cursor-pointer text-sm tracking-wide uppercase"
                >
                  {loading ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                  {loading ? t("profile.saving") : t("profile.save")}
                </button>

                <AnimatePresence>
                  {success && (
                    <motion.div 
                      initial={{ scale: 0.9, opacity: 0 }} 
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.9, opacity: 0 }}
                      className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-widest bg-emerald-500/12 border border-emerald-500/20 px-5 py-4 rounded-2xl"
                    >
                      <ShieldCheck size={16} /> {t("profile.saved")}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Premium Sign Out Button */}
              <button
                type="button"
                onClick={() => logout()}
                className="w-full sm:w-auto px-6 py-4 font-bold text-rose-500 hover:text-white bg-rose-500/8 hover:bg-rose-500 border border-rose-500/20 hover:border-transparent rounded-2xl transition-all duration-300 flex items-center justify-center gap-2 text-xs tracking-wider uppercase cursor-pointer"
              >
                <LogOut size={15} /> 
                {t("profile.sign_out")}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
