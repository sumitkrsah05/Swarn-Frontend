/**
 * "Suggest next steps" answers come back as a numbered list; each item becomes
 * a clickable chip under the answer card (docs/guide.md §7.5).
 */

const ITEM_RE = /^\s*(?:\d+[.)]|[-*•])\s+(.+?)\s*$/;

function stripMarkdown(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .trim();
}

/** Items of a numbered (or bulleted) list; empty when fewer than two items. */
export function parseNumberedList(text: string | null | undefined): string[] {
  if (!text) return [];
  const items: string[] = [];
  let numbered = 0;
  for (const line of text.split("\n")) {
    const m = ITEM_RE.exec(line);
    if (!m) continue;
    if (/^\s*\d/.test(line)) numbered += 1;
    const item = stripMarkdown(m[1]);
    if (item.length >= 4) items.push(item);
  }
  if (numbered < 2 && items.length < 3) return [];
  return items.slice(0, 8);
}

/** A 2-line plain-text preview of markdown for the answer card. */
export function markdownPreview(text: string, max = 220): string {
  const plain = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^#+\s*/gm, "")
    .replace(/[*_`>]/g, "")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > max ? plain.slice(0, max).trimEnd() + "…" : plain;
}
