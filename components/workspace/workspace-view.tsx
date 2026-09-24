"use client";

/**
 * A workspace (docs/guide.md §2.2): left rail · thread pane (whole 248px
 * columns, snapping splitter) · canvas (min 500px, visible only while
 * something is focused) · the composer docked at the bottom of the thread
 * pane. Under 700px the thread and the canvas become two full-width tabs.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { REPORT_PROMPT, SUGGEST_PROMPT } from "@/hooks/useWorkspaceRunner";
import { stepLabel } from "@/lib/toolMeta";
import { starterQuestions } from "@/lib/starters";
import { defaultColumns, maxColumnsFor, paneWidthFor, snapPaneWidth, columnsForWidth } from "@/lib/threadLayout";
import { refDataset, refKey, type Workspace } from "@/lib/workspace";
import { Canvas } from "./canvas/canvas";
import { Composer, type ComposerSubmit } from "./composer";
import { WorkspaceUiProvider, useWorkspaceUi } from "./context";
import { Rail } from "./rail";
import { ThreadPane } from "./thread/thread-pane";
import { SplitPane } from "@/components/ui";

const COLS_KEY = "swarn:threadColumns";

function useMedia(query: string): boolean {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const sync = () => setMatch(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [query]);
  return match;
}

function DockedComposer() {
  const ui = useWorkspaceUi();
  const running = ui.running;
  const focusedDataset = refDataset(ui.ws, ui.focus);
  const info = focusedDataset ? ui.datasetInfo(focusedDataset) : undefined;
  const starters = useMemo(() => (info && info.parents.length === 0 && !running ? starterQuestions(info) : []), [info, running]);
  const datasetNames = useMemo(() => {
    const set = new Set(ui.datasets.map((d) => d.name));
    for (const t of ui.ws.turns) for (const d of t.artifacts.datasets) set.add(d.name);
    return [...set];
  }, [ui.datasets, ui.ws.turns]);
  const lastStep = running?.steps[running.steps.length - 1];
  const mentionsFor = (extra: string[]) => {
    const out = focusedDataset ? [focusedDataset] : [];
    for (const m of extra) if (!out.includes(m)) out.push(m);
    return out;
  };

  const onSend = useCallback(
    (s: ComposerSubmit) => ui.ask({ prompt: s.text, attachment: s.attachment ?? undefined, mentions: s.mentions }),
    [ui],
  );

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-[3] px-4">
      <div className="pointer-events-auto">
        <Composer
          variant="docked"
          onSend={onSend}
          running={!!running}
          runningLabel={running ? (lastStep ? stepLabel(lastStep) : running.status === "queued" ? "queued…" : "thinking…") : undefined}
          runningSince={running?.startedAt ?? null}
          onStop={ui.stop}
          focusedDataset={focusedDataset}
          datasetNames={datasetNames}
          starters={starters}
          onReport={() => ui.ask({ prompt: REPORT_PROMPT, intent: "report", mentions: mentionsFor([]) })}
          onSuggest={() => ui.ask({ prompt: SUGGEST_PROMPT, intent: "suggest", mentions: mentionsFor([]) })}
          question={running?.question ?? null}
          onAnswer={(text) => running && void ui.answer(running.id, text)}
          onDismissQuestion={() => running && void ui.answer(running.id, running.question?.default ?? "")}
          mentionRequest={ui.mentionRequest}
          attachRequest={ui.attachRequest}
        />
      </div>
    </div>
  );
}

function ThreadArea({ centred }: { centred: boolean }) {
  return (
    <div className="relative h-full min-w-0">
      <ThreadPane centred={centred} />
      <DockedComposer />
    </div>
  );
}

function Surface() {
  const ui = useWorkspaceUi();
  const phone = useMedia("(max-width: 699px)");
  const narrow = useMedia("(max-width: 1023px)");
  const focusKey = ui.focus ? refKey(ui.focus) : null;
  // the phone tab: a new focus shows the canvas until the user picks the thread again
  const [tabChoice, setTabChoice] = useState<{ tab: "thread" | "canvas"; forKey: string | null }>({ tab: "thread", forKey: null });
  const open = !!ui.focus;
  const tab: "thread" | "canvas" = !open ? "thread" : tabChoice.forKey === focusKey ? tabChoice.tab : "canvas";
  const [cols, setCols] = useState<number>(() => {
    if (typeof window === "undefined") return 2;
    try {
      const stored = Number(localStorage.getItem(COLS_KEY));
      if (stored >= 1 && stored <= 5) return stored;
    } catch {
      /* ignore */
    }
    return defaultColumns(window.innerWidth);
  });
  const [surfaceWidth, setSurfaceWidth] = useState(() => (typeof window === "undefined" ? 1280 : window.innerWidth - 40));

  useEffect(() => {
    const sync = () => setSurfaceWidth(window.innerWidth - 40);
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  const closeCanvas = useCallback(() => ui.focusRef(null), [ui]);

  const snap = useCallback(
    (px: number, total: number) => {
      const w = snapPaneWidth(px, total);
      const n = columnsForWidth(w);
      setCols(n);
      try {
        localStorage.setItem(COLS_KEY, String(n));
      } catch {
        /* ignore */
      }
      return w;
    },
    [],
  );

  const wanted = Math.min(cols, Math.max(1, maxColumnsFor(Math.max(surfaceWidth, 1))));
  const leftPx = paneWidthFor(wanted);

  if (phone) {
    return (
      <div className="flex h-full flex-col">
        <div role="tablist" className="flex shrink-0 border-b border-edge">
          {(["thread", "canvas"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              disabled={t === "canvas" && !open}
              onClick={() => setTabChoice({ tab: t, forKey: focusKey })}
              className={`flex-1 py-2 text-12 capitalize ${tab === t ? "border-b-2 border-accent text-fg" : "text-muted disabled:opacity-40"}`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1">{tab === "canvas" && open ? <Canvas onClose={closeCanvas} /> : <ThreadArea centred />}</div>
      </div>
    );
  }

  return (
    <SplitPane
      left={<ThreadArea centred={!open} />}
      right={<Canvas onClose={closeCanvas} />}
      rightOpen={open}
      leftMin={paneWidthFor(1)}
      rightMin={narrow ? 320 : 500}
      defaultLeftPx={leftPx}
      snapLeft={snap}
    />
  );
}

export function WorkspaceView({ ws }: { ws: Workspace }) {
  const narrow = useMedia("(max-width: 1023px)");
  return (
    <WorkspaceUiProvider ws={ws}>
      <div className="flex h-full min-w-0">
        <Rail forceOverlay={narrow} />
        <div className="relative min-w-0 flex-1">
          <Surface />
        </div>
      </div>
    </WorkspaceUiProvider>
  );
}
