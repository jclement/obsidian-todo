/**
 * Task indexer. The SQLite tables are a DERIVED CACHE rebuildable from markdown
 * at any time. Change detection is by CONTENT HASH, never mtime (the vault sits
 * on synced/bind-mounted storage where mtimes lie).
 *
 *   - Watcher (fs.watch) is the fast path: it schedules a debounced sweep.
 *   - Periodic sweep is the safety net: inotify doesn't reliably cross Docker
 *     bind mounts / network FS / Syncthing, so we re-hash on an interval too.
 *
 * Per-file reindex is delete-then-recreate: granular and simple. Sync-conflict
 * files (`*.sync-conflict-*.md`) are surfaced, never silently indexed.
 */

import { readFileSync, watch, type FSWatcher } from "node:fs";
import type { Database } from "bun:sqlite";
import { contentHash, type VaultStore } from "../vault/store.ts";
import { parseTasksInFile } from "../tasks/file.ts";
import { isIndexable, type AppSettings } from "../settings.ts";
import { logger } from "../log.ts";

const log = logger("indexer");

const CONFLICT_RE = /\.sync-conflict-/i;

export type IndexListener = (change: { paths: string[]; conflicts: boolean }) => void;

export class Indexer {
  private listeners = new Set<IndexListener>();
  private watcher: FSWatcher | null = null;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private debounce: ReturnType<typeof setTimeout> | null = null;
  private sweeping = false;
  private rerun = false;

  constructor(
    private db: Database,
    private store: VaultStore,
    private getSettings: () => AppSettings,
    private opts: { sweepIntervalMs?: number; debounceMs?: number } = {},
  ) {}

  subscribe(fn: IndexListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(paths: string[], conflicts: boolean) {
    for (const fn of this.listeners) {
      try {
        fn({ paths, conflicts });
      } catch (err) {
        log.error(`listener error: ${String(err)}`);
      }
    }
  }

  /** Reindex one file. Returns true if the index changed. */
  reindexFile(path: string): boolean {
    if (!path.toLowerCase().endsWith(".md")) return false;
    const settings = this.getSettings();
    if (!isIndexable(path, settings)) return false;

    if (CONFLICT_RE.test(path)) {
      this.db
        .query("INSERT INTO sync_conflicts (path) VALUES (?) ON CONFLICT(path) DO NOTHING")
        .run(path);
      return true;
    }

    if (!this.store.exists(path)) return this.removeFile(path);

    let text: string;
    let hash: string;
    try {
      text = readFileSync(this.store.abs(path), "utf8");
      hash = contentHash(text);
    } catch {
      return this.removeFile(path);
    }

    const existing = this.db
      .query<{ hash: string }, [string]>("SELECT hash FROM files WHERE path = ?")
      .get(path);
    if (existing?.hash === hash) return false; // no-op: filters watcher noise + our echoes

    const tasks = parseTasksInFile(text, settings.globalFilter);
    const sourceNote = basenameNoExt(path);

    this.db.transaction(() => {
      this.db.query("DELETE FROM tasks WHERE path = ?").run(path);
      this.db
        .query("INSERT INTO files (path, hash, indexed_at) VALUES (?, ?, unixepoch()) ON CONFLICT(path) DO UPDATE SET hash = excluded.hash, indexed_at = excluded.indexed_at")
        .run(path, hash);
      const insert = this.db.query(
        `INSERT INTO tasks (path, line, raw, status, description, priority, due, scheduled, start, created, done, cancelled, recurrence, reminder, tags, task_id, depends_on, source_note, indent, parent_line)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      );
      for (const t of tasks) {
        insert.run(
          path,
          t.line,
          t.raw,
          t.status,
          t.description,
          t.priority,
          t.due ?? null,
          t.scheduled ?? null,
          t.start ?? null,
          t.created ?? null,
          t.done ?? null,
          t.cancelled ?? null,
          t.recurrence ?? null,
          t.reminder ?? null,
          JSON.stringify(t.tags),
          t.taskId ?? null,
          JSON.stringify(t.dependsOn),
          sourceNote,
          t.indent,
          t.parentLine,
        );
      }
    })();
    return true;
  }

  removeFile(path: string): boolean {
    const res = this.db.query("DELETE FROM files WHERE path = ?").run(path);
    return res.changes > 0;
  }

  /** Full sweep: hash every md file, reindex drift, drop vanished files. */
  async sweep(): Promise<{ changed: string[]; conflicts: boolean }> {
    if (this.sweeping) {
      this.rerun = true;
      return { changed: [], conflicts: false };
    }
    this.sweeping = true;
    const changed: string[] = [];
    let conflicts = false;
    try {
      const settings = this.getSettings();
      const seen = new Set<string>();
      const seenConflicts = new Set<string>();
      for (const { path } of this.store.walkFiles()) {
        if (!path.toLowerCase().endsWith(".md")) continue;
        if (!isIndexable(path, settings)) continue;
        if (CONFLICT_RE.test(path)) {
          conflicts = true;
          seenConflicts.add(path);
          this.db.query("INSERT INTO sync_conflicts (path) VALUES (?) ON CONFLICT(path) DO NOTHING").run(path);
          continue;
        }
        seen.add(path);
        if (this.reindexFile(path)) changed.push(path);
      }
      // drop files removed from the vault
      const known = this.db.query<{ path: string }, []>("SELECT path FROM files").all();
      for (const { path } of known) {
        if (!seen.has(path)) {
          this.removeFile(path);
          changed.push(path);
        }
      }
      // clear conflict markers for files that are no longer in conflict
      for (const { path } of this.db.query<{ path: string }, []>("SELECT path FROM sync_conflicts").all()) {
        if (!seenConflicts.has(path)) this.db.query("DELETE FROM sync_conflicts WHERE path = ?").run(path);
      }
    } finally {
      this.sweeping = false;
    }
    if (changed.length || conflicts) this.emit(changed, conflicts);
    if (this.rerun) {
      this.rerun = false;
      return this.sweep();
    }
    return { changed, conflicts };
  }

  /** Reindex a single file (e.g. just after a write) and broadcast. */
  reindexAndBroadcast(path: string) {
    const changed = this.reindexFile(path);
    if (changed) this.emit([path], false);
  }

  private scheduleSweep() {
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => void this.sweep(), this.opts.debounceMs ?? 500);
  }

  start() {
    try {
      this.watcher = watch(this.store.vaultDir, { recursive: true }, (_e, file) => {
        if (file && /\.md$/i.test(file.toString())) this.scheduleSweep();
      });
    } catch (err) {
      log.warn(`fs.watch unavailable (${String(err)}); relying on periodic sweep`);
    }
    this.sweepTimer = setInterval(() => void this.sweep(), this.opts.sweepIntervalMs ?? 15_000);
  }

  stop() {
    this.watcher?.close();
    this.watcher = null;
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    if (this.debounce) clearTimeout(this.debounce);
  }

  conflictPaths(): string[] {
    return this.db.query<{ path: string }, []>("SELECT path FROM sync_conflicts ORDER BY path").all().map((r) => r.path);
  }
}

function basenameNoExt(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.replace(/\.md$/i, "");
}
