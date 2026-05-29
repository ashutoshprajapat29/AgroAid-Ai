import { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, deleteDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { handleFirestoreError, OperationType } from "../lib/firebaseUtils";
import { useAuth } from "../lib/AuthContext";
import {
  CheckCircle2, Circle, Plus, Trash2, Droplet, Leaf,
  Search, CalendarDays, Wheat, Activity, ListTodo, AlertCircle, X
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Field } from "./FieldManager";
import { useLanguage } from "../lib/LanguageContext";

export interface Reminder {
  id: string; userId: string; title: string; description?: string;
  type: "irrigation" | "fertilizer" | "follow-up" | "monitoring" | "harvest" | "other";
  dueDate: string; isCompleted: boolean; fieldId?: string; createdAt: any; updatedAt?: any;
}

const TYPE_CONFIG: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  "irrigation":  { icon: <Droplet  size={13} />, color: "text-blue-400",   bg: "bg-blue-500/12 border-blue-500/20"    },
  "fertilizer":  { icon: <Leaf     size={13} />, color: "text-green-400",  bg: "bg-green-500/12 border-green-500/20"   },
  "monitoring":  { icon: <Search   size={13} />, color: "text-purple-400", bg: "bg-purple-500/12 border-purple-500/20" },
  "follow-up":   { icon: <Activity size={13} />, color: "text-orange-400", bg: "bg-orange-500/12 border-orange-500/20" },
  "harvest":     { icon: <Wheat    size={13} />, color: "text-amber-400",  bg: "bg-amber-500/12 border-amber-500/20"   },
  "other":       { icon: <ListTodo size={13} />, color: "text-slate-400",  bg: "bg-[var(--bg-input)] border-[var(--border-input)]"            },
};

export default function TaskManager() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [fields,    setFields]    = useState<Field[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [isAdding,  setIsAdding]  = useState(false);
  const [notified,  setNotified]  = useState(false);
  const [newTask, setNewTask] = useState<Partial<Reminder>>({
    title: "", description: "", type: "other",
    dueDate: new Date().toISOString().split('T')[0],
    isCompleted: false, fieldId: ""
  });

  useEffect(() => {
    if (!user) return;
    const unsubF = onSnapshot(
      query(collection(db, "users", user.uid, "fields"), orderBy("name")),
      snap => setFields(snap.docs.map(d => ({ id: d.id, ...d.data() } as Field))),
      err  => handleFirestoreError(err, OperationType.GET, `users/${user.uid}/fields`)
    );
    const unsubT = onSnapshot(
      query(collection(db, "users", user.uid, "reminders"), orderBy("dueDate", "asc")),
      snap => { setReminders(snap.docs.map(d => ({ id: d.id, ...d.data() } as Reminder))); setLoading(false); },
      err  => { handleFirestoreError(err, OperationType.GET, `users/${user.uid}/reminders`); setLoading(false); }
    );
    return () => { unsubF(); unsubT(); };
  }, [user]);

  // Notification
  useEffect(() => {
    if (!loading && reminders.length > 0 && !notified && "Notification" in window) {
      Notification.requestPermission().then(p => {
        if (p === "granted") {
          const today = new Date().toISOString().split('T')[0];
          const count = reminders.filter(r => !r.isCompleted && (r.dueDate === today || r.dueDate < today)).length;
          if (count > 0) {
            new Notification("Farm Tasks Update", { body: `${count} pending task${count > 1 ? 's' : ''} require attention.` });
            setNotified(true);
          }
        }
      });
    }
  }, [loading, reminders, notified]);

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newTask.title?.trim()) return;
    const path = `users/${user.uid}/reminders`;
    try {
      await addDoc(collection(db, path), {
        userId: user.uid, title: newTask.title!.trim(),
        description: newTask.description?.trim() || null,
        type: newTask.type, dueDate: newTask.dueDate,
        isCompleted: false, fieldId: newTask.fieldId || null, createdAt: serverTimestamp()
      });
      setIsAdding(false);
      setNewTask({ title: "", description: "", type: "other", dueDate: new Date().toISOString().split('T')[0], isCompleted: false, fieldId: "" });
    } catch (err) { handleFirestoreError(err, OperationType.CREATE, path); }
  };

  const toggleTask   = async (task: Reminder) => {
    if (!user) return;
    try { await updateDoc(doc(db, "users", user.uid, "reminders", task.id), { isCompleted: !task.isCompleted, updatedAt: serverTimestamp() }); }
    catch (err) { handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}/reminders/${task.id}`); }
  };
  const deleteTask   = async (id: string) => {
    if (!user) return;
    try { await deleteDoc(doc(db, "users", user.uid, "reminders", id)); }
    catch (err) { handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/reminders/${id}`); }
  };

  const pending   = reminders.filter(r => !r.isCompleted);
  const completed = reminders.filter(r => r.isCompleted);
  const todayStr  = new Date().toISOString().split('T')[0];

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_4px_rgba(34,197,94,0.8)]" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400/70">{t("tasks.scheduler")}</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-serif font-extrabold text-bento-text-main tracking-tight">{t("tasks.reminders")}</h2>
        </div>

        <div className="flex items-center gap-3">
          {/* Stats chips */}
          <div className="hidden md:flex items-center gap-2">
            <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              {pending.length} {t("common.pending")}
            </span>
            {pending.filter(r => r.dueDate < todayStr).length > 0 && (
              <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
                {pending.filter(r => r.dueDate < todayStr).length} {t("tasks.overdue")}
              </span>
            )}
          </div>

          {!isAdding && (
            <button
              onClick={() => setIsAdding(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-emerald-500/20 hover:-translate-y-0.5 active:scale-95"
            >
              <Plus size={16} /> {t("tasks.add")}
            </button>
          )}
        </div>
      </div>

      {/* Add Task form */}
      <AnimatePresence>
        {isAdding && (
          <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}>
            <form onSubmit={handleAddTask} className="glass-panel rounded-[1.75rem] p-6 md:p-8 border border-emerald-500/15">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold" style={{ color: 'var(--text-main)' }}>{t("tasks.schedule_new")}</h3>
                <button type="button" onClick={() => setIsAdding(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-rose-500/15 hover:text-rose-400 transition-colors border"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-muted)' }}>
                  <X size={16} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { label: t("tasks.task_title_label") + " *", type: "text", value: newTask.title || "", onChange: (v: string) => setNewTask({ ...newTask, title: v }), placeholder: "e.g. Spray Urea in North Plot", span: 1 },
                ].map(f => (
                  <div key={f.label}>
                    <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>{f.label}</label>
                    <input type={f.type} value={f.value} onChange={e => f.onChange(e.target.value)} placeholder={f.placeholder} required
                      className="w-full theme-input rounded-xl px-4 py-3 text-sm font-semibold focus:border-emerald-500/35" />
                  </div>
                ))}

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>{t("tasks.category")} *</label>
                  <select value={newTask.type} onChange={e => setNewTask({ ...newTask, type: e.target.value as any })}
                    className="w-full theme-input rounded-xl px-4 py-3 text-sm font-semibold appearance-none cursor-pointer focus:border-emerald-500/35">
                    <option value="irrigation">{t("tasks.irrigation")}</option>
                    <option value="fertilizer">{t("tasks.fert_app")}</option>
                    <option value="monitoring">{t("tasks.monitoring_scouting")}</option>
                    <option value="follow-up">{t("tasks.follow_up")}</option>
                    <option value="harvest">{t("tasks.harvest")}</option>
                    <option value="other">{t("tasks.other_activity")}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>{t("tasks.due_date")} *</label>
                  <input type="date" value={newTask.dueDate} onChange={e => setNewTask({ ...newTask, dueDate: e.target.value })} required
                    className="w-full theme-input rounded-xl px-4 py-3 text-sm font-semibold focus:border-emerald-500/35" />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>{t("tasks.plot")}</label>
                  <select value={newTask.fieldId} onChange={e => setNewTask({ ...newTask, fieldId: e.target.value })}
                    className="w-full theme-input rounded-xl px-4 py-3 text-sm font-semibold appearance-none cursor-pointer focus:border-emerald-500/35">
                    <option value="">{t("tasks.none_general")}</option>
                    {fields.map(f => <option key={f.id} value={f.id}>{f.name} ({f.area} {f.unit})</option>)}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>{t("common.notes")}</label>
                  <textarea value={newTask.description} onChange={e => setNewTask({ ...newTask, description: e.target.value })}
                    placeholder="e.g. Mix 50kg per acre, spray before 10 AM…" rows={3}
                    className="w-full theme-input rounded-xl px-4 py-3 text-sm font-semibold resize-none focus:border-emerald-500/35" />
                </div>
              </div>

              <div className="mt-5 flex justify-end gap-3 pt-4 border-t" style={{ borderColor: 'var(--border-input)' }}>
                <button type="button" onClick={() => setIsAdding(false)}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold text-bento-text-muted hover:text-bento-text-main hover:bg-white/4 transition-colors">
                  Cancel
                </button>
                <button type="submit"
                  className="px-7 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2">
                  <CheckCircle2 size={15} /> {t("tasks.save")}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Task columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* Pending */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <CalendarDays size={15} className="text-emerald-400" />
            <h3 className="text-sm font-bold text-bento-text-main uppercase tracking-wider">{t("common.pending")} <span className="text-bento-text-muted">({pending.length})</span></h3>
          </div>

          <div className="space-y-3">
            <AnimatePresence>
              {pending.map(task => {
                const field     = fields.find(f => f.id === task.fieldId);
                const isOverdue = task.dueDate < todayStr;
                const isToday   = task.dueDate === todayStr;
                const cfg       = TYPE_CONFIG[task.type] || TYPE_CONFIG["other"];

                return (
                  <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} key={task.id}
                    className={`glass-panel rounded-2xl p-4 flex gap-3 group transition-colors ${
                      isOverdue ? 'border-rose-500/20 bg-rose-500/4' :
                      isToday   ? 'border-amber-500/20 bg-amber-500/4' : ''
                    }`}>

                    <button onClick={() => toggleTask(task)} className="shrink-0 mt-0.5 hover:scale-110 active:scale-95 transition-transform">
                      <Circle size={20} className="text-[var(--text-subtle)] group-hover:text-emerald-400 transition-colors" />
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-semibold text-bento-text-main text-sm leading-tight">{task.title}</h4>
                        <button onClick={() => deleteTask(task.id)}
                          className="opacity-0 group-hover:opacity-100 text-bento-text-muted hover:text-rose-400 transition-all p-1 rounded-lg hover:bg-rose-500/10 shrink-0">
                          <Trash2 size={14} />
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}>
                          {cfg.icon} {task.type}
                        </span>
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          isOverdue ? 'bg-rose-500/12 border-rose-500/20 text-rose-400'   :
                          isToday   ? 'bg-amber-500/12 border-amber-500/20 text-amber-400' :
                                      'bg-[var(--bg-input)] border-[var(--border-input)] text-bento-text-muted'
                        }`}>
                          {isOverdue && <AlertCircle size={10} />}
                          {new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          {isToday && ` (${t("tasks.today")})`}{isOverdue && ` (${t("tasks.overdue")})`}
                        </span>
                        {field && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-500/12 border border-teal-500/20 text-teal-400">
                            <Wheat size={10} /> {field.name}
                          </span>
                        )}
                      </div>

                      {task.description && (
                        <p className="text-xs text-bento-text-muted mt-2 leading-relaxed line-clamp-2">{task.description}</p>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {!loading && pending.length === 0 && (
              <div className="glass-panel rounded-2xl p-8 text-center border-dashed">
                <ListTodo size={28} className="mx-auto text-bento-text-muted/40 mb-2" />
                <p className="text-sm text-bento-text-muted font-medium">{t("tasks.no_pending")}</p>
                <button onClick={() => setIsAdding(true)} className="text-emerald-400 text-xs font-semibold mt-2 hover:underline">
                  {t("tasks.create_reminder")}
                </button>
              </div>
            )}
            {loading && <div className="h-16 flex items-center justify-center"><div className="w-5 h-5 border-2 border-[var(--border-input)] border-t-emerald-400 rounded-full animate-spin" /></div>}
          </div>
        </div>

        {/* Completed */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 size={15} className="text-emerald-400" />
            <h3 className="text-sm font-bold text-bento-text-main uppercase tracking-wider">{t("common.completed")} <span className="text-bento-text-muted">({completed.length})</span></h3>
          </div>

          <div className="space-y-2 opacity-70 hover:opacity-100 transition-opacity">
            {completed.length === 0 && !loading && (
              <p className="text-xs text-center text-bento-text-muted/60 italic py-6">{t("tasks.no_completed")}</p>
            )}
            {completed.map(task => {
              const field = fields.find(f => f.id === task.fieldId);
              return (
                <motion.div layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} key={task.id}
                  className="glass-panel rounded-xl p-3 flex gap-3 group border-[var(--border-input)]">
                  <button onClick={() => toggleTask(task)} className="shrink-0 mt-0.5" title="Mark as pending">
                    <CheckCircle2 size={18} className="text-emerald-500" />
                  </button>
                  <div className="flex-1 min-w-0 flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-semibold text-bento-text-muted line-through truncate">{task.title}</h4>
                      <p className="text-[10px] text-bento-text-muted/50 mt-0.5">
                        {new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        {field && ` · ${field.name}`}
                      </p>
                    </div>
                    <button onClick={() => deleteTask(task.id)}
                      className="opacity-0 group-hover:opacity-100 text-bento-text-muted hover:text-rose-400 transition-all p-1.5 rounded-lg hover:bg-rose-500/10">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
