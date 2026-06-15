/**
 * The write path — the heart of the system. Every mutation is write-through
 * with optimistic concurrency: read the file + hash, edit the target line(s),
 * write back guarded by that hash (so a concurrent Obsidian/sync edit fails
 * safely instead of clobbering), then reindex that one file and broadcast.
 *
 * Two entry styles share this path:
 *  - Web/REST: caller passes `expectedHash` (the file_hash it last saw).
 *  - MCP: caller passes `description`; if the line shifted we relocate by
 *    description so agents never juggle hashes.
 */

import type { Database } from "bun:sqlite";
import type { VaultStore } from "../vault/store.ts";
import { VaultError } from "../vault/store.ts";
import type { Snapshotter } from "../snapshots/snapshotter.ts";
import type { Indexer } from "../index/indexer.ts";
import { classifyStatus, type AppSettings, type StatusType } from "../settings.ts";
import { getTaskAt, tasksInFile } from "../index/queries.ts";
import type { TaskDTO } from "./dto.ts";
import { parseTaskLine, hasGlobalFilter } from "./parse.ts";
import { buildTask, ensureGlobalFilter, formatTaskLine } from "./format.ts";
import { nextOccurrence } from "./recurrence.ts";
import { todayYmd } from "./dates.ts";
import type { ParsedTask, Priority, TaskStatus } from "./types.ts";

export class TaskConflictError extends Error {
  constructor(
    public path: string,
    public tasks: TaskDTO[],
    message: string,
  ) {
    super(message);
    this.name = "TaskConflictError";
  }
}

export class TaskNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskNotFoundError";
  }
}

export interface TaskChanges {
  description?: string;
  status?: TaskStatus;
  /** Explicit checkbox symbol (e.g. 'W', '!') — takes precedence over status. */
  statusChar?: string;
  priority?: Priority;
  due?: string | null;
  scheduled?: string | null;
  start?: string | null;
  recurrence?: string | null;
  reminder?: string | null;
  tags?: string[];
}

export interface AddTaskInput {
  description: string;
  priority?: Priority;
  due?: string;
  scheduled?: string;
  start?: string;
  created?: string;
  recurrence?: string;
  reminder?: string;
  targetNote?: string;
}

export interface Locator {
  path: string;
  line: number;
  /** REST CAS token. */
  expectedHash?: string;
  /** MCP relocation anchor. */
  description?: string;
}

const TAG_RE = /(^|\s)#([A-Za-z0-9_/-]*[A-Za-z_/-][A-Za-z0-9_/-]*)/gu;

export class TaskService {
  constructor(
    private db: Database,
    private store: VaultStore,
    private snapshotter: Snapshotter,
    private indexer: Indexer,
    private getSettings: () => AppSettings,
    private now: () => Date = () => new Date(),
  ) {}

  private gf() {
    return this.getSettings().globalFilter;
  }

  /** The configured checkbox symbol for a status type (with sane fallbacks). */
  private symbolForType(type: StatusType): string {
    const fallback: Record<StatusType, string> = { TODO: " ", DONE: "x", IN_PROGRESS: "/", CANCELLED: "-", NON_TASK: " " };
    return this.getSettings().statuses.find((s) => s.type === type)?.symbol ?? fallback[type];
  }

  private symbolForEnum(status: TaskStatus): string {
    const map: Record<TaskStatus, StatusType> = { todo: "TODO", done: "DONE", in_progress: "IN_PROGRESS", cancelled: "CANCELLED", other: "TODO" };
    return this.symbolForType(map[status]);
  }

  /** Locate the target line, relocating by description if it shifted (MCP). */
  private locate(lines: string[], loc: Locator): { idx: number; task: ParsedTask } {
    const gf = this.gf();
    const idx0 = loc.line - 1;
    const at = lines[idx0];
    if (at !== undefined && hasGlobalFilter(at, gf)) {
      const parsed = parseTaskLine(at, gf);
      if (parsed && (!loc.description || parsed.description.trim() === loc.description.trim())) {
        return { idx: idx0, task: parsed };
      }
    }
    // relocate by description
    if (loc.description) {
      const matches: number[] = [];
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i]!;
        if (!hasGlobalFilter(l, gf)) continue;
        const p = parseTaskLine(l, gf);
        if (p && p.description.trim() === loc.description.trim()) matches.push(i);
      }
      if (matches.length === 1) {
        return { idx: matches[0]!, task: parseTaskLine(lines[matches[0]!]!, gf)! };
      }
    }
    throw new TaskConflictError(
      loc.path,
      tasksInFile(this.db, loc.path),
      `Could not confidently locate the task at ${loc.path}:${loc.line}. The file changed; re-read its tasks and retry.`,
    );
  }

  /** Read → verify hash → transform target line(s) → write (CAS) → reindex. */
  private async edit(
    loc: Locator,
    transform: (task: ParsedTask, gf: string) => string[],
  ): Promise<TaskDTO[]> {
    let file;
    try {
      file = await this.store.readText(loc.path);
    } catch {
      throw new TaskNotFoundError(`Note not found: ${loc.path}`);
    }
    if (loc.expectedHash && loc.expectedHash !== file.hash) {
      throw new TaskConflictError(loc.path, tasksInFile(this.db, loc.path), `${loc.path} changed since you read it.`);
    }
    const trailingNewline = file.text.endsWith("\n");
    const lines = file.text.split("\n");
    if (trailingNewline) lines.pop(); // drop the empty element from the trailing \n
    const { idx, task } = this.locate(lines, loc);

    const replacement = transform(task, this.gf());
    lines.splice(idx, 1, ...replacement);

    const newText = lines.join("\n") + (trailingNewline ? "\n" : "");
    try {
      await this.store.write(loc.path, newText, { expectedHash: file.hash });
    } catch (err) {
      if (err instanceof VaultError && err.code === "STALE_NOTE") {
        this.indexer.reindexAndBroadcast(loc.path);
        throw new TaskConflictError(loc.path, tasksInFile(this.db, loc.path), err.message);
      }
      throw err;
    }
    this.snapshotter.noteMutation(`task: edit ${loc.path}`);
    this.indexer.reindexAndBroadcast(loc.path);

    // Return the resulting tasks at the affected lines (idx may have grown).
    const out: TaskDTO[] = [];
    for (let i = 0; i < replacement.length; i++) {
      const t = getTaskAt(this.db, loc.path, idx + 1 + i);
      if (t) out.push(t);
    }
    return out;
  }

  async setStatus(loc: Locator, status: TaskStatus): Promise<TaskDTO[]> {
    return this.edit(loc, (task) => {
      task.status = status;
      task.statusChar = this.symbolForEnum(status);
      if (status !== "done") task.done = undefined;
      if (status !== "cancelled") task.cancelled = undefined;
      return [formatTaskLine(task, this.gf())];
    });
  }

  async complete(loc: Locator): Promise<TaskDTO[]> {
    const today = todayYmd(this.now());
    return this.edit(loc, (task, gf) => {
      const next = nextOccurrence(task, today);
      task.status = "done";
      task.statusChar = this.symbolForType("DONE");
      task.done = today;
      const completedLine = formatTaskLine(task, gf);
      if (!next) return [completedLine];
      // Recurring: emit the next instance ABOVE the completed line as a fresh
      // TODO, stripping 🆔/⛔ per Tasks semantics.
      const fresh: ParsedTask = {
        ...task,
        raw: "",
        status: "todo",
        statusChar: this.symbolForType("TODO"),
        done: undefined,
        cancelled: undefined,
        created: undefined,
        taskId: undefined,
        dependsOn: [],
        start: next.start,
        scheduled: next.scheduled,
        due: next.due,
      };
      return [formatTaskLine(fresh, gf), completedLine];
    });
  }

  async cancel(loc: Locator): Promise<TaskDTO[]> {
    const today = todayYmd(this.now());
    return this.edit(loc, (task, gf) => {
      task.status = "cancelled";
      task.statusChar = this.symbolForType("CANCELLED");
      task.cancelled = today;
      return [formatTaskLine(task, gf)];
    });
  }

  async reschedule(loc: Locator, dates: { due?: string | null; scheduled?: string | null; start?: string | null }): Promise<TaskDTO[]> {
    return this.update(loc, dates);
  }

  async update(loc: Locator, changes: TaskChanges): Promise<TaskDTO[]> {
    return this.edit(loc, (task, gf) => {
      if (changes.description !== undefined) {
        task.descriptionRaw = ensureGlobalFilter(changes.description, gf);
      }
      if (changes.tags !== undefined) setTags(task, changes.tags, gf);
      if (changes.statusChar !== undefined) {
        task.statusChar = changes.statusChar.slice(0, 1) || " ";
        task.status = classifyStatus(task.statusChar, this.getSettings().statuses);
        const today = todayYmd(this.now());
        if (task.status === "done" && !task.done) task.done = today;
        if (task.status === "cancelled" && !task.cancelled) task.cancelled = today;
      } else if (changes.status !== undefined) {
        task.status = changes.status;
        task.statusChar = this.symbolForEnum(changes.status);
      }
      if (changes.priority !== undefined) task.priority = changes.priority;
      if (changes.due !== undefined) task.due = changes.due ?? undefined;
      if (changes.scheduled !== undefined) task.scheduled = changes.scheduled ?? undefined;
      if (changes.start !== undefined) task.start = changes.start ?? undefined;
      if (changes.recurrence !== undefined) task.recurrence = changes.recurrence ?? undefined;
      if (changes.reminder !== undefined) task.reminder = changes.reminder ?? undefined;
      return [formatTaskLine(task, gf)];
    });
  }

  async remove(loc: Locator): Promise<void> {
    await this.edit(loc, () => []); // delete the line; reindex handles the shift
  }

  /** Read → verify hash → mutate the whole line array → write → reindex. */
  private async editFile(loc: Locator, mutate: (lines: string[]) => void): Promise<void> {
    let file;
    try {
      file = await this.store.readText(loc.path);
    } catch {
      throw new TaskNotFoundError(`Note not found: ${loc.path}`);
    }
    if (loc.expectedHash && loc.expectedHash !== file.hash) {
      throw new TaskConflictError(loc.path, tasksInFile(this.db, loc.path), `${loc.path} changed since you read it.`);
    }
    const trailingNewline = file.text.endsWith("\n");
    const lines = file.text.split("\n");
    if (trailingNewline) lines.pop();
    mutate(lines);
    const newText = lines.join("\n") + (trailingNewline ? "\n" : "");
    try {
      await this.store.write(loc.path, newText, { expectedHash: file.hash });
    } catch (err) {
      if (err instanceof VaultError && err.code === "STALE_NOTE") {
        this.indexer.reindexAndBroadcast(loc.path);
        throw new TaskConflictError(loc.path, tasksInFile(this.db, loc.path), err.message);
      }
      throw err;
    }
    this.snapshotter.noteMutation(`task: edit ${loc.path}`);
    this.indexer.reindexAndBroadcast(loc.path);
  }

  /** Toggle a sub-checklist line (a note line under a task) between [ ] and [x]. */
  async toggleSubitem(path: string, line: number, expectedHash?: string): Promise<void> {
    await this.editFile({ path, line, expectedHash }, (lines) => {
      const m = /^(\s*(?:[-*+]|\d+[.)])\s+\[)(.)(\].*)$/.exec(lines[line - 1] ?? "");
      if (!m) throw new TaskNotFoundError(`No checklist item at ${path}:${line}`);
      const next = m[2] === " " || m[2] === "" ? "x" : " ";
      lines[line - 1] = m[1] + next + m[3];
    });
  }

  /** Replace a task's note block (the indented non-task lines beneath it). */
  async updateNotes(loc: Locator, notesText: string): Promise<TaskDTO | null> {
    const gf = this.gf();
    const width = (s: string) => (s.match(/^[ \t]*/)?.[0] ?? "").replace(/\t/g, "    ").length;
    await this.editFile(loc, (lines) => {
      const { idx, task } = this.locate(lines, loc);
      let end = idx + 1;
      while (end < lines.length) {
        const l = lines[end]!;
        if (l.trim() === "") {
          const nextNonBlank = lines.slice(end + 1).find((x) => x.trim() !== "");
          if (nextNonBlank && width(nextNonBlank) > task.indent && !hasGlobalFilter(nextNonBlank, gf)) {
            end++;
            continue;
          }
          break;
        }
        if (width(l) <= task.indent) break;
        if (hasGlobalFilter(l, gf)) break; // nested managed task: leave it
        end++;
      }
      const base = task.indentText + "    ";
      const trimmed = notesText.replace(/\n+$/, "");
      const noteLines = trimmed.trim() === "" ? [] : trimmed.split("\n").map((l) => (l.trim() === "" ? "" : base + l));
      lines.splice(idx + 1, end - (idx + 1), ...noteLines);
    });
    return getTaskAt(this.db, loc.path, loc.line);
  }

  /** Append a new task to the target note (default: configured Inbox). */
  async add(input: AddTaskInput): Promise<TaskDTO> {
    const settings = this.getSettings();
    let target = (input.targetNote ?? settings.inboxNote).trim();
    if (!/\.md$/i.test(target)) target += ".md";

    const task = buildTask({
      description: input.description,
      priority: input.priority,
      due: input.due,
      scheduled: input.scheduled,
      start: input.start,
      created: input.created,
      recurrence: input.recurrence,
      reminder: input.reminder,
      globalFilter: settings.globalFilter,
    });
    const newLine = formatTaskLine(task, settings.globalFilter);

    let line = 1;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        if (this.store.exists(target)) {
          const file = await this.store.readText(target);
          const base = file.text.replace(/\n+$/, "");
          const content = base.length ? `${base}\n${newLine}\n` : `${newLine}\n`;
          await this.store.write(target, content, { expectedHash: file.hash });
          line = content.replace(/\n$/, "").split("\n").length; // 1-based line of newLine
        } else {
          await this.store.write(target, `${newLine}\n`, { mustNotExist: true });
          line = 1;
        }
        break;
      } catch (err) {
        if (err instanceof VaultError && (err.code === "STALE_NOTE" || err.code === "ALREADY_EXISTS")) {
          if (attempt === 3) throw new TaskConflictError(target, tasksInFile(this.db, target), err.message);
          continue; // re-read and retry
        }
        throw err;
      }
    }
    this.snapshotter.noteMutation(`task: add ${target}`);
    this.indexer.reindexAndBroadcast(target);
    const created = getTaskAt(this.db, target, line);
    if (created) return created;
    // fall back: find the just-added line by description
    const all = tasksInFile(this.db, target).filter((t) => t.description.trim() === task.description.trim());
    if (all.length) return all[all.length - 1]!;
    throw new TaskNotFoundError(`Added task to ${target} but could not locate it in the index.`);
  }
}

/** Replace all inline tags (except the global filter) with a new set. */
function setTags(task: ParsedTask, tags: string[], globalFilter: string) {
  const bare = globalFilter.replace(/^#/, "");
  let d = task.descriptionRaw.replace(TAG_RE, (m, pre: string, name: string) => (name === bare ? m : pre));
  d = d.replace(/\s{2,}/g, " ").trim();
  for (const t of tags) {
    const clean = t.replace(/^#/, "");
    if (clean) d += ` #${clean}`;
  }
  task.descriptionRaw = d;
  task.tags = tags.map((t) => t.replace(/^#/, ""));
}
