import type { Priority, TaskStatus } from "./types.ts";

/** The wire shape returned to clients and MCP. */
export interface TaskDTO {
  id: number;
  path: string;
  line: number;
  /** Current content hash of the file — the CAS token clients echo on writes. */
  file_hash: string;
  status: TaskStatus;
  description: string;
  priority: Priority;
  due: string | null;
  scheduled: string | null;
  start: string | null;
  created: string | null;
  done: string | null;
  cancelled: string | null;
  recurrence: string | null;
  reminder: string | null;
  tags: string[];
  task_id: string | null;
  depends_on: string[];
  source_note: string;
  indent: number;
  parent_line: number | null;
}

/** Row as stored in the `tasks` table (joined with files.hash). */
export interface TaskRow {
  id: number;
  path: string;
  line: number;
  file_hash: string;
  raw: string;
  status: TaskStatus;
  description: string;
  priority: Priority;
  due: string | null;
  scheduled: string | null;
  start: string | null;
  created: string | null;
  done: string | null;
  cancelled: string | null;
  recurrence: string | null;
  reminder: string | null;
  tags: string;
  task_id: string | null;
  depends_on: string;
  source_note: string;
  indent: number;
  parent_line: number | null;
}

export function rowToDTO(r: TaskRow): TaskDTO {
  return {
    id: r.id,
    path: r.path,
    line: r.line,
    file_hash: r.file_hash,
    status: r.status,
    description: r.description,
    priority: r.priority,
    due: r.due,
    scheduled: r.scheduled,
    start: r.start,
    created: r.created,
    done: r.done,
    cancelled: r.cancelled,
    recurrence: r.recurrence,
    reminder: r.reminder,
    tags: safeJsonArray(r.tags),
    task_id: r.task_id,
    depends_on: safeJsonArray(r.depends_on),
    source_note: r.source_note,
    indent: r.indent,
    parent_line: r.parent_line,
  };
}

function safeJsonArray(s: string): string[] {
  try {
    const a = JSON.parse(s);
    return Array.isArray(a) ? a.map(String) : [];
  } catch {
    return [];
  }
}
