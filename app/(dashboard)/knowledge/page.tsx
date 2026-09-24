"use client";

/** Knowledge (docs/guide.md §8.5): the Playbook markdown in the document column. */

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { DocumentColumn } from "@/components/document-column";
import { BookIcon, EmptyNote, ErrorNote, Loading } from "@/components/ui";

export default function KnowledgePage() {
  const [playbook, setPlaybook] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getPlaybook()
      .then((r) => setPlaybook(r.playbook ?? ""))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <div className="h-full overflow-y-auto">
      {error && (
        <div className="mx-auto max-w-[816px] p-6">
          <ErrorNote message={error} />
        </div>
      )}
      {playbook === null && !error && <Loading label="Loading playbook…" />}
      {playbook !== null &&
        (playbook.trim() === "" ? (
          <EmptyNote icon={<BookIcon size={26} />} title="The playbook is empty" hint="It fills in as runs complete and lessons are extracted from them." />
        ) : (
          <DocumentColumn markdown={playbook} title="Playbook" />
        ))}
    </div>
  );
}
