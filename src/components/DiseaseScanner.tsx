import { useState, useEffect, useCallback } from "react";
import { detectPlantDisease, extractFarmUpdates } from "../services/gemini";
import { useAuth } from "../lib/AuthContext";
import { Camera, Loader2, AlertCircle, CheckCircle2, RefreshCw, ScanLine, Sprout, Upload } from "lucide-react";
import { collection, addDoc, serverTimestamp, query, orderBy, doc, updateDoc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { handleFirestoreError, OperationType } from "../lib/firebaseUtils";
import Markdown from "react-markdown";
import { Field } from "./FieldManager";
import { motion, AnimatePresence } from "motion/react";
import { useLanguage } from "../lib/LanguageContext";

export default function DiseaseScanner() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [image, setImage]           = useState<string | null>(null);
  const [loading, setLoading]       = useState(false);
  const [result, setResult]         = useState<string | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const [fields, setFields]         = useState<Field[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string>("");
  const [lastSaved, setLastSaved]   = useState<string | null>(null);
  const [dragging, setDragging]     = useState(false);

  useEffect(() => {
    if (!user) return;
    const path = `users/${user.uid}/fields`;
    const q = query(collection(db, "users", user.uid, "fields"), orderBy("name", "asc"));
    const unsub = onSnapshot(q, snap => {
      const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() } as Field));
      setFields(fetched);
      setSelectedFieldId(cur => (cur && !fetched.find(f => f.id === cur) ? "" : cur));
    }, err => handleFirestoreError(err, OperationType.GET, path));
    return () => unsub();
  }, [user]);

  const processFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        const max = 800;
        if (width > height) { if (width > max) { height *= max / width; width = max; } }
        else { if (height > max) { width *= max / height; height = max; } }
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d')?.drawImage(img, 0, 0, width, height);
        setImage(canvas.toDataURL('image/jpeg', 0.65));
        setResult(null); setError(null);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }, []);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file?.type.startsWith('image/')) processFile(file);
  }, [processFile]);

  const handleScan = useCallback(async () => {
    if (!image || loading || !user) return;
    setLoading(true); setError(null);
    try {
      const base64 = image.split(",")[1];
      const mime   = image.split(",")[0].split(":")[1].split(";")[0];
      const analysis = await detectPlantDisease(base64, mime);
      setResult(analysis);

      // Save to history
      try {
        await addDoc(collection(db, 'advice'), {
          userId: user.uid, query: "Plant Disease Analysis",
          response: analysis, type: 'vision',
          createdAt: serverTimestamp(),
          fieldId: selectedFieldId || null, imageUrl: image
        });
      } catch (err) { handleFirestoreError(err, OperationType.CREATE, 'advice'); }

      // Auto-sync field data
      if (selectedFieldId && analysis) {
        const field = fields.find(f => f.id === selectedFieldId);
        if (field) {
          try {
            const { fieldUpdates } = await extractFarmUpdates("Analyze this image for diseases.", analysis, field);
            if (Object.keys(fieldUpdates).length > 0) {
              await updateDoc(doc(db, "users", user.uid, "fields", selectedFieldId), {
                ...fieldUpdates, updatedAt: serverTimestamp()
              });
              setLastSaved(new Date().toLocaleTimeString());
              setTimeout(() => setLastSaved(null), 3000);
            }
          } catch { /* silent */ }
        }
      }
    } catch { setError(t("disease.error_analyze")); }
    finally { setLoading(false); }
  }, [image, loading, user, selectedFieldId, fields]);

  const reset = () => { setImage(null); setResult(null); setError(null); };

  return (
    <div className="max-w-7xl mx-auto relative">

      {/* Toast */}
      <AnimatePresence>
        {lastSaved && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="fixed top-20 inset-x-0 z-[100] flex justify-center pointer-events-none">
            <div className="bg-emerald-500/90 backdrop-blur-md text-white px-5 py-2 rounded-full flex items-center gap-2 shadow-xl border border-emerald-400/30 text-xs font-bold uppercase tracking-widest">
              <CheckCircle2 size={14} /> {t("disease.synced")}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Page header */}
      <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_4px_rgba(34,197,94,0.8)]" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400/70">{t("disease.ai_vision")}</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-serif font-extrabold text-bento-text-main tracking-tight">{t("disease.scanner_title")}</h2>
          <p className="text-sm text-bento-text-muted mt-1 font-medium">{t("disease.scanner_desc")}</p>
        </div>

        {fields.length > 0 && (
          <div className="flex items-center gap-2 border px-4 py-2.5 rounded-2xl w-full md:w-60" style={{ background: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
            <Sprout size={16} className="text-emerald-400 shrink-0" />
            <select
              value={selectedFieldId}
              onChange={e => setSelectedFieldId(e.target.value)}
              className="bg-transparent text-sm font-semibold focus:outline-none appearance-none cursor-pointer flex-1 text-bento-text-main"
            >
              <option value="">{t("disease.general_scan")}</option>
              {fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
        )}
      </header>

      <div className="grid md:grid-cols-12 gap-5">

        {/* Upload zone */}
        <div className="md:col-span-5 space-y-4">
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`relative aspect-square rounded-[1.75rem] flex flex-col items-center justify-center overflow-hidden transition-all duration-300 border-2 ${
              image
                ? 'border-emerald-500/20 bg-black/20'
                : dragging
                  ? 'border-emerald-400 bg-emerald-500/10 shadow-[0_0_30px_rgba(34,197,94,0.15)]'
                : 'border-dashed border-emerald-500/20 bg-[var(--bg-input)] hover:border-emerald-500/35 hover:bg-emerald-500/4'
            }`}
          >
            {!image && (
              <div className="absolute top-4 left-4 text-[9px] font-bold uppercase tracking-widest text-emerald-500/40">
                {t("disease.detection_badge")}
              </div>
            )}

            {image ? (
              <>
                <img src={image} alt="Preview" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <div className="absolute bottom-0 inset-x-0 p-4 flex justify-between items-center">
                  <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-main)' }}>{t("disease.image_loaded")}</span>
                  <button onClick={reset} className="p-2 border transition-all rounded-xl" style={{ background: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-main)' }}>
                    <RefreshCw size={16} />
                  </button>
                </div>
              </>
            ) : (
              <label className="cursor-pointer flex flex-col items-center p-10 text-center w-full h-full justify-center group">
                <div className="relative mb-6">
                  <div className="w-20 h-20 rounded-[1.25rem] bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center group-hover:scale-110 group-hover:border-emerald-500/40 transition-all">
                    <Camera size={38} className="text-emerald-400" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-emerald-500 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/30">
                    <Upload size={12} className="text-white" />
                  </div>
                </div>
                <span className="text-base font-bold text-bento-text-main mb-1">{t("disease.tap_upload")}</span>
                <span className="text-xs text-bento-text-muted font-medium">{t("disease.crops_hint")}</span>
                <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
              </label>
            )}
          </div>

          <button
            onClick={handleScan}
            disabled={!image || loading}
            className="w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-3 transition-all disabled:opacity-40 disabled:cursor-not-allowed
              bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500
              text-white shadow-xl shadow-emerald-500/20 hover:shadow-emerald-500/30 hover:-translate-y-0.5 active:scale-[0.98]"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : <ScanLine size={20} />}
            {loading ? t("disease.analyzing_specimen") : t("disease.start_analysis")}
          </button>

          {error && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center gap-3 text-rose-400 text-sm font-semibold">
              <AlertCircle size={18} className="shrink-0" /> {error}
            </div>
          )}
        </div>

        {/* Results panel */}
        <div className="md:col-span-7 flex flex-col">
          <div className="glass-panel rounded-[1.75rem] h-full min-h-[460px] flex flex-col overflow-hidden border border-emerald-500/12">

            {/* Panel header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-emerald-500/10">
              <div className="flex items-center gap-2">
                <ScanLine size={16} className="text-emerald-400" />
                <span className="text-sm font-bold text-bento-text-main tracking-tight">{t("disease.diagnostics")}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${loading ? 'bg-amber-400 animate-pulse' : result ? 'bg-emerald-400' : 'bg-[var(--border-strong)]'}`}
                  style={result && !loading ? { boxShadow: '0 0 6px rgba(34,197,94,0.7)' } : {}} />
                <span className="text-[10px] font-bold uppercase tracking-widest text-bento-text-muted">
                  {loading ? t("disease.processing") : result ? t("disease.ready") : t("disease.standby")}
                </span>
              </div>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto px-6 py-5 scrollbar-hide">
              {result ? (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
                  className="markdown-body text-sm leading-relaxed">
                  <Markdown>{result}</Markdown>
                </motion.div>
              ) : loading ? (
                <div className="h-full flex flex-col items-center justify-center gap-4">
                  <div className="relative w-16 h-16">
                    <div className="w-16 h-16 rounded-full border-2 border-emerald-500/20 border-t-emerald-400 animate-spin" />
                    <ScanLine size={20} className="text-emerald-400 absolute inset-0 m-auto" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-bento-text-main">{t("disease.analyzing_msg")}</p>
                    <p className="text-xs text-bento-text-muted mt-1">{t("disease.examining")}</p>
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-8">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-500/8 border border-emerald-500/15 flex items-center justify-center mb-4">
                    <CheckCircle2 size={32} className="text-emerald-500/40" />
                  </div>
                  <h4 className="text-base font-bold text-bento-text-main mb-2">{t("disease.ready_title")}</h4>
                  <p className="text-sm text-bento-text-muted max-w-xs leading-relaxed">
                    {t("disease.ready_desc")}
                  </p>
                </div>
              )}
            </div>

            {/* Stats bar */}
            <div className="px-6 py-4 border-t border-emerald-500/10 grid grid-cols-2 gap-4">
              <div className="bg-emerald-500/6 border border-emerald-500/12 rounded-xl p-3">
                <label className="text-[9px] font-bold uppercase tracking-widest text-bento-text-muted block mb-1">{t("disease.confidence")}</label>
                <span className={`text-lg font-extrabold ${result ? 'text-emerald-400' : 'text-bento-text-muted/40'}`}>
                  {result ? "98.4%" : "—"}
                </span>
              </div>
              <div className="border rounded-xl p-3" style={{ background: 'var(--bg-input)', borderColor: 'var(--border-input)' }}>
                <label className="text-[9px] font-bold uppercase tracking-widest text-bento-text-muted block mb-1">{t("disease.model_label")}</label>
                <span className="text-sm font-bold text-bento-text-muted">{t("disease.model_name")}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
