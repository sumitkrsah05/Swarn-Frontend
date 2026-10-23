"use client";

/**
 * Motion helpers (app/globals.css "motion system"):
 *   <Reveal>  rises its content in when it scrolls into view (once)
 *   <Aurora>  the slow colour fields behind a hero
 * Both are pure presentation; prefers-reduced-motion disables them in CSS.
 */

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

export function Reveal({
  children,
  delay = 0,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  /** ms before the rise starts once visible */
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li" | "span";
}) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  // without IntersectionObserver (old browsers, jsdom) everything is simply visible
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === "undefined");

  useEffect(() => {
    if (!el || seen) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setSeen(true);
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [el, seen]);

  const style = { "--reveal-delay": `${delay}ms` } as CSSProperties;
  return (
    <Tag ref={setEl as never} style={style} className={`reveal-up ${seen ? "in-view" : ""} ${className}`}>
      {children}
    </Tag>
  );
}

export function Aurora({ className = "" }: { className?: string }) {
  return (
    <div className={`aurora ${className}`} aria-hidden>
      <span />
      <span />
      <span />
    </div>
  );
}
