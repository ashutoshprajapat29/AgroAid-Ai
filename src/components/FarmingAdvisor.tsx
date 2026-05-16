import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { getFarmingAdvice, analyzeFarmingImage, getTTSAudio, extractFarmUpdates } from "../services/gemini";
import { useAuth } from "../lib/AuthContext";
import { motion, AnimatePresence } from "motion/react";
import {
  Send,
  Loader2,
  User,
  Bot,
  HelpCircle,
  MessageSquare,
  Sprout,
  Save,
  Clock,
  ChevronRight,
  Camera,
  X,
  Leaf,
  Square,
  BookOpen,
  Image as ImageIcon,
  Database,
  Volume2,
  Mic,
  CheckCircle2,
  Compass
} from "lucide-react";
import { collection, addDoc, query, where, orderBy, limit, getDocs, serverTimestamp, doc, updateDoc, onSnapshot, deleteDoc, writeBatch } from "firebase/firestore";
import { db } from "../lib/firebase";
import { handleFirestoreError, OperationType } from "../lib/firebaseUtils";
import Markdown from "react-markdown";
import { Field, SoilReport } from "./FieldManager";

interface Message {
  role: 'user' | 'bot';
  content: string;
  imageUrls?: string[];
}

export default function FarmingAdvisor({ isActive }: { isActive?: boolean }) {
  const { user, profile } = useAuth();
  const defaultMessage: Message = {
    role: 'bot',
    content: "Hi! 👋 I'm your AI Farming Advisor. How can I help your farm today?"
  };

  const [chatHistories, setChatHistories] = useState<Record<string, Message[]>>({
    'default': [defaultMessage]
  });

  const [input, setInput] = useState("");
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [fields, setFields] = useState<Field[]>([]);
  const [soilReports, setSoilReports] = useState<SoilReport[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string>("");
  const [isSpeaking, setIsSpeaking] = useState<number | null>(null);
  const [speechLoading, setSpeechLoading] = useState<number | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  // Quick Plot Form
  const [showAddPlot, setShowAddPlot] = useState(false);
  const [newPlotName, setNewPlotName] = useState("");
  const [showConfirmReset, setShowConfirmReset] = useState(false);

  const messages = useMemo(() =>
    chatHistories[selectedFieldId || 'default'] || [defaultMessage],
    [chatHistories, selectedFieldId, defaultMessage]);

  const updateMessages = useCallback((fieldKey: string, newMessages: Message[] | ((prev: Message[]) => Message[])) => {
    setChatHistories(prev => {
      const field = fieldKey || 'default';
      const prevMsgs = prev[field] || [defaultMessage];
      const result = typeof newMessages === 'function' ? newMessages(prevMsgs) : newMessages;
      if (JSON.stringify(prev[field]) === JSON.stringify(result)) return prev;
      return { ...prev, [field]: result };
    });
  }, [defaultMessage]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const recognitionRef = useRef<any>(null);
  const activeSpeechIndexRef = useRef<number | null>(null);
  const baselineTextRef = useRef<string>("");
  const lastSoilSyncRef = useRef<string | null>(null);
  const isProcessingRef = useRef(false);

  useEffect(() => {
    if (!user) return;

    const fieldsPath = `users/${user.uid}/fields`;
    const fieldsQuery = query(collection(db, "users", user.uid, "fields"), orderBy("name", "asc"));
    const unsubscribeFields = onSnapshot(fieldsQuery, (snapshot) => {
      const fetchedFields = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Field));
      setFields(fetchedFields);

      // If the currently selected field was deleted, reset to General AI
      setSelectedFieldId(current => {
        if (current && !fetchedFields.find(f => f.id === current)) {
          return "";
        }
        return current;
      });
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, fieldsPath);
    });

    const soilPath = `users/${user.uid}/soil_reports`;
    const soilQuery = query(collection(db, "users", user.uid, "soil_reports"), orderBy("testDate", "desc"));
    const unsubscribeSoil = onSnapshot(soilQuery, (snapshot) => {
      setSoilReports(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SoilReport)));
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, soilPath);
    });

    const advicePath = 'advice';
    const adviceQuery = query(collection(db, "advice"), where("userId", "==", user.uid));
    const unsubscribeAdvice = onSnapshot(adviceQuery, (snapshot) => {
      const histories: Record<string, Message[]> = { 'default': [defaultMessage] };
      
      const sortedDocs = [...snapshot.docs].sort((a, b) => {
        const timeA = a.data().createdAt?.toMillis?.() || 0;
        const timeB = b.data().createdAt?.toMillis?.() || 0;
        return timeA - timeB;
      });

      sortedDocs.forEach(docSnap => {
        const data = docSnap.data();
        const fieldKey = data.fieldId || 'default';
        
        if (!histories[fieldKey]) {
          histories[fieldKey] = [defaultMessage];
        }
        
        // Each document in 'advice' contains a user query and a bot response
        histories[fieldKey].push({
          role: 'user',
          content: data.query,
          imageUrls: data.imageUrls || (data.imageUrl ? [data.imageUrl] : undefined)
        });
        histories[fieldKey].push({
          role: 'bot',
          content: data.response
        });
      });
      
      setChatHistories(histories);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, advicePath);
    });

    return () => {
      unsubscribeFields();
      unsubscribeSoil();
      unsubscribeAdvice();
    };
  }, [user]);

  useEffect(() => {
    if (isActive) {
      const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
      };

      // 1. Instant jump
      scrollToBottom();

      // 2. Short delay for style/layout recalcs
      const timer1 = setTimeout(scrollToBottom, 50);

      // 3. Longer delay for potential image loading or network latency
      const timer2 = setTimeout(scrollToBottom, 400);

      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    }
  }, [messages.length, isActive, loading]);

  // Speech Recognition Setup
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    let recognition: any = null;
    if (SpeechRecognition) {
      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = profile?.preferredLanguage === 'Hindi' ? 'hi-IN' : 'en-US';

      recognition.onresult = (event: any) => {
        let sessionTranscript = "";
        for (let i = 0; i < event.results.length; i++) {
          const chunk = event.results[i][0].transcript;
          if (sessionTranscript && !sessionTranscript.endsWith(" ") && !chunk.startsWith(" ")) {
            sessionTranscript += " ";
          }
          sessionTranscript += chunk;
        }

        // Append current session transcript to what was already there
        const space = baselineTextRef.current && !baselineTextRef.current.endsWith(" ") && !sessionTranscript.startsWith(" ") ? " " : "";
        setInput(baselineTextRef.current + space + sessionTranscript);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
    
    return () => {
      if (recognition) {
        try { recognition.stop(); } catch (e) {}
      }
    };
  }, [profile?.preferredLanguage]);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      try {
        // Save what's currently in input so we can append to it
        baselineTextRef.current = input;
        recognitionRef.current?.start();
        setIsListening(true);
      } catch (err) {
        console.error("Failed to start recognition:", err);
      }
    }
  };

  const speakMessage = async (index: number, text: string) => {
    if (isSpeaking === index || speechLoading === index) {
      window.speechSynthesis.cancel();
      setIsSpeaking(null);
      setSpeechLoading(null);
      activeSpeechIndexRef.current = null;
      return;
    }

    window.speechSynthesis.cancel();
    setSpeechLoading(index);
    activeSpeechIndexRef.current = index;

    // Use native web speech synthesis
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = profile?.preferredLanguage === 'Hindi' ? 'hi-IN' : 'en-US';
    
    utterance.onstart = () => {
      if (activeSpeechIndexRef.current === index) {
        setSpeechLoading(null);
        setIsSpeaking(index);
      } else {
        window.speechSynthesis.cancel();
      }
    };
    
    utterance.onend = () => {
      if (activeSpeechIndexRef.current === index) {
        setIsSpeaking(null);
        activeSpeechIndexRef.current = null;
      }
    };
    
    utterance.onerror = (e) => {
      console.error("Speech synthesis error:", e);
      if (activeSpeechIndexRef.current === index) {
        setSpeechLoading(null);
        setIsSpeaking(null);
        activeSpeechIndexRef.current = null;
      }
    };

    window.speechSynthesis.speak(utterance);
  };

  const saveNewPlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newPlotName.trim()) return;
    setLoading(true);
    const path = `users/${user.uid}/fields`;
    try {
      const docRef = await addDoc(collection(db, path), {
        name: newPlotName,
        area: 1,
        unit: 'Acres',
        createdAt: serverTimestamp()
      });
      setNewPlotName("");
      setShowAddPlot(false);
      setSelectedFieldId(docRef.id);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    } finally {
      setLoading(false);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      files.forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const img = new Image();
          img.onload = () => {
            // Max dimension for Firestore safety (approx 800px)
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

            // Use high compression for Firestore storage
            const compressed = canvas.toDataURL('image/jpeg', 0.6);
            setSelectedImages(prev => [...prev, compressed].slice(-4)); // Limit to last 4 images
          };
          img.src = reader.result as string;
        };
        reader.readAsDataURL(file);
      });
    }
    // Reset input value so same file can be selected again if removed
    e.target.value = '';
  };

  const removeImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSend = async () => {
    if ((!input.trim() && selectedImages.length === 0) || loading || !user || isProcessingRef.current) return;
    isProcessingRef.current = true;
    setLoading(true);

    if (isListening) {
      recognitionRef.current?.stop();
    }

    const userQuery = input || (selectedImages.length > 0 ? "Analyze these images for me." : "");
    const currentImages = [...selectedImages];
    const selectedField = fields.find(f => f.id === selectedFieldId);
    const relatedNotes = soilReports.filter(r => r.fieldId === selectedFieldId).sort((a, b) => new Date(b.testDate).getTime() - new Date(a.testDate).getTime());
    const latestSoilReport = relatedNotes.length > 0 ? relatedNotes[0] : undefined;

    const currentFieldIdForChat = selectedFieldId || 'default';

    setInput("");
    baselineTextRef.current = "";
    setSelectedImages([]);
    updateMessages(currentFieldIdForChat, prev => [...prev, { role: 'user', content: userQuery, imageUrls: currentImages.length > 0 ? currentImages : undefined }]);

    try {
      let botResponse = "";

      // Prepare history for API
      const history = messages.slice(1).map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      }));

      if (currentImages.length > 0) {
        const imagePayload = currentImages.map(img => ({
          data: img.split(",")[1],
          mimeType: img.split(",")[0].split(":")[1].split(";")[0]
        }));
        botResponse = await analyzeFarmingImage(imagePayload, userQuery, profile?.farmDetails, profile?.preferredLanguage, selectedField, latestSoilReport);
      } else {
        botResponse = await getFarmingAdvice(userQuery, profile?.farmDetails, history, profile?.preferredLanguage, selectedField, latestSoilReport);
      }

      const responseText = botResponse || "I'm sorry, I couldn't process that request.";
      updateMessages(currentFieldIdForChat, prev => [...prev, { role: 'bot', content: responseText }]);

      // Reset loading state early so user can see response
      setLoading(false);
      isProcessingRef.current = false;

      // --- ASYNC BACKGROUND TASKS ---
      // 1. Save to history
      const historyPath = 'advice';
      addDoc(collection(db, historyPath), {
        userId: user.uid,
        query: userQuery,
        response: responseText,
        type: currentImages.length > 0 ? 'vision_chat' : 'chat',
        createdAt: serverTimestamp(),
        fieldId: selectedFieldId || null,
        imageUrls: currentImages.length > 0 ? currentImages : null
      }).catch(err => {
        handleFirestoreError(err, OperationType.CREATE, historyPath);
      });

      // 2. Extract and Sync Farm data in background
      (async () => {
        try {
          const { fieldUpdates, soilUpdates, newTasks } = await extractFarmUpdates(userQuery, responseText, selectedField);

          if (newTasks && newTasks.length > 0) {
            for (const task of newTasks) {
              const taskCollectionPath = `users/${user.uid}/reminders`;
              try {
                await addDoc(collection(db, taskCollectionPath), {
                  userId: user.uid,
                  fieldId: selectedFieldId || null,
                  title: task.title,
                  description: task.description || "",
                  type: task.type || "other",
                  dueDate: task.dueDate || new Date().toISOString().split('T')[0],
                  isCompleted: false,
                  createdAt: serverTimestamp()
                });
              } catch (err) {
                console.error("Failed to schedule AI task:", err);
              }
            }
            setLastSaved("Tasks Scheduled Automatically");
            setTimeout(() => setLastSaved(null), 3000);
          }

          if (selectedFieldId && Object.keys(fieldUpdates).length > 0) {
            const fieldPath = `users/${user.uid}/fields/${selectedFieldId}`;
            try {
              const fieldRef = doc(db, "users", user.uid, "fields", selectedFieldId);
              await updateDoc(fieldRef, {
                ...fieldUpdates,
                updatedAt: serverTimestamp()
              });
              setLastSaved("Plot Data Synced");
              setTimeout(() => setLastSaved(null), 3000);
            } catch (err) {
              handleFirestoreError(err, OperationType.UPDATE, fieldPath);
            }
          }

          if (Object.keys(soilUpdates).length > 0) {
            const syncKey = JSON.stringify({ ...soilUpdates, fieldId: selectedFieldId || 'none' });
            if (lastSoilSyncRef.current !== syncKey) {
              const targetFieldId = selectedFieldId || null;
              const existingReport = soilReports.find(r => r.fieldId === targetFieldId);

              if (existingReport) {
                const soilReportPath = `users/${user.uid}/soil_reports/${existingReport.id}`;
                try {
                  await updateDoc(doc(db, "users", user.uid, "soil_reports", existingReport.id), {
                    ...soilUpdates,
                    updatedAt: serverTimestamp()
                  });
                } catch (err) {
                  handleFirestoreError(err, OperationType.UPDATE, soilReportPath);
                }
              } else {
                const soilCollectionPath = `users/${user.uid}/soil_reports`;
                try {
                  await addDoc(collection(db, soilCollectionPath), {
                    ...soilUpdates,
                    userId: user.uid,
                    fieldId: targetFieldId,
                    testDate: soilUpdates.testDate || new Date().toISOString().split('T')[0],
                    createdAt: serverTimestamp()
                  });
                } catch (err) {
                  handleFirestoreError(err, OperationType.CREATE, soilCollectionPath);
                }
              }
              lastSoilSyncRef.current = syncKey;
              setLastSaved("Soil Records Updated");
              setTimeout(() => setLastSaved(null), 3000);
            }
          }
        } catch (syncErr) {
          console.warn("Auto-sync failed in background:", syncErr);
        }
      })();
      // ---------------------------

    } catch (error) {
      console.error(error);
      updateMessages(currentFieldIdForChat, prev => [...prev, { role: 'bot', content: "Something went wrong. Please try again." }]);
      setLoading(false);
      isProcessingRef.current = false;
    }
  };

  const resetChat = async () => {
    if (messages.length <= 1 || !user) return;

    setLoading(true);
    const advicePath = 'advice';
    try {
      // To avoid composite index requirements for filtered deletion, 
      // we fetch all advice for the user and filter locally.
      const q = query(
        collection(db, advicePath),
        where("userId", "==", user.uid)
      );

      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      const targetFieldId = selectedFieldId || null;

      let count = 0;
      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        const currentDocFieldId = data.fieldId || null;

        if (currentDocFieldId === targetFieldId) {
          batch.delete(docSnap.ref);
          count++;
        }
      });

      if (count > 0) {
        await batch.commit();
      }

      // Local state reset
      setSelectedImages([]);
      setInput("");
      setShowConfirmReset(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, advicePath);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bento-card border-none bg-transparent shadow-none px-2 pb-0 md:px-4 md:pb-0 relative overflow-hidden">
      <div className="sticky top-0 z-[40] bg-[#fbfbf8]/95 backdrop-blur-md pb-2 -mx-2 md:-mx-4 px-2 md:px-4">
        <AnimatePresence>
          {lastSaved && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute top-0 left-0 right-0 z-50 flex justify-center pointer-events-none"
            >
              <div className="bg-green-600/90 backdrop-blur-md text-white px-6 py-2 rounded-full flex items-center gap-2 shadow-xl border border-green-400/30 text-[10px] md:text-xs font-black uppercase tracking-widest mt-2 transform -translate-y-4">
                <CheckCircle2 size={14} />
                Records Synced Automatically
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="w-6 h-6 bg-bento-primary rounded flex items-center justify-center text-white shadow-md shadow-bento-primary/20 shrink-0">
              <MessageSquare size={12} />
            </div>
            <div className="min-w-0">
              <h2 className="text-[11px] md:text-sm font-black text-bento-text-main tracking-tight leading-none truncate">Advisor AI</h2>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full min-w-0">
            <div className="flex-1 overflow-x-auto scrollbar-hide py-0.5">
              <div className="flex bg-zinc-100 p-0.5 rounded-lg w-max">
                <button
                  onClick={() => setSelectedFieldId("")}
                  className={`whitespace-nowrap px-2.5 py-1 ${!selectedFieldId ? 'bg-white text-bento-primary shadow-sm rounded-md' : 'text-zinc-500'} text-[9px] font-black uppercase tracking-widest transition-all`}
                >
                  General
                </button>
                {fields.map(f => (
                  <button
                    key={f.id}
                    onClick={() => setSelectedFieldId(f.id)}
                    className={`flex items-center gap-1 whitespace-nowrap px-2.5 py-1 ${selectedFieldId === f.id ? 'bg-teal-600 text-white shadow-sm rounded-md' : 'text-zinc-500'} text-[9px] font-black uppercase tracking-widest transition-all`}
                  >
                    <Compass size={10} /> {f.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setShowAddPlot(true)}
                className="w-7 h-7 bg-teal-50 text-teal-600 border border-teal-100 rounded-lg transition-colors font-black flex items-center justify-center shadow-sm"
                title="Add New Plot Context"
              >
                +
              </button>

              {showConfirmReset ? (
                <div className="flex items-center gap-1 bg-red-50 p-0.5 rounded-lg border border-red-100">
                  <button onClick={resetChat} className="text-white bg-red-500 font-bold text-[9px] px-2 py-1 rounded-md">Clear</button>
                  <button onClick={() => setShowConfirmReset(false)} className="text-zinc-500 bg-white border border-zinc-200 font-bold text-[9px] px-2 py-1 rounded-md">X</button>
                </div>
              ) : (
                <button
                  onClick={() => setShowConfirmReset(true)}
                  className="w-7 h-7 bg-white border border-bento-border rounded-lg text-zinc-400 hover:text-red-500 transition-all flex items-center justify-center shadow-sm"
                  title="Reset Chat"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showAddPlot && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="absolute z-40 top-20 left-0 right-0 bg-white shadow-2xl p-4 border border-zinc-200 rounded-3xl mx-4 md:mx-8">
            <h3 className="font-black text-zinc-800 mb-2 border-b border-zinc-100 pb-2">Quick Map Field</h3>
            <form onSubmit={saveNewPlot} className="flex gap-2">
              <input type="text" placeholder="e.g. North Plot" value={newPlotName} onChange={e => setNewPlotName(e.target.value)} required className="flex-1 bg-zinc-50 border border-zinc-200 rounded-xl px-4 focus:outline-none focus:border-teal-500 font-bold text-sm" />
              <button type="submit" disabled={loading} className="bg-teal-600 text-white font-black text-sm px-6 py-2 rounded-xl hover:bg-teal-700">{loading ? 'Saving...' : 'Add'}</button>
              <button type="button" onClick={() => setShowAddPlot(false)} className="text-zinc-400 p-2 hover:text-red-500 rounded-xl bg-zinc-50 border border-zinc-200"><X size={18} /></button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-2 mb-0 pr-1 md:pr-2 scrollbar-hide bg-white/40 backdrop-blur-sm relative py-2 px-2 md:py-4 md:px-6 rounded-2xl md:rounded-[32px] border-2 border-white/60 shadow-inner"
      >
        {messages.length === 1 && (
          <div className="min-h-full flex flex-col items-center justify-center py-4">
            <div className="max-w-md w-full grid grid-cols-2 gap-2 md:gap-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="action-card success animate-in fade-in zoom-in duration-300 p-2 md:p-4"
              >
                <div className="action-card-icon w-8 h-8 md:w-12 md:h-12">
                  <Camera size={18} className="md:w-6 md:h-6" />
                </div>
                <span className="text-[10px] md:text-xs font-black uppercase tracking-widest leading-tight">Snap Photo</span>
                <p className="text-[8px] md:text-[9px] mt-1 font-bold opacity-60">Check Diseases</p>
              </button>

              <button
                onClick={() => setInput("What should I do on my farm today?")}
                className="action-card primary animate-in fade-in zoom-in duration-300 delay-75 p-2 md:p-4"
              >
                <div className="action-card-icon w-8 h-8 md:w-12 md:h-12">
                  <Leaf size={18} className="md:w-6 md:h-6" />
                </div>
                <span className="text-[10px] md:text-xs font-black uppercase tracking-widest leading-tight">Daily Plan</span>
                <p className="text-[8px] md:text-[9px] mt-1 font-bold opacity-60">Get To-Do List</p>
              </button>

              <button
                onClick={() => setInput("How is the soil health for my current crops?")}
                className="action-card warning animate-in fade-in zoom-in duration-300 delay-150 p-2 md:p-4"
              >
                <div className="action-card-icon w-8 h-8 md:w-12 md:h-12">
                  <Sprout size={18} className="md:w-6 md:h-6" />
                </div>
                <span className="text-[10px] md:text-xs font-black uppercase tracking-widest leading-tight">Soil Check</span>
                <p className="text-[8px] md:text-[9px] mt-1 font-bold opacity-60">Health Report</p>
              </button>

              <button
                onClick={() => setInput("How to improve my crop yield using local resources?")}
                className="action-card danger animate-in fade-in zoom-in duration-300 delay-200 p-2 md:p-4"
              >
                <div className="action-card-icon w-8 h-8 md:w-12 md:h-12">
                  <BookOpen size={18} className="md:w-6 md:h-6" />
                </div>
                <span className="text-[10px] md:text-xs font-black uppercase tracking-widest leading-tight">Yield Tips</span>
                <p className="text-[8px] md:text-[9px] mt-1 font-bold opacity-60">Improve Growth</p>
              </button>
            </div>
            <p className="mt-4 text-[9px] md:text-xs font-black text-zinc-400 uppercase tracking-[0.2em]">Or just type below</p>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
            <div className={`group relative max-w-[90%] md:max-w-[80%] p-4 md:p-6 rounded-[2rem] ${
              m.role === 'user' 
                ? 'bg-gradient-to-br from-[#123524] to-[#255239] text-white ml-4 md:ml-8 shadow-[0_12px_30px_rgba(18,53,36,0.15)] rounded-tr-sm border border-[#3e7b27]/30' 
                : 'glass-panel text-bento-text-main mr-4 md:mr-8 rounded-tl-sm shadow-[0_8px_30px_rgba(18,53,36,0.06)]'
            }`}>
              {m.imageUrls && m.imageUrls.length > 0 && (
                <div className={`grid ${m.imageUrls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'} gap-2 mb-3`}>
                  {m.imageUrls.map((url, idx) => (
                    <div key={idx} className="rounded-xl overflow-hidden shadow-md border border-white/20 relative group/img">
                      <img src={url} alt={`Context ${idx}`} className="w-full h-auto max-h-32 md:max-h-48 object-cover transition-transform duration-500 group-hover/img:scale-105" referrerPolicy="no-referrer" />
                      <div className="absolute inset-0 bg-black/10 opacity-0 group-hover/img:opacity-100 transition-opacity duration-300"></div>
                    </div>
                  ))}
                </div>
              )}
              <div className={`markdown-body ${m.role === 'user' ? 'text-white' : ''} text-[14px] md:text-[16px] font-sans leading-relaxed`}>
                <Markdown>{m.content}</Markdown>
              </div>

              {m.role === 'bot' && (
                <div className="absolute -right-3 md:-right-12 bottom-2 flex flex-col gap-2">
                  <button
                    onClick={() => speakMessage(i, m.content)}
                    className={`p-2.5 bg-white/90 backdrop-blur-md border border-white/50 rounded-xl md:rounded-2xl transition-all duration-300 shadow-lg flex items-center justify-center ${(isSpeaking === i || speechLoading === i)
                        ? 'text-rose-500 border-rose-200 scale-110 opacity-100 shadow-rose-500/20'
                        : 'opacity-0 group-hover:opacity-100 text-[#5e7264] hover:bg-[#123524] hover:border-[#123524] hover:text-white hover:-translate-y-1'
                      }`}
                    title={isSpeaking === i || speechLoading === i ? "Stop Speech" : "Speak Message"}
                  >
                    {speechLoading === i ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : isSpeaking === i ? (
                      <Square size={16} fill="currentColor" />
                    ) : (
                      <Volume2 size={16} />
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border-2 border-bento-border p-3 rounded-[20px] shadow-xl mr-12">
              <Loader2 className="animate-spin text-bento-primary" size={20} />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} className="h-px w-full" />
      </div>
      <div className="flex flex-col gap-1 pb-0">
        {selectedImages.length > 0 && (
          <div className="flex flex-wrap gap-2 bg-white p-2 rounded-2xl border border-bento-border shadow-lg animate-in fade-in slide-in-from-bottom-2">
            {selectedImages.map((img, idx) => (
              <div key={idx} className="relative w-12 h-12 md:w-16 md:h-16 rounded-xl overflow-hidden border border-bento-border shadow-inner shrink-0">
                <img src={img} alt={`Preview ${idx}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                <button
                  onClick={() => removeImage(idx)}
                  className="absolute top-0.5 right-0.5 p-1 bg-black/60 text-white rounded-full hover:bg-red-500 transition-colors"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
            <div className="flex flex-col justify-center px-1">
              <div className="flex items-center gap-1.5">
                <p className="text-[10px] md:text-xs font-black text-bento-text-main uppercase tracking-widest">{selectedImages.length} Photo{selectedImages.length > 1 ? 's' : ''}</p>
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shrink-0" />
              </div>
              <p className="text-[8px] md:text-[9px] text-zinc-400 font-bold uppercase tracking-widest mt-0.5">Multi-Image Mode</p>
            </div>
          </div>
        )}

        <div className="flex gap-1.5 md:gap-2 items-center">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageSelect}
            accept="image/*"
            multiple
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={`p-2 md:p-3 rounded-xl border-2 transition-all shadow-lg flex items-center justify-center shrink-0 ${selectedImages.length > 0 ? 'bg-bento-accent border-bento-accent text-white scale-105' : 'bg-white border-bento-border text-zinc-400 hover:text-bento-primary active:scale-95'}`}
          >
            <Camera size={18} />
          </button>

          <button
            type="button"
            onClick={toggleListening}
            className={`p-2 md:p-3 rounded-xl border-2 transition-all shadow-lg flex items-center justify-center shrink-0 ${isListening ? 'bg-red-500 border-red-500 text-white animate-pulse scale-105' : 'bg-white border-bento-border text-zinc-400 hover:text-bento-primary active:scale-95'}`}
            title={isListening ? "Stop Listening" : "Voice Typing"}
          >
            <Mic size={18} />
          </button>

          <div className="flex-1 relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => (e.key === 'Enter' && !e.shiftKey) && handleSend()}
              placeholder="Ask your query..."
              className="w-full bg-white border border-bento-border rounded-xl px-4 py-2.5 md:py-3 focus:outline-none focus:ring-4 focus:ring-bento-primary/5 focus:border-bento-primary transition-all shadow-lg font-bold text-sm md:text-base placeholder:text-zinc-300"
            />
          </div>

          <button
            onClick={handleSend}
            disabled={loading || (!input.trim() && selectedImages.length === 0)}
            className="p-2.5 md:px-4 md:py-3 bg-bento-primary text-white rounded-xl font-black hover:bg-black transition-all disabled:opacity-20 shadow-lg flex items-center justify-center shrink-0 active:scale-95"
          >
            {loading ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}
