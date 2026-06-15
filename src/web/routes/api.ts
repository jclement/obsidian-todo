/**
 * JSON API for the SPA. Mounted at /api behind a passkey session (see app.tsx).
 * Writes go through TaskService (hash-CAS); a TaskConflictError becomes a 409
 * carrying the note's fresh task list so the client can soft-refresh.
 */

import { Hono } from "hono";
import type { Database } from "bun:sqlite";
import type { Config } from "../../config.ts";
import type { TaskAppContext } from "../../tasks/app-context.ts";
import {
  counts,
  listProjects,
  listTags,
  queryTasks,
  tasksInFile,
  viewCompleted,
  viewInbox,
  viewToday,
  viewUpcoming,
  type TaskFilter,
} from "../../index/queries.ts";
import { TaskConflictError, TaskNotFoundError, type TaskChanges } from "../../tasks/service.ts";
import { isIndexable, publicSettings, type AppSettings } from "../../settings.ts";
import { basename } from "node:path";
import { AiError, parseTextToTasks, transcribeAudio } from "../../ai/openai.ts";
import type { Priority, TaskStatus } from "../../tasks/types.ts";

const PRIORITIES: Priority[] = ["highest", "high", "medium", "normal", "low", "lowest"];
const STATUSES: TaskStatus[] = ["todo", "done", "in_progress", "cancelled", "other"];

export function apiRouter(ctx: TaskAppContext, db: Database, config: Config, syncStatus?: () => { state: string; desired?: boolean } | null) {
  const app = new Hono();

  // Translate domain errors to HTTP. Everything in this router runs through it.
  app.onError((err, c) => {
    if (err instanceof TaskConflictError) {
      return c.json({ error: "conflict", message: err.message, path: err.path, tasks: err.tasks }, 409);
    }
    if (err instanceof TaskNotFoundError) return c.json({ error: "not_found", message: err.message }, 404);
    if (err instanceof AiError) return c.json({ error: err.code, message: err.message }, 400);
    return c.json({ error: "internal", message: err instanceof Error ? err.message : String(err) }, 500);
  });

  const noteList = (): { path: string; note: string }[] => {
    const out: { path: string; note: string }[] = [];
    const s = ctx.getSettings();
    for (const { path } of ctx.store.walkFiles()) {
      if (!path.toLowerCase().endsWith(".md")) continue;
      if (!isIndexable(path, s)) continue;
      out.push({ path, note: (path.split("/").pop() ?? path).replace(/\.md$/i, "") });
    }
    out.sort((a, b) => a.note.localeCompare(b.note));
    return out;
  };

  // --- bootstrap / meta ---
  app.get("/bootstrap", (c) => {
    const s = ctx.getSettings();
    const sync = syncStatus?.() ?? null;
    return c.json({
      settings: publicSettings(s),
      counts: counts(db, s.inboxNote, ctx.now()),
      conflicts: ctx.indexer.conflictPaths(),
      // The Obsidian vault name for deep links — user-set, else the vault folder name.
      vaultName: s.obsidianVaultName?.trim() || basename(config.vaultDir),
      sync: sync ? { state: sync.state, desired: sync.desired ?? false } : null,
    });
  });

  app.get("/me", (c) => {
    const u = db.query<{ display_name: string }, []>("SELECT display_name FROM users WHERE id = 1").get();
    return c.json({ display_name: u?.display_name ?? "Owner" });
  });

  app.get("/conflicts", (c) => c.json({ paths: ctx.indexer.conflictPaths() }));

  // --- reads ---
  app.get("/tasks", (c) => {
    const q = c.req.query();
    const view = q.view;
    const s = ctx.getSettings();
    if (view === "today") return c.json({ tasks: viewToday(db, ctx.now()) });
    if (view === "upcoming") return c.json({ tasks: viewUpcoming(db, q.days ? parseInt(q.days, 10) : 7, ctx.now()) });
    if (view === "inbox") return c.json({ tasks: viewInbox(db, s.inboxNote) });
    if (view === "completed") return c.json({ tasks: viewCompleted(db) });
    return c.json({ tasks: queryTasks(db, filterFromQuery(q)) });
  });

  app.get("/projects", (c) => {
    const s = ctx.getSettings();
    // The inbox has its own view; don't also list it as a project.
    return c.json({ projects: listProjects(db, [...s.projectExcludeFolders, s.inboxNote]) });
  });
  app.get("/tags", (c) => c.json({ tags: listTags(db) }));
  app.get("/notes", (c) => c.json({ notes: noteList() }));
  app.get("/counts", (c) => c.json(counts(db, ctx.getSettings().inboxNote, ctx.now())));

  // --- writes ---
  app.post("/tasks", async (c) => {
    const body = await c.req.json();
    // batch add (AI capture commit) or single add
    if (Array.isArray(body.drafts)) {
      const created = [];
      for (const d of body.drafts) {
        created.push(await ctx.service.add(sanitizeAdd(d as Record<string, unknown>)));
      }
      return c.json({ tasks: created });
    }
    const created = await ctx.service.add(sanitizeAdd(body));
    return c.json({ task: created });
  });

  app.patch("/tasks", async (c) => {
    const body = await c.req.json();
    const loc = locator(body);
    const changes = sanitizeChanges(body.changes ?? body);
    const tasks = await ctx.service.update(loc, changes);
    return c.json({ tasks });
  });

  app.post("/tasks/complete", async (c) => c.json({ tasks: await ctx.service.complete(locator(await c.req.json())) }));
  app.post("/tasks/cancel", async (c) => c.json({ tasks: await ctx.service.cancel(locator(await c.req.json())) }));
  app.post("/tasks/uncomplete", async (c) => c.json({ tasks: await ctx.service.setStatus(locator(await c.req.json()), "todo") }));

  app.post("/tasks/status", async (c) => {
    const body = await c.req.json();
    const status = STATUSES.includes(body.status) ? (body.status as TaskStatus) : "todo";
    return c.json({ tasks: await ctx.service.setStatus(locator(body), status) });
  });

  app.delete("/tasks", async (c) => {
    await ctx.service.remove(locator(await c.req.json()));
    return c.json({ ok: true });
  });

  app.post("/reindex", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    if (body?.path) ctx.indexer.reindexAndBroadcast(body.path);
    else await ctx.indexer.sweep();
    return c.json({ ok: true });
  });

  // --- settings ---
  app.get("/settings", (c) => c.json(publicSettings(ctx.getSettings())));
  app.put("/settings", async (c) => {
    const body = (await c.req.json()) as Partial<AppSettings>;
    const next = ctx.updateSettings(body);
    return c.json(publicSettings(next));
  });

  // --- AI ---
  app.post("/ai/parse", async (c) => {
    const { text } = await c.req.json();
    if (!text || typeof text !== "string") return c.json({ error: "bad_request", message: "text required" }, 400);
    const drafts = await parseTextToTasks(ctx.getSettings(), text, { notes: noteList().map((n) => n.note), now: ctx.now() });
    return c.json({ drafts });
  });

  app.post("/ai/capture", async (c) => {
    const { text } = await c.req.json();
    if (!text || typeof text !== "string") return c.json({ error: "bad_request", message: "text required" }, 400);
    const drafts = await parseTextToTasks(ctx.getSettings(), text, { notes: noteList().map((n) => n.note), now: ctx.now() });
    const created = [];
    for (const d of drafts) created.push(await ctx.service.add(sanitizeAdd(d as unknown as Record<string, unknown>)));
    return c.json({ tasks: created });
  });

  app.post("/ai/transcribe", async (c) => {
    const form = await c.req.formData();
    const file = form.get("audio");
    if (!(file instanceof Blob)) return c.json({ error: "bad_request", message: "audio file required" }, 400);
    const text = await transcribeAudio(ctx.getSettings(), file, "dictation.webm");
    return c.json({ text });
  });

  // resolve a note's full task list (used by the client on a 409 soft-refresh)
  app.get("/notes/tasks", (c) => {
    const path = c.req.query("path");
    if (!path) return c.json({ error: "bad_request" }, 400);
    return c.json({ tasks: tasksInFile(db, path) });
  });

  return app;
}

function filterFromQuery(q: Record<string, string>): TaskFilter {
  const f: TaskFilter = {};
  if (q.tag) f.tag = q.tag;
  if (q.note) f.note = q.note;
  if (q.path) f.path = q.path;
  if (q.text) f.text = q.text;
  if (q.priority) f.priority = q.priority.split(",").filter((p) => PRIORITIES.includes(p as Priority)) as Priority[];
  if (q.status) f.status = q.status.split(",").filter((s) => STATUSES.includes(s as TaskStatus)) as TaskStatus[];
  if (q.include_done === "1" || q.include_done === "true") f.includeDone = true;
  if (q.has_recurrence === "1") f.has_recurrence = true;
  if (q.due_before) f.due_before = q.due_before;
  if (q.due_after) f.due_after = q.due_after;
  if (q.due_on) f.due_on = q.due_on;
  if (q.sort === "priority" || q.sort === "due" || q.sort === "created") f.sort = q.sort;
  if (q.limit) f.limit = parseInt(q.limit, 10);
  return f;
}

function locator(body: Record<string, unknown>) {
  const path = String(body.path ?? "");
  const line = Number(body.line ?? 0);
  return {
    path,
    line,
    expectedHash: typeof body.expected_hash === "string" ? body.expected_hash : undefined,
    description: typeof body.description === "string" ? body.description : undefined,
  };
}

function sanitizeChanges(body: Record<string, unknown>): TaskChanges {
  const c: TaskChanges = {};
  if (typeof body.description === "string") c.description = body.description;
  if (typeof body.priority === "string" && PRIORITIES.includes(body.priority as Priority)) c.priority = body.priority as Priority;
  if (typeof body.status === "string" && STATUSES.includes(body.status as TaskStatus)) c.status = body.status as TaskStatus;
  for (const k of ["due", "scheduled", "start", "recurrence", "reminder"] as const) {
    if (k in body) c[k] = body[k] === null ? null : String(body[k]);
  }
  if (Array.isArray(body.tags)) c.tags = body.tags.map((t) => String(t).replace(/^#/, ""));
  return c;
}

function sanitizeAdd(body: Record<string, unknown>) {
  return {
    description: String(body.description ?? "").trim(),
    priority: PRIORITIES.includes(body.priority as Priority) ? (body.priority as Priority) : undefined,
    due: typeof body.due === "string" ? body.due : undefined,
    scheduled: typeof body.scheduled === "string" ? body.scheduled : undefined,
    start: typeof body.start === "string" ? body.start : undefined,
    created: typeof body.created === "string" ? body.created : undefined,
    recurrence: typeof body.recurrence === "string" ? body.recurrence : undefined,
    reminder: typeof body.reminder === "string" ? body.reminder : undefined,
    targetNote: typeof body.target_note === "string" ? body.target_note : typeof body.targetNote === "string" ? body.targetNote : undefined,
  };
}
