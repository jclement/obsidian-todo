/**
 * MCP task tools — a tight set for managing Obsidian Tasks. Mutating tools use
 * the description-verified write path: pass back the EXACT description you saw
 * from list_tasks and we relocate the line if the file shifted, so you never
 * juggle hashes. On a CONFLICT, re-fetch with list_tasks and retry.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { guarded, ok } from "../respond.ts";
import type { TaskAppContext } from "../../tasks/app-context.ts";
import {
  listProjects,
  listTags,
  queryTasks,
  viewInbox,
  viewToday,
  viewUpcoming,
  type TaskFilter,
} from "../../index/queries.ts";

const priority = z.enum(["highest", "high", "medium", "normal", "low", "lowest"]);
const status = z.enum(["todo", "done", "in_progress", "cancelled", "other"]);
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

const locArgs = {
  path: z.string().describe("Vault-relative path of the note containing the task (from list_tasks)."),
  line: z.number().int().min(1).describe("1-based line number (from list_tasks)."),
  description: z.string().describe("EXACT description text you saw from list_tasks. Used to relocate the line if the file changed since."),
};

export function registerTaskTools(server: McpServer, ctx: TaskAppContext) {
  server.registerTool(
    "list_tasks",
    {
      title: "List tasks",
      description:
        "List managed tasks (checkbox lines tagged with the global filter). Start here — every mutating tool needs the path, line, and description you get from this. Use `view` for the common lenses (today = overdue + due today; upcoming = next N days; inbox = the capture note) or pass filters. Open tasks only unless include_done is set.",
      inputSchema: {
        view: z.enum(["today", "upcoming", "inbox"]).optional().describe("Convenience lens. Omit to use filters."),
        days: z.number().int().min(1).max(60).optional().describe("Window for view=upcoming (default 7)."),
        tag: z.string().optional().describe("Filter to a tag (matches the tag and its nested children)."),
        note: z.string().optional().describe("Filter to a source note (basename), i.e. a project."),
        text: z.string().optional().describe("Case-insensitive substring match on the description."),
        priority: z.array(priority).optional(),
        status: z.array(status).optional(),
        due_before: ymd.optional(),
        due_after: ymd.optional(),
        due_on: ymd.optional(),
        has_recurrence: z.boolean().optional(),
        include_done: z.boolean().optional(),
        limit: z.number().int().min(1).max(500).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    guarded(async (args) => {
      if (args.view === "today") return ok({ tasks: viewToday(ctx.db, ctx.now()) });
      if (args.view === "upcoming") return ok({ tasks: viewUpcoming(ctx.db, args.days ?? 7, ctx.now()) });
      if (args.view === "inbox") return ok({ tasks: viewInbox(ctx.db, ctx.getSettings().inboxNote) });
      const filter: TaskFilter = {
        tag: args.tag,
        note: args.note,
        text: args.text,
        priority: args.priority,
        status: args.status,
        due_before: args.due_before,
        due_after: args.due_after,
        due_on: args.due_on,
        has_recurrence: args.has_recurrence,
        includeDone: args.include_done,
        limit: args.limit,
      };
      return ok({ tasks: queryTasks(ctx.db, filter) });
    }),
  );

  server.registerTool(
    "add_task",
    {
      title: "Add task",
      description:
        "Create a new task. Appends to the configured Inbox note unless you pass target_note (a note basename or path; created if missing). Dates are YYYY-MM-DD. Recurrence uses Obsidian Tasks syntax (e.g. 'every week', 'every 3 days when done'). Do NOT include a checkbox or the #task tag in description — they're added for you.",
      inputSchema: {
        description: z.string().min(1).describe("Task text. Inline #tags are allowed and preserved."),
        due: ymd.optional(),
        scheduled: ymd.optional(),
        start: ymd.optional(),
        priority: priority.optional(),
        recurrence: z.string().optional(),
        reminder: z.string().regex(/^\d{1,2}:\d{2}$/).optional().describe("Reminder time HH:MM for notifications."),
        target_note: z.string().optional().describe("Note basename or vault path to add to. Defaults to the Inbox."),
      },
      annotations: {},
    },
    guarded(async (args) => {
      const task = await ctx.service.add({
        description: args.description,
        due: args.due,
        scheduled: args.scheduled,
        start: args.start,
        priority: args.priority,
        recurrence: args.recurrence,
        reminder: args.reminder,
        targetNote: args.target_note,
      });
      return ok({ task });
    }),
  );

  server.registerTool(
    "complete_task",
    {
      title: "Complete task",
      description:
        "Mark a task done (sets [x] and stamps ✅ today). If the task recurs, the next occurrence is created automatically as a fresh TODO. Pass path, line, and the exact description from list_tasks.",
      inputSchema: locArgs,
      annotations: {},
    },
    guarded(async (args) => ok({ tasks: await ctx.service.complete(args) })),
  );

  server.registerTool(
    "reschedule_task",
    {
      title: "Reschedule task",
      description: "Change a task's due/scheduled/start date(s). Pass null to clear a date. Pass path, line, and the exact description.",
      inputSchema: {
        ...locArgs,
        due: ymd.nullable().optional(),
        scheduled: ymd.nullable().optional(),
        start: ymd.nullable().optional(),
      },
      annotations: {},
    },
    guarded(async (args) =>
      ok({
        tasks: await ctx.service.reschedule(
          { path: args.path, line: args.line, description: args.description },
          { due: args.due ?? undefined, scheduled: args.scheduled ?? undefined, start: args.start ?? undefined },
        ),
      }),
    ),
  );

  server.registerTool(
    "update_task",
    {
      title: "Update task",
      description:
        "Edit a task's fields: description, priority, dates, recurrence, reminder, tags. Only include fields you want to change; pass null to clear a date/recurrence/reminder. Pass path, line, and the exact current description.",
      inputSchema: {
        ...locArgs,
        new_description: z.string().optional(),
        priority: priority.optional(),
        due: ymd.nullable().optional(),
        scheduled: ymd.nullable().optional(),
        start: ymd.nullable().optional(),
        recurrence: z.string().nullable().optional(),
        reminder: z.string().regex(/^\d{1,2}:\d{2}$/).nullable().optional(),
        tags: z.array(z.string()).optional().describe("Replaces all inline tags (bare words, no #)."),
      },
      annotations: {},
    },
    guarded(async (args) =>
      ok({
        tasks: await ctx.service.update(
          { path: args.path, line: args.line, description: args.description },
          {
            description: args.new_description,
            priority: args.priority,
            due: args.due,
            scheduled: args.scheduled,
            start: args.start,
            recurrence: args.recurrence,
            reminder: args.reminder,
            tags: args.tags,
          },
        ),
      }),
    ),
  );

  server.registerTool(
    "cancel_task",
    {
      title: "Cancel task",
      description: "Cancel a task (sets [-] and stamps ❌ today). Pass path, line, and the exact description.",
      inputSchema: locArgs,
      annotations: {},
    },
    guarded(async (args) => ok({ tasks: await ctx.service.cancel(args) })),
  );

  server.registerTool(
    "remove_task",
    {
      title: "Remove task",
      description:
        "Delete a task line entirely. This is destructive but git-snapshotted (recoverable). Prefer complete_task or cancel_task to preserve history. Pass path, line, and the exact description.",
      inputSchema: locArgs,
      annotations: { destructiveHint: true },
    },
    guarded(async (args) => {
      await ctx.service.remove(args);
      return ok({ ok: true, removed: { path: args.path, line: args.line } });
    }),
  );

  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description: "List notes that contain open tasks (the emergent 'projects'), with open/total counts and the nearest due date.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    guarded(async () => ok({ projects: listProjects(ctx.db) })),
  );

  server.registerTool(
    "list_tags",
    {
      title: "List tags",
      description: "List the tags present on open tasks with counts — useful to discover how the user organises work.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    guarded(async () => ok({ tags: listTags(ctx.db) })),
  );
}
