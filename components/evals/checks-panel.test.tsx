import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { EstimateResponse, PingResponse, ValidateResponse } from "@/api/types";
import { ChecksPanel, type ChecksApi } from "./checks-panel";

const okValidate: ValidateResponse = {
  ok: true,
  errors: [],
  warnings: [],
  dataset: null,
  lines: [],
  plan: {
    candidates: [{ name: "gemma-4-31b", provider: "openai-compatible", model: "gemma4-31b", base_url: null, temperature: 0 }],
    metrics: ["judge_rubric"],
    judge: { provider: "deployed", model: "qwen3-32b", base_url: null, mode: "rubric", criteria: 2, decompose: true, ensemble: null },
    sampling: { mode: "full", sample_size: null, seed: 42 },
    gates: [],
    config_hash: "abc",
  },
};

const badValidate: ValidateResponse = {
  ...okValidate,
  ok: false,
  errors: ["dataset.path: file not found", "candidates: at least one required"],
  plan: null,
};

const estimate: EstimateResponse = {
  rows: 100,
  sampled: false,
  models: [{ name: "gemma-4-31b", requests: 100, tokens_in: 1000, tokens_out: 500, cost_usd: 1.23 }],
  judge: null,
  total_cost_usd: 1.23,
  total_requests: 100,
  est_minutes: 2,
  lines: [],
  budget_usd: 5,
  exceeds_budget: false,
};

function makeApi(validate: ValidateResponse, ping?: PingResponse): ChecksApi {
  return {
    validate: vi.fn(async () => validate),
    ping: vi.fn(async () => ping ?? { ok: true, checks: [] }),
    estimate: vi.fn(async () => estimate),
  };
}

function renderPanel(api: ChecksApi, yaml = "goal: test\n") {
  const onRun = vi.fn();
  const utils = render(
    <ChecksPanel
      yaml={yaml}
      runOptions={{}}
      onRunOptionsChange={() => {}}
      onRun={onRun}
      api={api}
      debounceMs={0}
    />,
  );
  return { ...utils, onRun };
}

describe("ChecksPanel run-button state machine", () => {
  it("starts disabled and shows 'not estimated' before any check", () => {
    renderPanel(makeApi(okValidate));
    expect(screen.getByTestId("run-button")).toBeDisabled();
    expect(screen.getByTestId("cost-label")).toHaveTextContent("not estimated");
  });

  it("enables Run after validate returns ok: true", async () => {
    const api = makeApi(okValidate);
    const { onRun } = renderPanel(api);
    await waitFor(() => expect(screen.getByTestId("run-button")).toBeEnabled());
    expect(api.validate).toHaveBeenCalledWith({ yaml: "goal: test\n" });
    fireEvent.click(screen.getByTestId("run-button"));
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it("keeps Run disabled and lists errors when validate returns ok: false", async () => {
    renderPanel(makeApi(badValidate));
    await waitFor(() => expect(screen.getByTestId("validate-errors")).toBeInTheDocument());
    expect(screen.getByText("dataset.path: file not found")).toBeInTheDocument();
    expect(screen.getByTestId("run-button")).toBeDisabled();
  });

  it("disables Run again when the yaml changes until it is re-validated", async () => {
    const api = makeApi(okValidate);
    const { rerender } = renderPanel(api);
    await waitFor(() => expect(screen.getByTestId("run-button")).toBeEnabled());

    // edit → errors on the next validate
    (api.validate as ReturnType<typeof vi.fn>).mockResolvedValueOnce(badValidate);
    rerender(
      <ChecksPanel yaml="goal: broken\n" runOptions={{}} onRunOptionsChange={() => {}} onRun={() => {}} api={api} debounceMs={0} />,
    );
    await waitFor(() => expect(screen.getByTestId("validate-errors")).toBeInTheDocument());
    expect(screen.getByTestId("run-button")).toBeDisabled();
  });

  it("shows the estimated cost next to Run after Estimate", async () => {
    const api = makeApi(okValidate);
    renderPanel(api);
    await act(async () => {
      fireEvent.click(screen.getByTestId("estimate-button"));
    });
    await waitFor(() => expect(screen.getByTestId("cost-label")).toHaveTextContent("est. $1.23"));
  });

  it("stays enabled but warns when the last ping had a failure", async () => {
    const api = makeApi(okValidate, {
      ok: false,
      checks: [
        { role: "candidate", name: "gemma-4-31b", provider: "openai-compatible", model: "gemma4-31b", base_url: "https://x/v1", ok: false, latency_s: null, error: "connection refused", reply: null },
      ],
    });
    renderPanel(api);
    await waitFor(() => expect(screen.getByTestId("run-button")).toBeEnabled());
    await act(async () => {
      fireEvent.click(screen.getByTestId("ping-button"));
    });
    await waitFor(() => expect(screen.getByTestId("ping-warning")).toBeInTheDocument());
    expect(screen.getByTestId("ping-warning")).toHaveTextContent("abort at pre-flight");
    expect(screen.getByTestId("run-button")).toBeEnabled();
  });

  it("warns when the judge shares a family with a candidate", async () => {
    const api = makeApi({
      ...okValidate,
      plan: { ...okValidate.plan!, judge: { ...okValidate.plan!.judge!, model: "gemma3-27b" } },
    });
    renderPanel(api);
    await waitFor(() => expect(screen.getByTestId("self-judge-warning")).toBeInTheDocument());
    expect(screen.getByTestId("self-judge-warning")).toHaveTextContent("gemma-4-31b");
  });
});
