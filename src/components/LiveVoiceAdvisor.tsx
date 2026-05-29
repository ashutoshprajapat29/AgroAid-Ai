import { useState, useRef, useEffect, useCallback } from "react";
import { GoogleGenAI, Modality } from "@google/genai";
import { Mic, MicOff, Loader2, Volume2, VolumeX, MessageSquare, Info } from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import { useLanguage } from "../lib/LanguageContext";

// Module-level AI client — created once, not on every render (Fix #4)
const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || "" });

// Chunked base64 encoder — avoids stack overflow with large buffers (Fix #23)
function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export default function LiveVoiceAdvisor() {
  const { profile } = useAuth();
  const { t } = useLanguage();
  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [transcription, setTranscription] = useState("");
  const [botResponse, setBotResponse] = useState("");
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<any>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const isActiveRef = useRef(false); // Fix #3: ref for stale closure

  // Keep ref in sync with state
  useEffect(() => { isActiveRef.current = isActive; }, [isActive]);

  const stopSession = useCallback(() => {
    setIsActive(false);
    setIsConnecting(false);
    isActiveRef.current = false;
    
    if (sessionRef.current) {
      try { sessionRef.current.close(); } catch {}
      sessionRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch {}
      audioContextRef.current = null;
    }
  }, []);

  // Fix #5: cleanup on unmount — stops mic, API session, and AudioContext
  useEffect(() => {
    return () => stopSession();
  }, [stopSession]);

  const startSession = async () => {
    try {
      setIsConnecting(true);
      
      // Request microphone
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Initialize Audio Context
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      // Connect to Live API
      const sessionPromise = ai.live.connect({
        model: "gemini-2.5-flash",
        callbacks: {
          onopen: () => {
            console.log("Live API connected");
            setIsConnecting(false);
            setIsActive(true);
            isActiveRef.current = true;
            setupAudioInput(audioContext, stream);
          },
          onmessage: async (message) => {
            if (message.serverContent?.modelTurn?.parts) {
              const audioPart = message.serverContent.modelTurn.parts.find(p => p.inlineData);
              if (audioPart?.inlineData?.data) {
                playAudioChunk(audioPart.inlineData.data);
              }
            }
            
            // Handle transcriptions
            if (message.serverContent?.modelTurn?.parts?.[0]?.text) {
                setBotResponse(prev => prev + " " + message.serverContent?.modelTurn?.parts?.[0]?.text);
            }
          },
          onerror: (error) => {
            console.error("Live API Error:", error);
            stopSession();
          },
          onclose: () => {
            console.log("Live API closed");
            stopSession();
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction: `You are an expert farming advisor in a live voice conversation. 
          Respond naturally, concisely, and helpfully. 
          The farmer might be in the field, so priority is clear advice.
          Preferred Language: ${profile?.preferredLanguage || 'English'}.
          Farmer Context: ${profile?.farmDetails || 'Primary farming'}.`,
        },
      });

      sessionRef.current = await sessionPromise;

    } catch (error) {
      console.error("Failed to start Live API:", error);
      setIsConnecting(false);
    }
  };

  const setupAudioInput = async (context: AudioContext, stream: MediaStream) => {
    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(4096, 1, 1);
    
    source.connect(processor);
    processor.connect(context.destination);

    processor.onaudioprocess = (e) => {
      // Fix #3: use ref instead of state to avoid stale closure
      if (!isActiveRef.current || !sessionRef.current) return;
      
      const inputData = e.inputBuffer.getChannelData(0);
      // Convert Float32 to Int16 PCM
      const pcmData = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
      }
      
      // Fix #23: use chunked encoder instead of spread operator
      const base64Data = uint8ToBase64(new Uint8Array(pcmData.buffer));
      sessionRef.current.sendRealtimeInput({
        audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
      });
    };
  };

  const playAudioChunk = (base64Data: string) => {
    if (!audioContextRef.current) return;
    
    try {
      const binary = atob(base64Data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      
      const pcm16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 0x7FFF;
      }

      const buffer = audioContextRef.current.createBuffer(1, float32.length, 16000);
      buffer.getChannelData(0).set(float32);
      
      const source = audioContextRef.current.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContextRef.current.destination);
      source.start();
    } catch (err) {
      console.error("Audio playback failed:", err);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full p-4 md:p-8 animate-in fade-in zoom-in duration-500">
      <div className="w-full max-w-lg bento-card p-8 flex flex-col items-center text-center space-y-8 bg-[var(--bg-card)] backdrop-blur-md border-[3px] border-[var(--border-card)] shadow-2xl rounded-[40px]">
        <div className="w-20 h-20 bg-bento-primary rounded-3xl flex items-center justify-center text-white shadow-2xl shadow-bento-primary/30 relative">
          <Volume2 size={40} />
          {isActive && (
            <div className="absolute inset-0 rounded-3xl border-4 border-bento-primary animate-ping opacity-20" />
          )}
        </div>

        <div>
          <h2 className="text-3xl font-black text-bento-text-main tracking-tight leading-none">{t("voice.advisor_title")}</h2>
          <p className="text-sm font-bold text-bento-text-muted mt-2 uppercase tracking-widest opacity-60">{t("voice.talk_realtime")}</p>
        </div>

        <div className="bg-[var(--bg-input)] rounded-[32px] p-6 w-full min-h-[160px] flex flex-col items-center justify-center border-2 border-[var(--border-card)] shadow-inner text-[var(--text-muted)] font-medium italic">
          {isConnecting ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="animate-spin text-bento-primary" size={32} />
              <p className="not-italic font-black text-xs uppercase tracking-widest text-bento-primary">{t("voice.establishing")}</p>
            </div>
          ) : isActive ? (
            <div className="space-y-4">
               <div className="flex justify-center gap-1 h-8 items-center">
                  {[...Array(8)].map((_, i) => (
                    <div key={i} className={`w-1 bg-bento-primary rounded-full animate-bounce`} style={{ height: `${20 + Math.random() * 80}%`, animationDelay: `${i * 0.1}s` }} />
                  ))}
               </div>
               <p className="text-base line-clamp-4">{t("voice.listening_msg")}</p>
            </div>
          ) : (
            <p className="text-sm opacity-50 px-8">{t("voice.tap_mic")}</p>
          )}
        </div>

        <div className="flex items-center gap-6">
          <button 
            onClick={isActive ? stopSession : startSession}
            disabled={isConnecting}
            className={`w-24 h-24 rounded-full flex items-center justify-center transition-all shadow-2xl transform active:scale-95 ${isActive ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-bento-primary text-white hover:scale-105'}`}
          >
            {isConnecting ? <Loader2 className="animate-spin" size={40} /> : isActive ? <MicOff size={40} /> : <Mic size={40} />}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 w-full opacity-80 pt-4">
          <div className="flex items-start gap-3 bg-blue-500/10 p-4 rounded-3xl text-left border border-blue-500/20">
            <Info className="text-blue-400 shrink-0 mt-0.5" size={18} />
            <p className="text-xs font-bold text-[var(--text-main)] leading-relaxed uppercase tracking-wider">
              {t("voice.tip")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
