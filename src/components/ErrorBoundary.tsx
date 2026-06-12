import React, { Component, ErrorInfo, ReactNode } from "react";
import { Leaf, RefreshCw } from "lucide-react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught runtime error captured by ErrorBoundary:", error, errorInfo);
  }

  private handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      const preferredLanguage = localStorage.getItem("agroaid-language") || localStorage.getItem("preferredLanguage") || "English";
      const isHindi = preferredLanguage === "Hindi";

      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#04090a] text-[#ecfdf5] relative overflow-hidden font-sans">
          {/* Ambient glow layers */}
          <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
            <div className="absolute top-[-10%] left-[25%] w-[600px] h-[600px] bg-emerald-500/10 rounded-full blur-[130px]" />
            <div className="absolute bottom-[-10%] right-[10%] w-[400px] h-[400px] bg-amber-500/5 rounded-full blur-[110px]" />
          </div>

          <div className="relative z-10 max-w-md w-full bg-gradient-to-b from-[#071209] to-[#040e06] border border-emerald-500/20 rounded-[2rem] p-8 text-center shadow-2xl backdrop-blur-xl">
            <div className="mx-auto w-16 h-16 bg-gradient-to-br from-emerald-400 to-green-700 rounded-2xl flex items-center justify-center mb-6 shadow-xl shadow-emerald-500/20">
              <Leaf size={32} className="text-white" />
            </div>

            <h1 className="text-2xl md:text-3xl font-serif font-black tracking-tight mb-3">
              {isHindi ? "कुछ गलत हो गया" : "Something went wrong"}
            </h1>

            <p className="text-sm text-[#3d6b50] leading-relaxed mb-6 font-medium">
              {isHindi 
                ? "AgroAid AI को एक अप्रत्याशित समस्या का सामना करना पड़ा। चिंता न करें, आपके खेत का विवरण और डेटा पूरी तरह से सुरक्षित हैं।" 
                : "AgroAid AI encountered an unexpected runtime error. Don't worry, your farm records and progress are perfectly safe."}
            </p>

            {this.state.error && (
              <div className="mb-8 p-4 bg-black/40 rounded-xl border border-rose-500/10 text-left overflow-x-auto max-h-32 text-[10px] font-mono text-rose-300 scrollbar-hide">
                <span className="font-bold block uppercase tracking-wider text-rose-400 mb-1">Diagnostic Info:</span>
                {this.state.error.stack || this.state.error.message}
              </div>
            )}

            <button
              onClick={this.handleReload}
              className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-white rounded-2xl font-bold transition-all shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 flex items-center justify-center gap-2.5 active:scale-[0.98] cursor-pointer"
            >
              <RefreshCw size={16} />
              <span>{isHindi ? "ऐप पुनः लोड करें" : "Reload Application"}</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
