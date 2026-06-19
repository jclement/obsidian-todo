/** Read queries over the task index. All return wire DTOs. */

import type { Database } from "bun:sqlite";
import { rowToDTO, type TaskDTO, type TaskRow } from "../tasks/dto.ts";
import type { Priority, TaskStatus } from "../tasks/types.ts";
import { addDaysYmd, todayYmd } from "../tasks/dates.ts";

const SELECT = "SELECT t.*, f.hash AS file_hash FROM tasks t JOIN files f ON f.path = t.path";

const OPEN: TaskStatus[] = ["todo", "in_progress", "other"];

// SQL fragment ranking priority high→low for ORDER BY.
const PRIORITY_RANK =
  "CASE t.priority WHEN 'highest' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'normal' THEN 3 WHEN 'low' THEN 4 WHEN 'lowest' THEN 5 ELSE 3 END";

export interface TaskFilter {
  status?: TaskStatus[];
  includeDone?: boolean;
  due_before?: string;
  due_after?: string;
  due_on?: string;
  has_due?: boolean;
  has_recurrence?: boolean;
  tag?: string;
  note?: string;
  path?: string;
  priority?: Priority[];
  text?: string;
  sort?: "due" | "priority" | "created";
  limit?: number;
  offset?: number;
}

function buildWhere(filter: TaskFilter): { sql: string; params: (string | number)[] } {
  const where: string[] = [];
  const params: (string | number)[] = [];

  if (filter.status?.length) {
    where.push(`t.status IN (${filter.status.map(() => "?").join(",")})`);
    params.push(...filter.status);
  } else if (!filter.includeDone) {
    where.push(`t.status IN (${OPEN.map(() => "?").join(",")})`);
    params.push(...OPEN);
  }
  if (filter.due_before) (where.push("t.due IS NOT NULL AND t.due < ?"), params.push(filter.due_before));
  if (filter.due_after) (where.push("t.due IS NOT NULL AND t.due > ?"), params.push(filter.due_after));
  if (filter.due_on) (where.push("t.due = ?"), params.push(filter.due_on));
  if (filter.has_due === true) where.push("t.due IS NOT NULL");
  if (filter.has_due === false) where.push("t.due IS NULL");
  if (filter.has_recurrence === true) where.push("t.recurrence IS NOT NULL");
  if (filter.has_recurrence === false) where.push("t.recurrence IS NULL");
  if (filter.note) (where.push("t.source_note = ?"), params.push(filter.note));
  if (filter.path) (where.push("t.path = ?"), params.push(filter.path));
  if (filter.priority?.length) {
    where.push(`t.priority IN (${filter.priority.map(() => "?").join(",")})`);
    params.push(...filter.priority);
  }
  if (filter.tag) {
    // exact tag or a parent of a nested tag (area → area/work)
    where.push("EXISTS (SELECT 1 FROM json_each(t.tags) WHERE value = ? OR value LIKE ? )");
    params.push(filter.tag, filter.tag + "/%");
  }
  if (filter.text) {
    where.push("t.description LIKE ? COLLATE NOCASE");
    params.push("%" + filter.text + "%");
  }
  return { sql: where.length ? "WHERE " + where.join(" AND ") : "", params };
}

export function queryTasks(db: Database, filter: TaskFilter = {}): TaskDTO[] {
  const { sql: whereSql, params } = buildWhere(filter);
  const order =
    filter.sort === "priority"
      ? `ORDER BY ${PRIORITY_RANK}, t.due IS NULL, t.due, t.path, t.line`
      : filter.sort === "created"
        ? "ORDER BY t.created IS NULL, t.created DESC, t.path, t.line"
        : `ORDER BY t.due IS NULL, t.due, ${PRIORITY_RANK}, t.path, t.line`;
  let sql = `${SELECT} ${whereSql} ${order}`;
  if (filter.limit) {
    sql += " LIMIT ?";
    params.push(filter.limit);
    if (filter.offset) {
      sql += " OFFSET ?";
      params.push(filter.offset);
    }
  }
  const rows = db.query<TaskRow, (string | number)[]>(sql).all(...params);
  return rows.map(rowToDTO);
}

export function getTaskAt(db: Database, path: string, line: number): TaskDTO | null {
  const row = db.query<TaskRow, [string, number]>(`${SELECT} WHERE t.path = ? AND t.line = ?`).get(path, line);
  return row ? rowToDTO(row) : null;
}

export function tasksInFile(db: Database, path: string): TaskDTO[] {
  const rows = db.query<TaskRow, [string]>(`${SELECT} WHERE t.path = ? ORDER BY t.line`).all(path);
  return rows.map(rowToDTO);
}

/** Today view: overdue + due/scheduled today (open only). */
export function viewToday(db: Database, now = new Date()): TaskDTO[] {
  const today = todayYmd(now);
  const rows = db
    .query<TaskRow, [string, string]>(
      `${SELECT} WHERE t.status IN ('todo','in_progress','other')
       AND ((t.due IS NOT NULL AND t.due <= ?) OR (t.scheduled IS NOT NULL AND t.scheduled <= ?))
       ORDER BY t.due IS NULL, t.due, ${PRIORITY_RANK}, t.path, t.line`,
    )
    .all(today, today);
  return rows.map(rowToDTO);
}

/** Upcoming: due or scheduled within (today+1 .. today+days). */
export function viewUpcoming(db: Database, days = 7, now = new Date()): TaskDTO[] {
  const from = addDaysYmd(todayYmd(now), 1);
  const to = addDaysYmd(todayYmd(now), days);
  const rows = db
    .query<TaskRow, [string, string, string, string]>(
      `${SELECT} WHERE t.status IN ('todo','in_progress','other')
       AND ((t.due BETWEEN ? AND ?) OR (t.scheduled BETWEEN ? AND ?))
       ORDER BY COALESCE(t.due, t.scheduled), ${PRIORITY_RANK}, t.path, t.line`,
    )
    .all(from, to, from, to);
  return rows.map(rowToDTO);
}

export function viewInbox(db: Database, inboxNote: string): TaskDTO[] {
  const rows = db
    .query<TaskRow, [string]>(
      `${SELECT} WHERE t.status IN ('todo','in_progress','other') AND t.path = ? ORDER BY t.line`,
    )
    .all(inboxNote);
  return rows.map(rowToDTO);
}

/** Logbook: recently completed + cancelled tasks, newest first. */
export function viewCompleted(db: Database, limit = 200): TaskDTO[] {
  const rows = db
    .query<TaskRow, [number]>(
      `${SELECT} WHERE t.status IN ('done','cancelled')
       ORDER BY COALESCE(t.done, t.cancelled, '') DESC, t.path, t.line LIMIT ?`,
    )
    .all(limit);
  return rows.map(rowToDTO);
}

export interface ProjectSummary {
  note: string;
  path: string;
  open_count: number;
  total_count: number;
  next_due: string | null;
}

/** Notes with open tasks, excluding folders the user marked as non-projects. */
export function listProjects(db: Database, excludeFolders: string[] = []): ProjectSummary[] {
  const rows = db
    .query<ProjectSummary, []>(
      `SELECT t.source_note AS note, t.path AS path,
              SUM(CASE WHEN t.status IN ('todo','in_progress','other') THEN 1 ELSE 0 END) AS open_count,
              COUNT(*) AS total_count,
              MIN(CASE WHEN t.status IN ('todo','in_progress','other') THEN t.due END) AS next_due
       FROM tasks t
       GROUP BY t.path
       HAVING open_count > 0
       ORDER BY next_due IS NULL, next_due, note, path`,
    )
    .all();
  if (!excludeFolders.length) return rows;
  return rows.filter((p) => !excludeFolders.some((f) => p.path === f || p.path.startsWith(f + "/")));
}

export interface TagSummary {
  tag: string;
  count: number;
}

/** Tags present on OPEN tasks, with counts — drives the auto-generated rail. */
export function listTags(db: Database): TagSummary[] {
  return db
    .query<TagSummary, []>(
      `SELECT value AS tag, COUNT(*) AS count
       FROM tasks t, json_each(t.tags)
       WHERE t.status IN ('todo','in_progress','other')
       GROUP BY value
       ORDER BY count DESC, tag`,
    )
    .all();
}

export interface Counts {
  today: number;
  /** Open tasks with a due date split for the segmented "Due" badge. */
  overdue: number;
  due_today: number;
  due_later: number;
  inbox: number;
  total_open: number;
}

export function counts(db: Database, inboxNote: string, now = new Date()): Counts {
  const today = todayYmd(now);
  const dueN = (cmp: string, arg: string) =>
    db
      .query<{ n: number }, [string]>(
        `SELECT COUNT(*) n FROM tasks WHERE status IN ('todo','in_progress','other') AND due IS NOT NULL AND due ${cmp} ?`,
      )
      .get(arg)?.n ?? 0;
  const overdue = dueN("<", today);
  const due_today = dueN("=", today);
  const due_later = dueN(">", today);
  return {
    today: overdue + due_today,
    overdue,
    due_today,
    due_later,
    inbox: viewInbox(db, inboxNote).length,
    total_open: (db.query<{ n: number }, []>("SELECT COUNT(*) n FROM tasks WHERE status IN ('todo','in_progress','other')").get()?.n) ?? 0,
  };
}
