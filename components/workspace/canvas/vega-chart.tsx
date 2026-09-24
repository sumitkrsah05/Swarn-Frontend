"use client";

/**
 * Vega-Lite rendering for Quick / Edit charts (docs/guide.md §7.7):
 *  - VegaChart: the canvas view (canvas renderer, tooltips on, actions off)
 *  - VegaThumb: a 120×100 thumbnail rendered once off-screen to a PNG data
 *    URL and cached per chart id
 * Data (≤ 5,000 rows) comes from /api/data/datasets/{name}/rows through a
 * shared React Query, so the thumbnail and the canvas fetch it once.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, isDatasetGone, type RowsResponse } from "@/lib/api";
import { rowsToObjects } from "@/lib/vega";
import type { ChartArtifact } from "@/lib/workspace";
import { BarChartIcon, Loading } from "@/components/ui";

export const VEGA_ROW_LIMIT = 5000;

export function useDatasetSample(name: string | null | undefined) {
  return useQuery<RowsResponse>({
    queryKey: ["data", "sample", name, VEGA_ROW_LIMIT],
    queryFn: () => api.datasetRows(name as string, { limit: 1000, offset: 0 }).then(async (first) => {
      // the API caps a page at 1000 rows; pull up to 5 pages
      const pages = [first];
      let got = first.rows.length;
      while (got < Math.min(first.total, VEGA_ROW_LIMIT) && pages.length < 5) {
        const next = await api.datasetRows(name as string, { limit: 1000, offset: got });
        if (!next.rows.length) break;
        pages.push(next);
        got += next.rows.length;
      }
      return { ...first, rows: pages.flatMap((p) => p.rows) };
    }),
    enabled: !!name,
    staleTime: 60_000,
    retry: (n, e) => !isDatasetGone(e) && n < 2,
  });
}

type EmbedResult = { view: { toImageURL: (t: "png" | "svg", scale?: number) => Promise<string>; finalize: () => void }; finalize: () => void };

async function embedSpec(el: HTMLElement, spec: Record<string, unknown>, values: Record<string, unknown>[], theme: "light" | "dark"): Promise<EmbedResult> {
  const mod = await import("vega-embed");
  const embed = mod.default;
  const full = {
    ...spec,
    data: { values },
    config: {
      ...(spec.config as Record<string, unknown> | undefined),
      axis: { ...((spec.config as { axis?: Record<string, unknown> } | undefined)?.axis ?? {}), labelColor: theme === "dark" ? "#a0a0a8" : "#5c5c63", titleColor: theme === "dark" ? "#e6e6e9" : "#272727" },
      legend: { labelColor: theme === "dark" ? "#a0a0a8" : "#5c5c63", titleColor: theme === "dark" ? "#e6e6e9" : "#272727" },
      title: { color: theme === "dark" ? "#e6e6e9" : "#272727" },
    },
  };
  const res = await embed(el, full as never, { renderer: "canvas", tooltip: true, actions: false, mode: "vega-lite" });
  return res as unknown as EmbedResult;
}

function currentTheme(): "light" | "dark" {
  return typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

export function VegaChart({ spec, dataset, className = "" }: { spec: Record<string, unknown>; dataset: string | undefined; className?: string }) {
  const sample = useDatasetSample(dataset);
  const ref = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const values = useMemo(() => (sample.data ? rowsToObjects(sample.data.columns, sample.data.rows) : null), [sample.data]);
  const [themeTick, setThemeTick] = useState(0);
  useEffect(() => {
    const obs = new MutationObserver(() => setThemeTick((n) => n + 1));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || !values) return;
    let result: EmbedResult | null = null;
    let cancelled = false;
    setError(null);
    embedSpec(el, spec, values, currentTheme())
      .then((r) => {
        if (cancelled) r.finalize();
        else result = r;
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
      result?.finalize();
    };
  }, [spec, values, themeTick]);

  if (sample.isError) {
    return (
      <div className="p-4 text-12 text-muted">
        {isDatasetGone(sample.error) ? "The chart's dataset is no longer in memory on the server." : (sample.error as Error).message}
      </div>
    );
  }
  if (!values) return <Loading label="Loading rows…" />;
  return (
    <div className={`relative h-full w-full ${className}`}>
      <div ref={ref} className="h-full w-full" />
      {error && <div className="absolute inset-x-0 bottom-0 p-2 text-11 text-err">{error}</div>}
      {sample.data && sample.data.total > sample.data.rows.length && (
        <div className="absolute top-1 right-2 font-mono text-10 text-faint">
          visualising {sample.data.rows.length.toLocaleString()} / {sample.data.total.toLocaleString()} rows
        </div>
      )}
    </div>
  );
}

const thumbCache = new Map<string, string>();

/** Cache key: the chart id plus a cheap hash of its spec, so edits refresh the thumbnail. */
function thumbKey(chart: ChartArtifact): string {
  const s = JSON.stringify(chart.spec ?? {});
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return `${chart.id}:${h}`;
}

export function VegaThumb({ chart, width, height }: { chart: ChartArtifact; width: number; height: number }) {
  const sample = useDatasetSample(chart.dataset);
  const key = thumbKey(chart);
  const [cached, setCached] = useState<{ key: string; url: string } | null>(() => {
    const hit = thumbCache.get(key);
    return hit ? { key, url: hit } : null;
  });
  const url = cached?.key === key ? cached.url : (thumbCache.get(key) ?? null);
  const setUrl = (u: string) => setCached({ key, url: u });
  const values = useMemo(() => (sample.data ? rowsToObjects(sample.data.columns, sample.data.rows) : null), [sample.data]);

  useEffect(() => {
    if (url || !values || !chart.spec) return;
    const host = document.createElement("div");
    host.style.cssText = `position:fixed;left:-9999px;top:0;width:${width * 3}px;height:${height * 3}px;`;
    document.body.appendChild(host);
    let cancelled = false;
    const spec = { ...chart.spec, width: width * 3 - 60, height: height * 3 - 60, title: undefined };
    embedSpec(host, spec, values, currentTheme())
      .then(async (r) => {
        try {
          const png = await r.view.toImageURL("png", 1);
          if (!cancelled) {
            thumbCache.set(key, png);
            setUrl(png);
          }
        } finally {
          r.finalize();
        }
      })
      .catch(() => {})
      .finally(() => host.remove());
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, values, url, width, height]);

  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={chart.title ?? "chart"} width={width} height={height} className="max-h-full max-w-full object-contain" />;
  }
  return (
    <span className="text-faint">
      <BarChartIcon size={22} />
    </span>
  );
}
