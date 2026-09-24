"use client";

/**
 * The "log" and "code" dialogs (docs/guide.md §2.6): the step timeline of the
 * run that produced an item, and the tool name plus its pretty-printed input
 * (syntax-highlighted Python for run_python).
 */

import { Highlight, themes } from "prism-react-renderer";
import { useTheme } from "@/lib/theme";
import type { SessionStep } from "@/lib/api";
import { StepTimeline } from "@/components/step-timeline";
import { useWorkspaceUi } from "../context";
import { CopyButton, Dialog, EmptyNote } from "@/components/ui";

export function CodeBlock({ code, language }: { code: string; language: "python" | "json" | "bash" }) {
  const [theme] = useTheme();
  return (
    <Highlight code={code} language={language} theme={theme === "dark" ? themes.nightOwl : themes.github}>
      {({ className, style, tokens, getLineProps, getTokenProps }) => (
        <pre className={`${className} max-h-[60vh] overflow-auto rounded-panel border border-edge p-3 font-mono text-12 leading-relaxed`} style={{ ...style, background: "var(--c-code-bg)" }}>
          {tokens.map((line, i) => (
            <div key={i} {...getLineProps({ line })}>
              <span className="mr-3 inline-block w-6 select-none text-right text-faint">{i + 1}</span>
              {line.map((token, key) => (
                <span key={key} {...getTokenProps({ token })} />
              ))}
            </div>
          ))}
        </pre>
      )}
    </Highlight>
  );
}

export function codeOfStep(steps: SessionStep[], step?: number): { tool: string; code: string; language: "python" | "json" | "bash" } | null {
  const calls = steps.filter((s) => s.kind === "tool_call" && (step == null || s.data.step === step));
  const call = calls[calls.length - 1];
  if (!call) return null;
  const tool = String(call.data.tool ?? "tool");
  const input = (call.data.input ?? {}) as Record<string, unknown>;
  if (tool === "run_python" && typeof input.code === "string") return { tool, code: input.code, language: "python" };
  if (tool === "run_shell" && typeof input.command === "string") return { tool, code: input.command, language: "bash" };
  return { tool, code: JSON.stringify(input, null, 2), language: "json" };
}

export function CanvasDialogs() {
  const ui = useWorkspaceUi();
  const req = ui.dialog;
  const steps = req ? (ui.stepOf(req.turnId) ?? []) : [];
  const code = req?.kind === "code" ? codeOfStep(steps, req.step) : null;
  return (
    <>
      <Dialog open={req?.kind === "log"} onClose={ui.closeDialog} title="Run log" width="min(52rem, 92vw)">
        {steps.length === 0 ? (
          <EmptyNote title="No steps recorded" hint="This turn has no step trace (it may have been created by hand, or before the run started)." />
        ) : (
          <StepTimeline steps={steps} highlightStep={req?.step} onOpenCode={(s) => req && ui.openCode(req.turnId, s)} />
        )}
      </Dialog>
      <Dialog open={req?.kind === "code"} onClose={ui.closeDialog} title={code ? `${code.tool} · input` : "Code"} width="min(52rem, 92vw)">
        {!code ? (
          <EmptyNote title="No tool input" hint="This item was not produced by a tool call." />
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-11 text-muted">{code.language === "python" ? "Python sent to run_python" : `${code.tool} input`}</span>
              <CopyButton text={code.code} />
            </div>
            <CodeBlock code={code.code} language={code.language} />
          </div>
        )}
      </Dialog>
    </>
  );
}
