#!/usr/bin/env bun
/**
 * Read-only validator: walk the vault, parse every managed (#task) line, and
 * print what we extracted. Use this to sanity-check the parser against the real
 * vault before anything writes to it.
 *
 *   bun scripts/dump-tasks.ts [vaultDir] [--json] [--all]
 *
 * --json  emit JSON instead of the human table
 * --all   include completed/cancelled tasks (default: open only)
 */

import { loadConfig } from "../src/config.ts";
import { VaultStore } from "../src/vault/store.ts";
import { parseTasksInFile } from "../src/tasks/file.ts";
import { getSetting, openDatabase } from "../src/db/index.ts";
import type { LocatedTask } from "../src/tasks/types.ts";

const args = process.argv.slice(2);
const json = args.includes("--json");
const all = args.includes("--all");
const positional = args.filter((a) => !a.startsWith("--"));

const config = loadConfig();
const vaultDir = positional[0] ?? config.vaultDir;

// Global filter: prefer the configured one if a DB exists, else default.
let globalFilter = "#task";
try {
  const db = openDatabase(config.dbPath);
  globalFilter = getSetting(db, "global_filter") ?? "#task";
  db.close();
} catch {
  // no DB yet — fine, use default
}

const store = new VaultStore(vaultDir);
const open: LocatedTask[] = [];
const collected: { path: string; task: LocatedTask }[] = [];
let files = 0;

for (const { path } of store.walkFiles()) {
  if (!path.toLowerCase().endsWith(".md")) continue;
  files++;
  const { text } = await store.readText(path);
  for (const task of parseTasksInFile(text, globalFilter)) {
    if (!all && (task.status === "done" || task.status === "cancelled")) continue;
    collected.push({ path, task });
    if (task.status === "todo" || task.status === "in_progress") open.push(task);
  }
}

if (json) {
  console.log(JSON.stringify(collected, null, 2));
} else {
  const pri: Record<string, string> = { highest: "🔺", high: "⏫", medium: "🔼", normal: "  ", low: "🔽", lowest: "⏬" };
  const st: Record<string, string> = { todo: "[ ]", done: "[x]", in_progress: "[/]", cancelled: "[-]", other: "[?]" };
  let lastPath = "";
  for (const { path, task } of collected) {
    if (path !== lastPath) {
      console.log(`\n\x1b[1m${path}\x1b[0m`);
      lastPath = path;
    }
    const due = task.due ? `  📅 ${task.due}` : "";
    const rec = task.recurrence ? `  🔁 ${task.recurrence}` : "";
    const tags = task.tags.length ? `  \x1b[2m${task.tags.map((t) => "#" + t).join(" ")}\x1b[0m` : "";
    console.log(`  ${st[task.status]} ${pri[task.priority]} ${task.description}${due}${rec}${tags}  \x1b[2m:${task.line}\x1b[0m`);
  }
  console.log(`\n\x1b[2m${files} files · ${collected.length} shown · ${open.length} open · filter=${globalFilter}\x1b[0m`);
}
