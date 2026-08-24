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
