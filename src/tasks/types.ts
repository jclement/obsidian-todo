/**
 * Domain types for Obsidian Tasks-plugin task lines.
 *
 * The vault is the single source of truth; these types describe what we parse
 * out of a single markdown checkbox line and what we write back. Identity is
 * (path, line) validated by the file's content hash — there is no embedded id.
 */

export type TaskStatus = "todo" | "done" | "in_progress" | "cancelled" | "other";

export type Priority = "highest" | "high" | "medium" | "normal" | "low" | "lowest";

/** Date-bearing fields, all `YYYY-MM-DD` (date-only). */
export type DateField = "created" | "start" | "scheduled" | "due" | "cancelled" | "done";

/**
 * A parsed task line. `descriptionRaw` is the description segment exactly as it
 * appeared (global-filter tag, inline #tags, markdown links and all) so we can
 * round-trip writes without ever reflowing the user's prose. `description` is
 * the display form with the global-filter tag stripped.
 */
export interface ParsedTask {
  /** Exact original line, for safe rewrite. */
  raw: string;
  /** Leading whitespace verbatim (spaces or tabs) — preserves subtask indent. */
  indentText: string;
  /** Indent width in characters (advisory; for nesting depth). */
  indent: number;
  /** List marker as written: "-", "*", "+", or "1." / "1)". */
  listMarker: string;
  /** Raw status character inside the brackets. */
  statusChar: string;
  status: TaskStatus;

  /** Description verbatim (incl. global filter + tags + links), trimmed. */
  descriptionRaw: string;
  /** Display description (global-filter tag removed). */
  description: string;
  /** Inline #tags, excluding the global filter, without the leading '#'. */
  tags: string[];

  priority: Priority;

  created?: string;
  start?: string;
  scheduled?: string;
  due?: string;
  cancelled?: string;
  done?: string;

  /** Recurrence rule text, e.g. "every week" or "every 3 days when done". */
  recurrence?: string;
  /** Reminder time `HH:MM` — our extension (⏰), used for notifications. */
  reminder?: string;

  /** 🆔 value if present. */
  taskId?: string;
  /** ⛔ dependsOn ids. */
  dependsOn: string[];

  /** Trailing block reference like `^abc123` (without the caret stripped). */
  blockRef?: string;
}

/** A task located in a file. */
export interface LocatedTask extends ParsedTask {
  /** 1-based line number in the file. */
  line: number;
  /** 0-based parent line for subtasks (nearest less-indented task), or null. */
  parentLine: number | null;
}
