import { useState, useRef, useEffect } from "react";
import { GoogleGenAI, Modality } from "@google/genai";
import { Mic, MicOff, Loader2, Volume2, VolumeX, MessageSquare, Info } from "lucide-react";
import { useAuth } from "../lib/AuthContext";

export default function LiveVoiceAdvisor() {
  const { profile } = useAuth();
  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [transcription, setTranscription] = useState("");
  const [botResponse, setBotResponse] = useState("");
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<any>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);

  // Initialize AI with current key
  const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

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
        model: "gemini-3.1-flash-live-preview",
        callbacks: {
          onopen: () => {
            console.log("Live API connected");
            setIsConnecting(false);
            setIsActive(true);
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
    // Basic PCM capture for simplicity in this demo
    // In a production app, we'd use a robust AudioWorklet for real-time PCM conversion
    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(4096, 1, 1);
    
    source.connect(processor);
    processor.connect(context.destination);

    processor.onaudioprocess = (e) => {
      if (!isActive || !sessionRef.current) return;
      
      const inputData = e.inputBuffer.getChannelData(0);
      // Convert Float32 to Int16 PCM
      const pcmData = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
      }
      
      const base64Data = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
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

  const stopSession = () => {
    setIsActive(false);
    setIsConnecting(false);
    
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full p-4 md:p-8 animate-in fade-in zoom-in duration-500">
      <div className="w-full max-w-lg bento-card p-8 flex flex-col items-center text-center space-y-8 bg-white/60 backdrop-blur-md border-[3px] border-white/80 shadow-2xl rounded-[40px]">
        <div className="w-20 h-20 bg-bento-primary rounded-3xl flex items-center justify-center text-white shadow-2xl shadow-bento-primary/30 relative">
          <Volume2 size={40} />
          {isActive && (
            <div className="absolute inset-0 rounded-3xl border-4 border-bento-primary animate-ping opacity-20" />
          )}
        </div>

        <div>
          <h2 className="text-3xl font-black text-bento-text-main tracking-tight leading-none">Voice Advisor</h2>
          <p className="text-sm font-bold text-bento-text-muted mt-2 uppercase tracking-widest opacity-60">Talk real-time with AgroAid AI</p>
        </div>

        <div className="bg-white/80 rounded-[32px] p-6 w-full min-h-[160px] flex flex-col items-center justify-center border-2 border-bento-border shadow-inner text-zinc-600 font-medium italic">
          {isConnecting ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="animate-spin text-bento-primary" size={32} />
              <p className="not-italic font-black text-xs uppercase tracking-widest text-bento-primary">Establishing Link...</p>
            </div>
          ) : isActive ? (
            <div className="space-y-4">
               <div className="flex justify-center gap-1 h-8 items-center">
                  {[...Array(8)].map((_, i) => (
                    <div key={i} className={`w-1 bg-bento-primary rounded-full animate-bounce`} style={{ height: `${20 + Math.random() * 80}%`, animationDelay: `${i * 0.1}s` }} />
                  ))}
               </div>
               <p className="text-base line-clamp-4">AgroAid is listening... Just speak your question!</p>
            </div>
          ) : (
            <p className="text-sm opacity-50 px-8">Tap the mic below and ask anything about your crops, soil, or weather.</p>
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
          <div className="flex items-start gap-3 bg-blue-50 p-4 rounded-3xl text-left border border-blue-100">
            <Info className="text-blue-500 shrink-0 mt-0.5" size={18} />
            <p className="text-xs font-bold text-blue-900 leading-relaxed uppercase tracking-wider">
              Works best in a quiet place. Say "Help me with my wheat crops" to start.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
