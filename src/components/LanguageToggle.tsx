import { useLanguage } from "../lib/LanguageContext";

interface LanguageToggleProps {
  variant?: "pill" | "icon";
}

export default function LanguageToggle({ variant = "icon" }: LanguageToggleProps) {
  const { language, setLanguage } = useLanguage();
  const isHindi = language === "Hindi";

  if (variant === "pill") {
    return (
      <div
        className="flex p-1 rounded-full gap-1 border"
        style={{ background: "var(--bg-input)", borderColor: "var(--border-input)" }}
      >
        {(["English", "Hindi"] as const).map((lang) => (
          <button
            key={lang}
            onClick={() => setLanguage(lang)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-300 ${
              language === lang
                ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
                : "hover:text-emerald-400"
            }`}
            style={language !== lang ? { color: "var(--text-muted)" } : undefined}
          >
            {lang === "Hindi" ? "हिन्दी" : "EN"}
          </button>
        ))}
      </div>
    );
  }

  // icon variant — compact toggle button
  return (
    <button
      onClick={() => setLanguage(isHindi ? "English" : "Hindi")}
      title={isHindi ? "Switch to English" : "हिन्दी में बदलें"}
      className="relative flex items-center justify-center w-9 h-9 rounded-xl border font-bold text-xs transition-all duration-300 hover:border-emerald-500/40 hover:text-emerald-400"
      style={{
        background: "var(--bg-input)",
        borderColor: "var(--border-input)",
        color: "var(--text-muted)",
      }}
    >
      {isHindi ? "EN" : "हि"}
    </button>
  );
}
