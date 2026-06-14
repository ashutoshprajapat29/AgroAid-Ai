import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X, Send, Volume2, VolumeX, Camera, Compass,
  MessageSquare, Sparkles, AlertTriangle, RefreshCw,
  MapPin, CheckCircle2, Loader2, Play, CircleAlert
} from "lucide-react";

interface SimulatorProps {
  onClose: () => void;
  lang: "English" | "Hindi";
}

/* ─────────────────────────────────────────────────────────────
   1. FARMING ADVISOR SIMULATOR
   ───────────────────────────────────────────────────────────── */
export function AdvisorSimulator({ onClose, lang }: SimulatorProps) {
  const [messages, setMessages] = useState<Array<{ sender: "user" | "bot"; text: string }>>([]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const t = {
    title: lang === "Hindi" ? "कृषि सलाहकार सिम्युलेटर" : "Farming Advisor Simulator",
    subtitle: lang === "Hindi" ? "एआई सलाह की त्वरित जांच करें" : "Quick preview of AI advisor recommendations",
    placeholder: lang === "Hindi" ? "अपनी कृषि संबंधी समस्या यहाँ लिखें..." : "Type your farming issue here...",
    send: lang === "Hindi" ? "भेजें" : "Send",
    audioPlay: lang === "Hindi" ? "सलाह सुनें" : "Listen to advice",
    audioStop: lang === "Hindi" ? "रोकें" : "Stop Audio",
    typing: lang === "Hindi" ? "सलाहकार सोच रहा है..." : "Advisor is thinking...",
    selectPrompt: lang === "Hindi" ? "इनमें से कोई एक सवाल चुनें:" : "Select a sample question:",
    prompts: [
      {
        q: lang === "Hindi" ? "टमाटर के पत्ते मुड़ रहे हैं, क्या करें?" : "Tomato leaves curling, what to do?",
        a: lang === "Hindi" 
          ? "टमाटर के पत्ते मुड़ना (Leaf Curl Virus) सफेद मक्खी के कारण होता है।\n\nसमाधान:\n1. नीम के तेल (NSKE 5%) का छिड़काव करें।\n2. पीले चिपचिपे कार्ड (Yellow Sticky Traps) खेत में लगाएं।\n3. रोगग्रस्त पौधों को उखाड़कर नष्ट कर दें।"
          : "Tomato leaf curl virus is spread by whiteflies.\n\nSolutions:\n1. Spray Neem oil extract (NSKE 5%) weekly.\n2. Install yellow sticky traps to catch whiteflies.\n3. Uproot and burn severely infected plants."
      },
      {
        q: lang === "Hindi" ? "गेहूं में यूरिया कब डालना चाहिए?" : "When to apply urea in wheat?",
        a: lang === "Hindi"
          ? "गेहूं में यूरिया (नाइट्रोजन) को 3 भागों में बांटकर डालें:\n1. 1/3 भाग: बुआई के समय (आधार खुराक)\n2. 1/3 भाग: पहली सिंचाई पर (21-25 दिन पर, ताज जड़ अवस्था)\n3. 1/3 भाग: दूसरी सिंचाई पर (40-45 दिन पर, कल्ले बनते समय)"
          : "Apply Urea (Nitrogen) in wheat in three split doses:\n1. 1/3rd: During sowing (Basal dose).\n2. 1/3rd: At 1st irrigation (21-25 days, Crown Root Initiation).\n3. 1/3rd: At 2nd irrigation (40-45 days, Tillering stage)."
      },
      {
        q: lang === "Hindi" ? "आलू की पछेती झुलसा बीमारी का जैविक इलाज?" : "Organic control for Late Blight in Potato?",
        a: lang === "Hindi"
          ? "आलू का पछेती झुलसा (Late Blight) एक कवक रोग है।\n\nजैविक उपाय:\n1. कॉपर ऑक्सीक्लोराइड का छिड़काव 2 ग्राम/लीटर पानी में मिलाकर करें।\n2. ट्राइकोडर्मा विरिडी (Trichoderma viride) 5 ग्राम/लीटर पानी में मिलाकर छिड़कें।\n3. खेतों में जलभराव न होने दें।"
          : "Late Blight of potato is a severe fungal disease.\n\nOrganic Solutions:\n1. Spray Trichoderma viride formulations (5g/liter).\n2. Apply Pseudomonas fluorescens spray as a bio-preventative.\n3. Ensure proper drainage to avoid moisture build-up."
      }
    ]
  };

  useEffect(() => {
    // Initial greeting
    setMessages([
      {
        sender: "bot",
        text: lang === "Hindi"
          ? "नमस्कार! मैं आपका एग्रोएड एआई कृषि सलाहकार हूं। आप मुझसे फसल रोगों, खाद प्रबंधन या सामान्य खेती के बारे में पूछ सकते हैं।"
          : "Hello! I am your AgroAid AI Farming Advisor. Ask me anything about crop diseases, fertilizers, or general farming practices."
      }
    ]);
  }, [lang]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const simulateBotResponse = (answer: string) => {
    setIsTyping(true);
    setIsPlayingAudio(false);
    
    // Simulate streaming text
    setTimeout(() => {
      setIsTyping(false);
      let currentText = "";
      const speed = 15; // ms per char
      let i = 0;
      
      setMessages(prev => [...prev, { sender: "bot", text: "" }]);
      
      const interval = setInterval(() => {
        if (i < answer.length) {
          currentText += answer[i];
          setMessages(prev => {
            const next = [...prev];
            next[next.length - 1] = { sender: "bot", text: currentText };
            return next;
          });
          i++;
        } else {
          clearInterval(interval);
        }
      }, speed);
    }, 1200);
  };

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;

    const query = inputText;
    setMessages(prev => [...prev, { sender: "user", text: query }]);
    setInputText("");

    // Simple matching or fallback
    const matchedPrompt = t.prompts.find(p => 
      query.toLowerCase().includes("leaf") || 
      query.toLowerCase().includes("curl") || 
      query.toLowerCase().includes("tomato") || 
      query.toLowerCase().includes("पत्ता") || 
      query.toLowerCase().includes("टमाटर")
    );

    let answer = "";
    if (matchedPrompt) {
      answer = matchedPrompt.a;
    } else {
      answer = lang === "Hindi"
        ? `आपके सवाल "${query}" का विश्लेषण किया जा रहा है... \nएग्रोएड एआई सलाह देता है कि फसल को पर्याप्त धूप दें, सप्ताह में एक बार पत्तियों की जांच करें और उचित जैविक खादों का उपयोग करें। पूर्ण विश्लेषण के लिए कृपया लॉगिन करें!`
        : `Analyzing your query: "${query}"... \nAgroAid AI suggests maintaining adequate soil aeration, inspecting the underside of leaves for early pest indicators, and applying certified bio-fertilizers. Please sign in to access personalized advisor profiles.`;
    }
    
    simulateBotResponse(answer);
  };

  const selectPrompt = (prompt: { q: string; a: string }) => {
    setMessages(prev => [...prev, { sender: "user", text: prompt.q }]);
    simulateBotResponse(prompt.a);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-theme-base/85 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="w-full max-w-lg glass-panel border-2 border-emerald-500/20 rounded-[2.5rem] overflow-hidden flex flex-col h-[85vh] max-h-[620px] shadow-2xl"
      >
        {/* Header */}
        <div className="p-5 border-b border-emerald-500/10 bg-emerald-500/5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-400 to-green-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
              <MessageSquare size={18} className="text-white" />
            </div>
            <div>
              <h3 className="text-sm font-black text-bento-text-main tracking-tight">{t.title}</h3>
              <p className="text-[10px] text-bento-text-muted font-bold tracking-wide uppercase">{t.subtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-bento-text-muted hover:text-bento-text-main rounded-xl hover:bg-[var(--bg-hover)] border border-transparent hover:border-[var(--border-input)] transition-all cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Chat window */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-[1.5rem] p-4 text-xs font-semibold leading-relaxed ${
                  msg.sender === "user"
                    ? "bg-emerald-500 text-white rounded-br-none shadow-md shadow-emerald-500/10"
                    : "bg-[var(--bg-input)] border border-[var(--border-input)] text-bento-text-main rounded-bl-none"
                }`}
                style={{ whiteSpace: "pre-line" }}
              >
                {msg.text}

                {/* Simulated Audio playback option for bot responses */}
                {msg.sender === "bot" && msg.text && !isTyping && index === messages.length - 1 && (
                  <div className="mt-3 pt-3 border-t border-[var(--border-input)] flex items-center gap-3">
                    <button
                      onClick={() => setIsPlayingAudio(!isPlayingAudio)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                        isPlayingAudio
                          ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                          : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20"
                      }`}
                    >
                      {isPlayingAudio ? (
                        <>
                          <VolumeX size={11} />
                          <span>{t.audioStop}</span>
                        </>
                      ) : (
                        <>
                          <Volume2 size={11} />
                          <span>{t.audioPlay}</span>
                        </>
                      )}
                    </button>

                    {/* Sound waves animation */}
                    {isPlayingAudio && (
                      <div className="flex items-end gap-0.5 h-3">
                        <div className="w-[2px] bg-amber-400 animate-bounce" style={{ animationDuration: '0.8s' }} />
                        <div className="w-[2px] bg-amber-400 animate-bounce" style={{ animationDuration: '0.5s', animationDelay: '0.2s' }} />
                        <div className="w-[2px] bg-amber-400 animate-bounce" style={{ animationDuration: '0.7s', animationDelay: '0.1s' }} />
                        <div className="w-[2px] bg-amber-400 animate-bounce" style={{ animationDuration: '0.9s', animationDelay: '0.3s' }} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-[var(--bg-input)] border border-[var(--border-input)] rounded-[1.5rem] rounded-bl-none p-4 text-xs text-bento-text-muted font-bold flex items-center gap-2">
                <Loader2 className="animate-spin text-emerald-400" size={14} />
                <span>{t.typing}</span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Footer prompts & input */}
        <div className="p-4 border-t border-emerald-500/10 bg-[var(--bg-card)] shrink-0 space-y-3">
          {messages.length === 1 && !isTyping && (
            <div className="space-y-1.5">
              <p className="text-[9px] font-black uppercase text-bento-text-muted tracking-wider">{t.selectPrompt}</p>
              <div className="flex flex-col gap-1.5">
                {t.prompts.map((p, idx) => (
                  <button
                    key={idx}
                    onClick={() => selectPrompt(p)}
                    className="w-full text-left px-3.5 py-2 bg-[var(--bg-input)] border border-[var(--border-input)] hover:border-emerald-500/30 text-bento-text-main text-xs font-semibold rounded-xl transition-all hover:bg-[var(--bg-hover)] cursor-pointer truncate"
                  >
                    {p.q}
                  </button>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleSend} className="flex gap-2">
            <input
              type="text"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder={t.placeholder}
              className="flex-1 px-4 py-3 bg-[var(--bg-input)] border-2 border-[var(--border-input)] focus:border-emerald-500/40 rounded-xl text-xs font-semibold text-bento-text-main focus:outline-none placeholder:text-bento-text-muted/40"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || isTyping}
              className="p-3 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl transition-all disabled:opacity-40 cursor-pointer shadow-lg shadow-emerald-500/20 flex items-center justify-center shrink-0"
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   2. DISEASE SCANNER SIMULATOR
   ───────────────────────────────────────────────────────────── */
const LEAF_SAMPLES = [
  {
    id: "tomato_blight",
    nameEn: "Tomato Leaf (Early Blight)",
    nameHi: "टमाटर का पत्ता (अगेती झुलसा रोग)",
    img: "🍅",
    color: "from-amber-500/20 to-rose-500/20",
    diagnosisEn: "Early Blight (Alternaria solani)",
    diagnosisHi: "अगेती झुलसा (अल्टरनेरिया सोलानी)",
    confidence: "94.8%",
    status: "warning",
    remedyEn: "1. Trim infected lower branches.\n2. Apply Copper-based organic fungicide.\n3. Water at the base, keeping foliage dry.",
    remedyHi: "1. नीचे की संक्रमित टहनियों को काटें।\n2. तांबा-आधारित जैविक कवकनाशी का प्रयोग करें।\n3. पत्तों को सुखा रखते हुए पौधे की जड़ में पानी दें।"
  },
  {
    id: "rice_blast",
    nameEn: "Rice Leaf (Blast Disease)",
    nameHi: "धान का पत्ता (झोंका/ब्लास्ट रोग)",
    img: "🌾",
    color: "from-yellow-600/20 to-amber-700/20",
    diagnosisEn: "Rice Blast (Magnaporthe oryzae)",
    diagnosisHi: "धान का झोंका रोग (मैग्नापोर्थे ओराइजी)",
    confidence: "97.2%",
    status: "danger",
    remedyEn: "1. Avoid excessive Nitrogen fertilizers.\n2. Spray Tricyclazole fungicide formulation.\n3. Use blast-resistant crop varieties.",
    remedyHi: "1. अत्यधिक नाइट्रोजन उर्वरकों के उपयोग से बचें।\n2. ट्राइसाइक्लाजोल कवकनाशी के घोल का छिड़काव करें।\n3. ब्लास्ट-प्रतिरोधी बीज किस्मों का प्रयोग करें।"
  },
  {
    id: "potato_healthy",
    nameEn: "Potato Leaf (Healthy)",
    nameHi: "आलू का पत्ता (स्वस्थ)",
    img: "🥔",
    color: "from-emerald-500/20 to-green-600/20",
    diagnosisEn: "Healthy Crop - No Pathogen Detected",
    diagnosisHi: "स्वस्थ फसल - कोई रोग नहीं मिला",
    confidence: "99.1%",
    status: "success",
    remedyEn: "1. Maintain crop rotation cycles.\n2. Add organic compost to soil.\n3. Spray seaweed fertilizer for optimal growth.",
    remedyHi: "1. फसल चक्र चक्र बनाए रखें।\n2. मिट्टी में जैविक खाद डालें।\n3. अनुकूल वृद्धि के लिए समुद्री घास उर्वरक का छिड़काव करें।"
  }
];

export function ScannerSimulator({ onClose, lang }: SimulatorProps) {
  const [selectedLeaf, setSelectedLeaf] = useState<typeof LEAF_SAMPLES[0] | null>(null);
  const [scanState, setScanState] = useState<"idle" | "scanning" | "done">("idle");
  const [progress, setProgress] = useState(0);
  const [scanMessage, setScanMessage] = useState("");

  const t = {
    title: lang === "Hindi" ? "फसल रोग स्कैनर सिम्युलेटर" : "Crop Disease Scanner Simulator",
    subtitle: lang === "Hindi" ? "एआई विजन रोग पहचान का परीक्षण करें" : "Test AI vision leaf diagnosis",
    selectLeaf: lang === "Hindi" ? "स्कैन करने के लिए पत्ती का चयन करें:" : "Select a leaf sample to scan:",
    scanningText: lang === "Hindi" ? "स्कैनिंग जारी है..." : "Scanning in progress...",
    diagnose: lang === "Hindi" ? "रोग पहचान रिपोर्ट" : "Pathology Report",
    matchRate: lang === "Hindi" ? "सटीकता दर" : "Match Confidence",
    action: lang === "Hindi" ? "सुझाए गए उपचार उपाय:" : "Recommended Treatments:",
    btnReset: lang === "Hindi" ? "दूसरा पत्ता स्कैन करें" : "Scan Another Leaf",
    threatLevel: lang === "Hindi" ? "खतरे का स्तर:" : "Threat Level:",
    threats: {
      danger: lang === "Hindi" ? "गंभीर" : "High",
      warning: lang === "Hindi" ? "मध्यम" : "Moderate",
      success: lang === "Hindi" ? "कोई नहीं" : "None"
    }
  };

  useEffect(() => {
    if (scanState === "scanning") {
      setProgress(0);
      const messages = lang === "Hindi" 
        ? [
            "पत्ती की संरचना का विश्लेषण...",
            "विकृति पैटर्न का मिलान...",
            "एग्रोएड पैथोलॉजी डेटाबेस से तुलना...",
            "अंतिम परिणाम संकलित किया जा रहा है..."
          ]
        : [
            "Analyzing leaf skeletal structure...",
            "Detecting lesion discoloration vectors...",
            "Comparing with pathogen database...",
            "Compiling final analysis sheet..."
          ];

      setScanMessage(messages[0]);
      
      const interval = setInterval(() => {
        setProgress(prev => {
          const next = prev + 10;
          
          // Rotate scanning messages
          const msgIdx = Math.min(Math.floor((next / 100) * messages.length), messages.length - 1);
          setScanMessage(messages[msgIdx]);

          if (next >= 100) {
            clearInterval(interval);
            setScanState("done");
            return 100;
          }
          return next;
        });
      }, 250);

      return () => clearInterval(interval);
    }
  }, [scanState, selectedLeaf, lang]);

  const handleSelectLeaf = (leaf: typeof LEAF_SAMPLES[0]) => {
    setSelectedLeaf(leaf);
    setScanState("scanning");
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-theme-base/85 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="w-full max-w-md glass-panel border-2 border-rose-500/20 rounded-[2.5rem] overflow-hidden flex flex-col shadow-2xl"
      >
        {/* Header */}
        <div className="p-5 border-b border-rose-500/10 bg-rose-500/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-rose-400 to-rose-600 flex items-center justify-center shadow-lg shadow-rose-500/25">
              <Camera size={18} className="text-white" />
            </div>
            <div>
              <h3 className="text-sm font-black text-bento-text-main tracking-tight">{t.title}</h3>
              <p className="text-[10px] text-bento-text-muted font-bold tracking-wide uppercase">{t.subtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-bento-text-muted hover:text-bento-text-main rounded-xl hover:bg-[var(--bg-hover)] border border-transparent hover:border-[var(--border-input)] transition-all cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Box */}
        <div className="p-6 space-y-6">
          {scanState === "idle" && (
            <div className="space-y-4">
              <p className="text-xs font-black uppercase text-bento-text-muted tracking-wider text-center">{t.selectLeaf}</p>
              <div className="grid gap-3">
                {LEAF_SAMPLES.map(leaf => (
                  <button
                    key={leaf.id}
                    onClick={() => handleSelectLeaf(leaf)}
                    className="w-full p-4 rounded-2xl border bg-[var(--bg-input)] border-[var(--border-input)] hover:border-rose-500/30 flex items-center gap-4 transition-all hover:bg-[var(--bg-hover)] hover:-translate-y-0.5 cursor-pointer text-left group"
                  >
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${leaf.color} flex items-center justify-center text-2xl shadow-inner`}>
                      {leaf.img}
                    </div>
                    <div className="flex-1">
                      <h4 className="text-xs font-black text-bento-text-main">{lang === "Hindi" ? leaf.nameHi : leaf.nameEn}</h4>
                      <span className="text-[9px] uppercase font-bold tracking-widest text-bento-text-muted group-hover:text-rose-400 transition-colors">
                        Click to Scan &rarr;
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {scanState === "scanning" && selectedLeaf && (
            <div className="space-y-6 text-center">
              {/* Vision viewfinder mockup */}
              <div className="relative w-48 h-48 mx-auto rounded-3xl bg-black/40 border-2 border-rose-500/30 flex items-center justify-center overflow-hidden">
                {/* Visual crop symbol */}
                <span className="text-7xl select-none animate-pulse">{selectedLeaf.img}</span>

                {/* Viewfinder brackets */}
                <div className="absolute top-3 left-3 w-4 h-4 border-t-2 border-l-2 border-rose-400" />
                <div className="absolute top-3 right-3 w-4 h-4 border-t-2 border-r-2 border-rose-400" />
                <div className="absolute bottom-3 left-3 w-4 h-4 border-b-2 border-l-2 border-rose-400" />
                <div className="absolute bottom-3 right-3 w-4 h-4 border-b-2 border-r-2 border-rose-400" />

                {/* Neon green sweep line */}
                <div className="absolute left-0 w-full h-[3px] bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_rgba(52,211,153,0.9)] animate-[scan-beam_2s_infinite_linear]" />
              </div>

              <div className="space-y-2 max-w-xs mx-auto">
                <p className="text-xs font-black text-bento-text-main">{t.scanningText}</p>
                <p className="text-[10px] font-bold text-bento-text-muted uppercase tracking-wider h-4 overflow-hidden">{scanMessage}</p>
                <div className="w-full bg-[var(--bg-input)] h-1.5 rounded-full overflow-hidden border border-[var(--border-input)] mt-2">
                  <div className="bg-rose-500 h-full rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
              </div>
            </div>
          )}

          {scanState === "done" && selectedLeaf && (
            <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="space-y-5">
              {/* Diagnosis header */}
              <div className="p-4 bg-[var(--bg-input)] rounded-2xl border border-[var(--border-input)] flex items-start gap-3.5">
                <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  <CircleAlert size={18} />
                </div>
                <div className="flex-1">
                  <span className="text-[9px] font-black uppercase text-bento-text-muted tracking-wider">{t.diagnose}</span>
                  <h4 className="text-sm font-black text-bento-text-main mt-0.5">{lang === "Hindi" ? selectedLeaf.diagnosisHi : selectedLeaf.diagnosisEn}</h4>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className="text-[9px] font-bold bg-emerald-500/10 text-emerald-400 px-2 py-0.5 border border-emerald-500/20 rounded-md">
                      {t.matchRate}: {selectedLeaf.confidence}
                    </span>
                    <span className={`text-[9px] font-bold px-2 py-0.5 border rounded-md uppercase tracking-wider ${
                      selectedLeaf.status === "danger" ? "bg-rose-500/10 border-rose-500/20 text-rose-400" :
                      selectedLeaf.status === "warning" ? "bg-amber-500/10 border-amber-500/20 text-amber-400" :
                      "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                    }`}>
                      {t.threatLevel} {t.threats[selectedLeaf.status as keyof typeof t.threats]}
                    </span>
                  </div>
                </div>
              </div>

              {/* Treatment details */}
              <div className="space-y-2">
                <h5 className="text-[10px] font-black uppercase tracking-wider text-bento-text-muted">{t.action}</h5>
                <div
                  className="p-4 rounded-2xl bg-[var(--bg-input)] border border-[var(--border-input)] text-xs text-bento-text-main font-semibold leading-relaxed"
                  style={{ whiteSpace: "pre-line" }}
                >
                  {lang === "Hindi" ? selectedLeaf.remedyHi : selectedLeaf.remedyEn}
                </div>
              </div>

              <button
                onClick={() => setScanState("idle")}
                className="w-full py-4 border border-rose-500/20 bg-rose-500/10 hover:bg-rose-500/15 text-rose-400 font-black text-xs uppercase tracking-wider rounded-2xl transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <RefreshCw size={13} />
                <span>{t.btnReset}</span>
              </button>
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* Styled inline animation inside component */}
      <style>{`
        @keyframes scan-beam {
          0%, 100% { top: 0%; opacity: 0.3; }
          50% { top: 100%; opacity: 1; }
        }
      `}</style>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   3. FARM PLOTS BOUNDARY SIMULATOR
   ───────────────────────────────────────────────────────────── */
export function PlotsSimulator({ onClose, lang }: SimulatorProps) {
  const [points, setPoints] = useState<Array<{ x: number; y: number }>>([]);
  const containerRef = useRef<SVGSVGElement>(null);

  const t = {
    title: lang === "Hindi" ? "फार्म प्लॉट मैपिंग सिम्युलेटर" : "Farm Plots Mapping Simulator",
    subtitle: lang === "Hindi" ? "सीमा अंकन और सिंचाई अनुमान" : "Draw coordinate boundaries on map",
    instructions: lang === "Hindi" 
      ? "नीचे खेत की ग्रिड पर 3 या अधिक बिंदुओं पर क्लिक करें और अपने प्लाट की सीमा बनाएं:"
      : "Tap/Click 3 or more points on the grid below to define your plot boundary:",
    statsTitle: lang === "Hindi" ? "भू-अंकन आंकड़े" : "Plot Geometry Metrics",
    pointsPlaced: lang === "Hindi" ? "अंकित स्थान" : "Points Placed",
    estArea: lang === "Hindi" ? "अनुमानित क्षेत्रफल" : "Calculated Area",
    estPerimeter: lang === "Hindi" ? "परिमाप" : "Perimeter",
    soilHealth: lang === "Hindi" ? "मृदा गुणवत्ता प्रोफाइल" : "Soil Health Assessment",
    soilMoisture: lang === "Hindi" ? "नमी स्तर:" : "Moisture Level:",
    soilNitrogen: lang === "Hindi" ? "नाइट्रोजन:" : "Nitrogen Level:",
    waterReq: lang === "Hindi" ? "अनुशंसित जल:" : "Drip Water Needs:",
    btnClear: lang === "Hindi" ? "खेत साफ करें" : "Reset Canvas",
    btnSubmit: lang === "Hindi" ? "सीमा सहेजें" : "Save Boundary",
    normal: lang === "Hindi" ? "सामान्य" : "Normal",
    low: lang === "Hindi" ? "कम" : "Low",
    optimal: lang === "Hindi" ? "पर्याप्त" : "Optimal"
  };

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);
    
    // Add point to array
    setPoints(prev => [...prev, { x, y }]);
  };

  // Shoelace formula for polygon area
  const getCalculatedArea = () => {
    if (points.length < 3) return 0;
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      sum += p1.x * p2.y - p2.x * p1.y;
    }
    return Math.abs(sum / 2);
  };

  // Perimeter calculation
  const getPerimeter = () => {
    if (points.length < 2) return 0;
    let distance = 0;
    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      distance += Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    }
    return Math.round(distance);
  };

  const area = getCalculatedArea();
  // Scale area value to look like acreage (e.g. 0.2 - 4.5 acres)
  const acreage = area > 0 ? (area / 12000).toFixed(2) : "0.00";
  const perimeter = getPerimeter() > 0 ? Math.round(getPerimeter() * 5) : 0;
  
  // Dynamic moisture estimate based on centroid position
  const avgY = points.length > 0 ? points.reduce((sum, p) => sum + p.y, 0) / points.length : 150;
  const moisturePercent = Math.min(Math.max(Math.round((avgY / 250) * 100), 22), 85);
  const dripWaterRequirement = Math.round(parseFloat(acreage) * 3200);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-theme-base/85 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="w-full max-w-2xl glass-panel border-2 border-teal-500/20 rounded-[2.5rem] overflow-hidden flex flex-col md:flex-row shadow-2xl h-[90vh] md:h-auto max-h-[580px]"
      >
        {/* Left: Map drawing grid */}
        <div className="flex-1 p-5 md:p-6 flex flex-col justify-between border-b md:border-b-0 md:border-r border-teal-500/10 min-h-[300px]">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center shadow-lg shadow-teal-500/25 shrink-0">
                <Compass size={18} className="text-white" />
              </div>
              <div>
                <h3 className="text-sm font-black text-bento-text-main tracking-tight">{t.title}</h3>
                <p className="text-[10px] text-bento-text-muted font-bold tracking-wide uppercase">{t.subtitle}</p>
              </div>
            </div>
            <p className="text-[11px] text-bento-text-main font-semibold leading-relaxed mb-4">{t.instructions}</p>
          </div>

          {/* Satellite grid simulation */}
          <div className="relative flex-1 bg-black/40 border border-teal-500/20 rounded-2xl overflow-hidden aspect-video md:aspect-auto">
            {/* Background grid lines */}
            <div className="absolute inset-0 opacity-20 pointer-events-none" 
              style={{
                backgroundImage: 'radial-gradient(circle, #0d9488 1px, transparent 1px)',
                backgroundSize: '20px 20px'
              }} 
            />
            {/* Grid center mark */}
            <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
              <div className="w-16 h-16 border-2 border-dashed border-teal-400 rounded-full" />
            </div>

            {/* Clickable SVG canvas */}
            <svg
              ref={containerRef}
              onClick={handleSvgClick}
              className="absolute inset-0 w-full h-full cursor-crosshair z-10"
            >
              {/* Completed polygon boundary */}
              {points.length >= 3 && (
                <polygon
                  points={points.map(p => `${p.x},${p.y}`).join(" ")}
                  fill="rgba(20, 184, 166, 0.18)"
                  stroke="#14b8a6"
                  strokeWidth="2.5"
                  strokeDasharray="4 2"
                  className="animate-[dash-pulse_12s_infinite_linear]"
                />
              )}

              {/* Connecting path if not 3 points yet */}
              {points.length > 0 && points.length < 3 && (
                <polyline
                  points={points.map(p => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke="#14b8a6"
                  strokeWidth="2.5"
                />
              )}

              {/* Points/markers */}
              {points.map((p, idx) => (
                <g key={idx}>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r="8"
                    fill="rgba(20, 184, 166, 0.4)"
                    className="animate-ping"
                    style={{ animationDuration: '2s' }}
                  />
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r="4.5"
                    fill="#14b8a6"
                    stroke="#ffffff"
                    strokeWidth="1.5"
                  />
                </g>
              ))}
            </svg>
          </div>
        </div>

        {/* Right: Metrics panel */}
        <div className="w-full md:w-[240px] bg-teal-500/5 p-5 md:p-6 flex flex-col justify-between shrink-0 overflow-y-auto">
          <div className="space-y-4">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-bento-text-muted">{t.statsTitle}</h4>

            {/* Statistics */}
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs font-semibold">
                <span className="text-bento-text-muted">{t.pointsPlaced}</span>
                <span className="text-bento-text-main font-bold bg-[var(--bg-input)] px-2 py-0.5 rounded-lg border border-[var(--border-input)]">{points.length}</span>
              </div>
              <div className="flex justify-between items-center text-xs font-semibold">
                <span className="text-bento-text-muted">{t.estArea}</span>
                <span className="text-teal-400 font-extrabold">{acreage} Ac</span>
              </div>
              <div className="flex justify-between items-center text-xs font-semibold">
                <span className="text-bento-text-muted">{t.estPerimeter}</span>
                <span className="text-bento-text-main font-bold">{perimeter} m</span>
              </div>
            </div>

            {/* Soil / Crop estimates */}
            {points.length >= 3 && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="pt-3 border-t border-teal-500/10 space-y-3">
                <h5 className="text-[10px] font-black uppercase tracking-wider text-bento-text-muted">{t.soilHealth}</h5>
                <div className="space-y-2 text-[11px] font-semibold text-bento-text-main leading-none">
                  <div className="flex justify-between">
                    <span>{t.soilMoisture}</span>
                    <span className={`font-bold ${moisturePercent < 35 ? "text-amber-400" : "text-emerald-400"}`}>{moisturePercent}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t.soilNitrogen}</span>
                    <span className="text-teal-300 font-bold">{moisturePercent > 50 ? t.optimal : t.normal}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t.waterReq}</span>
                    <span className="text-emerald-400 font-extrabold">{dripWaterRequirement} L/day</span>
                  </div>
                </div>
              </motion.div>
            )}
          </div>

          <div className="space-y-2 pt-6 md:pt-0">
            <button
              onClick={() => setPoints([])}
              disabled={points.length === 0}
              className="w-full py-2.5 border border-teal-500/20 hover:bg-teal-500/10 text-teal-400 font-black text-[10px] uppercase tracking-wider rounded-xl transition-all cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
            >
              {t.btnClear}
            </button>
            <button
              onClick={onClose}
              className="w-full py-3 bg-teal-500 hover:bg-teal-400 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-lg shadow-teal-500/20 text-center"
            >
              X Close Demo
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
