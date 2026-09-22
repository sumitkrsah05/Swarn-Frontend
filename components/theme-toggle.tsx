"use client";

import { useTheme } from "@/lib/theme";

export function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className="flex items-center gap-2 rounded px-1 py-0.5 font-mono text-[11px] text-muted hover:text-fg"
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      <span aria-hidden>{theme === "dark" ? "☾" : "☀"}</span>
      {theme} theme
    </button>
  );
}
