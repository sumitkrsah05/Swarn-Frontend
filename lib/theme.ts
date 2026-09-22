"use client";

/**
 * Light / dark theme. The choice lives in localStorage under `swarn:theme`
 * and is applied as `data-theme` on <html>; app/layout.tsx runs an inline
 * script before first paint so there is no flash. Without a stored choice
 * the CSS follows `prefers-color-scheme`.
 */

import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";
export const THEME_STORAGE_KEY = "swarn:theme";

/** Inline script source for <head>; must stay in sync with globals.css. */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t)}else if(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches){document.documentElement.setAttribute("data-theme","dark")}}catch(e){}})()`;

function readTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

/** Current theme, kept in sync with the <html data-theme> attribute. */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    const sync = () => setThemeState(readTheme());
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  const setTheme = useCallback((t: Theme) => {
    document.documentElement.setAttribute("data-theme", t);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, t);
    } catch {
      /* private mode */
    }
  }, []);

  return [theme, setTheme];
}
