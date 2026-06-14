import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createApp } from "../src/app.tsx";
import { loadConfig } from "../src/config.ts";
import { openDatabase } from "../src/db/index.ts";
import { VaultStore } from "../src/vault/store.ts";
import { LinkIndex } from "../src/vault/links.ts";
import { Snapshotter } from "../src/snapshots/snapshotter.ts";
import { createVaultContext } from "../src/mcp/context.ts";
import { createTaskContext } from "../src/tasks/app-context.ts";
import { createApiToken } from "../src/auth/tokens.ts";
import { tmpVault, type TmpVault } from "./helpers.ts";

let vault: TmpVault;
let snapsDir: string;
let server: ReturnType<typeof Bun.serve>;
let client: Client;

function textOf(result: CallToolResult): string {
  const block = result.content.find((c) => c.type === "text");
  return block && block.type === "text" ? block.text : "";
}
function jsonOf(result: CallToolResult): any {
  return JSON.parse(textOf(result));
}
async function call(name: string, args: Record<string, unknown> = {}) {
  return (await client.callTool({ name, arguments: args })) as CallToolResult;
}

beforeAll(async () => {
  vault = tmpVault({
    "Projects/Barreleye.md": [
      "# Barreleye",
      "",
      "- [ ] #task Migrate Production 📅 2026-07-01 ⏫",
      "- [ ] #task Fix OData 500 #engineering 📅 2026-06-12",
      "- [ ] #task weekly review 🔁 every week 📅 2026-06-12",
      "- [x] #task done already ✅ 2026-06-01",
    ].join("\n"),
    "Inbox.md": "# Inbox\n\n- [ ] #task triage me\n",
  });
  snapsDir = mkdtempSync(join(tmpdir(), "obtodo-snaps-"));
  const db = openDatabase(":memory:");
  const store = new VaultStore(vault.dir);
  // No-op snapshotter: git is exercised in snapshots.test.ts; here we only test tools.
  const snapshotter = { noteMutation() {}, async init() {} } as unknown as Snapshotter;
  const vaultCtx = createVaultContext({ store, links: new LinkIndex(store), snapshotter, vaultName: "TestVault" });
  const taskCtx = createTaskContext({ db, store, snapshotter, now: () => new Date(2026, 5, 12, 14, 30) });
  await taskCtx.indexer.sweep();
  const config = loadConfig({ DATA_DIR: vault.dir, PUBLIC_URL: "http://localhost:3000" } as unknown as NodeJS.ProcessEnv);
  const app = createApp({ config, db, vaultCtx, taskCtx, setupState: { token: null, pendingUserHandle: null } });
  server = Bun.serve({ port: 0, fetch: app.fetch });

  const { token } = createApiToken(db, "integration-test");
  client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`http://localhost:${server.port}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    }),
  );
});

afterAll(async () => {
  await client?.close();
  server?.stop(true);
  vault?.cleanup();
  rmSync(snapsDir, { recursive: true, force: true });
});

describe("MCP task tools", () => {
  test("exposes the task tool set with annotations", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "add_task",
      "cancel_task",
      "complete_task",
      "list_projects",
      "list_tags",
      "list_tasks",
      "remove_task",
      "reschedule_task",
      "update_task",
    ]);
    expect(tools.find((t) => t.name === "list_tasks")!.annotations?.readOnlyHint).toBe(true);
    expect(tools.find((t) => t.name === "remove_task")!.annotations?.destructiveHint).toBe(true);
  });

  test("instructions describe the task workflow", () => {
    expect(client.getInstructions()).toContain("list_tasks first");
  });

  test("list_tasks view=today returns overdue + due today", async () => {
    const r = jsonOf(await call("list_tasks", { view: "today" }));
    const descs = r.tasks.map((t: any) => t.description);
    expect(descs).toContain("Fix OData 500 #engineering");
    expect(descs).toContain("weekly review");
    expect(descs).not.toContain("Migrate Production");
  });

  test("add_task appends to Inbox by default", async () => {
    const r = jsonOf(await call("add_task", { description: "buy milk", due: "2026-06-20", priority: "high" }));
    expect(r.task.path).toBe("Inbox.md");
    expect(r.task.due).toBe("2026-06-20");
    expect(r.task.priority).toBe("high");
  });

  test("complete_task on a recurring task creates the next occurrence", async () => {
    const before = jsonOf(await call("list_tasks", {})).tasks.find((t: any) => t.description === "weekly review");
    const r = jsonOf(await call("complete_task", { path: before.path, line: before.line, description: "weekly review" }));
    expect(r.tasks.length).toBe(2);
    const after = jsonOf(await call("list_tasks", {})).tasks.filter((t: any) => t.description === "weekly review");
    expect(after.length).toBe(1);
    expect(after[0].due).toBe("2026-06-19");
  });

  test("reschedule_task changes the due date", async () => {
    const t = jsonOf(await call("list_tasks", {})).tasks.find((x: any) => x.description === "Migrate Production");
    await call("reschedule_task", { path: t.path, line: t.line, description: t.description, due: "2026-08-01" });
    const after = jsonOf(await call("list_tasks", {})).tasks.find((x: any) => x.description === "Migrate Production");
    expect(after.due).toBe("2026-08-01");
  });

  test("update_task changes priority", async () => {
    const t = jsonOf(await call("list_tasks", {})).tasks.find((x: any) => x.description === "Fix OData 500 #engineering");
    await call("update_task", { path: t.path, line: t.line, description: t.description, priority: "highest" });
    const after = jsonOf(await call("list_tasks", {})).tasks.find((x: any) => x.description === "Fix OData 500 #engineering");
    expect(after.priority).toBe("highest");
  });

  test("relocates by description when the line shifted", async () => {
    const t = jsonOf(await call("list_tasks", {})).tasks.find((x: any) => x.description === "triage me");
    // external edit shifts the line down
    vault.write("Inbox.md", "# Inbox\n\nNew preamble line\n\n- [ ] #task triage me\n");
    const r = await call("complete_task", { path: t.path, line: t.line, description: "triage me" });
    expect(r.isError).toBeFalsy();
  });

  test("conflict when a task cannot be located", async () => {
    const r = await call("complete_task", { path: "Projects/Barreleye.md", line: 999, description: "ghost task" });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain("CONFLICT");
  });

  test("list_projects and list_tags", async () => {
    const projects = jsonOf(await call("list_projects", {}));
    expect(projects.projects.some((p: any) => p.note === "Barreleye")).toBe(true);
    const tags = jsonOf(await call("list_tags", {}));
    expect(tags.tags.some((t: any) => t.tag === "engineering")).toBe(true);
  });

  test("cancel_task and remove_task", async () => {
    const t = jsonOf(await call("list_tasks", {})).tasks.find((x: any) => x.description === "Migrate Production");
    const cancelled = jsonOf(await call("cancel_task", { path: t.path, line: t.line, description: t.description }));
    expect(cancelled.tasks[0].status).toBe("cancelled");

    const t2 = jsonOf(await call("list_tasks", { include_done: true })).tasks.find((x: any) => x.description === "Fix OData 500 #engineering");
    const removed = jsonOf(await call("remove_task", { path: t2.path, line: t2.line, description: t2.description }));
    expect(removed.ok).toBe(true);
    const after = jsonOf(await call("list_tasks", { include_done: true })).tasks.find((x: any) => x.description === "Fix OData 500 #engineering");
    expect(after).toBeUndefined();
  });
});
