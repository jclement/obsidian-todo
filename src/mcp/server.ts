import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { TaskAppContext } from "../tasks/app-context.ts";
import { getSetting } from "../db/index.ts";
import { registerTaskTools } from "./tools/tasks.ts";

export const SERVER_INSTRUCTIONS = `Obsidian-backed task manager. Tasks are markdown checkbox lines in the user's vault tagged with a global filter (#task); the vault is the single source of truth.

How to work:
- ALWAYS call list_tasks first to get tasks with their {path, line, description}. Mutating tools need all three.
- When mutating (complete/reschedule/update/cancel/remove), pass the EXACT description you saw — if the line shifted (Obsidian/sync edits), we relocate by description. On a CONFLICT error, call list_tasks again and retry.
- Dates are YYYY-MM-DD. Recurrence uses Obsidian Tasks syntax ('every week', 'every 3 days when done'); completing a recurring task auto-creates the next occurrence.
- add_task appends to the Inbox unless target_note is given. Projects are emergent: a note with open tasks is a project (see list_projects).
- Every change is git-snapshotted and recoverable — but say what you changed.`;

export interface McpServerOptions {
  /** Called after each tool invocation for audit logging. */
  onToolCall?: (tool: string, args: Record<string, unknown>, result: CallToolResult) => void;
}

/** Compose base instructions with the owner's vault-specific guidance. */
export function buildInstructions(ctx: TaskAppContext): string {
  const guidance = getSetting(ctx.db, "vault_instructions")?.trim();
  if (!guidance) return SERVER_INSTRUCTIONS;
  return `${SERVER_INSTRUCTIONS}\n\n## Owner guidance\n${guidance}`;
}

export function createMcpServer(ctx: TaskAppContext, opts: McpServerOptions = {}): McpServer {
  const server = new McpServer(
    { name: "obsidian-todo", version: "0.1.0" },
    { instructions: buildInstructions(ctx) },
  );

  if (opts.onToolCall) {
    const orig = server.registerTool.bind(server);
    const onCall = opts.onToolCall;
    (server.registerTool as unknown) = (name: string, config: unknown, handler: (...a: unknown[]) => Promise<CallToolResult>) =>
      orig(name as string, config as never, (async (args: Record<string, unknown>, extra: unknown) => {
        const result = await handler(args ?? {}, extra);
        try {
          onCall(name, args ?? {}, result);
        } catch {}
        return result;
      }) as never);
  }

  registerTaskTools(server, ctx);
  return server;
}
