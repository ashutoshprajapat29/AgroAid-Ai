import { Sun, Moon } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useTheme } from "../lib/ThemeContext";

interface ThemeToggleProps {
  /** "icon" = compact icon button, "pill" = labeled pill (for landing page) */
  variant?: "icon" | "pill";
}

export default function ThemeToggle({ variant = "icon" }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  if (variant === "pill") {
    return (
      <button
        onClick={toggleTheme}
        aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
        className="flex items-center gap-2 px-4 py-2 rounded-full border transition-all duration-300 font-semibold text-sm select-none
          border-emerald-500/20 hover:border-emerald-500/40
          bg-white/5 hover:bg-emerald-500/8
          text-[var(--text-muted)] hover:text-[var(--text-main)]"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={theme}
            initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            exit={{ rotate: 90, opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            {isDark
              ? <Sun size={16} className="text-amber-400" />
              : <Moon size={16} className="text-indigo-400" />}
          </motion.div>
        </AnimatePresence>
        <span>{isDark ? "Light Mode" : "Dark Mode"}</span>
      </button>
    );
  }

  return (
    <button
      onClick={toggleTheme}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      title={`Switch to ${isDark ? "light" : "dark"} mode`}
      className="relative w-9 h-9 flex items-center justify-center rounded-xl transition-all duration-300 select-none
        border border-[var(--border-input)]
        bg-[var(--bg-input)] hover:bg-emerald-500/10 hover:border-emerald-500/25
        text-[var(--text-muted)] hover:text-emerald-400"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={theme}
          initial={{ y: -12, opacity: 0, rotate: -30 }}
          animate={{ y: 0,   opacity: 1, rotate: 0   }}
          exit={{   y: 12,  opacity: 0, rotate: 30   }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="absolute"
        >
          {isDark
            ? <Sun size={16} className="text-amber-400" />
            : <Moon size={16} className="text-indigo-400" />}
        </motion.div>
      </AnimatePresence>
    </button>
  );
}
