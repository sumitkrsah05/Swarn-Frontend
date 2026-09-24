# Prompt: redesign the swarn frontend as a Data-Formulator-style analysis workspace

## 0. Role and ground rules

You are a senior product engineer. You will redesign **swarn-frontend** (a
Next.js client for the swarn ML/data agent) so that its whole UI follows the
interaction model and visual language of **Microsoft Data Formulator**
(https://data-formulator.ai, source at github.com/microsoft/data-formulator).
You will also add a small set of **read-only backend endpoints** to swarn's
FastAPI server so the new UI can show real tables and lineage.

Rules:

1. **Re-create the patterns, not the brand.** Do not copy Data Formulator's
   name, logo, illustrations, icon SVGs, demo videos, or text verbatim. The
   product is **swarn**. Use the UX ideas and layout described in section 2
   under swarn's own identity.
2. **Read before you write.** Read every file listed in section 3 before
   changing anything. `swarn-frontend/AGENTS.md` warns that this Next.js
   version (16.x) has breaking changes: read the relevant guide in
   `swarn-frontend/node_modules/next/dist/docs/` before writing routes,
   layouts or data fetching, and heed deprecation notices.
3. **Do not break what works.** The Evals feature (`/evals/*`), the job
   watcher (`hooks/useJob.ts`), the shared websocket (`lib/live.tsx`) and the
   typed API client stay functionally intact. Restyle them; don't rewrite
   their logic.
4. **No invented endpoints.** The frontend may call only the endpoints in
   section 4 (existing) and section 5 (the ones you add). Components never call
   `fetch` directly; everything goes through `lib/api.ts` / `api/client.ts`.
5. **Work in phases** (section 11), keeping `npm run build`, `npm run lint`
   and `npm test` green at the end of each phase. Also keep the backend's
   `pytest` green in `agent2/`.
6. When the spec is silent, choose the behaviour that matches Data Formulator
   and write the decision down in the frontend README.

---

## 1. What you are building, in one paragraph

A single-page **analysis workspace** replaces today's chat page. The user
drops in data or types a question. The swarn agent works step by step, and
each result appears as a card in a **data thread** on the left: the user's
prompt, then the agent's plan, then the tables it derived, then chart
thumbnails, reports and the final answer. Threads **branch**: clicking any
earlier card and typing forks a new thread from that point. Clicking a card
opens it on the **canvas** on the right: a large chart, a live paged data
grid, a report document, or the answer. Every other page (Jobs, History,
Files, Knowledge, Evals) moves into the same shell and visual language.

---

## 2. Reference UX: Data Formulator, distilled

These points describe how DF works (v0.8, `src/views/*`). Re-create the
behaviour and layout. Swarn-specific mappings follow in sections 6 and 7.

### 2.1 Core ideas

- **Focus is the one navigation primitive.** Clicking a thread item does
  four things:
  - focuses it
  - opens the canvas on it
  - highlights its full ancestry (lineage)
  - makes it the parent of the next prompt

  Closing the canvas clears the focus. Nothing else opens the canvas.
- **To follow up or fork, focus then type.** There is no fork button. If the
  focused node already has children, the new run becomes a new branch and a
  new column. Continuing in a straight line is the default, because focus
  normally rests on the newest item.
- **History is data-centric.** Nodes are data versions (tables). Edges are
  instructions. Charts hang off the table they visualise.
- **Trust cues are everywhere.** Every agent step can be expanded to show
  the plan, code or tool input. A "log" and a "code" view exist for every
  result. A quiet line on the canvas reads "AI-generated results can be
  inaccurate — inspect them."

### 2.2 Layout

```
┌ App bar 44px: logo·swarn · Workspace|Jobs|History|Evals|Files · [workspace name ▾] · model · ● live · ☀/☾ ┐
├──┬─────────────────────────────────────────┬───────────────────────────────────────────────────────────────┤
│R │ THREAD PANE (snaps to whole columns)     │ CANVAS (min 500px, 16px-radius bordered box, ✕ close)         │
│a │ ┌DATA ───┐┌THREAD 1┐┌THREAD 2┐           │  toolbar: zoom ─●─   ·········   [log] [code] [Edit chart]    │
│i │ │SOURCES ││ cards… ││ ⤷ fork…│           │              ┌──────── chart / report / answer ────────┐       │
│l │ │        ││        ││ cards… │           │              └──────────────────────────────────────────┘      │
│  │ └────────┘└────────┘└────────┘           │   status line: "AI-generated results can be inaccurate…"      │
│40│   ┌──── composer (max 640, centred) ──┐  │   ┌──────────── data grid (virtualised, paged) ──────┐ ⤢       │
│px│   │ Ask a question or describe…  ⚡ ↑ │  │   └──────────────────────────────────────────────────┘         │
└──┴───┴───────────────────────────────────┴──┴──────────────────────────────────────────────────────────────┘
```

**Left rail.**
- 40px wide, icons only.
- It opens a docked panel (default 280px, resizable 240–450px, width stored
  in localStorage).
- The panel can be pinned (it pushes the workspace aside) or unpinned (it
  overlays the workspace and closes on click-away).
- Clicking the active icon collapses the panel.

**Thread pane.**
- Its width is always a whole number of **248px card columns** with 8px gaps
  (width = `n*248 + (n-1)*8 + 32`).
- After the user drags the splitter, it snaps to the nearest column count.
- Default column count by viewport width:

  | Viewport width | Columns |
  |---|---|
  | under 1280px | 1–2 |
  | 1280–1680px | 2 |
  | 1680–2560px | 3 |
  | over 2560px | 4–5 |

- It never takes so much width that the canvas drops below 500px.
- When the canvas is closed, the thread pane fills the surface and centres
  itself.

**Canvas.**
- Visible only while something is focused.
- Opening and closing animates the split over 140ms.
- It is a bordered box: 1px hairline, 16px radius, 4–8px margin.

**Composer.**
- Docked at the bottom of the thread pane, max 640px wide, centred.
- The thread scroller has ~180px of bottom padding so the last card can
  scroll clear of it.
- 56px **scroll-fade gradients** sit at the top and bottom of the thread
  scroller.

**Phones (under 700px).** The thread and the canvas become two full-width
tabs, "Thread | Canvas".

### 2.3 Anatomy of a thread (a vertical timeline)

**Every row** has a **14px gutter** and then the content.
- The gutter holds a 2px connector line (hairline grey, or primary when the
  row is on the focused lineage) and a small icon for the row type.
- Each entry is wrapped in a panel box with an 8px radius.

**Thread header.** An 8px hollow circle, then **"THREAD 1"** in 11px, weight
700, uppercase. It is primary-coloured when the thread holds the focus.

**Row types, in the order they appear:**

1. **User prompt card**
   - Person icon in the gutter.
   - **Orange tint** (the "user" role colour at 10%), 4px radius, 11–12px text.
   - Clamped to 160px tall.
   - `@dataset` mentions render as highlighted inline chips.
   - Shows chips for any attachments.
2. **Agent plan line**
   - Robot icon in the gutter.
   - Grey 11px prose summarising what the agent did.
   - Click to expand the full step list.
3. **Merge row**
   - Shown when a step combines several datasets (a join).
   - Reads "Using ▤ sales ▤ regions".
4. **Table card**
   - Table icon in the gutter.
   - **Blue tint** (primary at 10%), hairline border, 6px radius.
   - Shows the name at 12px/500, then `rows × cols` in muted mono.
   - Hover lifts it 1px and adds a small shadow.
   - Focused: a 2px primary ring. On the focused lineage: a 2px primary left
     border.
   - Hover reveals a red trash icon.
5. **Chart thumbnail**
   - Gutter icon chosen by chart kind (bar, line, scatter, grid, pie).
   - Thumbnail max 120×100, transparent card, 6px radius.
   - A **6px pulsing amber "unread" dot** until the chart is first focused.
6. **Report card**
   - **Purple tint**, document icon, the report title.
   - Reads "composing…" while it is being written.
7. **Answer / text card**
   - Grey tint, a 2-line clamped markdown preview.
   - Clicking it opens the full text on the canvas.
   - Long chains of Q&A fold into "N earlier turns".

**Fork columns.** When a thread forks from a shared ancestor, the new column
does **not** repeat the history.
- It starts with a compact **reference chip** for the parent node (untinted,
  with no actions).
- It is preceded by a "…" row when more than one ancestor was skipped.

**Long chains** split across columns. The first segment ends with a dashed
rule and "⌄ CONTINUES"; the next segment starts with "⌃ CONTINUED" and a chip.
Pack the columns so that the tallest one is as short as possible.

**Auto-scroll** keeps the newly focused or newly produced item about 60% of
the way down the viewport.

### 2.4 Live progress (in the thread, while the agent works)

Under the parent node, a **draft** renders:
- the prompt card
- a **thinking-steps banner**: one 10–11px italic row per step, each with an
  icon:

  | Step | Icon |
  |---|---|
  | code | terminal |
  | inspect / search | magnifier |
  | chart | chart |
  | anything else | sparkle |
  | error | error mark |
  | correction | warning mark |

- The **active step shimmers** (a 2s left-to-right gradient sweep) and shows
  a ticking timer ("12s", "1m12s"). Finished steps fade to the disabled
  colour.
- A 12px spinner sits in the gutter.
- **Artifacts appear as they are produced.** Table cards and chart
  thumbnails are inserted into the draft as soon as the step that makes them
  finishes, so a single run grows the chain step by step.
- The first chart of a run is auto-focused. Later charts get the unread dot.

### 2.5 The composer

**Card.**
- Outlined, **12px radius**, Google-style soft double shadow
  (`0 1px 6px rgba(32,33,36,.10), 0 1px 2px rgba(32,33,36,.06)`).
- On focus: a primary border plus a 2px primary-at-15% ring.

**Chips above the textarea.**
- A **context chip** row: the focused dataset as a fixed `@name` chip,
  removable `@` mentions, and attachment chips (file icon, name, count).
- A **starter-question row** (toggled by a ⚡ button). It shows only when a
  source table is focused and the agent is idle. Chips are 24px tall with a
  6px radius; clicking one sends it.

**Textarea.**
- Grows from 2 to 6 rows.
- Placeholder: **"Ask a question or describe what to explore (add context
  with @)"**.
- Keys:
  - **Enter** sends; **Shift+Enter** inserts a newline.
  - **Tab on an empty input** fills "Explore interesting patterns and trends
    in this data".
  - **`@`** opens a keyboard-navigable dataset picker.
- Pasting or dropping files attaches them.

**Toolbar.**
- **Left:** "+" attach.
- **Right:**
  - ✎ "Generate a report"
  - 💡 "Suggest next steps"
  - a **28px round send button** (arrow-up icon), filled primary when there
    is text

**Working overlay** (covers the input while a job runs):
- ✏️ "swarn is working…"
- the latest step label and its elapsed time
- a red round **Stop** button
- a 2px indeterminate progress bar along the bottom edge

### 2.6 The canvas

**Floating toolbar.**
- **Left:** a zoom slider with stops 0.6 / 0.8 / 1 / 1.25 / 1.5 / 2.
- **Right:** pill buttons ("log", "code", "Edit chart"). Pill style: paper
  background, hairline border, a small shadow, primary on hover.

**Chart focus.**
- The chart is vertically centred in a `min(75vh, 800px)` block and fades in
  over 600ms when it changes.
- Below it: a quick-config pill (options plus 🗑 with an inline "Delete this
  chart?" confirmation).
- Then a status line.
- Then **the data grid of the table the chart came from**, in the same
  scroll. A maximise toggle floats the grid over the canvas as an overlay.

**Table focus.**
- A full-height grid card.
- Header: the name (16px/600), "N rows · N columns", and a search box that
  runs on Enter.
- A dock underneath: **Quick chart** · Download CSV · N rows.

**Data grid.**
- Virtualised. Loads pages of 500 rows as you scroll; sort, filter and
  search run on the server.
- 24px header, zebra rows, 12px cells with ellipsis, numbers right-aligned,
  a 56px `#` column first.
- **Column header styling by origin:**
  - **source** columns: blue tint with a 2px blue bottom border
  - **derived** columns (not present in the parent dataset): **orange tint
    with a 2px orange bottom border**
- Header contents: a type icon, the name, sort arrows, a filter icon and a ⋮
  menu. Clicking the title cycles the sort.
- The ⋮ menu opens a **column popover**:
  - "N rows · N distinct · N blanks"
  - Sort
  - Filter, chosen by type: a range for numbers and dates, a checklist with
    counts when there are 100 or fewer distinct values, otherwise "contains…"
  - "Clear filter" / "Apply"

**Code dialog.** Tool name plus the pretty-printed input, or the
syntax-highlighted Python for `run_python`.

**Log dialog.** The step timeline for the run that produced the item.

**Report focus.**
- A centred **816px document column** with no chrome.
- Typography like a clean document: 0.95rem, line-height 1.7, h1 1.75rem/700,
  h2 1.4rem, h3 1.15rem, grey-bar blockquotes.
- A floating vertical pill stack at the top-left: Open in new tab · Download
  (md / html) · Copy content · Delete.

### 2.7 Visual language

**Semantic colour roles.** Keep these consistent everywhere:

| Colour | Meaning |
|---|---|
| **blue** (primary) | data, lineage, selection |
| **orange** | the user's words, derived columns |
| **purple** | reports |
| **amber** | unread items, the agent asking a question |
| **grey** | history, text |

**Density and type.**
- A dense type ramp: 10 / 11 / 12 / 13 / 14 / 16 / 18px.
- Icons: 12–20px.
- Section labels are uppercase, bold, 11px, letter-spacing 0.04em (for
  example "DATA SOURCES", "THREAD 2", "RECENT").
- The brand wordmark is light weight (300) with 0.03em tracking.

**Surfaces.**
- Cards are flat (no elevation) with a hairline border and a light tint.
- Hover lifts a card by 1–2px. Focus is a 2px ring, never a thicker border.
- Destructive and secondary actions are hover-revealed (opacity 0 to 1 over
  150ms).
- Radii: 4 (chips, inputs), 6 (thread cards), 8 (panels, tables), 12
  (composer), 16 (canvas, pills).

**Motion.**
- UI transitions are 100–150ms.
- Content fades in over 600ms.
- Micro-animations: the step shimmer, the unread-dot pulse (1.6s), a pencil
  wobble on "working…", and a bouncing robot icon while the agent is asking.
- All of these are disabled under `prefers-reduced-motion`.

**Scrollbars.** Thin (6px) and revealed on hover.

**Landing background.** A faint 16px graph-paper grid (two 1px linear
gradients at about 2.5% of the text colour). The workspace background is
plain.

**Empty states.** An icon, one bold line and one muted line.

---

## 3. The existing code: read these first

### 3.1 Frontend: `swarn-frontend/`

**Stack:** Next.js 16.3 (App Router), React 19.2, TypeScript, Tailwind v4
(tokens in `@theme`), TanStack Query 5, CodeMirror 6 (YAML), react-markdown
with remark-gfm, and Vitest with Testing Library. There is no component
library; the design system lives in `components/ui/`.

| File | What it does today |
|---|---|
| `app/layout.tsx`, `components/app-shell.tsx`, `components/sidebar.tsx` | Chrome: a fixed 240px sidebar (Chat, New Run, Jobs, Sessions, Runs, Evals, Workspace, Playbook) plus a mobile drawer. It already has a skip link, landmarks, the theme toggle and toasts. |
| `app/globals.css` | Theme tokens (`--c-bg`, `--c-panel`, `--c-accent` indigo, …) for light, dark and OS-dark, exposed to Tailwind via `@theme inline`; `.markdown` styles; focus ring; reduced-motion. |
| `app/page.tsx` | The **Chat page**. Each user message becomes a `react` job that carries the thread's full `resume_session_ids` chain. Progress comes from `/ws/live` session frames, with `GET /api/jobs/{id}?since=N` polling (2.5s) as the authoritative fallback. Handles finalize, retry and stop. |
| `lib/threads.ts` | Client-owned threads in localStorage (`swarn:threads:v1`): `Thread {id, title, sessionIds[], jobIds[], activeJobId, status, messages[]}`. Linear only; no branching. |
| `components/composer.tsx`, `chat-message.tsx`, `working-feed.tsx`, `step-timeline.tsx`, `thread-list.tsx` | The chat UI. `step-timeline.tsx` already colour-codes step kinds (plan, tool_call, tool_result, correction, complete, error). |
| `lib/live.tsx` | One shared websocket to `/ws/live` with backoff and ping. `useLiveFrames(handler)`. |
| `lib/api.ts` | The typed client for jobs, uploads, sessions, runs, workspace and playbook, plus `uploadFiles` with progress and `workspaceFileUrl`. |
| `api/types.ts`, `api/client.ts`, `hooks/useJob.ts`, `hooks/useEvalData.ts`, `lib/evals.ts`, `components/evals/*`, `app/(evals)/evals/*` | The **Evals** feature: runs list, 3-step wizard, run detail tabs, and compare. Keep the logic; restyle only. |
| `components/ui/primitives.tsx`, `components/ui/icons.tsx` | Button, Badge, Card, Banner, Tabs, TableWrap/CellText, Field/Input/Select, Drawer, Loading/Skeleton/Empty/ErrorNote, MetricBar, Elapsed; inline SVG icons using `currentColor`. |
| `app/(dashboard)/*` | Run (one-shot ReAct/AIDE/Team), Jobs list and detail, Sessions list and detail, Runs list and detail (AIDE report, files), Workspace browser, Playbook. |
| `README.md` | The UI architecture notes. Update them when you finish. |

The fonts are Overused Grotesk (local `.otf`, sans) and Plex Mono. Keep them;
the density rules in 2.7 matter more than the typeface.

### 3.2 Backend: `agent2/`

| File | What it does |
|---|---|
| `agent/web/API.md` | The HTTP contract (summarised in section 4). The source of truth. |
| `agent/web/dashboard.py` | FastAPI app: jobs, uploads, sessions, runs, workspace files, playbook, `/ws/live`. Mounts `eval_api.router`. |
| `agent/web/jobs.py` | The job registry. Runs react jobs on threads and emits `session` / `status` events; AIDE jobs emit `node` and `approval_request`. |
| `agent/core/agent_loop.py` | The ReAct loop. Emits the session steps (`plan`, `tool_call`, `tool_result`, `correction`, `complete`, `error`) that `/ws/live` broadcasts and that `sessions/<id>/trace.json` stores. |
| `agent/data/pipeline.py` | `get_data_pipeline()`: a **process-global** `DataPipeline` whose `datasets: dict[str, pd.DataFrame]` is the dataset registry. It is shared by every job in the server process and lost on restart. |
| `agent/data/analysis.py`, `cleaner.py`, `join.py`, `report.py`, `workbook.py` | Tools that load, derive, plot and report. Charts are **matplotlib PNGs** under `workspace/plots/`. Derived datasets are registered with names such as `<name>_pivot`, `<name>_grouped`, `<name>_clean` and `<name>_features`. `write_report` writes `<name>_report.md` and `<name>_report.html` (self-contained, charts embedded). |
| `docs/TOOLS.md` | Every agent tool and its arguments. Use it to build the tool → icon/label map. |

**What a real step trace looks like** (from `sessions/<id>/trace.json`).
Tool results are **free text**:

```json
{"kind":"tool_call","time":1787568926.17,"data":{"step":2,"tool":"load_csv","input":{"path":"uploads/1787568592/saas_product_metrics_q3.csv","name":"saas_metrics"}}}
{"kind":"tool_result","time":1787568926.20,"data":{"step":2,"tool":"load_csv","result":"Loaded 'saas_metrics' from csv:uploads/… (9 rows × 7 cols)\nColumns: Product_Line, Region, …"}}
{"kind":"tool_call","time":1787568935.32,"data":{"step":5,"tool":"plot_column","input":{"name":"saas_metrics","column":"Active_Users"}}}
{"kind":"tool_result","time":1787568936.04,"data":{"step":5,"tool":"plot_column","result":"Histogram of 'Active_Users' saved to plots/saas_metrics__Active_Users_distribution.png\n  9 values, 0 blank. …"}}
{"kind":"tool_result", … "tool":"write_report","result":"Report written for 'saas_metrics':\n  saas_metrics_report.md …\n  saas_metrics_report.html …"}
```

The wording varies from tool to tool ("Loaded …", "Registered result as …",
"saved to {path}", "Report written for …"). That is why section 5 adds
structured artifacts rather than relying on regexes.

---

## 4. Existing API you will use (unchanged)

The base URL comes from `NEXT_PUBLIC_SWARN_API` (default
`http://localhost:8420`). Errors are `{"detail": "..."}` with a 4xx status;
show `detail` verbatim in a toast or inline banner. There is no auth.

**Jobs.**
- `POST /api/jobs {task, method:"react"|"aide"|"team", data_dir?, steps?, resume_session_ids?}`
  returns the job summary (`id`, `status`, `session_id`, `run_id`,
  `n_events`, …).
- `GET /api/jobs` and `GET /api/jobs/{id}?since=N` return the summary plus
  `result`, `error` and `events[N:]`.
- `POST /api/jobs/{id}/cancel`.
- `POST /api/jobs/{id}/approve {request_id, answer}` answers a parked
  `approval_request` (AIDE today).
- React `result` on completion: `{outcome, summary, session_id}`.

**Conversations.** Every job is a fresh agent. To continue, pass the ordered
session ids of the context **oldest first**. A session id is valid only after
its run completes.

**Uploads.**
- `POST /api/upload` (multipart, `files`) returns
  `{data_dir, relative_dir, files}`.
- `GET /api/uploads` and `DELETE /api/uploads/{batch}`.

**History.**
- `GET /api/sessions?limit=` and `GET /api/sessions/{id}` (the full step trace).
- `GET /api/runs`, `GET /api/runs/{id}`, and `/api/runs/{id}/files[/{path}]`.

**Files.**
- `GET /api/workspace/files?path=` lists a directory.
- `GET /api/workspace/file?path=` downloads a file. Use it for chart PNGs
  and report HTML/MD.
- `GET /api/playbook`.

**Evals.** `/api/eval/*`, exactly as the current code uses them.

**Websocket `WS /ws/live`.**
- `{channel:"session", session_id, kind, timestamp, data}` for every agent
  step.
- `{channel:"job", job_id, status, event}` for job lifecycle events.
- No replay. Always confirm terminal states over REST.

---

## 5. Backend additions (small, read-only, in `agent2/`)

Put the new routes in a new router, **`agent/web/data_api.py`** (prefix
`/api/data`), mounted in `dashboard.py` the same way `eval_api.router` is.
Document every route in `agent/web/API.md` and add pytest coverage under
`tests/`. Add no new Python dependencies. Every route must be safe to call
while jobs are running: take a snapshot of the registry dict before iterating.

### 5.1 Lineage and step artifacts (the key change)

In `agent/core/agent_loop.py`, around each tool execution:

1. **Before the call:** snapshot the registry as `{name: id(df)}` from
   `get_data_pipeline().datasets`, and record the call's start time.
2. **After the call:**
   - **Datasets:** names that are new, or whose object id changed, are
     artifacts of this step. Their `parents` are the registry names that
     appear in the tool input: any string value, or list of strings, under
     keys such as `name`, `names`, `left`, `right`, `dataset` or `sources`
     that matches a registered name. If no parent is found, the dataset is a
     **source**.
   - **Files:** paths mentioned in the result text that exist under the
     workspace and were modified after the call started. Classify each as
     `chart` (png/svg/jpg), `report` (`*_report.html` or `*_report.md`),
     `table` (csv/parquet), `model`, or `other`.
3. **Emit** the result under a new key on the existing `tool_result` step:

```json
"artifacts": {
  "datasets": [{"name":"saas_metrics_pivot","rows":3,"cols":4,
                "parents":["saas_metrics"],"tool":"pivot_dataset"}],
  "files":    [{"path":"plots/saas_metrics__correlations.png","kind":"chart",
                "dataset":"saas_metrics"}]
}
```

   A chart's `dataset` is the tool input's `name`, if it names a registered
   dataset.
4. **Record lineage** on the pipeline:
   `pipeline.lineage[name] = {parents, tool, session_id, step, created_at}`.
   Do this so it survives beyond the step event.

Rules for this change:
- `artifacts` is **additive**. The field is absent when there is nothing to
  report. Old traces have no `artifacts`, and the frontend must fall back to
  parsing (section 7.4).
- Concurrent jobs share the registry, so a diff may include a dataset
  created by another job at the same moment. Guard the snapshot/diff with a
  lock, or accept the race and document it.

### 5.2 Dataset endpoints

| Route | Returns |
|---|---|
| `GET /api/data/datasets` | `{datasets: [{name, rows, cols, columns: [{name, dtype, kind: "number"\|"string"\|"date"\|"datetime"\|"boolean"\|"other"}], parents, tool, session_id, step, created_at, derived_columns: [names not present in any parent]}]}`, newest first |
| `GET /api/data/datasets/{name}/rows?offset=0&limit=500&sort=&desc=false&q=&filters=` | `{name, total, offset, limit, columns, rows: [[…]]}`. `limit` is at most 1000. `q` is a case-insensitive substring match across string columns. `filters` is URL-encoded JSON: `[{column, op: "range"\|"in"\|"contains", min?, max?, values?, text?}]`. NaN becomes `null`; timestamps become ISO strings; numpy scalars become JSON numbers. |
| `GET /api/data/datasets/{name}/columns/{column}` | `{rows, distinct, blanks, kind, min?, max?, mean?, top: [{value, count}] (≤100)}` for the column popover |
| `GET /api/data/datasets/{name}/export?format=csv` | A streamed CSV download |

Behaviour:
- Return **404** with `detail` "Dataset '<name>' is not in memory — the
  server may have restarted. Re-run the step that created it." when a name
  is unknown. The UI shows this as a recoverable state, not a crash.
- Validate `sort` and `filters` column names against the frame (422 on
  unknown columns).

### 5.3 Optional: agent questions in react jobs (do this last)

If `apply_cleaning` or `ask_human` block in react jobs today, wire them to the
same `ApprovalBroker` that AIDE uses. That way they emit
`{"type":"approval_request", request_id, question, options}` job events and
park until `POST /api/jobs/{id}/approve` answers them. Mirror the AIDE
implementation in `jobs.py` exactly, including the timeout that takes the
safe default. The UI in 7.6 works for both job types.

---

## 6. Information architecture (the whole app)

### 6.1 App bar (44px, on every page)

**Left:**
- a 40×40 logo box aligned with the rail
- the **"swarn"** wordmark (weight 300)
- text nav buttons: **Workspace · Jobs · History · Evals · Files**
  - 13px, not uppercase, square corners
  - the selected one has an 8% fill

**Centre:**
- In the Workspace, the **workspace name ▾**. It opens a small "Workspaces"
  dialog: New · rename inline · delete with inline confirmation · list sorted
  by last modified.
- Elsewhere, the page title as a small uppercase label.

**Right:**
- the **model name**, from `GET /api/eval/endpoints` → `deployed.model`,
  muted
- a **live dot** from `useLiveStatus()`: green when live, amber when
  reconnecting (tooltip gives the state)
- the theme toggle
- a ⋮ overflow for Playbook and API docs (`/docs` on the API base)

**Below 900px** the nav collapses into a dropdown and the right cluster into
the ⋮ menu. There is no separate sidebar any more; delete `sidebar.tsx` once
nothing uses it.

### 6.2 Route map

| Route | Screen |
|---|---|
| `/` | **Workspace** (section 7). With no active workspace it shows the Landing (7.1). |
| `/jobs`, `/jobs/[id]` | Jobs list and detail, restyled (8.1). Absorbs **New Run** as a "New run" button that opens the existing form in a drawer (ReAct / AIDE / Team). Keep `/run` as a redirect to `/jobs?new=1`. |
| `/history` | Tabs **Sessions · AIDE runs** (8.2). `/sessions/*` and `/runs/*` keep working: keep the detail routes and redirect the list routes to `/history?tab=…`. |
| `/evals/*` | Unchanged routes, restyled (8.3). |
| `/files` | The workspace file browser, restyled (8.4). Keep `/workspace` as a redirect. |
| `/knowledge` | The Playbook, restyled (8.5). Keep `/playbook` as a redirect. |

---

## 7. The Workspace (`/`)

### 7.1 Landing (no workspace open)

- Background: the 16px graph-paper grid.
- A centred column, max 1024px.

**Hero** (min-height `calc(100vh - 150px)` so the sections below peek up):
- the swarn mark and the **"swarn"** wordmark at 56px, weight 300
- the tagline "Analyse data with an agent that shows its work."

**Big composer.** The same component as 2.5, in stacked layout, 3 rows,
800px wide.
- Placeholder: "Drop a CSV / Excel / Parquet file, or ask swarn to analyse
  something…"
- On focus it shows a **"Try asking"** dropdown of 4 examples, for example:
  - "Analyse this dataset and write a report"
  - "What drives churn?"
  - "Clean this file and show me what changed"
  - "Train a model to predict the target column"
- Sending creates a workspace and its first turn.

**"Or add data directly:"** grey chip buttons:
- **Upload files**, which uses the existing `uploadFiles` with a progress bar
- **Reuse an upload**, a popover listing `GET /api/uploads` batches with file
  names and sizes

**RECENT WORKSPACES.**
- A grid `repeat(auto-fill, minmax(220px, 1fr))` with a 12px gap.
- Each card is a horizontal outlined card: a 72px cover thumbnail on the left
  (the latest chart PNG, or a table icon), the name, the relative time, and
  "N threads · N charts".
- Hover lifts it 2px. A pill of Rename / Export JSON / Delete appears at the
  top-right.
- The last card is dashed: **"Import workspace (.json)"**.

**EXAMPLES.** 3–5 cards that prefill the composer (no demo data is bundled).

### 7.2 Left rail and panels (inside a workspace)

| Rail icon | Panel |
|---|---|
| ⊕ (primary) **Add data** | A drop zone (the same upload flow), "Reuse an upload" list, and "Attach to the next prompt" behaviour |
| ▤ **Datasets** | `GET /api/data/datasets`, shown as a tree by lineage (sources at the root, derived underneath), 24px rows with 12px indent, `rows × cols`. A hover card after 450ms shows the column chips. Click to focus on the canvas; drag onto the composer to @-mention. |
| 🗂 **Workspaces** | Compact rows with the active one dotted, relative times, hover Rename / Export / Delete, and a New button |
| 💡 **Knowledge** | The Playbook markdown, read-only here, with a link to `/knowledge` |

### 7.3 Data model (client-side, localStorage `swarn:workspaces:v2`)

Replace the linear `Thread` with a **turn tree**. Keep this module pure and
unit-tested (`lib/workspace.ts`).

```ts
interface Workspace { id; name; createdAt; updatedAt; turns: Turn[]; focus: Focus | null; unread: string[] }

interface Turn {
  id: string;
  parentId: string | null;          // the turn this was asked from (branching = shared parent)
  parentArtifact?: ArtifactRef;     // exactly which card was focused when asked
  prompt: string;                   // as typed, including @mentions
  attachment?: ChatAttachment;      // {data_dir, label, files}
  jobId: string | null;
  sessionId: string | null;         // set on completion
  status: "queued" | "running" | "complete" | "failed" | "cancelled";
  steps: SessionStep[];             // live feed; the persisted copy is capped (e.g. last 300)
  artifacts: {                      // accumulated in order, from step artifacts (or the parse fallback)
    datasets: DatasetArtifact[];    // {name, rows, cols, parents, tool, step}
    charts:   ChartArtifact[];      // {path, dataset?, tool, step, kind: "png" | "vega"; spec?}
    reports:  ReportArtifact[];     // {htmlPath?, mdPath?, dataset, title, step}
    files:    FileArtifact[];
  };
  answer?: string;                  // result.summary
  outcome?: string;
  failure?: string;
  startedAt; finishedAt?;
}

type ArtifactRef =
  | { kind: "turn"; turnId }
  | { kind: "dataset"; turnId | null; name }        // turnId null = a source from the Datasets panel
  | { kind: "chart"; turnId; index }
  | { kind: "report"; turnId; index }
  | { kind: "answer"; turnId };
type Focus = ArtifactRef;
```

**Resume chain (critical for branching to work with the backend).** When a
turn is submitted, send `resume_session_ids` equal to the session ids of
**its ancestors only**: walk `parentId` up to the root, collect the completed
`sessionId`s, then reverse the list so it is oldest first. Siblings on other
branches must **not** leak into the context. This replaces today's "the
thread's whole list".

**Migration.** On first load, convert each `swarn:threads:v1` thread into a
workspace whose turns form one linear chain:
- each user message plus its following assistant message becomes one turn
  (prompt, answer, sessionId, failure, attachment)
- keep the v1 key untouched, as a backup

### 7.4 Turning steps into thread rows

For each turn, render rows in this order:

1. The prompt card.
2. The plan line. Take the first `plan` step's text, or "Ran N tools: load_csv,
   pivot_dataset, …". Clicking it expands the `StepTimeline`.
3. For each dataset artifact, in step order:
   - a merge row if it has more than one parent
   - then its table card
   - then the chart thumbnails whose `dataset` is that table
4. Any remaining charts, attached to the most recent table card.
5. Report cards.
6. The answer card.

**Artifacts come from `step.data.artifacts`** (section 5.1). If that is
absent (old sessions, or a backend without 5.1), use a **parse fallback**
(`lib/artifacts.ts`, unit-tested against the real strings in 3.2):

| What | Rule |
|---|---|
| Dataset name | `Loaded '([^']+)'` and `Registered result as '?([\w.-]+)` |
| Dataset shape | `\((\d+) rows × (\d+) cols\)` |
| Files | `(?:saved to\|written to)\s+(\S+\.(png\|svg\|jpg\|html\|md\|csv\|parquet))` plus bare `\b[\w./-]+_report\.(md\|html)\b` |
| A chart's dataset | the tool input's `name` |
| Parents | the tool input's `name` when it differs from the new name |

**Tool → chart kind, for the gutter icon.**

| Tool | Chart kind |
|---|---|
| `plot_column` | histogram / bar |
| `plot_relationship` | scatter |
| `analyze_correlations` | grid |
| `analyze_over_time` | line |
| `compare_models`, `feature_importance` | bar |
| `plot_confusion_matrix` | grid |
| `plot_roc_curve`, `plot_residuals` | line / scatter |
| anything else | generic chart |

Keep this in a single map, `lib/toolMeta.ts`, together with each tool's step
label and icon (for example `run_python` → terminal / "running code…").

**Chart thumbnails.**
- For PNG charts, load `workspaceFileUrl(path)` with `loading="lazy"` into
  a 120×100 box.
- For "vega" charts (7.7), render a small off-screen `vega-embed` view to a
  PNG data URL once, and cache it.

### 7.5 Submitting, live updates and completion

Reuse today's `app/page.tsx` mechanics, moved into
`hooks/useWorkspaceRunner.ts`:
- a job per turn
- `/ws/live` session frames mapped to the turn through `session_id`
- REST polling of active jobs every 2.5s, which is authoritative and also
  reconciles jobs that finished while the tab was closed
- a 404 means the server forgot the job, so mark the turn failed with a
  Retry
- Stop calls `POST /api/jobs/{id}/cancel`
- Retry resubmits the same turn with the same resume chain

The task text sent to the agent is the prompt plus a short context footer:
- when a dataset is focused or @-mentioned:
  `\n\nUse the already-loaded dataset(s): 'sales_clean', 'regions'.`
  (the registry is shared server-side, so the agent can use them by name)
- when an attachment exists: its `data_dir` goes in `data_dir`, as today

As `tool_result` steps arrive:
- append their artifacts to the turn and insert the cards live
- auto-focus the **first chart** of the run
- give later charts the unread dot (add their ids to `workspace.unread`)

When the run completes:
- store `sessionId`, `answer` and `outcome`
- if the user hasn't focused anything during the run, focus the answer card

When the run fails or is cancelled, pin the failure to the prompt card as a
red banner with **Retry**.

Only one job can run per workspace at a time; the composer shows the
working overlay. Other workspaces may run in parallel, and each shows a
spinner in the Workspaces panel.

**Composer shortcuts.**

- **Generate a report** sends:

  > Write a report of the key findings from this exploration using
  > write_report on the most relevant dataset.

  The resulting report card is purple and reads "composing…" until the
  `write_report` artifact arrives.

- **Suggest next steps** sends:

  > Suggest 3–5 concrete next analyses for the focused data as a numbered
  > list, one line each. Do not run any tools.

  When the answer is a numbered list, render the items as clickable chips
  under the answer card. Clicking a chip sends it with that answer as the
  parent.

- **Starter questions** for a focused *source* dataset are generated
  **client-side and deterministically** from its columns (no LLM call), using
  `GET /api/data/datasets` kinds:
  - "Show the distribution of {first numeric}"
  - "What drives {a numeric that looks like a target, e.g. price, revenue,
    churn, rating, or the last numeric}?"
  - "Compare {numeric} across {low-cardinality string}"
  - "How does {numeric} change over {date}?"
  - "Clean this dataset"

### 7.6 Agent questions (clarification panel)

When a job event `approval_request` arrives (AIDE today; react after 5.3), a
panel docks **inside the top of the composer card**, bleeding to its edges:
- an amber header: robot icon, **"QUESTION"**, and ✕
- the numbered question text
- `options` as rounded 6px buttons
- an "Or type your own answer…" input

Answering calls `POST /api/jobs/{id}/approve`. The thread item shows a
bouncing robot and "(awaiting your answer)". A `409` means the question timed
out and took its default: show that as an info toast.

### 7.7 Canvas views by focus

| Focus | Canvas |
|---|---|
| dataset | The grid card (2.6), using `/api/data/datasets/{name}/rows` with paging, sort, search and filters, and `/columns/{c}` for the column popover. Derived columns come from `derived_columns`. Dock: **Quick chart** · **Download CSV** (`/export`) · N rows. A 404 shows the "not in memory" empty state with a **Re-run this turn** button. |
| chart (png) | The zoomable image and the status line. Pills: **log** (the turn's `StepTimeline`, scrolled to the step), **code** (the tool name plus the pretty-printed `input`; for `run_python`, the syntax-highlighted code), **open** (a new tab), and **Edit chart**. Below: the grid of `chart.dataset`, if known. |
| chart (vega) | A `vega-embed` view (canvas renderer, tooltips on, actions off) and the same pills. **Edit chart** opens the encoding popover. |
| report | An 816px document column. Prefer the report **HTML** in a sandboxed `<iframe sandbox="allow-same-origin">` sized to its content; otherwise render the MD through the existing `Markdown` component. Pills: open, download md/html, copy. |
| answer | The full markdown, file-mention chips (images inline, as in today's `chat-message.tsx`), and "view trace" → `/sessions/{id}`. |
| turn (running) | The live `StepTimeline`, auto-scrolled. |

**Quick chart and Edit chart: client-side Vega-Lite, no LLM.**

This is the swarn equivalent of DF's encoding shelf.

**The gallery.**
- A popover gallery grouped by category: Points (scatter), Bars (bar,
  grouped, stacked), Distributions (histogram, boxplot), Lines & Areas (line,
  area), Grid (heatmap).
- Each item is a 30×30 line-art icon (draw your own, a monochrome pastel
  style) plus the name.
- Choosing one creates a "vega" chart artifact on a **user turn**. A user
  turn is a turn with `jobId: null` and the prompt "Quick chart: Bar". It is
  parented to the focused dataset's turn and styled like a normal turn, but
  with a "manual" tag instead of the robot row.

**Auto-encoding.** Fill the channels from the column kinds:
- first string → x, first numeric → y, date → x for line
- a second string → color when it has 20 or fewer distinct values

**The encoding popover.**
- Non-modal, 280px wide, 10px radius, anchored to "Edit chart".
- **Chart type select**, shown as the same grouped grid.
- **Channel rows:** x, y, color, size, column, row. Each row is an 84px
  label button plus either a field chip or an empty "field" autocomplete
  that lists the columns with their type icons.
- Field chips are **draggable from the grid's column headers** into
  channels. Use `@dnd-kit/core`. While a drag is in progress, compatible
  targets tint pale yellow; the one under the pointer tints pale blue.
  Dropping one chip onto another swaps them.
- Per-channel options: data type (auto, quantitative, nominal, temporal),
  sort, and aggregate (none, count, sum, mean).
- A footer link, "Open in Vega Editor".

**The data.** Fetch up to 5,000 rows from `/rows`. When `total` is larger,
the status line reads "visualising 5,000 / N rows".

**PNG agent charts are not editable in place.** **Edit chart** on a PNG
chart opens the popover prefilled from the tool input (`x`, `y`, `column`)
and creates a *new* vega chart next to it.

### 7.8 Deleting

Delete works only on client-side artifacts; there is no server delete for
datasets.
- **Chart:** remove it from the turn.
- **Turn:** remove it and its whole subtree, after an inline confirmation
  that shows the count.
- **Dataset card:** hide it in this workspace. The tooltip reads "the
  dataset stays loaded on the server".

Deleting never touches server files.

---

## 8. Other pages in the new language

All of these use the app bar, the new tokens, flat tinted cards, uppercase
section labels, hover-revealed actions and thin scrollbars. Every table keeps
scrolling inside its own container (`TableWrap` / `CellText`).

### 8.1 Jobs

**List.**
- A dense table: status dot, method badge, task, elapsed, created.
- Refreshes live from `/ws/live` job frames, with REST as the fallback.
- A **"New run"** button opens the old Run form in a right drawer.

**Detail.**
- **React / team jobs** render their steps with the same thread timeline
  components as the workspace: gutter icons, shimmer on the active step, and
  table/chart/report cards from artifacts. Add an "Open in workspace" action
  that imports the job's session as a new workspace with one turn.
- **AIDE jobs** render the node events as a **thread of attempt cards**:
  draft, debug and improve stages, the metric, buggy nodes tinted red, and
  the best node marked with a star.

### 8.2 History

- **Sessions tab:** the same rows as today.
- **Session detail:** uses the thread renderer (read-only) plus the summary.
- **AIDE runs tab:** the run list.
- **Run detail:** shows the journal **as a solution tree in thread columns**
  (a node's children fork into columns, exactly like 2.3), the report in the
  816px document column, and the files list.

### 8.3 Evals

- Keep every route, component contract and behaviour rule in `lib/evals.ts`.
- Restyle only:
  - replace indigo with the new primary
  - use the 12px-radius card style
  - use the canvas-style bordered panels for the run detail tabs

### 8.4 Files

- A two-pane browser: tree on the left, preview on the right.
- The preview shows images inline, and md/html in the document column.
- CSVs load into the grid **only if** a registry dataset with the same name
  exists; otherwise the first 200 lines are shown as text.

### 8.5 Knowledge

The Playbook markdown in the document column.

---

## 9. Design system changes

Rewrite the tokens in `app/globals.css`, keeping the same mechanism: light,
dark and OS-dark blocks, exposed through `@theme inline`. Keep the existing
token names so current screens keep working, and add the new roles.

| Token | Light | Dark | Role |
|---|---|---|---|
| `--c-accent` (primary) | `#0f6cbd` | `#4aa3f0` | data, lineage, selection, CTAs |
| `--c-user` | `#c85a17` | `#f08a4b` | user prompts, derived columns |
| `--c-report` | `#7a5bb5` | `#a98be6` | reports |
| `--c-ask` | `#b7791f` | `#f0b94b` | unread dot, agent questions |
| `--c-bg` / `--c-panel` / `--c-raised` | `#f7f7f8` / `#ffffff` / `#f4f4f5` | keep current | surfaces |
| `--c-edge` | `rgba(0,0,0,.12)` | `rgba(255,255,255,.10)` | hairlines |
| `--c-ok` / `--c-warn` / `--c-err` | keep current | keep current | status |

- Each role gets a 10% tint utility, for example
  `bg-[color-mix(in_srgb,var(--c-user)_10%,transparent)]`. Add
  `--color-user-tint` and similar through `@theme` so components write
  `bg-user-tint`.
- Shadows: sm `0 1px 2px rgba(0,0,0,.05)`, md `0 2px 4px rgba(0,0,0,.08)`,
  lg `0 2px 8px rgba(0,0,0,.12)`, plus the composer double shadow. In dark
  mode, use borders instead of shadows.
- Add these to `components/ui/primitives.tsx`:
  - `Pill` / `PillButton`
  - `SectionLabel`
  - `TintCard` (with a role prop)
  - `GutterRow`
  - `Shimmer`
  - `UnreadDot`
  - `SplitPane` (snapping)
  - `Popover`
  - `Dialog`

  Reuse them everywhere; screens must not hand-roll these styles.
- Contrast must meet **WCAG AA** in both themes, including tinted cards and
  the muted text on them. Verify with a quick script or the browser devtools.

### Allowed new dependencies

Add nothing else without writing down why.

| Package | Used for |
|---|---|
| `vega`, `vega-lite`, `vega-embed` | quick and edited charts |
| `@tanstack/react-virtual` | the virtualised grid and long thread lists |
| `@dnd-kit/core` | dragging from grid headers into the encoding popover |
| `react-resizable-panels` | splits; implement snapping in its `onLayout` |
| `prism-react-renderer` | the code dialog |

No MUI, no Redux. Use TanStack Query for server data and a small store (React
context plus `useSyncExternalStore`, or zustand if you prefer and note it)
for workspace state.

---

## 10. Quality bar

**Accessibility.**
- Keep the skip link and landmarks.
- The thread is a `role="tree"` with arrow-key navigation (up/down within a
  column, left/right across columns); Enter focuses; Delete prompts.
- Every icon button has an `aria-label` and a tooltip.
- The composer's `@` menu is a proper combobox.
- Live progress is announced in a polite live region at most every 5s.
- Nothing is conveyed by colour alone. Tints always come with an icon.

**Performance.**
- The thread renders over 300 cards smoothly: virtualise columns taller than
  the viewport.
- The grid scrolls 100k-row datasets through paging.
- Thumbnails are lazy-loaded.
- localStorage writes are debounced (500ms), and the persisted `steps` array
  is capped.

**Resilience.**
- Every fetch has loading, empty and error states.
- A websocket drop shows the amber live dot, and REST polling carries on.
- A 404 on a dataset or job is a recoverable state with an action, never a
  blank panel.

**Responsiveness.**
- Laptop (1280×720) and 1080p are first-class.
- Under 1024px the rail panel always overlays.
- Under 700px the Thread and Canvas tabs take over.
- The page never scrolls horizontally.

**No regressions.** Chat history migrates, Evals works, and the Jobs,
Sessions, Runs and Files deep links still resolve.

---

## 11. Delivery plan and acceptance criteria

Stop at the end of each phase with a short summary: what changed, how you
verified it, and any deviations from this spec.

**Phase 1: design system and shell.**
- Tokens, primitives, app bar, rail skeleton, route map and redirects.
- Every existing page renders in the new shell.
- Acceptance:
  - `build`, `lint` and `test` pass
  - every old URL resolves
  - both themes pass the AA check

**Phase 2: backend (section 5.1 and 5.2).**
- Artifacts on `tool_result`, lineage, and the `/api/data/*` routes, with
  pytest coverage and `API.md` updated.
- Acceptance:
  - a react job that loads a CSV, pivots it and plots it emits `artifacts`
    with correct `parents`
  - `/rows` pages, sorts, searches and filters a 100k-row frame in under
    300ms
  - an unknown dataset returns 404 with the exact message

**Phase 3: the workspace core.**
- Turn-tree store with migration, landing, composer, runner, thread
  rendering (including fork columns, CONTINUES/CONTINUED and lineage
  highlight), and the canvas for dataset, png chart, report and answer.
- Acceptance:
  - a fork from an earlier table sends only its ancestors'
    `resume_session_ids` (unit test)
  - artifacts appear live, before the job completes
  - the parse fallback reproduces the cards for `sessions/ab2bb1db-…`
    (fixture test with the real `trace.json`)

**Phase 4: interaction depth.**
- Quick chart, encoding popover with drag-and-drop, column popover filters,
  starter questions, the Suggest next steps chips, the Generate report flow,
  and the unread dots.

**Phase 5: the other pages** in the new language (section 8), including the
AIDE solution tree as thread columns.

**Phase 6 (optional):** section 5.3 plus the clarification panel.

**Tests to write** (Vitest):
- `lib/workspace.ts`: the resume chain, subtree delete, migration
- `lib/artifacts.ts`: every regex against real result strings from `sessions/`
- the thread layout: column packing, fork reference chips, chain split
- the composer: Enter, Shift+Enter, Tab fill, and the `@` combobox
- the runner: REST-authoritative finalisation when the websocket misses the
  terminal frame

---

## 12. Don'ts

- Don't call a model from the browser, and don't add an LLM endpoint for
  starter questions or chart encodings.
- Don't store secrets, and don't add a login.
- Don't add write/delete endpoints for datasets or workspace files.
- Don't remove the REST polling fallback, and don't trust the websocket for
  terminal states.
- Don't send sibling-branch sessions in `resume_session_ids`.
- Don't render agent-produced HTML outside a sandboxed iframe.
- Don't copy Data Formulator's assets, logo, name or copy text.
