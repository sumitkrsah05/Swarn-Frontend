"use client";

/**
 * One shared websocket to WS /ws/live for the whole app, with auto-reconnect
 * and exponential backoff. Components subscribe to raw frames and filter by
 * channel / job_id / session_id themselves. The server never replays history —
 * pages fetch state over REST after (re)connecting, then stream.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { wsLiveUrl, type LiveFrame } from "./api";

export type WsStatus = "connecting" | "live" | "reconnecting";

type FrameHandler = (frame: LiveFrame) => void;

interface LiveContextValue {
  status: WsStatus;
  subscribe: (handler: FrameHandler) => () => void;
}

const LiveContext = createContext<LiveContextValue>({
  status: "connecting",
  subscribe: () => () => {},
});

export function LiveProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<WsStatus>("connecting");
  const handlersRef = useRef<Set<FrameHandler>>(new Set());

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;
    let attempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let pingTimer: ReturnType<typeof setInterval> | undefined;

    const connect = () => {
      if (closed) return;
      setStatus(attempts === 0 ? "connecting" : "reconnecting");
      ws = new WebSocket(wsLiveUrl());

      ws.onopen = () => {
        attempts = 0;
        setStatus("live");
        // keep intermediaries from idling the socket out
        pingTimer = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) ws.send("ping");
        }, 25_000);
      };

      ws.onmessage = (e) => {
        let frame: LiveFrame;
        try {
          frame = JSON.parse(e.data as string) as LiveFrame;
        } catch {
          return;
        }
        for (const h of handlersRef.current) h(frame);
      };

      ws.onclose = () => {
        if (pingTimer) clearInterval(pingTimer);
        pingTimer = undefined;
        if (closed) return;
        setStatus("reconnecting");
        attempts += 1;
        const delay = Math.min(15_000, 1000 * 2 ** Math.min(attempts, 4));
        reconnectTimer = setTimeout(connect, delay);
      };

      ws.onerror = () => ws?.close();
    };

    connect();
    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pingTimer) clearInterval(pingTimer);
      ws?.close();
    };
  }, []);

  const subscribe = useCallback((handler: FrameHandler) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  return (
    <LiveContext.Provider value={{ status, subscribe }}>
      {children}
    </LiveContext.Provider>
  );
}

export function useLiveStatus(): WsStatus {
  return useContext(LiveContext).status;
}

/** Subscribe to every live frame; `handler` may change freely between renders. */
export function useLiveFrames(handler: FrameHandler) {
  const { subscribe } = useContext(LiveContext);
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  }, [handler]);
  useEffect(() => subscribe((f) => ref.current(f)), [subscribe]);
}
