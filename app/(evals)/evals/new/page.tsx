"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { createRun, designConfig, getExampleYaml, runAuto } from "@/api/client";
import type { ModelConfig, RunOptions } from "@/api/types";
import { useInvalidateRuns } from "@/hooks/useEvalData";
import { useToast } from "@/components/toast";
import { PageHeader } from "@/components/ui";
import {
  AUTO_MAX_COST_DEFAULT,
  EMPTY_DRAFT,
  GOAL_PLACEHOLDER,
  MOCK_CANDIDATES,
  applyThinkingFix,
  clearWizardDraft,
  errorMessage,
  loadWizardDraft,
  saveWizardDraft,
  type WizardDraft,
  type WizardStep,
  type YamlModelRef,
} from "@/lib/evals";
import {
  Banner,
  Button,
  Card,
  Collapsible,
  Field,
  Input,
  Loading,
  Textarea,
} from "@/components/ui";
import { DatasetPicker } from "@/components/evals/dataset-picker";
import { CandidateEditor } from "@/components/evals/candidate-editor";
import { YamlEditor } from "@/components/evals/yaml-editor";
import { ChecksPanel } from "@/components/evals/checks-panel";
import { JobMonitor } from "@/components/evals/job-monitor";

const STEPS: { id: WizardStep; label: string }[] = [
  { id: 1, label: "Setup" },
  { id: 2, label: "Review" },
  { id: 3, label: "Running" },
];

export default function NewEvalPage() {
  const toast = useToast();
  const invalidate = useInvalidateRuns();
  const [draft, setDraft] = useState<WizardDraft>(EMPTY_DRAFT);
  const [loaded, setLoaded] = useState(false);
  const [autoMaxCost, setAutoMaxCost] = useState<number>(AUTO_MAX_COST_DEFAULT);

  // sessionStorage is client-only and the page is prerendered: hydrate with
  // the empty draft, then restore once after mount (same pattern as lib/threads).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const saved = loadWizardDraft();
    if (saved) setDraft(saved);
    setLoaded(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (loaded) saveWizardDraft(draft);
  }, [draft, loaded]);

  const patch = useCallback(
    (p: Partial<WizardDraft>) => setDraft((d) => ({ ...d, ...p })),
    [],
  );

  const candidatesForDesign = (): ModelConfig[] | undefined => {
    const list = [...draft.candidates, ...(draft.addMocks ? MOCK_CANDIDATES : [])];
    return list.length ? list : undefined;
  };

  const design = useMutation({
    mutationFn: () =>
      designConfig({
        goal: draft.goal.trim(),
        dataset_path: draft.datasetPath.trim(),
        candidates: candidatesForDesign(),
        judge: draft.judge[0],
      }),
    onSuccess: (r) => {
      patch({ yaml: r.yaml, design: { rationale: r.rationale, notes: r.notes }, step: 2 });
      toast("success", "Configuration drafted");
    },
    onError: (e) => toast("error", errorMessage(e)),
  });

  const example = useMutation({
    mutationFn: getExampleYaml,
    onSuccess: (yaml) => patch({ yaml, design: null, step: 2 }),
    onError: (e) => toast("error", errorMessage(e)),
  });

  // the autonomous loop: design → run → self-heal → stage-2 as one job; the
  // cap is the only brake, so it is typed in next to the button
  const auto = useMutation({
    mutationFn: () =>
      runAuto({
        goal: draft.goal.trim(),
        dataset_path: draft.datasetPath.trim(),
        candidates: candidatesForDesign(),
        judge: draft.judge[0],
        max_cost_usd: autoMaxCost,
      }),
    onSuccess: (job) => {
      patch({ jobId: job.id, step: 3, design: null });
      invalidate();
      toast("success", `Autonomous evaluation started as job ${job.id}`);
    },
    onError: (e) => toast("error", errorMessage(e)),
  });

  const run = useMutation({
    mutationFn: () => createRun({ yaml: draft.yaml, ...draft.runOptions }),
    onSuccess: (job) => {
      patch({ jobId: job.id, step: 3 });
      invalidate();
      toast("success", `Job ${job.id} started`);
    },
    onError: (e) => toast("error", errorMessage(e)),
  });

  const applyFix = (target: YamlModelRef) => {
    const next = applyThinkingFix(draft.yaml, target);
    if (next === draft.yaml) {
      toast("error", `Could not find ${target.label} in the YAML`);
      return;
    }
    patch({ yaml: next, step: 2 });
    toast("success", `enable_thinking: false added to ${target.label}`);
  };

  const reset = () => {
    clearWizardDraft();
    setDraft(EMPTY_DRAFT);
    design.reset();
    run.reset();
    auto.reset();
  };

  if (!loaded) return <Loading />;

  const canDraft = draft.goal.trim().length > 0 && draft.datasetPath.trim().length > 0;
  const canAuto = canDraft && Number.isFinite(autoMaxCost) && autoMaxCost > 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="New evaluation"
        subtitle="Pick a dataset and candidates, draft a configuration, check it, run it."
        actions={
          <>
            <Link href="/evals" className="text-sm text-muted hover:text-fg">← Runs</Link>
            <Button variant="ghost" size="sm" onClick={reset}>Start over</Button>
          </>
        }
      />

      <ol className="flex flex-wrap gap-2">
        {STEPS.map((s) => {
          const active = draft.step === s.id;
          const reachable =
            s.id === 1 || (s.id === 2 && !!draft.yaml) || (s.id === 3 && !!draft.jobId);
          return (
            <li key={s.id}>
              <button
                type="button"
                disabled={!reachable}
                onClick={() => patch({ step: s.id })}
                className={`rounded-full border px-3 py-1 font-mono text-xs ${
                  active
                    ? "border-accent bg-accent/10 text-accent"
                    : reachable
                      ? "border-edge text-muted hover:text-fg"
                      : "border-edge text-faint"
                }`}
              >
                {s.id} · {s.label}
              </button>
            </li>
          );
        })}
      </ol>

      {/* ------------------------------------------------ step 1 */}
      {draft.step === 1 && (
        <div className="space-y-4">
          <Card title="Dataset" subtitle="the JSONL the candidates are scored on">
            <DatasetPicker value={draft.datasetPath} onChange={(v) => patch({ datasetPath: v })} />
          </Card>
          <Card title="Candidates" subtitle="the models under test">
            <CandidateEditor
              candidates={draft.candidates}
              onChange={(c) => patch({ candidates: c })}
              addMocks={draft.addMocks}
              onAddMocksChange={(v) => patch({ addMocks: v })}
            />
          </Card>
          <Card
            title="Judge (optional)"
            subtitle="grades open-ended answers for judge_* and rag_* metrics; pick a different model family from the candidates, or the scores favour their own family"
          >
            <CandidateEditor
              candidates={draft.judge}
              onChange={(j) => patch({ judge: j.slice(0, 1) })}
              max={1}
              emptyHint="No judge chosen: the deployed model judges when the design needs one, and the designer warns if that is a candidate's own family."
            />
          </Card>
          <Card title="Goal" subtitle="what the evaluation should decide; the designer turns it into metrics, a judge rubric and gates">
            <Field label="Goal" htmlFor="goal">
              <Textarea
                id="goal"
                rows={3}
                value={draft.goal}
                onChange={(e) => patch({ goal: e.target.value })}
                placeholder={GOAL_PLACEHOLDER}
                className="font-sans"
              />
            </Field>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button variant="primary" disabled={!canDraft} loading={design.isPending} onClick={() => design.mutate()}>
                Draft configuration
              </Button>
              <span className="text-xs text-muted">
                {design.isPending ? "Designing… may take up to 30 seconds" : "one LLM call; may take up to 30 seconds"}
              </span>
              <button
                type="button"
                onClick={() => example.mutate()}
                disabled={example.isPending}
                className="ml-auto text-xs text-accent hover:underline disabled:opacity-50"
              >
                {example.isPending ? "Loading reference config…" : "Start from the reference config instead →"}
              </button>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-edge pt-4">
              <Button variant="ghost" disabled={!canAuto} loading={auto.isPending} onClick={() => auto.mutate()}>
                Design and run autonomously
              </Button>
              <label className="flex items-center gap-2 text-xs text-muted">
                hard cost cap $
                <span className="w-20">
                  <Input
                    type="number"
                    min={0.01}
                    step={0.5}
                    value={Number.isFinite(autoMaxCost) ? autoMaxCost : ""}
                    onChange={(e) => setAutoMaxCost(parseFloat(e.target.value))}
                    aria-label="hard cost cap in USD"
                  />
                </span>
              </label>
              <span className="text-xs text-muted">
                skips the review step: the designer picks the config, runs it, repairs systematic failures and
                adds rows if the result is ambiguous — nothing asks back, the cap is the only brake
              </span>
            </div>
          </Card>
        </div>
      )}

      {/* ------------------------------------------------ step 2 */}
      {draft.step === 2 && (
        <div className="space-y-4">
          {draft.design && (
            <Collapsible summary="Designer rationale and notes" defaultOpen>
              <p className="whitespace-pre-wrap text-sm text-fg">{draft.design.rationale}</p>
              {draft.design.notes.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-muted">
                  {draft.design.notes.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              )}
            </Collapsible>
          )}
          {!draft.yaml.trim() && (
            <Banner tone="warn">The configuration is empty. Go back to setup or paste YAML into the editor.</Banner>
          )}
          <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(24rem,30rem)]">
            <div className="min-w-0" style={{ height: "calc(100vh - 16rem)", minHeight: "28rem" }}>
              <YamlEditor value={draft.yaml} onChange={(v) => patch({ yaml: v })} />
            </div>
            <div className="min-w-0 xl:max-h-[calc(100vh-16rem)] xl:overflow-y-auto">
              <ChecksPanel
                yaml={draft.yaml}
                runOptions={draft.runOptions}
                onRunOptionsChange={(o: RunOptions) => patch({ runOptions: o })}
                onRun={() => run.mutate()}
                running={run.isPending}
                onApplyThinkingFix={applyFix}
              />
            </div>
          </div>
          <div>
            <Button variant="ghost" onClick={() => patch({ step: 1 })}>← Back to setup</Button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ step 3 */}
      {draft.step === 3 && (
        <div className="space-y-4">
          {draft.jobId ? (
            <Card title="Evaluation job">
              <JobMonitor
                jobId={draft.jobId}
                yaml={draft.yaml}
                onApplyThinkingFix={applyFix}
                onBackToReview={() => patch({ step: 2 })}
                onNewJob={(j) => patch({ jobId: j.id })}
              />
            </Card>
          ) : (
            <Banner tone="warn">No job has been started yet.</Banner>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => patch({ step: 2 })}>← Back to review</Button>
            <Button variant="ghost" onClick={reset}>Start another evaluation</Button>
          </div>
        </div>
      )}
    </div>
  );
}
