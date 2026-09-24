"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon } from "@/components/ui";

type ToastKind = "error" | "info" | "success";

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

const ToastContext = createContext<(kind: ToastKind, message: string) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

const KIND_STYLES: Record<ToastKind, string> = {
  error: "border-err/50 text-err",
  info: "border-accent/50 text-accent",
  success: "border-ok/50 text-ok",
};

const KIND_ICON: Record<ToastKind, ReactNode> = {
  error: <AlertIcon size={15} />,
  info: <InfoIcon size={15} />,
  success: <CheckIcon size={15} />,
};

/** Errors persist longer — they usually carry a server `detail` worth reading. */
const KIND_MS: Record<ToastKind, number> = { error: 9000, info: 6000, success: 4500 };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-4), { id, kind, message }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, KIND_MS[kind]);
  }, []);

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
            className={`pointer-events-auto flex items-start gap-2.5 rounded-lg border bg-panel px-3.5 py-3 text-sm shadow-lg ${KIND_STYLES[t.kind]}`}
          >
            <span className="mt-px shrink-0">{KIND_ICON[t.kind]}</span>
            <span className="flex-1 break-words text-fg">{t.message}</span>
            <button
              type="button"
              onClick={() => setToasts((cur) => cur.filter((x) => x.id !== t.id))}
              className="shrink-0 rounded p-0.5 text-muted transition-colors hover:text-fg"
              aria-label="Dismiss notification"
            >
              <CloseIcon size={13} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
