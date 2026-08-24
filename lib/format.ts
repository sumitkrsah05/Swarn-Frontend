/** Unix-seconds timestamps → local-time strings, byte/duration formatting. */

export function formatTime(ts: number | null | undefined): string {
  if (ts == null) return "—";
  return new Date(ts * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatClock(ts: number | null | undefined): string {
  if (ts == null) return "—";
  return new Date(ts * 1000).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function timeAgo(ts: number | null | undefined): string {
  if (ts == null) return "—";
  const s = Math.max(0, Date.now() / 1000 - ts);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !isFinite(seconds)) return "—";
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export function formatMetric(m: number | null | undefined): string {
  if (m == null || !isFinite(m)) return "—";
  if (Math.abs(m) >= 1000) return m.toFixed(0);
  return m.toPrecision(4);
}

const IMAGE_EXT = /\.(png|jpe?g|gif|svg|webp|bmp)$/i;
export function isImagePath(path: string): boolean {
  return IMAGE_EXT.test(path);
}

/**
 * Pull workspace-file mentions (plots, CSVs, reports…) out of an agent
 * summary so they can be linked via /api/workspace/file. Returns paths
 * relative to the workspace root; absolute paths outside it are dropped.
 */
const FILE_MENTION =
  /(?:^|[\s`'"(\[])((?:\/[\w.\-]+)+|(?:\.\/)?(?:[\w.\-]+\/)*[\w.\-]+\.(?:png|jpe?g|gif|svg|webp|csv|tsv|json|jsonl|md|txt|html?|pdf|parquet|xlsx?|pkl|joblib|py|log))(?=[\s`'")\],;:!?]|\.\s|\.$|$)/gim;

export function extractFileMentions(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(FILE_MENTION)) {
    let p = m[1];
    if (p.startsWith("/")) {
      const i = p.indexOf("/workspace/");
      if (i < 0) continue; // absolute path outside the agent workspace
      p = p.slice(i + "/workspace/".length);
    }
    p = p.replace(/^\.\//, "").replace(/^workspace\//, "");
    if (!p || p.endsWith("/") || !p.includes(".")) continue;
    out.add(p);
  }
  return [...out].slice(0, 12);
}
