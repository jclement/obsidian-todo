/**
 * Extract managed tasks from a whole note. A line is a *managed* task only if
 * it is a checkbox carrying the global-filter tag (default `#task`); the vault
 * is full of in-document checklists that must stay invisible to the app.
 *
 * Subtask hierarchy is derived from indentation: a task's parent is the nearest
 * preceding managed task with a smaller indent.
 */

import { hasGlobalFilter, parseTaskLine, DEFAULT_GLOBAL_FILTER } from "./parse.ts";
import type { LocatedTask } from "./types.ts";

const FENCE = /^(```|~~~)/;

export function parseTasksInFile(content: string, globalFilter = DEFAULT_GLOBAL_FILTER): LocatedTask[] {
  const lines = content.split("\n");
  const out: LocatedTask[] = [];
  // Stack of open ancestors: { indent, line } for parent resolution.
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
    const parsed = parseTaskLine(raw, globalFilter);
    if (!parsed) continue;

    const lineNo = i + 1; // 1-based
    while (stack.length && stack[stack.length - 1]!.indent >= parsed.indent) stack.pop();
    const parentLine = stack.length ? stack[stack.length - 1]!.line : null;
    stack.push({ indent: parsed.indent, line: lineNo });

    out.push({ ...parsed, line: lineNo, parentLine });
  }
  return out;
}
