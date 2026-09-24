# swarn workspace

Next.js frontend for the **swarn** ML/data agent. It is a pure client of the
FastAPI backend in `agent2/` — it builds no API of its own. The whole UI is an
**analysis workspace**: you drop in data or type a question, the agent works
step by step, and every result becomes a card in a branching **data thread**;
clicking a card opens it on a **canvas** (a paged data grid, a chart, a report,
the answer). Jobs, History, Files, Knowledge and Evals live in the same shell.

## Prerequisites

The backend must be running (default `http://localhost:8420`):

```bash
cd ../agent2 && swarn serve --port 8420      # or: .venv/bin/python -m uvicorn agent.web.dashboard:app --port 8420
```

It enables CORS for `http://localhost:3000` by default; set `SWARN_CORS_ORIGINS`
on the backend if you serve this app elsewhere.

## Configuration

The API base URL comes from `NEXT_PUBLIC_SWARN_API` (with `NEXT_PUBLIC_API_URL`
as a legacy fallback) and defaults to `http://localhost:8420`. The live websocket
URL (`ws://…/ws/live`) is derived from it.

```bash
cp .env.example .env.local   # then edit
```

`NEXT_PUBLIC_*` variables are inlined at build time — restart the dev server (or
rebuild) after changing them.

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm start
npm run lint
npm test           # Vitest + Testing Library
```

Open the dev server as `localhost`, not `127.0.0.1`: Next 16 only serves its
dev chunks to the hostname it was started with (`allowedDevOrigins` in
`next.config.ts` adds the loopback address as well).

Docker (standalone server on port 3000; the API base is inlined at build time):

```bash
docker build --build-arg NEXT_PUBLIC_SWARN_API=http://api-host:8420 -t swarn-frontend .
docker run -p 3000:3000 swarn-frontend
```

## Routes

| Route | Screen |
| --- | --- |
| `/` | The Workspace: the Landing when no workspace is open, otherwise rail · thread pane · canvas · composer. |
| `/jobs`, `/jobs/[id]` | Job list (live) and detail; **New run** opens the one-shot ReAct / AIDE / Team form in a drawer (`/run` redirects to `/jobs?new=1`). |
| `/history?tab=sessions\|runs` | Sessions and AIDE runs (`/sessions` and `/runs` redirect here); `/sessions/[id]` and `/runs/[id]` keep working. |
| `/evals/*` | LLM evaluation runs, unchanged routes (see below). |
| `/files` | Two-pane workspace file browser (`/workspace` redirects here, `?path=` preserved). |
| `/knowledge` | The Playbook in the document column (`/playbook` redirects here). |

## UI architecture

- **Design system — `components/ui/`.** `primitives.tsx` holds every shared
  piece: Button, Badge, Card, Banner, Tabs, TableWrap/CellText, Field/Input/
  Select, Drawer, Loading/Skeleton/Empty, MetricBar, Elapsed, plus the
  workspace-era pieces the spec asks for — `IconButton`, `Pill`/`PillButton`,
  `SectionLabel`, `TintCard` (a role prop: data · user · report · ask · grey…),
  `GutterRow`, `Shimmer`, `UnreadDot`, `SplitPane` (react-resizable-panels with
  snapping in `onLayoutChanged`), `Popover`, `Menu`, `Dialog`, `ProgressBar`,
  `EmptyNote`, `PageFrame`. `icons.tsx` is our own inline SVG set. Screens
  compose these and never hand-roll the styles they encode.
- **Tokens — `app/globals.css`.** One set of custom properties per theme
  (light, dark, OS-dark) exposed to Tailwind through `@theme inline`. The
  semantic roles are `--c-accent` (blue: data, lineage, selection), `--c-user`
  (orange: the user's words, derived columns), `--c-report` (purple),
  `--c-ask` (amber: unread, agent questions) and grey; every role has a 10%
  tint (`bg-accent-tint`, `bg-user-tint`, …). Radii: 4 chips/inputs · 6 thread
  cards · 8 panels · 12 composer · 16 canvas/pills (`rounded-chip` …
  `rounded-canvas`). The dense type ramp is `text-10` … `text-18`. Shadows are
  `shadow-hair/card/pop/composer`; dark mode swaps them for borders.
  Scrollbars are 6px and revealed on hover; every animation is off under
  `prefers-reduced-motion`. `.graph-paper` is the landing background,
  `.document` the 816px report typography.
- **Shell — `components/app-shell.tsx`, `components/app-bar.tsx`.** A 44px app
  bar: logo box, wordmark, Workspace · Jobs · History · Evals · Files (8% fill
  on the selected one), the workspace name ▾ (Workspaces dialog) or the page
  title, the deployed model name (`GET /api/eval/endpoints`), the live dot
  (`useLiveStatus`), the theme toggle and a ⋮ menu (Playbook, API docs). Below
  900px the nav collapses into a dropdown. There is no sidebar any more.
- **Workspace model — `lib/workspace.ts`** (pure, tested). A `Workspace` holds a
  **turn tree**: `Turn {id, parentId, parentArtifact, prompt, attachment,
  jobId, sessionId, status, steps, artifacts, answer…}`. Branching is a shared
  parent. `resumeChain()` walks `parentId` to the root and returns the
  ancestors' completed session ids oldest first — siblings never leak into
  `resume_session_ids`. `deleteSubtree`, `deleteChart`, `hideDataset`,
  `setFocus`/`markUnread` are pure updates. Storage is `swarn:workspaces:v2`
  (writes debounced 500ms, `steps` capped at 300 per turn). On first load,
  `swarn:threads:v1` chats are migrated into linear workspaces; the v1 key is
  left as a backup.
- **Store — `lib/workspace-store.tsx`.** A tiny external store (React context +
  `useSyncExternalStore`) with selectors, mounted in the root layout.
- **Runner — `hooks/useWorkspaceRunner.tsx`** (`RunnerProvider` at the root, so
  every workspace keeps streaming on any page). One `react` job per turn.
  `/ws/live` session frames are mapped to turns through `session_id`; REST
  polling (2.5s) of every active job is authoritative — it confirms terminal
  states, reconciles jobs that finished while the tab was closed, and turns a
  404 into a failed turn with Retry. The task text is the prompt plus
  `Use the already-loaded dataset(s): 'a', 'b'.` when datasets are focused or
  @-mentioned; an attachment travels as `data_dir`. Artifacts appear live as
  `tool_result` steps arrive; the first chart of a run is auto-focused, later
  charts get the unread dot; completion focuses the answer unless the user
  focused something during the run.
- **Artifacts — `lib/artifacts.ts`** (tested against the real trace in
  `test/fixtures/trace-ab2bb1db.json`). Cards come from the structured
  `artifacts` key on `tool_result` steps (backend §5.1). Without it, the parse
  fallback runs: `Loaded '…'`, `Registered result as '…'`, `(N rows × M cols)`,
  `saved to / written to <file>`, bare `*_report.(md|html)`. `lib/toolMeta.ts`
  is the single tool → label / icon / chart-kind map.
- **Thread layout — `lib/threadLayout.ts`** (tested). Columns are whole 248px
  cards with 8px gaps (`width = n·248 + (n−1)·8 + 32`); forks start a new
  column with a reference chip (and a "…" row when more than one ancestor was
  skipped); long chains split into CONTINUES / CONTINUED segments packed so the
  tallest column is as short as possible. The splitter snaps to whole columns
  and never lets the canvas drop below 500px.
- **Workspace UI — `components/workspace/`.** `context.tsx` (focus is the one
  navigation primitive: it opens the canvas, highlights the lineage and becomes
  the parent of the next prompt), `thread/*` (the row types, the live thinking
  banner, the tree with arrow-key navigation), `composer.tsx` (context chips,
  starter questions, the `@` combobox, Enter/Shift+Enter/Tab, attach by
  paste/drop, Generate a report, Suggest next steps, the working overlay, the
  agent-question panel), `canvas/*` (dataset grid, png/vega chart with zoom +
  log/code/open/Edit chart pills, report document column, answer, running
  timeline, the log/code dialogs, the chart gallery and encoding popover with
  dnd-kit drag from grid headers), `data-grid.tsx` (virtualised, 500-row pages,
  server-side sort/search/filter, source vs derived column headers, the column
  popover), `rail.tsx` (Add data · Datasets tree · Workspaces · Knowledge),
  `landing.tsx`, `workspace-view.tsx` (split, phone tabs) and
  `static-thread.tsx` (a read-only thread + canvas for server records).
- **Client-side charts — `lib/vega.ts`.** Quick chart and Edit chart build
  Vega-Lite specs from column kinds (no model call); data is up to 5,000 rows
  from `/rows`; "Edit chart" on an agent PNG creates a new vega chart next to it.
- **Accessibility.** Skip link and landmarks, `role="tree"` with arrow keys /
  Enter / Delete, every icon button has an `aria-label` and tooltip, the `@`
  menu is a combobox, tints always come with an icon, contrast checked at AA
  in both themes (see "Decisions").
- **Errors.** `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`;
  every fetch has loading, empty and error states; a dataset 404 is a
  recoverable "not in memory" state with **Re-run this turn**.

## Backend endpoints used

Only the endpoints documented in `agent2/agent/web/API.md`: jobs (`/api/jobs*`,
`/approve`, `/cancel`), uploads, sessions, runs, workspace files, playbook,
`/api/eval/*`, `WS /ws/live`, and the read-only dataset API added with this
redesign: `GET /api/data/datasets`, `…/{name}/rows`, `…/{name}/columns/{c}`,
`…/{name}/export?format=csv`. Components never call `fetch`; everything goes
through `lib/api.ts` (dashboard) or `api/client.ts` (evals).

## Decisions where the spec was silent

- **Fork column numbering.** Every chain gets its own THREAD number in the
  order it is discovered (the root chain, then forks in creation order);
  CONTINUED segments keep their thread's number.
- **Folded Q&A.** In a column, three or more consecutive artifact-less turns
  that are not among the newest two (and not on the focused lineage) fold into
  one "N earlier turns" row.
- **`@` mentions and Enter.** While the dataset picker is open, Enter picks the
  highlighted name; the next Enter sends. Mentions are derived from the text,
  so removing a chip removes its `@name` token.
- **Low-cardinality strings for starter questions.** The dataset API gives
  column kinds but not cardinalities, so "Compare X across Y" picks the first
  string column whose name looks categorical (category, region, status, …)
  and otherwise the first string column.
- **Quick chart flow.** Picking a gallery item creates the chart immediately
  (auto-encoded) on a user turn parented to the dataset's turn, focuses it and
  lets "Edit chart" refine it live. Vega charts are edited in place; agent PNGs
  are not (Edit creates a sibling vega chart prefilled from the tool input).
- **Report delete.** The pill stack's Delete removes the report card from the
  turn (client-side only, like every delete); server files are never touched.
- **Colour contrast.** `--c-faint` was darkened (light `#63636b`, dark
  `#8e8f98`) so 10/11px labels reach 4.5:1 on every tint. Role colours
  (orange, amber, warn, ok) are used for icons, borders, badges and tints —
  body text on tinted cards is always `fg`/`muted`. The pre-existing `--c-warn`
  is kept as the spec asks; it is not used for small body text.
- **Wordmark weight.** The spec's 300 weight is requested in CSS; the bundled
  Overused Grotesk only ships 400–700, so the browser renders 400.
- **Agent questions.** The composer's question panel answers `approval_request`
  events for any job (AIDE, and react jobs since backend §5.3); a 409 on
  `/approve` is shown as "timed out, took its default".
- **Dev origin.** `allowedDevOrigins: ["127.0.0.1"]` so the dev server also
  serves chunks to the loopback address.

## LLM evaluation (`/evals`)

The evaluation screens are a client of the `/api/eval/*` endpoints
(`docs/eval_guide.md` §3). Code layout:

- `api/types.ts` — TypeScript interfaces for every eval response.
- `api/client.ts` — one function per endpoint; components never call `fetch`.
- `hooks/useJob.ts` — job watcher: websocket frames from the shared `/ws/live`
  socket while it is live, `GET /api/jobs/{id}?since=N` polling every 1.5 s
  otherwise, with a catch-up fetch on every reconnect (REST is authoritative).
- `hooks/useEvalData.ts` — React Query hooks (runs list, run, results, files…).
- `lib/evals.ts` — behaviour rules (self-judge detection, hidden-reasoning
  fix, gate-vs-CI, mock sanity), formatting, and the wizard's sessionStorage
  draft.
- `components/evals/*` — screens' building blocks; `app/(evals)/evals/*` — routes.

| Route | Purpose |
| --- | --- |
| `/evals` | Runs list from `GET /api/eval/runs`; refreshes every 5 s while a listed run has a live job; open / compare / delete. |
| `/evals/new` | Three-step wizard: Setup (datasets, candidates, goal → `POST /api/eval/design`), Review (YAML editor + validate / ping / estimate), Running (`POST /api/eval/runs` watched through `hooks/useJob.ts`). |
| `/evals/[runId]` | Run detail: Overview, Slices, Comparisons, Results, Report, Judge (only with judge diagnostics), Files; compare / resume / delete. |
| `/evals/compare?run=&baseline=` | `POST /api/eval/compare` between two runs with optional max drop / p-value. |

Behaviour rules enforced in the UI: judge in the same model family as a
candidate → warning before run; every mean shows its 95% CI and a gate whose
threshold lies inside the CI is "not decisive at this sample size"; candidates
with `failure_rate > 0` carry the "metrics cover only samples that produced
output" caveat; `mock-*` candidates are grouped separately and a failing mock
sanity check flags the judge/rubric; judge metrics are "unaudited" until a
calibration exists (the Judge tab collects human labels for
`POST /api/eval/runs/{run_id}/calibrate`).

## Tests

```bash
npm test
```

- `lib/workspace.test.ts` — the resume chain (ancestors only, no sibling leak), subtree delete, chart delete re-indexing, v1 migration, sanitising.
- `lib/artifacts.test.ts` — every fallback regex against the real strings of `sessions/ab2bb1db-…` plus the structured `artifacts` path.
- `lib/threadLayout.test.ts` — column packing, fork reference chips, chain splitting, pane geometry.
- `components/workspace/composer.test.tsx` — Enter, Shift+Enter, Tab fill, the `@` combobox, chips, the working overlay, the question panel.
- `hooks/useWorkspaceRunner.test.tsx` — REST-authoritative finalisation when the websocket never delivers the terminal frame, live artifacts, the 404 → Retry path.
- `hooks/useJob.test.tsx`, `components/evals/checks-panel.test.tsx` — the eval feature (unchanged).
