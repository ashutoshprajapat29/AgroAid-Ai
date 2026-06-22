import { useState, useEffect, useMemo } from "react";
import { collection, query, orderBy, onSnapshot, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/AuthContext";
import { useLanguage } from "../lib/LanguageContext";
import { useWeather } from "../lib/WeatherContext";
import { 
  Camera, Compass, CheckCircle2, Activity, User as UserIcon, 
  MessageSquare, Sprout, ArrowRight, TrendingUp, AlertCircle, 
  CalendarDays, FlaskConical, LayoutDashboard, Cloud, Droplet, 
  Wind, Sun, Loader2, Sparkles, Send, Circle, ChevronRight
} from "lucide-react";
import { motion } from "motion/react";
import { Field, SoilReport } from "./FieldManager";
import { Reminder } from "./TaskManager";

interface DashboardProps {
  onTabChange: (tab: 'dashboard' | 'disease' | 'fields' | 'tasks' | 'market' | 'profile') => void;
  onOpenGeneralAI: (queryText: string) => void;
}

export default function Dashboard({ onTabChange, onOpenGeneralAI }: DashboardProps) {
  const { user, profile } = useAuth();
  const { t, isHindi } = useLanguage();
  const { weather, advisory, loading: weatherLoading } = useWeather();

  const [fields, setFields] = useState<Field[]>([]);
  const [reports, setReports] = useState<SoilReport[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiInput, setAiInput] = useState("");

  // Fetch metrics and upcoming tasks
  useEffect(() => {
    if (!user) return;
    
    setLoading(true);

    const unsubFields = onSnapshot(
      query(collection(db, "users", user.uid, "fields"), orderBy("name", "asc")),
      (snapshot) => {
        setFields(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Field)));
        setLoading(false);
      },
      (err) => console.error("Error fetching fields:", err)
    );

    const unsubReports = onSnapshot(
      query(collection(db, "users", user.uid, "soil_reports"), orderBy("testDate", "desc")),
      (snapshot) => {
        setReports(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as SoilReport)));
      },
      (err) => console.error("Error fetching soil reports:", err)
    );

    const unsubReminders = onSnapshot(
      query(collection(db, "users", user.uid, "reminders"), orderBy("dueDate", "asc")),
      (snapshot) => {
        setReminders(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Reminder)));
      },
      (err) => console.error("Error fetching reminders:", err)
    );

    return () => {
      unsubFields();
      unsubReports();
      unsubReminders();
    };
  }, [user]);

  // Calculate stats
  const totalArea = useMemo(() => {
    if (fields.length === 0) return `0 ${t("plots.unit")}`;
    const totals: Record<string, number> = {};
    fields.forEach(f => {
      const areaVal = Number(f.area) || 0;
      totals[f.unit] = (totals[f.unit] || 0) + areaVal;
    });
    return Object.entries(totals)
      .map(([unit, val]) => `${val.toFixed(1)} ${t(`plots.unit` === unit ? "plots.unit" : "plots.unit")}`) // localized units or simplified
      .join(", ");
  }, [fields, t]);

  const pendingTasks = useMemo(() => reminders.filter(r => !r.isCompleted), [reminders]);
  const overdueCount = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    return pendingTasks.filter(t => t.dueDate < todayStr).length;
  }, [pendingTasks]);

  // Next 2 upcoming/overdue tasks
  const nextTasks = useMemo(() => {
    return pendingTasks.slice(0, 2);
  }, [pendingTasks]);

  // Localized time-based greeting
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    const name = profile?.displayName || user?.displayName || (isHindi ? "किसान भाई" : "Farmer");
    
    let timeGreeting = t("dashboard.greeting_generic");
    if (hour < 12) {
      timeGreeting = t("dashboard.greeting_morning");
    } else if (hour < 17) {
      timeGreeting = t("dashboard.greeting_afternoon");
    } else {
      timeGreeting = t("dashboard.greeting_evening");
    }

    return `${timeGreeting}, ${name}`;
  }, [profile, user, isHindi, t]);

  const handleToggleTask = async (task: Reminder) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, "users", user.uid, "reminders", task.id), {
        isCompleted: !task.isCompleted,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error("Error toggling task:", err);
    }
  };

  const handleAIQuerySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiInput.trim()) return;
    onOpenGeneralAI(aiInput.trim());
    setAiInput("");
  };

  const handleSuggestionClick = (queryText: string) => {
    onOpenGeneralAI(queryText);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-24 px-4 md:px-0 animate-fade-in">
      
      {/* 1. Header Greeting & Weather Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        
        {/* Farmer Welcome Bento Panel */}
        <div className="lg:col-span-2 glass-panel border border-emerald-500/15 rounded-3xl p-6 md:p-8 flex flex-col justify-between shadow-lg relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none -mr-16 -mt-16" />
          
          <div>
            <div className="flex items-center gap-2 text-emerald-400 text-[10px] font-black uppercase tracking-[0.15em] mb-3">
              <Sparkles size={12} className="animate-pulse" />
              {t("dashboard.welcome")}
            </div>
            <h1 className="text-3xl md:text-4xl font-black text-[var(--text-main)] tracking-tight leading-tight">
              {greeting}
            </h1>
            <p className="text-sm text-[var(--text-muted)] font-medium mt-2 max-w-xl leading-relaxed">
              {t("landing.subtitle")}
            </p>
          </div>

          {/* Quick Metrics Overlay */}
          <div className="grid grid-cols-3 gap-4 mt-8 pt-6 border-t border-emerald-500/10">
            <div className="cursor-pointer hover:opacity-80 transition-opacity" onClick={() => onTabChange('fields')}>
              <span className="text-[9px] font-black uppercase tracking-wider text-[var(--text-subtle)] block mb-1">{t("dashboard.mapped_acres")}</span>
              <span className="text-base md:text-lg font-black text-teal-400 truncate block">
                {fields.length} {isHindi ? "प्लॉट" : fields.length === 1 ? "Plot" : "Plots"}
              </span>
            </div>
            <div className="cursor-pointer hover:opacity-80 transition-opacity" onClick={() => onTabChange('tasks')}>
              <span className="text-[9px] font-black uppercase tracking-wider text-[var(--text-subtle)] block mb-1">{t("dashboard.active_tasks")}</span>
              <span className="text-base md:text-lg font-black text-amber-400 truncate block flex items-center gap-1.5">
                {pendingTasks.length} 
                {overdueCount > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-400">
                    {overdueCount}!
                  </span>
                )}
              </span>
            </div>
            <div className="cursor-pointer hover:opacity-80 transition-opacity" onClick={() => onTabChange('fields')}>
              <span className="text-[9px] font-black uppercase tracking-wider text-[var(--text-subtle)] block mb-1">{t("dashboard.diagnosed_diseases")}</span>
              <span className="text-base md:text-lg font-black text-indigo-400 truncate block">
                {reports.length}
              </span>
            </div>
          </div>
        </div>

        {/* Live Climate widget */}
        <div className="glass-panel border border-emerald-500/15 rounded-3xl p-6 flex flex-col justify-between shadow-lg relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl pointer-events-none -mr-8 -mt-8" />
          
          <div>
            <div className="flex justify-between items-center mb-4">
              <span className="text-[9px] font-black uppercase tracking-[0.15em] text-amber-400/80 flex items-center gap-1.5">
                <Cloud size={12} />
                {isHindi ? "लाइव मौसम" : "Live Climate"}
              </span>
              <span className="text-[10px] font-bold text-[var(--text-muted)] bg-[var(--bg-input)] border border-[var(--border-input)] px-2 py-0.5 rounded-md">
                {weather?.location || (isHindi ? "खेत स्थान" : "My Farm")}
              </span>
            </div>

            {weatherLoading ? (
              <div className="py-6 flex flex-col items-center justify-center gap-2">
                <Loader2 className="animate-spin text-amber-400" size={24} />
                <span className="text-xs text-[var(--text-muted)]">{t("weather.fetching")}</span>
              </div>
            ) : weather ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-gradient-to-br from-amber-400 to-amber-600 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/25">
                    <Sun className="text-white animate-float" size={32} style={{ animationDuration: '6s' }} />
                  </div>
                  <div>
                    <span className="text-3xl font-extrabold text-[var(--text-main)] tracking-tighter leading-none">
                      {weather.current.temp}°C
                    </span>
                    <p className="text-xs text-[var(--text-muted)] font-bold mt-1">
                      {isHindi ? "सुहावना" : "Optimal Conditions"}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs border-t border-[var(--border-input)] pt-3">
                  <div className="flex items-center gap-1.5">
                    <Droplet size={14} className="text-blue-400" />
                    <span className="text-[var(--text-muted)] font-medium">{t("weather.humidity")}:</span>
                    <strong className="text-[var(--text-main)]">{weather.current.humidity}%</strong>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Wind size={14} className="text-teal-400" />
                    <span className="text-[var(--text-muted)] font-medium">{t("weather.wind")}:</span>
                    <strong className="text-[var(--text-main)]">9 km/h</strong>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-[var(--text-muted)] font-medium">
                <AlertCircle className="mx-auto text-rose-500/60 mb-2" size={20} />
                {t("weather.unavailable")}
              </div>
            )}
          </div>

          {/* Localized Weather Advisory banner */}
          <div className="mt-4 pt-3 border-t border-[var(--border-input)] text-[10px] font-semibold text-[var(--text-main)] leading-relaxed flex items-start gap-2 bg-emerald-500/5 p-2 rounded-xl border border-emerald-500/10">
            <span className="shrink-0 text-emerald-400 font-bold uppercase tracking-wider bg-emerald-500/15 px-1.5 py-0.5 rounded">ADVISORY</span>
            <p className="opacity-90">{advisory || (isHindi ? "मौसम स्थिर है। नियमित कार्य जारी रखें।" : "Weather conditions stable. Proceed with regular tasks.")}</p>
          </div>
        </div>
      </div>

      {/* 2. Interactive AI Advisor Consult Box */}
      <div className="glass-panel border border-emerald-500/15 rounded-3xl p-5 md:p-6 shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-full bg-gradient-to-l from-emerald-500/4 to-transparent pointer-events-none" />
        
        <h3 className="text-sm font-black text-[var(--text-main)] flex items-center gap-2 mb-3">
          <MessageSquare className="text-emerald-400" size={16} />
          {t("plots.ask_ai")}
        </h3>

        <form onSubmit={handleAIQuerySubmit} className="flex gap-2">
          <input 
            type="text"
            required
            value={aiInput}
            onChange={e => setAiInput(e.target.value)}
            placeholder={t("dashboard.ask_ai_placeholder")}
            className="flex-1 bg-[var(--bg-input)] border-2 border-[var(--border-strong)] rounded-2xl px-4 py-3.5 text-sm focus:outline-none focus:border-emerald-500 font-medium placeholder-[var(--text-subtle)] text-[var(--text-main)]"
          />
          <button 
            type="submit"
            className="bg-emerald-500 hover:bg-emerald-400 text-white px-5 rounded-2xl transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center shrink-0 cursor-pointer active:scale-95"
            title={t("dashboard.ask_ai_btn")}
          >
            <Send size={18} />
          </button>
        </form>

        <div className="mt-3.5 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-subtle)] mr-1">{t("dashboard.ask_ai_suggestions")}</span>
          {[
            t("dashboard.suggestion1"),
            t("dashboard.suggestion2"),
            t("dashboard.suggestion3")
          ].map((s, idx) => (
            <button
              key={idx}
              onClick={() => handleSuggestionClick(s)}
              className="text-[10px] md:text-xs font-semibold px-3 py-1.5 rounded-full bg-[var(--bg-input)] border border-[var(--border-input)] hover:border-emerald-500/25 hover:bg-emerald-500/5 text-[var(--text-muted)] hover:text-emerald-400 transition-all cursor-pointer text-left line-clamp-1"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Bento Grid of App Modules */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        
        {/* Card 1: Fields & Plots */}
        <div 
          onClick={() => onTabChange('fields')}
          className="bento-card relative cursor-pointer group"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-white/5 to-transparent rounded-bl-3xl pointer-events-none" />
          <div className="flex justify-between items-start mb-5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-400 to-teal-700 flex items-center justify-center shadow-lg transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3">
              <Compass size={22} className="text-white" />
            </div>
            <span className="text-[9px] font-black uppercase tracking-wider bg-[var(--bg-input)] border border-[var(--border-input)] px-2.5 py-1 rounded-lg text-bento-text-muted">
              {fields.length} {isHindi ? "प्लॉट" : fields.length === 1 ? "Plot" : "Plots"}
            </span>
          </div>
          
          <h3 className="text-lg font-black text-bento-text-main mb-2 tracking-tight">{t("dashboard.my_plots")}</h3>
          <p className="text-xs text-bento-text-muted leading-relaxed font-semibold mb-6 flex-grow">{t("dashboard.my_plots_desc")}</p>
          
          <div className="flex justify-between items-center pt-3 border-t border-[var(--border-input)] mt-auto">
            <span className="text-[10px] font-black text-teal-400 group-hover:underline flex items-center gap-1">
              {t("dashboard.plots_btn")} <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
            </span>
            <span className="text-[8px] font-black uppercase tracking-widest text-bento-text-muted">
              {totalArea || `0 Acres`}
            </span>
          </div>
        </div>

        {/* Card 2: Crop Scanner */}
        <div 
          onClick={() => onTabChange('disease')}
          className="bento-card relative cursor-pointer group"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-white/5 to-transparent rounded-bl-3xl pointer-events-none" />
          <div className="flex justify-between items-start mb-5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-400 to-rose-700 flex items-center justify-center shadow-lg transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3">
              <Camera size={22} className="text-white" />
            </div>
            <span className="text-[9px] font-black uppercase tracking-wider bg-[var(--bg-input)] border border-[var(--border-input)] px-2.5 py-1 rounded-lg text-rose-400 font-bold">
              AI Vision
            </span>
          </div>
          
          <h3 className="text-lg font-black text-bento-text-main mb-2 tracking-tight">{t("dashboard.quick_scan")}</h3>
          <p className="text-xs text-bento-text-muted leading-relaxed font-semibold mb-6 flex-grow">{t("dashboard.quick_scan_desc")}</p>
          
          <div className="flex justify-between items-center pt-3 border-t border-[var(--border-input)] mt-auto">
            <span className="text-[10px] font-black text-rose-400 group-hover:underline flex items-center gap-1">
              {t("dashboard.scan_btn")} <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
            </span>
            <span className="text-[8px] font-black uppercase tracking-widest text-bento-text-muted">
              {isHindi ? "तुरंत रिपोर्ट" : "Instant Diagnostic"}
            </span>
          </div>
        </div>

        {/* Card 3: Mandi Rates */}
        <div 
          onClick={() => onTabChange('market')}
          className="bento-card relative cursor-pointer group"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-white/5 to-transparent rounded-bl-3xl pointer-events-none" />
          <div className="flex justify-between items-start mb-5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-700 flex items-center justify-center shadow-lg transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3">
              <TrendingUp size={22} className="text-white" />
            </div>
            <span className="text-[9px] font-black uppercase tracking-wider bg-[var(--bg-input)] border border-[var(--border-input)] px-2.5 py-1 rounded-lg text-amber-400 font-bold">
              {isHindi ? "लाइव भाव" : "Mandi Rates"}
            </span>
          </div>
          
          <h3 className="text-lg font-black text-bento-text-main mb-2 tracking-tight">{t("dashboard.mandi_rates")}</h3>
          <p className="text-xs text-bento-text-muted leading-relaxed font-semibold mb-6 flex-grow">{t("dashboard.mandi_rates_desc")}</p>
          
          <div className="flex justify-between items-center pt-3 border-t border-[var(--border-input)] mt-auto">
            <span className="text-[10px] font-black text-amber-400 group-hover:underline flex items-center gap-1">
              {t("dashboard.mandi_btn")} <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
            </span>
            <span className="text-[8px] font-black uppercase tracking-widest text-bento-text-muted">
              {isHindi ? "मंडी रेट अपडेट" : "Live Influx"}
            </span>
          </div>
        </div>

        {/* Card 4: Farm Tasks Checklist (Interactive inline widget!) */}
        <div className="md:col-span-2 bento-card relative border border-emerald-500/10">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-lg">
                <CheckCircle2 size={18} className="text-white" />
              </div>
              <div>
                <h3 className="text-base font-black text-bento-text-main leading-none">{t("dashboard.tasks_schedule")}</h3>
                <span className="text-[9px] text-[var(--text-muted)] font-semibold mt-1 block uppercase tracking-wider">
                  {pendingTasks.length} {t("common.pending")}
                </span>
              </div>
            </div>
            
            <button 
              onClick={() => onTabChange('tasks')}
              className="text-xs font-bold text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
            >
              {t("dashboard.tasks_btn")} <ChevronRight size={14} />
            </button>
          </div>

          <div className="space-y-2 mt-2">
            {nextTasks.length > 0 ? (
              nextTasks.map((task) => {
                const isOverdue = task.dueDate < new Date().toISOString().split('T')[0];
                return (
                  <div 
                    key={task.id}
                    className={`flex items-center justify-between p-3 rounded-xl border border-[var(--border-input)] bg-[var(--bg-input)] hover:border-indigo-500/25 transition-all group/task ${
                      isOverdue ? 'border-rose-500/10 bg-rose-500/4' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <button 
                        onClick={() => handleToggleTask(task)} 
                        className="shrink-0 hover:scale-110 active:scale-95 transition-transform"
                      >
                        <Circle size={18} className="text-[var(--text-subtle)] hover:text-emerald-400 transition-colors" />
                      </button>
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-[var(--text-main)] block truncate leading-tight group-hover/task:text-emerald-400 transition-colors">
                          {task.title}
                        </span>
                        <span className="text-[9px] text-[var(--text-muted)] font-medium flex items-center gap-2 mt-0.5">
                          {isOverdue && <span className="text-rose-400 font-extrabold uppercase text-[8px] tracking-wider bg-rose-500/10 px-1 rounded">{t("tasks.overdue")}</span>}
                          {new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    </div>
                    
                    <button 
                      onClick={() => handleToggleTask(task)}
                      className="text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500 text-emerald-400 hover:text-white transition-all cursor-pointer opacity-0 group-hover/task:opacity-100"
                    >
                      {t("dashboard.quick_complete")}
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="py-6 border border-dashed border-[var(--border-input)] rounded-xl text-center">
                <CheckCircle2 className="mx-auto text-emerald-400/40 mb-2" size={24} />
                <p className="text-xs text-[var(--text-muted)] font-semibold">{t("dashboard.no_tasks")}</p>
              </div>
            )}
          </div>
        </div>

        {/* Card 5: Profile Settings */}
        <div 
          onClick={() => onTabChange('profile')}
          className="bento-card relative cursor-pointer group"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-white/5 to-transparent rounded-bl-3xl pointer-events-none" />
          <div className="flex justify-between items-start mb-5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-400 to-slate-700 flex items-center justify-center shadow-lg transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3">
              <UserIcon size={22} className="text-white" />
            </div>
            <span className="text-[9px] font-black uppercase tracking-wider bg-[var(--bg-input)] border border-[var(--border-input)] px-2.5 py-1 rounded-lg text-[var(--text-muted)] font-bold">
              {profile?.displayName ? t("profile.verified") : "Guest"}
            </span>
          </div>
          
          <h3 className="text-lg font-black text-bento-text-main mb-2 tracking-tight">{t("dashboard.profile_settings")}</h3>
          <p className="text-xs text-bento-text-muted leading-relaxed font-semibold mb-6 flex-grow">{t("dashboard.profile_settings_desc")}</p>
          
          <div className="flex justify-between items-center pt-3 border-t border-[var(--border-input)] mt-auto">
            <span className="text-[10px] font-black text-[var(--text-muted)] group-hover:text-emerald-400 group-hover:underline flex items-center gap-1 transition-colors">
              {t("dashboard.profile_btn")} <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
            </span>
            <span className="text-[8px] font-black uppercase tracking-widest text-bento-text-muted">
              {profile?.preferredLanguage || `English`}
            </span>
          </div>
        </div>

      </div>

    </div>
  );
}
