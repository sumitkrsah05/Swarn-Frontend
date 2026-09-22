"use client";

import { useState } from "react";
import type { ModelConfig, MockBehavior, Provider } from "@/api/types";
import { useEndpoints } from "@/hooks/useEvalData";
import { errorMessage } from "@/lib/evals";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Field,
  InlineError,
  Input,
  Select,
  Textarea,
} from "./primitives";

const PROVIDERS: Provider[] = ["deployed", "openai-compatible", "anthropic", "hf-local", "mock"];
const MOCK_BEHAVIORS: MockBehavior[] = ["reference", "echo", "fixed", "fail"];

function emptyModel(): ModelConfig {
  return {
    name: "",
    provider: "openai-compatible",
    model: "",
    base_url: "",
    api_key_env: "",
    temperature: 0,
    max_tokens: 512,
    timeout_s: 120,
    rpm: 60,
    system_prompt: "",
    prompt_template: "{input}",
  };
}

/** Drop empty / default-ish fields so the config stays small. */
function compact(m: ModelConfig): ModelConfig {
  const out: ModelConfig = { provider: m.provider };
  if (m.name?.trim()) out.name = m.name.trim();
  if (m.provider === "mock") {
    out.mock_behavior = m.mock_behavior ?? "reference";
    return out;
  }
  if (m.provider !== "deployed") {
    if (m.model?.trim()) out.model = m.model.trim();
    if (m.base_url?.trim()) out.base_url = m.base_url.trim();
    if (m.api_key_env?.trim()) out.api_key_env = m.api_key_env.trim();
  }
  if (m.temperature != null && !Number.isNaN(m.temperature)) out.temperature = m.temperature;
  if (m.max_tokens) out.max_tokens = m.max_tokens;
  if (m.timeout_s) out.timeout_s = m.timeout_s;
  if (m.rpm) out.rpm = m.rpm;
  if (m.system_prompt?.trim()) out.system_prompt = m.system_prompt;
  if (m.prompt_template && m.prompt_template !== "{input}") out.prompt_template = m.prompt_template;
  if (m.extra && Object.keys(m.extra).length) out.extra = m.extra;
  return out;
}

export function describeModel(m: ModelConfig): string {
  if (m.provider === "mock") return `mock · ${m.mock_behavior ?? "reference"}`;
  if (m.provider === "deployed") return "deployed (server .env)";
  return [m.model, m.base_url].filter(Boolean).join(" @ ") || m.provider;
}

export function CandidateEditor({
  candidates,
  onChange,
  addMocks,
  onAddMocksChange,
}: {
  candidates: ModelConfig[];
  onChange: (c: ModelConfig[]) => void;
  addMocks: boolean;
  onAddMocksChange: (v: boolean) => void;
}) {
  const endpoints = useEndpoints();
  const [editing, setEditing] = useState<{ index: number | null; draft: ModelConfig } | null>(null);
  const [extraText, setExtraText] = useState("");
  const [extraError, setExtraError] = useState<string | null>(null);

  const addDeployed = () => {
    const d = endpoints.data?.deployed;
    const name = d?.model ? d.model.replace(/[^\w.-]+/g, "-") : "deployed";
    onChange([...candidates, { name: uniqueName(name, candidates), provider: "deployed" }]);
  };

  const startAdd = () => {
    setEditing({ index: null, draft: emptyModel() });
    setExtraText("");
    setExtraError(null);
  };
  const startEdit = (i: number) => {
    setEditing({ index: i, draft: { ...emptyModel(), ...candidates[i] } });
    setExtraText(candidates[i].extra ? JSON.stringify(candidates[i].extra, null, 2) : "");
    setExtraError(null);
  };
  const remove = (i: number) => onChange(candidates.filter((_, j) => j !== i));

  const save = () => {
    if (!editing) return;
    let extra: Record<string, unknown> | undefined;
    if (extraText.trim()) {
      try {
        extra = JSON.parse(extraText) as Record<string, unknown>;
      } catch (e) {
        setExtraError(`extra must be JSON: ${errorMessage(e)}`);
        return;
      }
    }
    const model = compact({ ...editing.draft, extra });
    if (!model.name) {
      setExtraError("name is required");
      return;
    }
    const next = [...candidates];
    if (editing.index == null) next.push(model);
    else next[editing.index] = model;
    onChange(next);
    setEditing(null);
  };

  const set = (patch: Partial<ModelConfig>) =>
    setEditing((e) => (e ? { ...e, draft: { ...e.draft, ...patch } } : e));

  return (
    <div className="space-y-3">
      {endpoints.isError && <InlineError message={errorMessage(endpoints.error)} />}

      {candidates.length === 0 ? (
        <p className="rounded-md border border-dashed border-edge px-3 py-3 text-sm text-muted">
          No candidates yet. Add the deployed model or configure one by hand. Leaving this empty
          lets the designer choose from the deployed endpoint.
        </p>
      ) : (
        <ul className="divide-y divide-edge overflow-hidden rounded-lg border border-edge">
          {candidates.map((c, i) => (
            <li key={i} className="flex items-center gap-3 bg-panel px-3 py-2">
              <span className="font-mono text-sm text-fg">{c.name || "(unnamed)"}</span>
              <Badge tone={c.provider === "mock" ? "neutral" : c.provider === "deployed" ? "accent" : "violet"}>
                {c.provider}
              </Badge>
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted">{describeModel(c)}</span>
              <Button size="sm" variant="ghost" onClick={() => startEdit(i)}>edit</Button>
              <Button size="sm" variant="ghost" className="text-err" onClick={() => remove(i)}>remove</Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={addDeployed} disabled={!endpoints.data} title={endpoints.data ? `${endpoints.data.deployed.model} @ ${endpoints.data.deployed.base_url}` : "loading endpoints…"}>
          Add deployed model
          {endpoints.data?.deployed.model && (
            <span className="font-mono text-xs text-muted">{endpoints.data.deployed.model}</span>
          )}
        </Button>
        <Button onClick={startAdd}>Add model</Button>
      </div>

      <Checkbox
        checked={addMocks}
        onChange={onAddMocksChange}
        label="Add mock baselines (perfect + echo)"
        hint="They prove the scoring works: a perfect mock must score high and an echo mock low, or the judge/rubric is not discriminating."
      />

      {editing && (
        <Card
          title={editing.index == null ? "New model" : `Edit ${editing.draft.name || "model"}`}
          actions={
            <>
              <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              <Button size="sm" variant="primary" onClick={save}>Save</Button>
            </>
          }
        >
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Name" hint="short id used in gates, e.g. gemma-4-31b">
              <Input value={editing.draft.name ?? ""} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field label="Provider">
              <Select value={editing.draft.provider} onChange={(e) => set({ provider: e.target.value as Provider })}>
                {(endpoints.data?.providers?.length ? endpoints.data.providers : PROVIDERS).map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </Select>
            </Field>
            {editing.draft.provider === "mock" && (
              <Field label="Mock behaviour">
                <Select value={editing.draft.mock_behavior ?? "reference"} onChange={(e) => set({ mock_behavior: e.target.value as MockBehavior })}>
                  {MOCK_BEHAVIORS.map((b) => <option key={b} value={b}>{b}</option>)}
                </Select>
              </Field>
            )}
            {editing.draft.provider === "deployed" && (
              <p className="self-end text-xs text-muted md:col-span-1">
                model, base_url and api_key_env come from the server&apos;s .env
                {endpoints.data && <> ({endpoints.data.deployed.model})</>}.
              </p>
            )}
            {editing.draft.provider !== "mock" && editing.draft.provider !== "deployed" && (
              <>
                <Field label="Model">
                  <Input value={editing.draft.model ?? ""} onChange={(e) => set({ model: e.target.value })} placeholder="gemma4-31b" className="font-mono text-xs" />
                </Field>
                <Field label="Base URL">
                  <Input value={editing.draft.base_url ?? ""} onChange={(e) => set({ base_url: e.target.value })} placeholder="https://host/v1" className="font-mono text-xs" />
                </Field>
                <Field label="API key env" hint="environment-variable name on the server; keys are never typed here">
                  <Select value={editing.draft.api_key_env ?? ""} onChange={(e) => set({ api_key_env: e.target.value })}>
                    <option value="">(none)</option>
                    {(endpoints.data?.api_key_envs ?? []).map((k) => <option key={k} value={k}>{k}</option>)}
                    {editing.draft.api_key_env && !(endpoints.data?.api_key_envs ?? []).includes(editing.draft.api_key_env) && (
                      <option value={editing.draft.api_key_env}>{editing.draft.api_key_env}</option>
                    )}
                  </Select>
                </Field>
              </>
            )}
            {editing.draft.provider !== "mock" && (
              <>
                <Field label="Temperature">
                  <Input type="number" step="0.1" min="0" value={editing.draft.temperature ?? 0} onChange={(e) => set({ temperature: Number(e.target.value) })} />
                </Field>
                <Field label="Max tokens">
                  <Input type="number" min="1" value={editing.draft.max_tokens ?? ""} onChange={(e) => set({ max_tokens: e.target.value ? Number(e.target.value) : undefined })} />
                </Field>
                <Field label="Timeout (s)">
                  <Input type="number" min="1" value={editing.draft.timeout_s ?? ""} onChange={(e) => set({ timeout_s: e.target.value ? Number(e.target.value) : undefined })} />
                </Field>
                <Field label="Requests / minute">
                  <Input type="number" min="1" value={editing.draft.rpm ?? ""} onChange={(e) => set({ rpm: e.target.value ? Number(e.target.value) : undefined })} />
                </Field>
                <Field label="Prompt template" hint="{input} is replaced with the row input" className="md:col-span-2">
                  <Input value={editing.draft.prompt_template ?? ""} onChange={(e) => set({ prompt_template: e.target.value })} className="font-mono text-xs" />
                </Field>
                <Field label="System prompt" className="md:col-span-3">
                  <Textarea rows={2} value={editing.draft.system_prompt ?? ""} onChange={(e) => set({ system_prompt: e.target.value })} />
                </Field>
                <Field label="Extra (JSON)" hint='e.g. {"chat_template_kwargs": {"enable_thinking": false}} for thinking models' className="md:col-span-3">
                  <Textarea rows={2} value={extraText} onChange={(e) => setExtraText(e.target.value)} placeholder="{}" />
                </Field>
              </>
            )}
          </div>
          {extraError && <p className="mt-2 text-xs text-err">{extraError}</p>}
        </Card>
      )}
    </div>
  );
}

function uniqueName(base: string, existing: ModelConfig[]): string {
  const names = new Set(existing.map((c) => c.name));
  if (!names.has(base)) return base;
  let i = 2;
  while (names.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}
