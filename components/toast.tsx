"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon } from "@/components/ui";

type ToastKind = "error" | "info" | "success";

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  /** playing its exit animation */
  leaving?: boolean;
}

const ToastContext = createContext<(kind: ToastKind, message: string) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

const KIND_STYLES: Record<ToastKind, string> = {
  error: "border-err/50 border-l-err text-err",
  info: "border-accent/50 border-l-accent text-accent",
  success: "border-ok/50 border-l-ok text-ok",
};

const KIND_ICON: Record<ToastKind, ReactNode> = {
  error: <AlertIcon size={15} />,
  info: <InfoIcon size={15} />,
  success: <CheckIcon size={15} />,
};

/** Errors persist longer — they usually carry a server `detail` worth reading. */
const KIND_MS: Record<ToastKind, number> = { error: 9000, info: 6000, success: 4500 };
const EXIT_MS = 220;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  // dismissing plays the slide-out first, then drops the toast
  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), EXIT_MS);
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-4), { id, kind, message }]);
      setTimeout(() => dismiss(id), KIND_MS[kind]);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        aria-label="Notifications"
        className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className={`pointer-events-auto relative flex items-start gap-2.5 overflow-hidden rounded-lg border border-l-[3px] bg-panel px-3.5 py-3 text-sm shadow-lift motion-reduce:animate-none ${
              t.leaving ? "animate-toast-out" : "animate-toast-in"
            } ${KIND_STYLES[t.kind]}`}
          >
            <span className="mt-px shrink-0 animate-pop motion-reduce:animate-none">{KIND_ICON[t.kind]}</span>
            <span className="flex-1 break-words text-fg">{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="shrink-0 rounded p-0.5 text-muted transition-colors hover:text-fg"
              aria-label="Dismiss notification"
            >
              <CloseIcon size={13} />
            </button>
            {/* the auto-dismiss meter */}
            <span
              aria-hidden
              className="absolute bottom-0 left-0 h-0.5 w-full origin-left bg-current opacity-35 motion-reduce:hidden"
              style={{ animation: `toast-progress ${KIND_MS[t.kind]}ms linear forwards` }}
            />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
