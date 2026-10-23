"use client";

import { useTheme } from "@/lib/theme";
import { IconButton, MoonIcon, SunIcon } from "@/components/ui";

export function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <IconButton label={`Switch to ${next} theme`} onClick={() => setTheme(next)} className="overflow-hidden">
      {/* the icon spins in whenever the theme flips */}
      <span key={theme} className="inline-flex animate-icon-in motion-reduce:animate-none">
        {theme === "dark" ? <MoonIcon size={15} /> : <SunIcon size={15} />}
      </span>
    </IconButton>
  );
}
