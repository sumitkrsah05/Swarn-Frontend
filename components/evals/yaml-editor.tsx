"use client";

/**
 * CodeMirror YAML editor. Loaded client-side only (no SSR), follows the app
 * theme, and leaves Tab alone (indentWithTab=false) so keyboard focus can
 * move out of the editor.
 */

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { yaml } from "@codemirror/lang-yaml";
import { EditorView } from "@codemirror/view";
import { useTheme } from "@/lib/theme";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[24rem] items-center justify-center text-sm text-muted">
      Loading editor…
    </div>
  ),
});

export function YamlEditor({
  value,
  onChange,
  height = "100%",
  readOnly,
}: {
  value: string;
  onChange: (v: string) => void;
  height?: string;
  readOnly?: boolean;
}) {
  const [theme] = useTheme();
  const extensions = useMemo(
    () => [
      yaml(),
      EditorView.lineWrapping,
      EditorView.theme({
        "&": { fontSize: "12.5px" },
        ".cm-content": { fontFamily: "var(--font-plex-mono), ui-monospace, monospace" },
        ".cm-gutters": { fontFamily: "var(--font-plex-mono), ui-monospace, monospace" },
      }),
    ],
    [],
  );
  return (
    <div className="h-full min-h-[24rem] overflow-hidden rounded-lg border border-edge" data-testid="yaml-editor">
      <CodeMirror
        value={value}
        height={height}
        theme={theme}
        extensions={extensions}
        onChange={(v) => onChange(v)}
        indentWithTab={false}
        readOnly={readOnly}
        basicSetup={{ foldGutter: true, highlightActiveLine: true, tabSize: 2 }}
        aria-label="Evaluation configuration YAML"
      />
    </div>
  );
}
