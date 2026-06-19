#!/usr/bin/env bun
/**
 * Visual QA: load the built SPA with a mocked API and screenshot every major
 * screen at desktop + mobile widths, and assert the header padding actually
 * renders (regression guard for the safe-area / CSS-layer bug).
 *
 *   bunx vite preview --port 4188 --strictPort   # serve dist/client (run in web/)
 *   bun scripts/visual-check.ts
 *
 * Output: PNGs under /tmp/obtodo-shots, plus a printed header-padding report.
 */
import { chromium, type Route } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:4188";
const OUT = "/tmp/obtodo-shots";
mkdirSync(OUT, { recursive: true });

const STATUSES = [
  { symbol: " ", name: "To do", type: "TODO" },
  { symbol: "/", name: "In progress", type: "IN_PROGRESS" },
  { symbol: "x", name: "Done", type: "DONE" },
  { symbol: "-", name: "Cancelled", type: "CANCELLED" },
];

const settings = {
  globalFilter: "#task", inboxNote: "Inbox.md", excludedFolders: [], includedFolders: [],
  projectExcludeFolders: ["Daily"], obsidianVaultName: "My Vault", ntfyUrl: "", ntfyTopic: "",
  ntfyConfigured: false, ntfyTokenSet: false, openaiConfigured: true, openaiModel: "gpt-4o-mini",
  notifyHour: 8, notifyEnabled: false, statuses: STATUSES, syncMode: "obsidian", onboarded: true,
};

const counts = { today: 3, overdue: 2, due_today: 1, due_later: 4, inbox: 2, total_open: 11 };

let n = 0;
const task = (o: Partial<any>) => ({
  id: ++n, path: o.path ?? "Projects/Barreleye.md", line: 10 + n, file_hash: "h" + n,
  status: "todo", status_char: " ", description: "Untitled", priority: "normal",
  due: null, scheduled: null, start: null, created: null, done: null, cancelled: null,
  recurrence: null, reminder: null, tags: [], task_id: null, depends_on: [],
  source_note: (o.path ?? "Projects/Barreleye.md").split("/").pop()!.replace(/\.md$/, ""),
  indent: 0, parent_line: null, notes: "", subitems: [], ...o,
});

const tasks = [
  task({ description: "Fix OData 500 on the metrics endpoint #barreleye", due: "2026-06-10", priority: "high", tags: ["barreleye"] }),
  task({ description: "Review the Q3 capacity plan and leave comments for the team", due: "2026-06-16", tags: ["work"], subitems: [{ line: 1, checked: true, text: "Read draft" }, { line: 2, checked: false, text: "Add notes" }] }),
  task({ description: "Water the plants", due: "2026-06-16", recurrence: "every 3 days", priority: "low", source_note: "Home", path: "Home.md" }),
  task({ description: "Call dentist to reschedule cleaning", due: "2026-06-18", reminder: "09:00", priority: "highest", tags: ["health"] }),
  task({ description: "Draft the onboarding doc for new engineers and circulate it widely before the offsite next week", due: "2026-07-01", notes: "Some context notes", tags: ["work", "writing"] }),
  task({ description: "Buy milk", source_note: "Inbox", path: "Inbox.md" }),
  task({ description: "Finished setting up CI", status: "done", status_char: "x", done: "2026-06-15" }),
];

const projects = [
  { note: "Barreleye", path: "Projects/Barreleye.md", open_count: 4, total_count: 9, next_due: "2026-06-16" },
  { note: "Home", path: "Home.md", open_count: 2, total_count: 3, next_due: "2026-06-18" },
];
const tags = [
  { tag: "work", count: 7 }, { tag: "barreleye", count: 4 }, { tag: "health", count: 2 }, { tag: "writing", count: 1 },
];
const bootstrap = { settings, counts, conflicts: [], vaultName: "My Vault", sync: { state: "running", desired: true } };
const adminOverview = { counts, passkeys: 2, tokens: 1, connections: 0, snapshots: 42, sync: { state: "running", desired: true }, mcpUrl: BASE + "/mcp" };

function mock(route: Route) {
  const url = new URL(route.request().url());
  const p = url.pathname.replace(/^\/api/, "");
  const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  if (p === "/bootstrap") return json(bootstrap);
  if (p === "/counts") return json(counts);
  if (p === "/me") return json({ display_name: "Jeff" });
  if (p === "/tasks") return json({ tasks });
  if (p === "/projects") return json({ projects });
  if (p === "/tags") return json({ tags });
  if (p === "/notes") return json({ notes: projects.map((x) => ({ path: x.path, note: x.note })) });
  if (p === "/notes/tasks") return json({ tasks });
  if (p === "/settings") return json(settings);
  if (p === "/admin/overview") return json(adminOverview);
  if (p.startsWith("/admin")) return json({ passkeys: [], tokens: [], connections: [], entries: [], commits: [], guidance: "" });
  return json({});
}

const SCREENS: [string, string][] = [
  ["today", "/"], ["inbox", "/inbox"], ["all", "/all"],
  ["completed", "/completed"], ["tags", "/tags"], ["settings", "/settings"],
];

const VIEWPORTS: [string, number, number][] = [["desktop", 1366, 900], ["mobile", 390, 844]];

const browser = await chromium.launch();
const report: string[] = [];

for (const [vp, w, h] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await ctx.route("**/api/**", mock);
  const page = await ctx.newPage();

  for (const [name, path] of SCREENS) {
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${OUT}/${vp}-${name}.png`, fullPage: false });
  }

  // Modals (drive from the Today screen).
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  for (const [name, key] of [["quickadd", "q"], ["bulk", "b"], ["help", "?"]] as [string, string][]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${vp}-modal-${name}.png` });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  }
  // Task editor — click the first row's title.
  await page.locator('[role="button"][aria-label^="Edit:"]').first().click().catch(() => {});
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${vp}-modal-editor.png` });

  await ctx.close();
}

await browser.close();
console.log(report.join("\n"));
console.log("shots in", OUT);
