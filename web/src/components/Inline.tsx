import type { ReactNode } from "react";

/**
 * Tiny inline-Markdown renderer: **bold**, *italic*, `code`, [text](url), and
 * Obsidian [[wikilinks]] / [[target|alias]] (rewritten to clickable links that
 * open the note via `onWikilink`). Block-level markdown is intentionally out of
 * scope — these are one-line task/sub-task/note strings.
 */
const PATTERN =
  "(`[^`]+`)|(\\[\\[[^\\]]+\\]\\])|(\\[[^\\]]+\\]\\([^)\\s]+\\))|(\\*\\*[^*]+\\*\\*)|(\\*[^*]+\\*)";

function render(text: string, onWikilink: ((t: string) => void) | undefined, depth: number): ReactNode[] {
  const out: ReactNode[] = [];
  const re = new RegExp(PATTERN, "g");
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (m[1]) {
      out.push(<code key={k} className="rounded bg-[var(--color-surface-3)] px-1 text-[0.85em]">{tok.slice(1, -1)}</code>);
    } else if (m[2]) {
      const inner = tok.slice(2, -2);
      const [target, alias] = inner.split("|");
      out.push(
        <a
          key={k}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onWikilink?.(target!.trim()); }}
          className="cursor-pointer underline decoration-dotted"
          style={{ color: "var(--color-accent-2)" }}
        >
          {(alias ?? target)!.trim()}
        </a>,
      );
    } else if (m[3]) {
      const mm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok)!;
      out.push(
        <a key={k} href={mm[2]} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="underline" style={{ color: "var(--color-accent-2)" }}>
          {mm[1]}
        </a>,
      );
    } else if (m[4]) {
      const inner = tok.slice(2, -2);
      out.push(<strong key={k}>{depth < 3 ? render(inner, onWikilink, depth + 1) : inner}</strong>);
    } else if (m[5]) {
      const inner = tok.slice(1, -1);
      out.push(<em key={k}>{depth < 3 ? render(inner, onWikilink, depth + 1) : inner}</em>);
    }
    last = re.lastIndex;
    k++;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Inline({ text, onWikilink }: { text: string; onWikilink?: (t: string) => void }) {
  return <>{render(text, onWikilink, 0)}</>;
}
