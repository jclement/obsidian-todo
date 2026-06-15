/**
 * Parser for Obsidian Tasks-plugin checkbox lines.
 *
 * Reads BOTH the emoji format (canonical for this vault, e.g. `📅 2026-05-25
 * ✅ 2026-03-30`) and Dataview-style inline fields (`[due:: 2026-05-25]`), so
 * nothing in the vault is missed. We only ever *write* the emoji format
 * (see format.ts).
 *
 * Splitting rule: the description is everything before the first recognised
 * emoji signifier; tags (incl. the global filter) stay inside the description.
 * Variation selectors (U+FE0F) are stripped on a working copy before scanning
 * so `📅️` and `📅` parse identically; the original line is preserved in `raw`.
 */

import type { DateField, ParsedTask, Priority } from "./types.ts";
import { classifyStatus, type StatusDef } from "../settings.ts";

export const DEFAULT_GLOBAL_FILTER = "#task";

const CHECKBOX = /^(\s*)([-*+]|\d+[.)])\s+\[(.)\]\s*(.*)$/;

const PRIORITY_EMOJI: Record<string, Priority> = {
  "🔺": "highest",
  "⏫": "high",
  "🔼": "medium",
  "🔽": "low",
  "⏬": "lowest",
};

const DATE_EMOJI: Record<string, DateField> = {
  "➕": "created",
  "🛫": "start",
  "⏳": "scheduled",
  "📅": "due",
  "❌": "cancelled",
  "✅": "done",
};

// Boundary lookahead: stop free-text captures (recurrence, deps) at the next signifier / block ref / EOL.
const NEXT_SIGNIFIER = "(?=$|[🔺⏫🔼🔽⏬➕🛫⏳📅❌✅🔁⏰🆔⛔]|\\^)";

const DATE = "(\\d{4}-\\d{2}-\\d{2})";
const DATE_RE: Record<string, RegExp> = Object.fromEntries(
  Object.keys(DATE_EMOJI).map((e) => [e, new RegExp(`${e}\\s*${DATE}`, "u")]),
);
const PRIORITY_RE = /[🔺⏫🔼🔽⏬]/u;
const RECUR_RE = new RegExp(`🔁\\s*(.+?)\\s*${NEXT_SIGNIFIER}`, "u");
const REMINDER_RE = /⏰\s*(\d{1,2}:\d{2})/u;
const ID_RE = /🆔\s*([A-Za-z0-9_-]+)/u;
const DEPS_RE = new RegExp(`⛔\\s*(.+?)\\s*${NEXT_SIGNIFIER}`, "u");
const BLOCKREF_RE = /\s+(\^[A-Za-z0-9-]+)\s*$/u;

// Dataview inline field: [key:: value] or (key:: value). Requires '::' so it
// never matches a plain markdown link like [#1700](https://...).
const DATAVIEW_RE = /[[(]\s*([a-zA-Z][a-zA-Z0-9_-]*)\s*::\s*([^\])]+?)\s*[\])]/gu;

const TAG_RE = /#([A-Za-z0-9_/-]*[A-Za-z_/-][A-Za-z0-9_/-]*)/gu;

const DATAVIEW_DATE_KEYS: Record<string, DateField> = {
  created: "created",
  start: "start",
  scheduled: "scheduled",
  due: "due",
  cancelled: "cancelled",
  done: "done",
  completion: "done",
};

const DATAVIEW_PRIORITY: Record<string, Priority> = {
  highest: "highest",
  high: "high",
  medium: "medium",
  normal: "normal",
  low: "low",
  lowest: "lowest",
};

function statusFromChar(ch: string): ParsedTask["status"] {
  switch (ch) {
    case " ":
      return "todo";
    case "x":
    case "X":
      return "done";
    case "/":
      return "in_progress";
    case "-":
      return "cancelled";
    default:
      return "other";
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Strip the global-filter tag from display text and collapse the gap. */
function stripGlobalFilter(text: string, globalFilter: string): string {
  const re = new RegExp(`(^|\\s)${escapeRegExp(globalFilter)}(?![\\w/-])`, "gu");
  return text.replace(re, "$1").replace(/\s{2,}/g, " ").trim();
}

/**
 * Parse a single line. Returns null if it is not a checkbox line. Note: this
 * returns tasks for ALL checkbox lines; the global-filter gate (only `#task`
 * lines are managed) is applied by the indexer, not here, so callers can still
 * inspect untagged checklist items if they want.
 */
export function parseTaskLine(raw: string, globalFilter = DEFAULT_GLOBAL_FILTER, statuses?: StatusDef[]): ParsedTask | null {
  const m = CHECKBOX.exec(raw);
  if (!m) return null;
  const [, indentText, listMarker, statusChar, restRaw] = m as unknown as [string, string, string, string, string];

  // Work on a copy with variation selectors removed so emoji match cleanly.
  let rest = restRaw.replace(/️/g, "");

  // Pull a trailing block ref off the end first.
  let blockRef: string | undefined;
  const bref = BLOCKREF_RE.exec(rest);
  if (bref) {
    blockRef = bref[1]!.slice(1); // drop caret
    rest = rest.slice(0, bref.index);
  }

  // Extract Dataview inline fields (read-only support) and remove them.
  const dv = new Map<string, string>();
  rest = rest.replace(DATAVIEW_RE, (_full, key: string, value: string) => {
    dv.set(key.toLowerCase(), value.trim());
    return " ";
  });

  const task: ParsedTask = {
    raw,
    indentText,
    indent: indentText.replace(/\t/g, "    ").length,
    listMarker,
    statusChar,
    status: statuses ? classifyStatus(statusChar, statuses) : statusFromChar(statusChar),
    descriptionRaw: "",
    description: "",
    tags: [],
    priority: "normal",
    dependsOn: [],
    blockRef,
  };

  // Extract emoji signifiers from ANYWHERE in the line (matching the Tasks
  // plugin: signifiers are recognised wherever they appear, and whatever is
  // left over is the description). We record each match's character range, then
  // excise those ranges so interspersed free text survives in the description.
  const ranges: Array<[number, number]> = [];
  const mark = (m: RegExpExecArray | null) => {
    if (m) ranges.push([m.index, m.index + m[0].length]);
  };

  const prio = PRIORITY_RE.exec(rest);
  if (prio) {
    task.priority = PRIORITY_EMOJI[prio[0]!]!;
    mark(prio);
  }
  for (const [emoji, field] of Object.entries(DATE_EMOJI)) {
    const dm = DATE_RE[emoji]!.exec(rest);
    if (dm) {
      task[field] = dm[1]!;
      mark(dm);
    }
  }
  const rec = RECUR_RE.exec(rest);
  if (rec) {
    task.recurrence = rec[1]!.trim();
    mark(rec);
  }
  const rem = REMINDER_RE.exec(rest);
  if (rem) {
    task.reminder = rem[1]!;
    mark(rem);
  }
  const id = ID_RE.exec(rest);
  if (id) {
    task.taskId = id[1]!;
    mark(id);
  }
  const deps = DEPS_RE.exec(rest);
  if (deps) {
    task.dependsOn = deps[1]!.split(",").map((s) => s.trim()).filter(Boolean);
    mark(deps);
  }

  // Excise signifier ranges (extending left over the preceding whitespace so we
  // don't leave a gap), preserving all other whitespace — including any double
  // spaces the user typed in their prose.
  ranges.sort((a, b) => b[0] - a[0]);
  let descStr = rest;
  for (const [s, e] of ranges) {
    let start = s;
    while (start > 0 && /\s/.test(descStr[start - 1]!)) start--;
    descStr = descStr.slice(0, start) + descStr.slice(e);
  }
  const descriptionRaw = descStr.trim();
  task.descriptionRaw = descriptionRaw;
  task.description = stripGlobalFilter(descriptionRaw, globalFilter);

  // Tags (excluding the global filter), from the raw description.
  const filterBare = globalFilter.replace(/^#/, "");
  for (const t of descriptionRaw.matchAll(TAG_RE)) {
    const name = t[1]!;
    if (name !== filterBare) task.tags.push(name);
  }

  // Dataview fields fill in anything the emoji format didn't provide.
  for (const [key, value] of dv) {
    const dfield = DATAVIEW_DATE_KEYS[key];
    if (dfield && !task[dfield] && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      task[dfield] = value;
      continue;
    }
    if ((key === "priority") && task.priority === "normal") {
      const p = DATAVIEW_PRIORITY[value.toLowerCase()];
      if (p) task.priority = p;
    } else if ((key === "repeat" || key === "recurrence") && !task.recurrence) {
      task.recurrence = value;
    } else if (key === "id" && !task.taskId) {
      task.taskId = value;
    } else if ((key === "dependson" || key === "blockedby") && task.dependsOn.length === 0) {
      task.dependsOn = value.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (key === "reminder" && !task.reminder && /^\d{1,2}:\d{2}$/.test(value)) {
      task.reminder = value;
    }
  }

  return task;
}

/** Does this line carry the global-filter tag (i.e. is it a managed task)? */
export function hasGlobalFilter(raw: string, globalFilter = DEFAULT_GLOBAL_FILTER): boolean {
  const bare = globalFilter.replace(/^#/, "");
  const re = new RegExp(`(^|\\s)#${escapeRegExp(bare)}(?![\\w/-])`, "u");
  return re.test(raw);
}
