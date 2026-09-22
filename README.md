# swarn dashboard

Next.js frontend for the **swarn** ML agent platform. It is a pure client of the
existing FastAPI backend — it builds no API of its own.

## Prerequisites

The FastAPI backend must be running (default `http://localhost:8420`):

```bash
swarn serve --port 8420
```

The backend enables CORS for `http://localhost:3000` by default; set
`SWARN_CORS_ORIGINS` on the backend if you serve this app elsewhere.

## Configuration

The API base URL comes from `NEXT_PUBLIC_SWARN_API` (with `NEXT_PUBLIC_API_URL`
as a legacy fallback) and defaults to `http://localhost:8420`. The live
websocket URL (`ws://…/ws/live`) is derived from the same value. To point at a
different backend:

```bash
cp .env.example .env.local   # then edit
```

```env
NEXT_PUBLIC_SWARN_API=http://localhost:8420
```

Note: `NEXT_PUBLIC_*` variables are inlined at build time — re-run the dev
server (or rebuild) after changing it.

## Run

```bash
npm install
npm run dev        # http://localhost:3000
```

Production:

```bash
npm run build
npm start
```

Tests (Vitest + Testing Library):

```bash
npm test
```

Docker (standalone Next.js server on port 3000; the API base is inlined at
build time, so pass it as a build argument):

```bash
docker build --build-arg NEXT_PUBLIC_SWARN_API=http://api-host:8420 -t swarn-frontend .
docker run -p 3000:3000 swarn-frontend
```

Light and dark themes follow the OS preference; the toggle at the bottom of
the sidebar stores an override in `localStorage` (`swarn:theme`).

## Pages

- **Chat** (`/`) — converse with the agent. Threads are client-owned
  (localStorage): every message submits a `react` job carrying the thread's
  full `resume_session_ids` chain, and the completed session id is appended on
  finish. Attach files, watch the live step feed, stop a run, retry failures.
- **New Run** (`/run`) — one-shot advanced run (ReAct / AIDE / Team), upload
  data or re-use a previous upload batch; AIDE takes a search budget.
- **Jobs** (`/jobs`, `/jobs/[id]`) — live job list and per-job progress via
  the `/ws/live` websocket with REST polling as fallback; cancel, results,
  deep links to artifacts.
- **Sessions** (`/sessions`) — ReAct session traces.
- **Runs** (`/runs`) — AIDE runs: report + downloadable artifacts.
- **Workspace** (`/workspace`) — browse/download agent workspace files,
  inline image previews.
- **Playbook** (`/playbook`) — cross-run learned lessons.
- **Evals** (`/evals`) — LLM evaluation runs (see below).

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

### Screens

| Route | Purpose |
| --- | --- |
| `/evals` | Runs list from `GET /api/eval/runs`; refreshes every 5 s while a listed run has a live job; open / compare / delete (delete is disabled while a job is producing the run). |
| `/evals/new` | Three-step wizard (below). |
| `/evals/[runId]` | Run detail: Overview, Slices, Comparisons, Results, Report, Judge (only with judge diagnostics), Files; header actions compare / resume (incomplete runs) / delete. |
| `/evals/compare?run=&baseline=` | `POST /api/eval/compare` between two runs with optional max drop / p-value; regressions highlighted; markdown for copy-paste. |

### How the wizard maps to the API

1. **Setup** — datasets from `GET /api/eval/datasets`; "Upload dataset" (or
   drag-and-drop) sends the file through the dashboard's existing multipart
   `POST /api/upload`, refetches the list and selects the new entry. The
   deployed endpoint
   and key-env names from `GET /api/eval/endpoints` (only variable *names*
   are ever shown). "Draft configuration" → `POST /api/eval/design` with
   `{goal, dataset_path, candidates}` (mock baselines `mock-perfect` and
   `mock-echo` are appended when the toggle is on). "Start from the reference
   config" → `GET /api/eval/example`.
2. **Review** — the YAML editor (CodeMirror) on the left; on the right
   `POST /api/eval/validate` (debounced 800 ms on edit and on demand),
   `POST /api/eval/ping` and `POST /api/eval/estimate`, each sending
   `{yaml}`. The Run button is enabled only when the last validate for the
   current YAML returned `ok: true`; a failed ping warns but does not block;
   the last estimate's cost (or "not estimated") is shown next to Run. Run
   options map 1:1 to the `POST /api/eval/runs` body fields (`label`,
   `no_cache`, `max_cost_usd`, `full`, `allow_self_judge`, `no_preflight`).
   The YAML is kept in `sessionStorage` so a refresh keeps edits.
3. **Running** — `POST /api/eval/runs` returns a job; the page watches it via
   `hooks/useJob.ts`, links to the run as soon as `run_id` appears, cancels
   with `POST /api/jobs/{id}/cancel`, and on `cancelled` offers
   `POST /api/eval/runs/{run_id}/resume`. A failure mentioning "hidden
   reasoning" offers a one-click YAML fix that adds
   `extra: {chat_template_kwargs: {enable_thinking: false}}` to the chosen model.

### Behaviour rules enforced in the UI

- Judge in the same model family as a candidate → warning before run (the
  server refuses unless "Allow self-judge" is set).
- Every mean is shown with its 95% CI; a gate whose threshold lies inside the
  CI is annotated "not decisive at this sample size".
- Candidates with `failure_rate > 0` carry the caveat "metrics cover only
  samples that produced output".
- `mock-*` candidates are grouped separately; if `mock-perfect` < 0.95 or
  `mock-echo` > 0.2 on a judge metric, a banner says the judge/rubric is not
  discriminating.
- Judge metrics are labelled "unaudited" until `judge_diagnostics.calibration`
  exists; the Judge tab collects up to 50 human pass/fail labels and posts
  them to `POST /api/eval/runs/{run_id}/calibrate`.
