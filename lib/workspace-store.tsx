"use client";

/**
 * Workspace state: a tiny external store (React context + useSyncExternalStore)
 * persisted to localStorage under `swarn:workspaces:v2` with a 500ms debounce.
 * On first load, `swarn:threads:v1` chats are migrated into linear workspaces
 * and the v1 key is left untouched as a backup (docs/guide.md §7.3).
 *
 * Server side (swarn-backend): every UI workspace maps to one row of
 * /api/workspaces (`Workspace.serverId`). The row is created lazily by
 * `ensureServerId` — the first time a turn is submitted — and the thread tree
 * is mirrored into `PUT /api/workspaces/{id}/state` a few seconds after it
 * changes, so the same workspaces open on any device. `useServerWorkspaceSync`
 * pulls the server's list once the user is signed in (see lib/auth.tsx).
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
import { API_BASE, api, ApiError, setScopedWorkspaceId, type ServerWorkspace } from "./api";
import { useAuth } from "./auth";
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
/** the server copy lags local changes by this much (a run patches the tree many times a second) */
const SERVER_PUSH_MS = 3000;
const ACTIVE_KEY = "swarn:workspaces:active";

class WorkspaceStore {
  private state: StoreState = { workspaces: [], activeId: null, loaded: false };
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** workspaces changed since their last server push */
  private dirty = new Set<string>();
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  /** in-flight POST /api/workspaces per local id, so parallel callers share one row */
  private creating = new Map<string, Promise<string>>();
  /** server pushes happen only while someone is signed in */
  private online = false;

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
    const before = new Map(this.state.workspaces.map((w) => [w.id, w]));
    for (const w of next.workspaces) if (before.get(w.id) !== w) this.dirty.add(w.id);
    this.state = next;
    for (const l of this.listeners) l();
    this.schedulePersist();
    this.schedulePush();
  }

  // ------------------------------------------------------------ server mirror

  setOnline(online: boolean) {
    this.online = online;
    if (online) this.schedulePush();
  }

  /**
   * The backend workspace a UI workspace runs in, created on first use. Throws
   * (ApiError) when the backend refuses — the caller shows that on the turn.
   */
  ensureServerId(id: string): Promise<string> {
    const ws = this.state.workspaces.find((w) => w.id === id);
    if (!ws) return Promise.reject(new Error("workspace not found"));
    if (ws.serverId) return Promise.resolve(ws.serverId);
    const pending = this.creating.get(id);
    if (pending) return pending;
    const p = api
      .createWorkspace(ws.name)
      .then((row) => {
        this.set((s) => ({ ...s, workspaces: s.workspaces.map((w) => (w.id === id && !w.serverId ? { ...w, serverId: row.id } : w)) }));
        return row.id;
      })
      .finally(() => this.creating.delete(id));
    this.creating.set(id, p);
    return p;
  }

  private schedulePush() {
    if (!this.online || !this.state.loaded || this.dirty.size === 0) return;
    if (this.pushTimer) return;
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null;
      void this.pushNow();
    }, SERVER_PUSH_MS);
  }

  /** PUT the thread tree of every changed workspace that has a server row. */
  async pushNow(keepalive = false): Promise<void> {
    if (!this.online) return;
    const ids = [...this.dirty];
    this.dirty.clear();
    await Promise.all(
      ids.map(async (id) => {
        const ws = this.state.workspaces.find((w) => w.id === id);
        if (!ws?.serverId) return;
        try {
          if (keepalive) {
            // page is closing: a keepalive request outlives the document (bodies ≤ 64 KB)
            const body = JSON.stringify(forPersist(ws));
            if (body.length > 60_000) return;
            await fetch(`${API_BASE}/api/workspaces/${encodeURIComponent(ws.serverId)}/state`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body,
              credentials: "include",
              keepalive: true,
            });
          } else {
            await api.putWorkspaceState(ws.serverId, forPersist(ws));
          }
        } catch (e) {
          if (e instanceof ApiError && e.status === 404) {
            // the row was deleted elsewhere: forget it, the next turn creates a new one
            this.set((s) => ({ ...s, workspaces: s.workspaces.map((w) => (w.id === id ? withoutServer(w) : w)) }));
          } else if (!(e instanceof ApiError && e.status === 401)) {
            this.dirty.add(id); // try again on the next change
          }
        }
      }),
    );
  }

  /**
   * Merge the server's workspace list into the local one: rows unknown here are
   * added (with their saved thread tree when there is one), a newer server copy
   * replaces an older local one, and local links to deleted rows are dropped.
   */
  async pullFromServer(): Promise<void> {
    const { workspaces: rows } = await api.listWorkspaces();
    const byServer = new Map(rows.map((r) => [r.id, r]));
    const local = this.state.workspaces;
    const linked = new Set(local.map((w) => w.serverId).filter((x): x is string => !!x));
    const fresh: Workspace[] = [];
    const replace = new Map<string, Workspace>();
    for (const row of rows) {
      const mine = local.find((w) => w.serverId === row.id);
      let state: Workspace | null = null;
      try {
        const res = await api.getWorkspaceState<unknown>(row.id);
        state = res.state ? (sanitizeWorkspaces([res.state])[0] ?? null) : null;
      } catch {
        /* unreadable state: fall back to an empty workspace */
      }
      if (state) state = { ...state, serverId: row.id };
      if (mine) {
        if (state && state.updatedAt > mine.updatedAt + 1 && !this.dirty.has(mine.id)) replace.set(mine.id, { ...state, id: mine.id });
      } else if (!linked.has(row.id)) {
        fresh.push(state ?? emptyFromRow(row));
      }
    }
    this.set((s) => {
      const ids = new Set(s.workspaces.map((w) => w.id));
      const kept = s.workspaces.map((w) => {
        const r = replace.get(w.id);
        if (r) return r;
        return w.serverId && !byServer.has(w.serverId) ? withoutServer(w) : w;
      });
      const added = fresh.filter((w) => !ids.has(w.id));
      if (replace.size === 0 && added.length === 0 && kept.every((w, i) => w === s.workspaces[i])) return s;
      return { ...s, workspaces: [...kept, ...added] };
    });
    // the merge itself is not a local edit
    for (const w of fresh) this.dirty.delete(w.id);
    for (const id of replace.keys()) this.dirty.delete(id);
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

function withoutServer(w: Workspace): Workspace {
  const { serverId: _s, ...rest } = w;
  void _s;
  return rest;
}

/** A server row with no saved thread tree (made by the CLI, or the `Scratch` default). */
function emptyFromRow(row: ServerWorkspace): Workspace {
  return { ...makeWorkspace(row.name), serverId: row.id, createdAt: row.created_at, updatedAt: row.updated_at };
}

const SERVER_SNAPSHOT: StoreState = { workspaces: [], activeId: null, loaded: false };

const StoreContext = createContext<WorkspaceStore | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const store = useMemo(() => new WorkspaceStore(), []);
  useEffect(() => {
    store.load();
    const flush = () => {
      store.persistNow();
      void store.pushNow(true);
    };
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

/**
 * Keeps the store and the backend in step: pulls the server's workspaces once
 * the user is signed in, turns pushes on, and tells lib/api which server
 * workspace the open UI workspace is (the default `workspace_id` for reads).
 * Mount once, inside AuthProvider and WorkspaceProvider.
 */
export function WorkspaceServerSync() {
  const store = useStore();
  const { status, user } = useAuth();
  const loaded = useWorkspacesLoaded();
  const active = useActiveWorkspace();
  const signedIn = status === "signed-in";
  const userId = user?.id ?? null;

  useEffect(() => {
    store.setOnline(signedIn);
    if (!signedIn || !loaded) return;
    let cancelled = false;
    store.pullFromServer().catch(() => {
      /* offline or 401: local copies still work; the next sign-in retries */
    });
    return () => {
      cancelled = true;
      void cancelled;
    };
  }, [store, signedIn, loaded, userId]);

  useEffect(() => {
    setScopedWorkspaceId(active?.serverId ?? null);
    return () => setScopedWorkspaceId(null);
  }, [active?.serverId]);

  return null;
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
  /** removes locally at once; rejects (and keeps the workspace) when the server refuses, e.g. 409 while a job runs */
  remove: (id: string) => Promise<void>;
  /** the backend workspace id, creating the row on first use */
  ensureServerId: (id: string) => Promise<string>;
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
    (id: string, name: string) => {
      const clean = name.trim();
      const ws = store.getSnapshot().workspaces.find((w) => w.id === id);
      if (!ws || !clean || ws.name === clean) return;
      update(id, (w) => touch({ ...w, name: clean }));
      if (ws.serverId) api.renameWorkspace(ws.serverId, clean).catch(() => {});
    },
    [store, update],
  );
  const remove = useCallback(
    async (id: string) => {
      const ws = store.getSnapshot().workspaces.find((w) => w.id === id);
      if (ws?.serverId) {
        try {
          await api.deleteWorkspace(ws.serverId);
        } catch (e) {
          // already gone on the server is fine; anything else (409 running job) keeps it
          if (!(e instanceof ApiError && e.status === 404)) throw e;
        }
      }
      store.set((s) => ({
        ...s,
        workspaces: s.workspaces.filter((w) => w.id !== id),
        activeId: s.activeId === id ? null : s.activeId,
      }));
    },
    [store],
  );
  const ensureServerId = useCallback((id: string) => store.ensureServerId(id), [store]);
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
    () => ({ setActive, create, rename, remove, ensureServerId, update, updateAll, add, importJson, exportJson, getState }),
    [setActive, create, rename, remove, ensureServerId, update, updateAll, add, importJson, exportJson, getState],
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
