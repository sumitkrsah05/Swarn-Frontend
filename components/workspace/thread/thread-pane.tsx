"use client";

/**
 * The thread pane (docs/guide.md §2.2–2.3): whole 248px card columns with
 * 8px gaps, THREAD n headers, fork reference chips, CONTINUES / CONTINUED
 * segments, 56px scroll-fade gradients, ~180px bottom padding for the
 * docked composer, auto-scroll that keeps the newly focused item about 60%
 * of the way down, and role="tree" arrow-key navigation.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { layoutThreads, type LayoutColumn } from "@/lib/threadLayout";
import { refKey, turnById, type ArtifactRef, type Turn } from "@/lib/workspace";
import { useWorkspaceUi } from "../context";
import { ContinuedRow, ContinuesRow, FoldedRow, ReferenceChip } from "./rows";
import { TurnRows } from "./turn-rows";
import { SectionLabel } from "@/components/ui";

export function parseTreeKey(key: string): ArtifactRef | null {
  const [kind, a, b] = key.split(":");
  switch (kind) {
    case "turn":
      return { kind: "turn", turnId: a };
    case "answer":
      return { kind: "answer", turnId: a };
    case "dataset":
      return { kind: "dataset", turnId: a === "-" ? null : a, name: key.slice(kind.length + a.length + 2) };
    case "chart":
      return { kind: "chart", turnId: a, index: Number(b) };
    case "report":
      return { kind: "report", turnId: a, index: Number(b) };
    default:
      return null;
  }
}

const FOLD_MIN = 3;

function ThreadColumn({ col, holdsFocus }: { col: LayoutColumn; holdsFocus: boolean }) {
  const ui = useWorkspaceUi();
  const [expanded, setExpanded] = useState(false);
  const turns = col.turnIds.map((id) => turnById(ui.ws, id)).filter((t): t is Turn => !!t);

  // fold long Q&A chains: consecutive artifact-less turns, except the newest two
  const folded = useMemo(() => {
    if (expanded) return null;
    const plain = (t: Turn) =>
      t.artifacts.datasets.length === 0 && t.artifacts.charts.length === 0 && t.artifacts.reports.length === 0 && !(t.status === "queued" || t.status === "running");
    let end = 0;
    while (end < turns.length - 2 && plain(turns[end]) && !ui.lineage.has(turns[end].id)) end += 1;
    return end >= FOLD_MIN ? end : null;
  }, [turns, expanded, ui.lineage]);

  return (
    <div className="w-[248px] shrink-0" data-column={col.id}>
      <div className={`mb-1.5 flex items-center gap-1.5 pl-0.5 ${holdsFocus ? "text-accent" : "text-muted"}`}>
        <span className={`h-2 w-2 rounded-full border-2 ${holdsFocus ? "border-accent" : "border-faint"}`} aria-hidden />
        <SectionLabel tone={holdsFocus ? "accent" : "muted"} as="h3">
          Thread {col.threadNo}
        </SectionLabel>
      </div>
      {col.rows.map((row, i) => {
        if (row.kind === "reference") {
          const t = turnById(ui.ws, row.turnId);
          return t ? <ReferenceChip key={`ref-${i}`} turn={t} skipped={row.skipped} /> : null;
        }
        if (row.kind === "continued") {
          const t = turnById(ui.ws, row.turnId);
          return t ? <ContinuedRow key={`cont-${i}`} turn={t} /> : null;
        }
        if (row.kind === "continues") return <ContinuesRow key={`cs-${i}`} />;
        const idx = turns.findIndex((t) => t.id === row.turnId);
        if (idx < 0) return null;
        if (folded != null && idx < folded) {
          return idx === 0 ? <FoldedRow key="fold" count={folded} onExpand={() => setExpanded(true)} /> : null;
        }
        const t = turns[idx];
        const firstShown = folded != null ? idx === folded : idx === 0;
        return (
          <TurnRows key={t.id} turn={t} first={firstShown && col.segment === 0 && col.rows[0]?.kind === "turn"} last={idx === turns.length - 1 && col.rows[col.rows.length - 1]?.kind === "turn"} />
        );
      })}
    </div>
  );
}

export function ThreadPane({ centred, className = "" }: { centred: boolean; className?: string }) {
  const ui = useWorkspaceUi();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [maxUnits, setMaxUnits] = useState(26);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setMaxUnits(Math.max(14, Math.min(60, Math.round((el.clientHeight - 220) / 28))));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => layoutThreads(ui.ws, maxUnits), [ui.ws, maxUnits]);
  const focusedTurnId = ui.focusedTurn?.id ?? null;
  const focusedColumn = focusedTurnId != null ? layout.columnOf.get(focusedTurnId) : undefined;

  // ---- auto-scroll: keep the focused / newest item ~60% down the viewport
  const focusKey = ui.focus ? refKey(ui.focus) : null;
  const running = ui.running;
  const lastSignal = `${focusKey}|${running?.id ?? ""}|${running?.steps.length ?? 0}|${running?.artifacts.charts.length ?? 0}|${ui.ws.turns.length}`;
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let target: HTMLElement | null = null;
    if (running) target = el.querySelector<HTMLElement>(`[data-turn="${running.id}"]`);
    if (!running && focusKey) target = el.querySelector<HTMLElement>(`[data-tree-item="${CSS.escape(focusKey)}"]`);
    if (!target && focusedTurnId) target = el.querySelector<HTMLElement>(`[data-turn="${focusedTurnId}"]`);
    if (!target) return;
    const top = target.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop;
    const anchor = running ? top + target.offsetHeight : top + Math.min(target.offsetHeight, 80) / 2;
    const want = anchor - el.clientHeight * 0.6;
    if (Math.abs(want - el.scrollTop) > 24) el.scrollTo({ top: Math.max(0, want), behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSignal]);

  // ---- roving tabindex: only the focused card is in the tab order
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const items = el.querySelectorAll<HTMLElement>("[data-tree-item]");
    let found = false;
    items.forEach((it) => {
      const isFocus = focusKey != null && it.dataset.treeItem === focusKey;
      it.tabIndex = isFocus ? 0 : -1;
      it.setAttribute("role", "treeitem");
      it.setAttribute("aria-selected", isFocus ? "true" : "false");
      if (isFocus) found = true;
    });
    if (!found && items.length) items[items.length - 1].tabIndex = 0;
  });

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const el = scrollRef.current;
      if (!el) return;
      const active = document.activeElement as HTMLElement | null;
      const cur = active?.closest<HTMLElement>("[data-tree-item]");
      if (!cur || !el.contains(cur)) return;
      const cols = Array.from(el.querySelectorAll<HTMLElement>("[data-column]"));
      const colEl = cur.closest<HTMLElement>("[data-column]");
      if (!colEl) return;
      const inCol = Array.from(colEl.querySelectorAll<HTMLElement>("[data-tree-item]"));
      const i = inCol.indexOf(cur);
      const ci = cols.indexOf(colEl);
      let next: HTMLElement | undefined;
      switch (e.key) {
        case "ArrowDown":
          next = inCol[i + 1];
          break;
        case "ArrowUp":
          next = inCol[i - 1];
          break;
        case "ArrowRight":
        case "ArrowLeft": {
          const other = cols[ci + (e.key === "ArrowRight" ? 1 : -1)];
          if (!other) return;
          const items = Array.from(other.querySelectorAll<HTMLElement>("[data-tree-item]"));
          next = items[Math.min(i, items.length - 1)];
          break;
        }
        case "Enter": {
          const ref = parseTreeKey(cur.dataset.treeItem ?? "");
          if (ref) ui.focusRef(ref);
          e.preventDefault();
          return;
        }
        case "Delete":
        case "Backspace": {
          cur.dispatchEvent(new CustomEvent("swarn:arm-delete", { bubbles: true }));
          e.preventDefault();
          return;
        }
        default:
          return;
      }
      if (next) {
        e.preventDefault();
        next.focus();
      }
    },
    [ui],
  );

  return (
    <div className={`scroll-fade h-full min-h-0 ${className}`}>
      <div
        ref={scrollRef}
        role="tree"
        aria-label="Data thread"
        onKeyDown={onKeyDown}
        className="h-full overflow-x-auto overflow-y-auto"
      >
        <div className={`flex min-h-full items-start gap-2 px-4 pt-4 pb-[180px] ${centred ? "justify-center" : ""}`}>
          {layout.columns.map((col, i) => (
            <ThreadColumn key={col.id} col={col} holdsFocus={focusedColumn === i} />
          ))}
        </div>
      </div>
    </div>
  );
}
