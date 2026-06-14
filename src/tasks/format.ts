/**
 * Canonical emoji-format writer. We always emit emoji format regardless of how
 * the line was read. The description is written *verbatim* (we never reflow the
 * user's prose, tags, or links); only the signifiers are (re)emitted in a fixed
 * canonical order so round-trips with the Tasks plugin stay clean.
 *
 * Canonical order:
 *   description  <priority>  🔁<rec>  ➕<created>  🛫<start>  ⏳<sched>  📅<due>
 *   ❌<cancelled>  ✅<done>  🆔<id>  ⛔<deps>  ⏰<reminder>  ^blockref
 *
 * ⏰ (reminder) is our extension, not core Tasks, so it goes last — after the
 * id/deps the plugin recognises — to minimise interference with its parser.
 */

import { DEFAULT_GLOBAL_FILTER } from "./parse.ts";
import type { ParsedTask, Priority, TaskStatus } from "./types.ts";

const PRIORITY_GLYPH: Record<Priority, string> = {
  highest: "🔺",
  high: "⏫",
  medium: "🔼",
  normal: "",
  low: "🔽",
  lowest: "⏬",
};

const STATUS_CHAR: Record<TaskStatus, string> = {
  todo: " ",
  done: "x",
  in_progress: "/",
  cancelled: "-",
  other: " ",
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Ensure the description carries the global-filter tag (prepended if absent). */
export function ensureGlobalFilter(description: string, globalFilter = DEFAULT_GLOBAL_FILTER): string {
  const bare = globalFilter.replace(/^#/, "");
  const re = new RegExp(`(^|\\s)#${escapeRegExp(bare)}(?![\\w/-])`, "u");
  if (re.test(description)) return description.trim();
  return `${globalFilter} ${description}`.trim();
}

/**
 * Render a task to a single markdown line. The status character comes from
 * `task.status` (so callers flip status by setting that field), except when the
 * status is "other" we preserve the original `statusChar`.
 */
export function formatTaskLine(task: ParsedTask, globalFilter = DEFAULT_GLOBAL_FILTER): string {
  const statusChar = task.status === "other" ? task.statusChar : STATUS_CHAR[task.status];
  const desc = ensureGlobalFilter(task.descriptionRaw, globalFilter);

  const parts: string[] = [desc];
  const push = (s: string | undefined) => {
    if (s) parts.push(s);
  };

  if (task.priority !== "normal") push(PRIORITY_GLYPH[task.priority]);
  if (task.recurrence) push(`🔁 ${task.recurrence}`);
  if (task.created) push(`➕ ${task.created}`);
  if (task.start) push(`🛫 ${task.start}`);
  if (task.scheduled) push(`⏳ ${task.scheduled}`);
  if (task.due) push(`📅 ${task.due}`);
  if (task.cancelled) push(`❌ ${task.cancelled}`);
  if (task.done) push(`✅ ${task.done}`);
  if (task.taskId) push(`🆔 ${task.taskId}`);
  if (task.dependsOn.length) push(`⛔ ${task.dependsOn.join(",")}`);
  if (task.reminder) push(`⏰ ${task.reminder}`);

  let line = `${task.indentText}${task.listMarker} [${statusChar}] ${parts.join(" ")}`;
  if (task.blockRef) line += ` ^${task.blockRef}`;
  return line;
}

/**
 * Build a fresh task object from user input (for capture). Places the global
 * filter at the front of the description to match the vault's convention.
 */
export function buildTask(input: {
  description: string;
  status?: TaskStatus;
  priority?: Priority;
  created?: string;
  start?: string;
  scheduled?: string;
  due?: string;
  recurrence?: string;
  reminder?: string;
  globalFilter?: string;
  indentText?: string;
  listMarker?: string;
}): ParsedTask {
  const globalFilter = input.globalFilter ?? DEFAULT_GLOBAL_FILTER;
  const descriptionRaw = ensureGlobalFilter(input.description, globalFilter);
  const bare = globalFilter.replace(/^#/, "");
  const tags: string[] = [];
  for (const m of descriptionRaw.matchAll(/#([A-Za-z0-9_/-]*[A-Za-z_/-][A-Za-z0-9_/-]*)/gu)) {
    if (m[1] !== bare) tags.push(m[1]!);
  }
  return {
    raw: "",
    indentText: input.indentText ?? "",
    indent: (input.indentText ?? "").replace(/\t/g, "    ").length,
    listMarker: input.listMarker ?? "-",
    statusChar: " ",
    status: input.status ?? "todo",
    descriptionRaw,
    description: descriptionRaw.replace(new RegExp(`(^|\\s)#${escapeRegExp(bare)}(?![\\w/-])`, "gu"), "$1").replace(/\s{2,}/g, " ").trim(),
    tags,
    priority: input.priority ?? "normal",
    created: input.created,
    start: input.start,
    scheduled: input.scheduled,
    due: input.due,
    recurrence: input.recurrence,
    reminder: input.reminder,
    dependsOn: [],
  };
}
