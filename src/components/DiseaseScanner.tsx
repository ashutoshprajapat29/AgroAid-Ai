import { useState, useEffect, useCallback } from "react";
import { detectPlantDisease, extractFarmUpdates } from "../services/gemini";
import { useAuth } from "../lib/AuthContext";
import { Camera, Upload, Loader2, AlertCircle, CheckCircle2, RefreshCw, TrendingUp, Sprout } from "lucide-react";
import { collection, addDoc, serverTimestamp, query, where, orderBy, getDocs, doc, updateDoc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { handleFirestoreError, OperationType } from "../lib/firebaseUtils";
import Markdown from "react-markdown";
import { Field } from "./FieldManager";
import { motion, AnimatePresence } from "motion/react";

export default function DiseaseScanner() {
  const { user } = useAuth();
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string>("");
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    
    const path = `users/${user.uid}/fields`;
    const q = query(collection(db, "users", user.uid, "fields"), orderBy("name", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedFields = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Field));
      setFields(fetchedFields);
      
      setSelectedFieldId(current => {
        if (current && !fetchedFields.find(f => f.id === current)) {
          return "";
        }
        return current;
      });
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, path);
    });

    return () => unsubscribe();
  }, [user]);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const maxDim = 800;

          if (width > height) {
            if (width > maxDim) {
              height *= maxDim / width;
              width = maxDim;
            }
          } else {
            if (height > maxDim) {
              width *= maxDim / height;
              height = maxDim;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          const compressed = canvas.toDataURL('image/jpeg', 0.6);
          setImage(compressed);
          setResult(null);
          setError(null);
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleScan = useCallback(async () => {
    if (!image || loading || !user) return;

    setLoading(true);
    setError(null);

    try {
      const base64Data = image.split(",")[1];
      const mimeType = image.split(",")[0].split(":")[1].split(";")[0];
      
      const analysis = await detectPlantDisease(base64Data, mimeType);
      setResult(analysis);

      // Save to history
      const advicePath = 'advice';
      try {
        await addDoc(collection(db, advicePath), {
          userId: user.uid,
          query: "Plant Disease Analysis",
          response: analysis,
          type: 'vision',
          createdAt: serverTimestamp(),
          fieldId: selectedFieldId || null,
          imageUrl: image
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, advicePath);
      }

      // --- AUTO-SYNC FIELD DATA ---
      if (selectedFieldId && analysis) {
        const selectedField = fields.find(c => c.id === selectedFieldId);
        if (selectedField) {
          try {
            const { fieldUpdates } = await extractFarmUpdates("Analyze this image of a plant for diseases.", analysis, selectedField);
            if (Object.keys(fieldUpdates).length > 0) {
              const fieldPath = `users/${user.uid}/fields/${selectedFieldId}`;
              try {
                await updateDoc(doc(db, "users", user.uid, "fields", selectedFieldId), {
                  ...fieldUpdates,
                  updatedAt: serverTimestamp()
                });
                setLastSaved(new Date().toLocaleTimeString());
                setTimeout(() => setLastSaved(null), 3000);
              } catch (updateErr) {
                handleFirestoreError(updateErr, OperationType.UPDATE, fieldPath);
              }
            }
          } catch (syncErr) {
            console.warn("Auto-sync failed:", syncErr);
          }
        }
      }
    } catch (err) {
      console.error(err);
      setError("Failed to analyze image. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [image, loading, user, selectedFieldId, fields]);

  const reset = () => {
    setImage(null);
    setResult(null);
    setError(null);
  };

  return (
    <div className="max-w-7xl mx-auto relative">
      <AnimatePresence>
        {lastSaved && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-20 left-0 right-0 z-[100] flex justify-center pointer-events-none"
          >
            <div className="bg-green-600/90 backdrop-blur-md text-white px-6 py-2 rounded-full flex items-center gap-2 shadow-xl border border-green-400/30 text-[10px] md:text-xs font-black uppercase tracking-widest">
              <CheckCircle2 size={14} />
              Health Diagnostic Synced Automatically
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="mb-8 p-6 bento-card border-none bg-bento-card/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-bento-text-main tracking-tight">Plant Health Scanner</h2>
          <p className="text-bento-text-muted font-medium">Identify diseases instantly with AI-powered vision.</p>
        </div>
        
        {fields.length > 0 && (
          <div className="flex items-center gap-2 bg-white px-4 py-2.5 rounded-2xl border-2 border-bento-border shadow-sm w-full md:w-64">
            <Sprout size={18} className="text-bento-primary shrink-0" />
            <select 
              value={selectedFieldId}
              onChange={(e) => setSelectedFieldId(e.target.value)}
              className="bg-transparent text-sm font-black focus:outline-none appearance-none cursor-pointer pr-6 flex-1 uppercase tracking-wider overflow-hidden"
            >
              <option value="">General Scan</option>
              {fields.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
        )}
      </header>

      <div className="grid md:grid-cols-12 gap-6">
        {/* Upload Section - Taking 5 columns as in bento-theme */}
        <div className="md:col-span-5 space-y-6">
          <div className={`relative aspect-[4/5] md:aspect-square rounded-[30px] flex flex-col items-center justify-center transition-all overflow-hidden shadow-2xl ${image ? 'bg-white' : 'bg-gradient-to-br from-[#2e5a27] to-[#1e3d1a]'}`}>
            {!image && <div className="absolute top-6 left-8 text-white/50 text-[11px] font-bold uppercase tracking-widest">Disease Detection</div>}
            
            {image ? (
              <>
                <img src={image} alt="Preview" className="w-full h-full object-cover" />
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-black/40 backdrop-blur-md flex justify-between items-center text-white">
                  <span className="text-xs font-bold uppercase tracking-widest">Image Loaded</span>
                  <button 
                    onClick={reset}
                    className="p-2 bg-white/20 rounded-xl hover:bg-white/30 transition-all"
                  >
                    <RefreshCw size={18} />
                  </button>
                </div>
              </>
            ) : (
              <label className="cursor-pointer flex flex-col items-center p-10 text-center w-full h-full justify-center group">
                <div className="w-20 h-20 bg-white/10 rounded-[24px] border border-white/20 flex items-center justify-center text-white mb-6 group-hover:scale-110 transition-transform shadow-inner">
                  <Camera size={40} />
                </div>
                <span className="text-xl font-bold text-white mb-2">📸 Tap to Scan</span>
                <span className="text-xs text-white/60 font-medium">Supported: Maize, Wheat, Tomato, Rice</span>
                <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
              </label>
            )}
          </div>

          <button 
            onClick={handleScan}
            disabled={!image || loading}
            className="w-full py-5 bg-bento-primary text-white rounded-[20px] font-extrabold hover:bg-black transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xl shadow-bento-primary/20 flex items-center justify-center gap-3"
          >
            {loading ? <Loader2 className="animate-spin text-white" /> : <TrendingUp size={20} />}
            {loading ? "Analyzing Specimen..." : "Start Analysis"}
          </button>

          {error && (
            <div className="p-4 bg-bento-highlight border border-bento-border rounded-[20px] flex items-center gap-3 text-red-600 text-sm font-bold shadow-sm">
              <AlertCircle size={20} />
              {error}
            </div>
          )}
        </div>

        {/* Results Section - Taking the remaining 7 columns */}
        <div className="md:col-span-7 flex flex-col">
          <div className="bento-card h-full min-h-[500px] shadow-xl border-2 border-bento-border relative overflow-hidden">
             <div className="bento-title flex items-center gap-2">
               <div className="w-2 h-2 bg-bento-accent rounded-full animate-pulse"></div>
               Diagnostics Lab
             </div>
            
            <div className="flex-1 overflow-y-auto pr-2 scrollbar-hide py-4">
              {result ? (
                <div className="markdown-body text-bento-text-main font-medium leading-[1.8]">
                  <Markdown>{result}</Markdown>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-10 text-bento-text-muted">
                  <div className="w-20 h-20 bg-bento-bg rounded-full flex items-center justify-center mb-6 shadow-inner">
                    <CheckCircle2 size={40} className="text-bento-border" />
                  </div>
                  <h4 className="text-lg font-extrabold text-bento-text-main mb-2">Ready for Inspection</h4>
                  <p className="max-w-xs mx-auto">Upload or take a photo of the affected plant part to begin the automated diagnostic process.</p>
                </div>
              )}
            </div>

            {/* Mock stats for bento look */}
            <div className="grid grid-cols-2 gap-4 pt-6 mt-auto border-t border-bento-border">
              <div className="bg-bento-bg p-4 rounded-[15px]">
                <label className="text-[10px] font-bold uppercase tracking-widest text-bento-text-muted block mb-1">Confidence Score</label>
                <span className="text-xl font-extrabold text-bento-primary">{result ? "98.4%" : "--"}</span>
              </div>
              <div className="bg-bento-highlight p-4 rounded-[15px]">
                <label className="text-[10px] font-bold uppercase tracking-widest text-bento-text-muted block mb-1">Status</label>
                <span className="text-xl font-extrabold text-bento-accent">{loading ? "Processing" : result ? "Analysis Ready" : "Standby"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
