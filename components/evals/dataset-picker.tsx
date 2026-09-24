"use client";

import { useCallback, useRef, useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { listDatasets, uploadDataset } from "@/api/client";
import type { DatasetEntry } from "@/api/types";
import { evalKeys, useDatasets } from "@/hooks/useEvalData";
import { useToast } from "@/components/toast";
import { formatBytes, formatTime } from "@/lib/format";
import { errorMessage, fmtInt } from "@/lib/evals";
import {
  Button,
  Empty,
  Field,
  InlineError,
  Input,
  Loading,
  TABLE,
  TD,
  TH,
  TableWrap,
} from "@/components/ui";

export function DatasetPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (path: string) => void;
}) {
  const datasets = useDatasets();
  const qc = useQueryClient();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [q, setQ] = useState("");
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const doUpload = useCallback(
    async (files: FileList | File[]) => {
      const file = Array.from(files)[0];
      if (!file) return;
      setUploadPct(0);
      try {
        const res = await uploadDataset(file, setUploadPct);
        const suffix = `${res.relative_dir}/${file.name}`.replace(/^\/+/, "");
        // the datasets list is the authority on config paths: refetch and
        // pick the entry for the file we just uploaded
        await qc.invalidateQueries({ queryKey: evalKeys.datasets });
        const fresh = await qc.fetchQuery({
          queryKey: evalKeys.datasets,
          queryFn: () => listDatasets(200),
        });
        const hit = fresh.datasets.find(
          (d) => d.path === suffix || d.path.endsWith(`/${suffix}`),
        );
        onChange(hit?.path ?? suffix);
        toast(
          "success",
          hit
            ? `Uploaded ${file.name} and selected it`
            : `Uploaded ${file.name} to ${res.relative_dir}; path set to ${suffix} — adjust if validate disagrees`,
        );
      } catch (e) {
        toast("error", errorMessage(e));
      } finally {
        setUploadPct(null);
      }
    },
    [qc, onChange, toast],
  );

  const list = useMemo(() => {
    const all = datasets.data?.datasets ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (d: DatasetEntry) =>
        d.name.toLowerCase().includes(needle) || d.path.toLowerCase().includes(needle),
    );
  }, [datasets.data, q]);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Search datasets" hint={datasets.data?.workspace ? `workspace ${datasets.data.workspace}` : undefined}>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="name or path…" />
        </Field>
        <Field label="Dataset path" hint="pick from the list or type a path not listed here">
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="workspace/evals/my_dataset.jsonl"
            className="font-mono text-xs"
          />
        </Field>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void doUpload(e.dataTransfer.files);
        }}
        className={`flex flex-wrap items-center gap-3 rounded-lg border border-dashed px-3 py-2 text-xs ${
          dragOver ? "border-accent bg-accent/5" : "border-edge"
        }`}
      >
        <input
          ref={fileInput}
          type="file"
          accept=".jsonl,.json,.csv,.tsv,.txt"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void doUpload(e.target.files);
            e.target.value = "";
          }}
        />
        <Button
          size="sm"
          loading={uploadPct != null}
          onClick={() => fileInput.current?.click()}
        >
          Upload dataset
        </Button>
        {uploadPct != null ? (
          <span className="flex items-center gap-2 font-mono text-muted">
            <span className="h-1.5 w-28 overflow-hidden rounded bg-raised">
              <span
                className="block h-full bg-accent transition-[width]"
                style={{ width: `${Math.round(uploadPct * 100)}%` }}
              />
            </span>
            {Math.round(uploadPct * 100)}%
          </span>
        ) : (
          <span className="text-muted">
            or drop a .jsonl file here — it lands in the workspace and is selected automatically
          </span>
        )}
      </div>

      {datasets.isError && <InlineError message={errorMessage(datasets.error)} />}
      {datasets.isPending && <Loading label="Loading datasets…" />}
      {datasets.isSuccess && list.length === 0 && (
        <Empty
          title={q ? "No dataset matches the search" : "No datasets found in the workspace"}
          hint="Type the path by hand above if the file exists elsewhere."
        />
      )}
      {list.length > 0 && (
        <TableWrap maxHeight="18rem">
          <table className={TABLE}>
            <thead>
              <tr>
                <th className={TH}></th>
                <th className={TH}>Name</th>
                <th className={TH}>Path</th>
                <th className={TH}>Rows</th>
                <th className={TH}>Size</th>
                <th className={TH}>Modified</th>
              </tr>
            </thead>
            <tbody>
              {list.map((d) => {
                const selected = d.path === value;
                return (
                  <tr
                    key={d.path}
                    onClick={() => onChange(d.path)}
                    className={`cursor-pointer ${selected ? "bg-accent/10" : "bg-panel hover:bg-hover"}`}
                  >
                    <td className={TD}>
                      <input
                        type="radio"
                        name="dataset"
                        checked={selected}
                        onChange={() => onChange(d.path)}
                        aria-label={`select ${d.name}`}
                        className="accent-accent"
                      />
                    </td>
                    <td className={`${TD} text-xs text-fg`}>{d.name}</td>
                    <td className={`${TD} font-mono text-xs text-muted`}>{d.path}</td>
                    <td className={`${TD} font-mono text-xs`}>{d.rows == null ? "—" : fmtInt(d.rows)}</td>
                    <td className={`${TD} font-mono text-xs text-muted`}>{formatBytes(d.size)}</td>
                    <td className={`${TD} font-mono text-xs text-muted`}>{formatTime(d.modified)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}
    </div>
  );
}
