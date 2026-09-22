# Prompt: build the LLM Evaluation frontend for swarn

## 1. What you are building

A web frontend for **swarn's LLM evaluation feature**. Users pick a dataset
and one or more candidate models, describe the goal, get a proposed
configuration, review and edit it, run the evaluation, watch progress, and
read the results: metrics with confidence intervals, gate pass/fail,
per-row answers with the judge's reasoning, and comparisons between runs.

The backend is finished and running. You are building only the UI against
the HTTP API described in section 3. Do not invent endpoints; do not call
any model API directly.

## 2. Stack and constraints

- **Next.js 14+ (App Router) with TypeScript**, React Query (TanStack) for
  data fetching, a small component library of your choice (shadcn/ui or
  similar), Tailwind for styling. Monaco or CodeMirror for the YAML editor.
- The API lives on the same host as the dashboard, default
  `http://<host>:8420`. Read the base URL from `NEXT_PUBLIC_SWARN_API`
  (default `http://localhost:8420`). CORS is enabled on the backend for
  `http://localhost:3000`; other origins are configured server-side via
  `SWARN_CORS_ORIGINS`.
- No authentication exists on the API. Do not build a login. Do not store
  anything secret in the browser; the API never returns secrets.
- Must work on a laptop screen and a 1080p monitor. Dark and light theme.
- Every table must scroll inside its own container; the page never scrolls
  horizontally.
- Errors from the API arrive as `{"detail": "..."}` with 4xx status. Show
  the detail text to the user verbatim in a non-blocking toast or inline
  banner, never a generic "something went wrong".

## 3. API contract

All paths are relative to the API base. JSON unless stated.

### 3.1 Form data

`GET /api/eval/datasets?limit=200` →
`{datasets: [{path, name, size, rows|null, modified}], workspace}`.
`path` is the value to put in the config's `dataset.path`.

`GET /api/eval/endpoints` →
`{deployed: {provider:"deployed", model, base_url}, api_key_envs: [string], providers: [string]}`.
`api_key_envs` are environment-variable **names** for a candidate's
`api_key_env` field. Never ask the user to type a key.

`GET /api/eval/metrics` → `{metrics: [{name, group, needs_judge}]}`,
`group` ∈ deterministic | embedding | code | judge | rag | safety | trajectory.

`GET /api/eval/example` → the fully commented reference YAML (`text/yaml`).

### 3.2 Config bodies

Every endpoint that takes a configuration accepts **either**
`{"config": <object>}` **or** `{"yaml": "<text>"}`, never both. The object
shape is the eval.yaml shape (see 3.8 for a complete example).

### 3.3 Design and checks

`POST /api/eval/design`
`{goal, dataset_path, candidates?: [ModelConfig], train_path?}` →
`{config, yaml, rationale, notes: [string], plan}`. May take 5–30 s (one LLM
call). 422 if the dataset is unusable, 404 if missing.

`POST /api/eval/validate` (config body) → **always 200**:
`{ok, errors: [string], warnings: [string], dataset: {...}|null, lines: [string], plan: {...}|null}`.
`dataset` includes `total_rows, valid_rows, malformed, exact_duplicates,
near_duplicates, oversized, avg_input_tokens, avg_reference_tokens`.
`plan` is `{candidates: [{name, provider, model, base_url, temperature}],
metrics: [string], judge: {provider, model, base_url, mode, criteria, decompose, ensemble}|null,
sampling: {mode, sample_size, seed}, gates: [{metric, op, threshold, min_samples}], config_hash}`.

`POST /api/eval/estimate?full=false` (config body) →
`{rows, sampled, models: [{name, requests, tokens_in, tokens_out, cost_usd, ...}],
judge: {...}|null, total_cost_usd, total_requests, est_minutes, lines, budget_usd, exceeds_budget}`.
422 on an invalid config.

`POST /api/eval/ping` (config body) →
`{ok, checks: [{role: "candidate"|"judge"|"judge-ensemble", name, provider, model, base_url,
ok: true|false|null, latency_s, error|null, reply}]}`.
`ok: null` means skipped (mock or local model). 422 on an invalid config.

### 3.4 Running

`POST /api/eval/runs`
`{config|yaml, label?, no_cache?, max_cost_usd?, full?, allow_self_judge?, no_preflight?}`
→ a **job summary**:
`{id, task, method:"eval", status, created, started, finished, cancel_requested,
run_id|null, n_events, last_event, pending_approvals: []}`.

`POST /api/eval/runs/{run_id}/resume` `{add?: int, max_cost_usd?}` → job summary.
409 if the run is complete and `add` is absent.

**Job lifecycle (shared with all dashboard jobs):**
- `GET /api/jobs/{id}?since=N` →
  `{...summary, result, error, events: [...], events_from}`. Poll every
  1–2 s while `status` ∈ queued | running, passing `since = n_events` you
  already have.
- Or subscribe to `WS /ws/live`; each message is
  `{channel:"job", job_id, method, status, task, event}`. Filter
  `method === "eval"`.
- Event types for eval jobs: `{type:"status", status}`,
  `{type:"progress", message}`, `{type:"cancel_requested"}`. Every event has `ts`.
- `POST /api/jobs/{id}/cancel` → job summary. Cancel is cooperative: it
  takes effect at the engine's next checkpoint; the run stays resumable.
- Terminal statuses: `complete`, `failed` (reason in `error`), `cancelled`.
- On `complete`, `result` is
  `{method:"eval", run_id, run_dir, goal, candidates: {name: {samples, failure_rate, cost_usd,
  metrics: {metric: {mean, pass_rate}}}}, gates: [{gate, value, passed, reason}],
  gates_passed: bool|null, caveats: [string], report_url}`.
- `run_id` is set on the job as soon as the run directory exists, before
  completion. Use it to link to the run page early.

### 3.5 Reading runs

`GET /api/eval/runs?limit=50` →
`{runs: [{run_id, status: "complete"|"incomplete"|"empty", goal, created, candidates: [string],
headline: {name: {samples, failure_rate, cost_usd, metrics: {metric: {mean, ci95: [lo, hi], pass_rate}}}}|null,
gates_passed: bool|null, job: <job summary>|null}], root}` newest first.

`GET /api/eval/runs/{run_id}` →
`{run_id, status, summary, config, checkpoint: {cost_so_far, selected_ids, seed}|null,
artifacts: {"report.md": bool, "report.html": bool, ...}, job}`.
`summary` is the full summary.json:
`{run_id, goal, generated_at, seed, sampled, dataset_rows_used, config_hash, dataset_hash,
candidates: {name: {samples, failures, failure_rate, cost_usd, cache_hits, latency_s_avg,
tokens_in, tokens_out, pass_rate, metrics: {metric: {mean, ci95_low, ci95_high, n, errors, pass_rate}},
slices: {field: {value: {metric: {mean, ci95_low, ci95_high, n}}}}}},
comparisons: [{a, b, n_shared, metrics: {metric: {delta, ci, test, p, verdict, ...}}}],
gates: [{gate, value, passed, reason}], gates_passed, caveats: [string],
failure_analysis: {...}, judge_diagnostics: {verbosity_bias_corr, format_bias, pairwise_flip_rates, calibration},
stage2_recommendation: {additional_rows, reason}|null, environment}`.

`GET /api/eval/runs/{run_id}/report?format=html|md` → rendered report
(`text/html` or `text/markdown`); 404 until complete. Render the HTML in a
sandboxed iframe (`sandbox=""`) or fetch the markdown and render it yourself.

`POST /api/eval/runs/{run_id}/report` → rebuilds summary and reports; `{run_id, summary}`.

`GET /api/eval/runs/{run_id}/results?candidate=&sample_id=&only_failed=&offset=0&limit=50`
→ `{run_id, total, offset, limit, rows}`; `limit` ≤ 500. Each row:
`{candidate, sample_id, input, output, reference, scores: {metric: number},
passed: {metric: bool}, metric_details: {judge_rubric?: {reasoning, criteria: {name: {verdict}}}},
metric_errors: {metric: string}, error|null, latency_s, tokens_in, tokens_out, cost_usd, cached, metadata: {...}}`.

`GET /api/eval/runs/{run_id}/files` → `{run_id, files: [{path, size}]}`;
`GET /api/eval/runs/{run_id}/files/{path}` downloads one.
`DELETE /api/eval/runs/{run_id}` → `{deleted}`; 409 while a job is producing it.

`{run_id}` accepts a unique prefix.

### 3.6 Across runs

`POST /api/eval/compare` `{run, baseline, max_drop?, p_value?}` →
`{baseline_run, candidate_run, pairs: [{candidate, metric, delta, ci, test, p, verdict, ...}],
regressions: [...], warnings: [string], passed, markdown}`.

`POST /api/eval/runs/{run_id}/calibrate`
`{labels: [{sample_id, human_pass: bool} | {sample_id, human_score: number}]}` →
`{run_id, calibration: {kappa, spearman, n, ...}}`. 409 if the run had no judge.

### 3.7 ModelConfig (one candidate or the judge model)

```json
{"name": "gemma-4-31b", "provider": "openai-compatible", "model": "gemma4-31b",
 "base_url": "https://host/v1", "api_key_env": "GEMMA_API_KEY",
 "temperature": 0.0, "max_tokens": 512, "timeout_s": 120, "rpm": 60,
 "system_prompt": "", "prompt_template": "{input}",
 "extra": {"chat_template_kwargs": {"enable_thinking": false}}}
```
`provider` ∈ deployed | openai-compatible | anthropic | hf-local | mock.
With `deployed`, omit model/base_url/api_key_env (they come from the server's
`.env`). With `mock`, `mock_behavior` ∈ reference | echo | fixed | fail.

### 3.8 Complete config example

```yaml
goal: "Does gemma4-31b explain hard conceptual questions correctly? Gate at 0.70."
dataset:
  path: workspace/evals/gemma_descriptive_qa.jsonl
  field_mapping: {metadata_fields: [category, difficulty]}
candidates:
  - {name: gemma-4-31b, provider: openai-compatible, model: gemma4-31b,
     base_url: https://uat-bodhi.swarajcloud.dev/openai/v1, api_key_env: GEMMA_API_KEY,
     temperature: 0.0, max_tokens: 700}
  - {name: mock-perfect, provider: mock, mock_behavior: reference}
  - {name: mock-echo, provider: mock, mock_behavior: echo}
judge:
  model: {provider: deployed, max_tokens: 1200, extra: {chat_template_kwargs: {enable_thinking: false}}}
  mode: rubric
  decompose: true
  pass_threshold: 0.70
  rubric:
    - {name: key_points, description: "Gives the main mechanism and conclusion in the reference.", scale: 5, weight: 2.0}
    - {name: no_errors, description: "Makes substantive claims and none is wrong.", binary: true, weight: 2.0}
metrics:
  - {name: judge_rubric}
  - {name: token_f1, pass_threshold: 0.3}
sampling: {mode: full, seed: 42}
execution: {concurrency: 3, budget_usd: 5.0, preflight: true}
gates:
  - {metric: "gemma-4-31b/judge_rubric.mean", op: ">=", threshold: 0.70, min_samples: 30}
  - {metric: "mock-perfect/judge_rubric.mean", op: ">=", threshold: 0.85, min_samples: 30}
  - {metric: "mock-echo/judge_rubric.mean", op: "<=", threshold: 0.30, min_samples: 30}
reporting: {formats: [md, html, json], slice_by: [category, difficulty]}
```

## 4. Screens

### 4.1 `/evals` — Runs list (landing page)
- Table of runs from `GET /api/eval/runs`: run id (link), goal (truncated),
  status badge, candidates, one headline metric per candidate as
  `mean [lo, hi]`, gates badge (passed / failed / n.a.), created time,
  and a live indicator when `job` is present with status running.
- Primary button "New evaluation" → `/evals/new`.
- Row actions: open, compare (opens 4.4 with this run preselected), delete
  (confirm; disabled while a job is producing it).
- Auto-refresh every 5 s while any listed run has a running job.

### 4.2 `/evals/new` — Create (a three-step wizard on one page)

**Step 1, Setup.**
- Dataset picker from `GET /api/eval/datasets`: name, path, rows, size,
  modified; searchable. Also a free-text path field for a path not listed.
- Candidates: a list editor. "Add deployed model" pre-fills from
  `GET /api/eval/endpoints`. "Add model" opens a form with the ModelConfig
  fields; `api_key_env` is a select fed by `api_key_envs`. Always include a
  toggle "Add mock baselines (perfect + echo)", default on, which appends
  the two mock candidates. Explain in one line why: they prove the scoring
  works.
- Goal: a multiline text box with placeholder
  "Does <model> answer <dataset> correctly? Gate at 80%."
- Button "Draft configuration" → `POST /api/eval/design` with a spinner and
  the note "may take up to 30 seconds". On success move to step 2 with the
  returned YAML. Show `rationale` and `notes` in a collapsible panel.
- Secondary link "Start from the reference config" → loads
  `GET /api/eval/example` into step 2 instead.

**Step 2, Review.**
- Left: YAML editor (Monaco/CodeMirror, YAML mode) holding the draft.
- Right: a checks panel with three cards, each with its own button and
  result area:
  - **Validate** → `POST /api/eval/validate` with `{yaml}`. Debounce 800 ms
    on edit and also run on demand. Show `errors` as a red list; show the
    `plan` as a readable summary (candidates, metrics, judge, sampling,
    gates) and the dataset profile (rows, duplicates, average tokens).
  - **Ping** → `POST /api/eval/ping`. One row per check: role, name, model
    @ base_url, ok/failed/skipped, latency ms, error text on failure.
  - **Estimate** → `POST /api/eval/estimate`. Requests, tokens, cost,
    minutes; highlight when `exceeds_budget`.
- The "Run" button is enabled only when the last validate returned
  `ok: true`. If the last ping had a failure, the button stays enabled but
  shows a warning "an endpoint failed the last ping; the run will abort at
  pre-flight".
- Run options (collapsed by default): label, no cache, max cost, force
  full dataset, allow self-judge (with a one-line warning about
  self-preference bias), skip pre-flight.

**Step 3, Running.**
- After `POST /api/eval/runs`, show the job id, a status badge, an
  elapsed timer, and a live log of `progress` messages (newest at the
  bottom, auto-scroll, monospace). Source: WebSocket if connected,
  otherwise poll `GET /api/jobs/{id}?since=N` every 1.5 s.
- As soon as `run_id` appears on the job, show a link "Open run".
- Cancel button → `POST /api/jobs/{id}/cancel`, then show "cancel
  requested, stops at next checkpoint".
- On `complete`: render `result` as a result card (per-candidate metric
  means and pass rates, gates with pass/fail and reason, caveats) and a
  primary button to the run page. On `failed`: show `error` prominently
  with a "Back to review" button that returns to step 2 with the YAML
  intact. On `cancelled`: offer "Resume" → `POST /api/eval/runs/{run_id}/resume`.

### 4.3 `/evals/[runId]` — Run detail

Tabs:
- **Overview**: goal, created, config hash, dataset hash, seed, sampled
  flag; per-candidate cards with samples, failure rate, cost, cache hits,
  average latency; a metrics table per candidate with mean, 95% CI as
  text and as a small horizontal bar from 0 to 1 with the CI drawn, pass
  rate, n, errors; gates list with pass/fail badges and reasons; caveats
  in a warning box at the top when non-empty; `stage2_recommendation`
  as an info box with a "Resume with N more rows" button when present.
- **Slices**: for each metadata field in `candidates[*].slices`, a table of
  value × metric with mean and CI.
- **Comparisons**: the `comparisons` array rendered as a table per pair
  (a vs b, n shared, per metric: delta, CI, test, p, verdict).
- **Results**: a paginated table over `GET .../results` with filters:
  candidate (select), only failed (toggle), sample id (text). Columns:
  sample id, candidate, scores per metric (colour by pass), latency,
  cached. Clicking a row opens a drawer showing input, output, reference
  side by side, all scores, and for judge metrics the criteria verdicts
  and the full reasoning text. Preserve whitespace in these texts.
- **Report**: the server-rendered `report.html` in a sandboxed iframe,
  with a "Download markdown" link to `?format=md`. A "Regenerate" button
  calls `POST .../report`.
- **Judge**: shown only when `summary.judge_diagnostics` has content.
  Verbosity bias correlation, format bias, pairwise flip rates,
  calibration record or "unaudited" label. Below it, a calibration form:
  a table of up to 50 sampled rows for one candidate where the user marks
  pass/fail per row, then "Submit labels" → `POST .../calibrate`; show the
  returned kappa and Spearman with the interpretation bands: ≥ 0.8 strong,
  0.6–0.8 moderate, < 0.6 unreliable.
- **Files**: listing from `GET .../files` with download links.
- Header actions: compare with… (opens 4.4), delete (confirm), resume when
  status is incomplete.

### 4.4 `/evals/compare?run=&baseline=`
- Two run selectors (searchable, from the runs list), optional max drop
  and p-value. "Compare" → `POST /api/eval/compare`.
- Render `pairs` as a table; highlight rows present in `regressions`; show
  `passed` as a large badge and `warnings` in a box; offer the returned
  `markdown` in a collapsible for copy-paste.

## 5. Behaviour rules the UI must enforce or explain

1. **A judge must not be the candidate's own model family.** If the plan
   shows a judge whose `model` shares its family prefix (text before the
   first `-`, `/`, or digit) with any candidate, show a warning before
   run; the server will refuse the run unless `allow_self_judge` is set.
2. **Thinking models return empty answers unless told not to think.** If a
   ping or a run error contains the phrase "hidden reasoning", surface the
   remedy text from the error and offer a one-click fix that adds
   `extra: {chat_template_kwargs: {enable_thinking: false}}` to that model
   in the YAML.
3. **Confidence intervals are the result, not the mean.** Wherever a mean
   is shown, show its CI beside it. If a gate's threshold lies inside the
   CI, annotate "not decisive at this sample size".
4. **A failure rate above zero changes what the mean means.** Show a
   caveat on any candidate with `failure_rate > 0`: "metrics cover only
   samples that produced output".
5. **Mock baselines are a self-test.** In results and overview, visually
   group `mock-*` candidates separately from real ones, and if
   `mock-perfect` scores below 0.95 or `mock-echo` above 0.2 on a judge
   metric, show a banner "the judge or rubric is not discriminating; do
   not trust the candidate scores".
6. **Judge scores are opinions until calibrated.** If
   `judge_diagnostics.calibration` is null, label judge metrics
   "unaudited" with a link to the Judge tab.
7. **Nothing is spent without a visible step.** The run button must show
   the estimated cost from the last estimate next to it, or "not
   estimated" if the user skipped that check.

## 6. Non-functional

- Type every API response with TypeScript interfaces derived from section 3.
  Put them in one `api/types.ts` and a thin `api/client.ts` with one
  function per endpoint. No fetch calls inside components.
- Handle the WebSocket dropping: reconnect with backoff and fall back to
  polling; never lose the run state.
- Persist the wizard's YAML in `sessionStorage` so a refresh does not lose
  edits.
- All long texts (prompts, outputs, reasoning) render in a scrollable,
  monospace, whitespace-preserving block with a copy button.
- Loading, empty and error states for every list and table.
- Keyboard: the YAML editor must not trap Tab focus outside itself; Esc
  closes drawers.
- Provide `npm run dev`, `npm run build`, and a Dockerfile that builds a
  static production server on port 3000. Document `NEXT_PUBLIC_SWARN_API`
  in the README.

## 7. Deliverables

1. The Next.js project with the four routes above.
2. `api/types.ts`, `api/client.ts`, and a `hooks/useJob.ts` that
   encapsulates the WebSocket-or-poll job watcher.
3. A README covering setup, environment, and how the wizard maps to the
   API calls.
4. Component tests for the checks panel state machine (validate ok →
   run enabled; validate error → disabled) and for the job watcher's
   fallback from WebSocket to polling.

Build it in this order: types and client, runs list, run detail Overview
and Results tabs, the wizard, then compare and calibration.
