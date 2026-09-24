"use client";

/**
 * Workspace state: a tiny external store (React context + useSyncExternalStore)
 * persisted to localStorage under `swarn:workspaces:v2` with a 500ms debounce.
 * On first load, `swarn:threads:v1` chats are migrated into linear workspaces
 * and the v1 key is left untouched as a backup (docs/guide.md §7.3).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  THREADS_V1_KEY,
  WORKSPACES_KEY,
  forPersist,
  importWorkspace,
  exportWorkspace,
  makeWorkspace,
  migrateThreadsV1,
  sanitizeWorkspaces,
  touch,
  type Workspace,
} from "./workspace";

export interface StoreState {
  workspaces: Workspace[];
  activeId: string | null;
  loaded: boolean;
}

const PERSIST_MS = 500;
const ACTIVE_KEY = "swarn:workspaces:active";

class WorkspaceStore {
  private state: StoreState = { workspaces: [], activeId: null, loaded: false };
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = () => this.state;

  set(fn: (s: StoreState) => StoreState) {
    const next = fn(this.state);
    if (next === this.state) return;
    this.state = next;
    for (const l of this.listeners) l();
    this.schedulePersist();
  }

  load() {
    if (this.state.loaded) return;
    let workspaces: Workspace[] = [];
    let activeId: string | null = null;
    try {
      const raw = localStorage.getItem(WORKSPACES_KEY);
      if (raw) {
        const data = JSON.parse(raw) as { workspaces?: unknown; activeId?: unknown };
        workspaces = sanitizeWorkspaces(data.workspaces);
        if (typeof data.activeId === "string") activeId = data.activeId;
      } else {
        const v1 = localStorage.getItem(THREADS_V1_KEY);
        if (v1) workspaces = migrateThreadsV1(JSON.parse(v1));
      }
      const stickyActive = sessionStorage.getItem(ACTIVE_KEY);
      if (stickyActive) activeId = stickyActive;
    } catch {
      /* corrupted store — start fresh */
    }
    if (activeId && !workspaces.some((w) => w.id === activeId)) activeId = null;
    this.state = { workspaces, activeId, loaded: true };
    for (const l of this.listeners) l();
  }

  private schedulePersist() {
    if (!this.state.loaded) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.persistNow();
    }, PERSIST_MS);
  }

  persistNow() {
    if (!this.state.loaded) return;
    try {
      localStorage.setItem(
        WORKSPACES_KEY,
        JSON.stringify({
          workspaces: this.state.workspaces.map(forPersist),
          activeId: this.state.activeId,
        }),
      );
      if (this.state.activeId) sessionStorage.setItem(ACTIVE_KEY, this.state.activeId);
      else sessionStorage.removeItem(ACTIVE_KEY);
    } catch {
      /* quota / private mode — the workspace still works, just unpersisted */
    }
  }
}

const SERVER_SNAPSHOT: StoreState = { workspaces: [], activeId: null, loaded: false };

const StoreContext = createContext<WorkspaceStore | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const store = useMemo(() => new WorkspaceStore(), []);
  useEffect(() => {
    store.load();
    const flush = () => store.persistNow();
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [store]);
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

function useStore(): WorkspaceStore {
  const s = useContext(StoreContext);
  if (!s) throw new Error("useWorkspaceStore must be used inside <WorkspaceProvider>");
  return s;
}

/** Select a slice of store state; re-renders only when the slice changes. */
export function useWorkspaceSelector<T>(selector: (s: StoreState) => T): T {
  const store = useStore();
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getSnapshot()),
    () => selector(SERVER_SNAPSHOT),
  );
}

export interface WorkspaceActions {
  setActive: (id: string | null) => void;
  create: (name?: string) => Workspace;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
  update: (id: string, fn: (w: Workspace) => Workspace) => void;
  updateAll: (fn: (workspaces: Workspace[]) => Workspace[]) => void;
  add: (ws: Workspace) => void;
  importJson: (text: string) => Workspace | null;
  exportJson: (id: string) => string | null;
  getState: () => StoreState;
}

export function useWorkspaceActions(): WorkspaceActions {
  const store = useStore();
  const setActive = useCallback(
    (id: string | null) => store.set((s) => (s.activeId === id ? s : { ...s, activeId: id })),
    [store],
  );
  const add = useCallback(
    (ws: Workspace) => store.set((s) => ({ ...s, workspaces: [ws, ...s.workspaces.filter((w) => w.id !== ws.id)] })),
    [store],
  );
  const create = useCallback(
    (name?: string) => {
      const ws = makeWorkspace(name);
      store.set((s) => ({ ...s, workspaces: [ws, ...s.workspaces], activeId: ws.id }));
      return ws;
    },
    [store],
  );
  const update = useCallback(
    (id: string, fn: (w: Workspace) => Workspace) =>
      store.set((s) => {
        let changed = false;
        const workspaces = s.workspaces.map((w) => {
          if (w.id !== id) return w;
          const next = fn(w);
          if (next !== w) changed = true;
          return next;
        });
        return changed ? { ...s, workspaces } : s;
      }),
    [store],
  );
  const updateAll = useCallback(
    (fn: (workspaces: Workspace[]) => Workspace[]) =>
      store.set((s) => {
        const workspaces = fn(s.workspaces);
        return workspaces === s.workspaces ? s : { ...s, workspaces };
      }),
    [store],
  );
  const rename = useCallback(
    (id: string, name: string) => update(id, (w) => (w.name === name ? w : touch({ ...w, name: name.trim() || w.name }))),
    [update],
  );
  const remove = useCallback(
    (id: string) =>
      store.set((s) => ({
        ...s,
        workspaces: s.workspaces.filter((w) => w.id !== id),
        activeId: s.activeId === id ? null : s.activeId,
      })),
    [store],
  );
  const importJson = useCallback(
    (text: string) => {
      const ws = importWorkspace(text);
      if (ws) store.set((s) => ({ ...s, workspaces: [ws, ...s.workspaces], activeId: ws.id }));
      return ws;
    },
    [store],
  );
  const exportJson = useCallback(
    (id: string) => {
      const ws = store.getSnapshot().workspaces.find((w) => w.id === id);
      return ws ? exportWorkspace(ws) : null;
    },
    [store],
  );
  const getState = useCallback(() => store.getSnapshot(), [store]);
  return useMemo(
    () => ({ setActive, create, rename, remove, update, updateAll, add, importJson, exportJson, getState }),
    [setActive, create, rename, remove, update, updateAll, add, importJson, exportJson, getState],
  );
}

export function useWorkspaces(): Workspace[] {
  return useWorkspaceSelector((s) => s.workspaces);
}

export function useActiveWorkspace(): Workspace | null {
  return useWorkspaceSelector((s) => s.workspaces.find((w) => w.id === s.activeId) ?? null);
}

export function useWorkspacesLoaded(): boolean {
  return useWorkspaceSelector((s) => s.loaded);
}
