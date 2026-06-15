/**
 * Extract managed tasks from a whole note. A line is a *managed* task only if
 * it is a checkbox carrying the global-filter tag (default `#task`); the vault
 * is full of in-document checklists that must stay invisible to the app.
 *
 * Subtask hierarchy is derived from indentation. Indented lines directly under
 * a managed task (that are NOT themselves managed tasks) become that task's
 * NOTES — free text and sub-checklists. Sub-checklists are surfaced as
 * toggleable `subitems` with their absolute line numbers.
 */

import { hasGlobalFilter, parseTaskLine, DEFAULT_GLOBAL_FILTER } from "./parse.ts";
import type { StatusDef } from "../settings.ts";
import type { LocatedTask, SubItem } from "./types.ts";

const FENCE = /^(```|~~~)/;
const SUBITEM = /^(\s*)([-*+]|\d+[.)])\s+\[(.)\]\s*(.*)$/;

function indentWidth(s: string): number {
  return (s.match(/^[ \t]*/)?.[0] ?? "").replace(/\t/g, "    ").length;
}

export function parseTasksInFile(content: string, globalFilter = DEFAULT_GLOBAL_FILTER, statuses?: StatusDef[]): LocatedTask[] {
  const lines = content.split("\n");
  const out: LocatedTask[] = [];
  const stack: { indent: number; line: number }[] = [];
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    if (FENCE.test(raw.trimStart())) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (!hasGlobalFilter(raw, globalFilter)) continue;
    const parsed = parseTaskLine(raw, globalFilter, statuses);
    if (!parsed) continue;

    const lineNo = i + 1; // 1-based
    while (stack.length && stack[stack.length - 1]!.indent >= parsed.indent) stack.pop();
    const parentLine = stack.length ? stack[stack.length - 1]!.line : null;
    stack.push({ indent: parsed.indent, line: lineNo });

    // Collect the child block: deeper-indented lines that are NOT managed
    // tasks (those are their own tasks). This is the task's notes.
    const noteLines: string[] = [];
    const subitems: SubItem[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const child = lines[j] ?? "";
      if (child.trim() === "") {
        // blank line: part of notes only if more deeper content follows
        const next = lines.slice(j + 1).find((l) => l.trim() !== "");
        if (next && indentWidth(next) > parsed.indent) {
          noteLines.push(child);
          continue;
        }
        break;
      }
      if (indentWidth(child) <= parsed.indent) break;
      if (hasGlobalFilter(child, globalFilter)) break; // nested managed task → its own row
      noteLines.push(child);
      const m = SUBITEM.exec(child);
      if (m) subitems.push({ line: j + 1, checked: m[3] !== " " && m[3] !== "", text: m[4]!.trim() });
    }
    const notes = noteLines.length ? dedent(noteLines).join("\n") : "";

    out.push({ ...parsed, line: lineNo, parentLine, notes, subitems });
  }
  return out;
}

/** Strip the common leading indentation off the note block for clean display. */
function dedent(lines: string[]): string[] {
  const min = Math.min(...lines.filter((l) => l.trim()).map((l) => (l.match(/^[ \t]*/)?.[0].length ?? 0)));
  return lines.map((l) => l.slice(min));
}
