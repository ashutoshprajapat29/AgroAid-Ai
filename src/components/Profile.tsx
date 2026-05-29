import { useState, useEffect } from "react";
import { useAuth } from "../lib/AuthContext";
import { User, Mail, ShieldCheck, Sprout, Save, Loader2, LogOut, Globe, Layers, Wind, Palette } from "lucide-react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { handleFirestoreError, OperationType } from "../lib/firebaseUtils";
import { motion } from "motion/react";
import ThemeToggle from "./ThemeToggle";
import { useLanguage } from "../lib/LanguageContext";

export default function Profile() {
  const { user, profile, updateProfile, logout } = useAuth();
  const { t, setLanguage } = useLanguage();
  const [formData, setFormData] = useState({
    displayName: profile?.displayName || "",
    farmDetails: profile?.farmDetails || "",
    preferredLanguage: profile?.preferredLanguage || "English"
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [stats, setStats]     = useState({ plots: 0, reports: 0 });

  useEffect(() => {
    async function fetchStats() {
      if (!user) return;
      try {
        const fieldsSnap  = await getDocs(collection(db, "users", user.uid, "fields"));
        const reportsSnap = await getDocs(collection(db, "users", user.uid, "soil_reports"));
        setStats({ plots: fieldsSnap.size, reports: reportsSnap.size });
      } catch (err) { handleFirestoreError(err, OperationType.GET, `users/${user.uid}/fields`); }
    }
    fetchStats();
  }, [user]);

  const languages = ["English", "Hindi", "Punjabi", "Marathi", "Tamil", "Telugu", "Kannada", "Bengali", "Gujarati"];

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
    <div className="max-w-6xl mx-auto px-0 pb-24 md:pb-12">

      {/* Hero identity card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">

        {/* Profile hero */}
        <div className="lg:col-span-2 rounded-[1.75rem] p-8 md:p-10 relative overflow-hidden flex flex-col md:flex-row items-center md:items-start gap-7
          bg-gradient-to-br from-[#071409] via-[#091b0d] to-[#0c2411] border border-emerald-500/18">
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/7 rounded-full -mr-32 -mt-32 blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-40 h-40 bg-amber-500/4 rounded-full -ml-20 -mb-20 blur-2xl pointer-events-none" />

          {/* Avatar */}
          <div className="relative z-10 shrink-0">
            {profile?.photoURL ? (
              <img src={profile.photoURL} alt={profile.displayName} referrerPolicy="no-referrer"
                className="w-24 h-24 md:w-28 md:h-28 rounded-2xl border-2 border-emerald-500/20 shadow-2xl object-cover" />
            ) : (
              <div className="w-24 h-24 md:w-28 md:h-28 rounded-2xl bg-emerald-500/15 border-2 border-emerald-500/20 flex items-center justify-center">
                <User size={40} className="text-emerald-400" />
              </div>
            )}
            <div className="absolute -bottom-1.5 -right-1.5 w-6 h-6 bg-emerald-500 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/40">
              <ShieldCheck size={13} className="text-white" />
            </div>
          </div>

          {/* Info */}
          <div className="relative z-10 flex-1 text-center md:text-left">
            <div className="flex flex-wrap justify-center md:justify-start items-center gap-2 mb-3">
              <span className="text-[10px] font-bold uppercase tracking-widest bg-emerald-500/15 text-emerald-400 px-3 py-1 rounded-full border border-emerald-500/20">
                {t("profile.verified_farmer")}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-bento-text-muted px-3 py-1 rounded-full border flex items-center gap-1" style={{ background: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
                <Globe size={9} /> {formData.preferredLanguage}
              </span>
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-bento-text-main mb-2">
              {profile?.displayName || t("profile.guardian")}
            </h1>
            <p className="text-bento-text-muted font-medium flex items-center justify-center md:justify-start gap-2 text-sm">
              <Mail size={14} className="text-emerald-400/60" />
              {profile?.email}
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="glass-panel rounded-[1.75rem] p-7 flex flex-col justify-between">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-bento-text-muted mb-6">{t("profile.impact")}</h3>
          <div className="space-y-5">
            {[
              { label: t("profile.mapped_plots"), value: stats.plots, icon: Layers, color: "emerald" },
              { label: t("profile.health_audits"), value: stats.reports, icon: ShieldCheck, color: "indigo" },
            ].map(stat => (
              <div key={stat.label} className="flex items-center gap-4">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${stat.color === 'emerald' ? 'bg-emerald-500/12 text-emerald-400 border border-emerald-500/20' : 'bg-indigo-500/12 text-indigo-400 border border-indigo-500/20'}`}>
                  <stat.icon size={20} />
                </div>
                <div>
                  <p className="text-2xl font-extrabold text-bento-text-main">{stat.value}</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-bento-text-muted">{stat.label}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 p-3.5 bg-emerald-500/5 border border-emerald-500/10 rounded-xl italic text-[11px] font-medium text-bento-text-muted leading-relaxed">
            {t("profile.quote")}
          </div>
        </div>
      </div>

      {/* Settings form */}
      <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Identity */}
        <div className="glass-panel rounded-[1.75rem] p-7 md:p-9 flex flex-col">
          <div className="flex items-center gap-3 mb-7">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center border" style={{ background: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
              <User size={18} style={{ color: 'var(--text-muted)' }} />
            </div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-main)' }}>{t("profile.settings")}</h2>
          </div>

          <div className="space-y-5 flex-1">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>{t("profile.display_name")}</label>
              <input
                type="text"
                value={formData.displayName}
                onChange={e => setFormData({ ...formData, displayName: e.target.value })}
                className="w-full theme-input rounded-2xl px-5 py-3.5 font-semibold"
                placeholder="Your display name…"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>{t("profile.language")}</label>
              <div className="relative">
                <select
                  value={formData.preferredLanguage}
                  onChange={e => setFormData({ ...formData, preferredLanguage: e.target.value })}
                  className="w-full theme-input rounded-2xl px-5 py-3.5 font-semibold appearance-none cursor-pointer"
                >
                  {languages.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
                <Globe size={16} className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
              </div>
            </div>

            {/* Appearance row */}
            <div className="pt-4 border-t border-[var(--border-input)]">
              <label className="block text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>{t("profile.appearance")}</label>
              <div className="flex items-center justify-between bg-[var(--bg-input)] border border-[var(--border-input)] rounded-2xl px-5 py-3.5">
                <div className="flex items-center gap-2.5">
                  <Palette size={16} className="text-emerald-400" />
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>{t("profile.color_theme")}</span>
                </div>
                <ThemeToggle variant="pill" />
              </div>
            </div>
          </div>

          <div className="mt-8 pt-6 flex items-center gap-3 flex-wrap border-t" style={{ borderColor: 'var(--border-input)' }}>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 min-w-[180px] px-6 py-4 bg-emerald-500 hover:bg-emerald-400 text-white rounded-2xl font-bold transition-all flex items-center justify-center gap-2.5 shadow-xl shadow-emerald-500/20 hover:-translate-y-0.5 active:scale-95 disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
              {loading ? t("profile.saving") : t("profile.save")}
            </button>

            {success && (
              <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-widest bg-emerald-500/12 border border-emerald-500/20 px-5 py-4 rounded-2xl">
                <ShieldCheck size={15} /> {t("profile.saved")}
              </motion.div>
            )}
          </div>
        </div>

        {/* Farm context */}
        <div className="glass-panel rounded-[1.75rem] p-7 md:p-9 flex flex-col group">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 bg-emerald-500/10 border border-emerald-500/18 rounded-xl flex items-center justify-center transition-transform group-hover:rotate-12">
              <Sprout size={18} className="text-emerald-400" />
            </div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-main)' }}>{t("profile.farm_context")}</h2>
          </div>
          <p className="text-sm font-medium mb-5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            {t("profile.farm_context_desc")}
          </p>

          <div className="relative flex-1">
            <div className="absolute top-4 left-5 text-emerald-500/10 pointer-events-none">
              <Wind size={56} />
            </div>
            <textarea
              rows={9}
              value={formData.farmDetails}
              onChange={e => setFormData({ ...formData, farmDetails: e.target.value })}
              placeholder="Describe your soil (Sandy, Clay, Loamy), typical climate (Arid, Tropical), terrain, and any existing crops…"
              className="relative z-10 w-full theme-input rounded-2xl px-6 py-5 resize-none font-medium leading-relaxed transition-all h-full focus:border-emerald-500/30"
            />
          </div>

          <button
            type="button"
            onClick={() => logout()}
            className="mt-6 w-full px-6 py-4 font-semibold hover:text-rose-400 hover:bg-rose-500/8 border border-transparent hover:border-rose-500/15 rounded-2xl transition-all flex items-center justify-center gap-2 text-sm"
            style={{ color: 'var(--text-muted)' }}
          >
            <LogOut size={16} /> {t("profile.sign_out")}
          </button>
        </div>
      </form>
    </div>
  );
}
