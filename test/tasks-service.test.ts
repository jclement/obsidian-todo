import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openDatabase } from "../src/db/index.ts";
import { VaultStore } from "../src/vault/store.ts";
import { Indexer } from "../src/index/indexer.ts";
import { TaskService, TaskConflictError } from "../src/tasks/service.ts";
import { queryTasks, viewToday, viewUpcoming, viewCompleted, listProjects, listTags, tasksInFile } from "../src/index/queries.ts";
import { DEFAULT_SETTINGS } from "../src/settings.ts";
import type { Snapshotter } from "../src/snapshots/snapshotter.ts";
import { tmpVault, type TmpVault } from "./helpers.ts";
import type { Database } from "bun:sqlite";

const NOW = new Date("2026-06-13T12:00:00");
const snap = { noteMutation() {} } as unknown as Snapshotter;
const settings = { ...DEFAULT_SETTINGS };

let vault: TmpVault;
let db: Database;
let store: VaultStore;
let indexer: Indexer;
let svc: TaskService;

beforeEach(async () => {
  vault = tmpVault({
    "Projects/Barreleye.md": [
      "# Barreleye",
      "",
      "- [ ] #task Migrate Production 📅 2026-07-01 ⏫",
      "- [ ] #task Fix OData 500 #engineering 📅 2026-06-13",
      "- [ ] #task overdue thing 📅 2026-06-01",
      "- [x] #task already done ✅ 2026-06-10",
      "- [ ] water plants (not a task)",
      "- [ ] #task weekly review 🔁 every week 📅 2026-06-13",
    ].join("\n"),
    "Inbox.md": "# Inbox\n\n- [ ] #task triage me\n",
    "templates/T.md": "- [ ] #task should be excluded\n",
  });
  db = openDatabase(":memory:");
  store = new VaultStore(vault.dir);
  indexer = new Indexer(db, store, () => settings);
  svc = new TaskService(db, store, snap, indexer, () => settings, () => NOW);
  await indexer.sweep();
});

afterEach(() => {
  db.close();
  vault.cleanup();
});

describe("indexer", () => {
  test("indexes only #task lines, excludes templates folder", () => {
    const all = queryTasks(db, { includeDone: true });
    expect(all.find((t) => t.description === "should be excluded")).toBeUndefined();
    expect(all.find((t) => t.description === "water plants (not a task)")).toBeUndefined();
    expect(all.some((t) => t.description === "Migrate Production")).toBe(true);
  });

  test("attaches file_hash and source_note", () => {
    const t = queryTasks(db).find((t) => t.description === "Migrate Production")!;
    expect(t.file_hash).toMatch(/^[a-f0-9]{12}$/);
    expect(t.source_note).toBe("Barreleye");
    expect(t.priority).toBe("high");
  });

  test("reindex on content change", async () => {
    vault.write("Projects/Barreleye.md", "# Barreleye\n\n- [ ] #task brand new\n");
    await indexer.sweep();
    const descs = queryTasks(db).map((t) => t.description);
    expect(descs).toContain("brand new");
    expect(descs).not.toContain("Migrate Production");
  });
});

describe("custom statuses & folder scoping", () => {
  test("custom statuses ([/], [!], [?]) count as open, not hidden", async () => {
    vault.write("Projects/Barreleye.md", [
      "# Barreleye",
      "- [/] #task in progress thing",
      "- [!] #task important thing",
      "- [?] #task question thing",
      "- [x] #task done thing ✅ 2026-06-10",
    ].join("\n"));
    await indexer.sweep();
    const open = queryTasks(db).map((t) => t.description);
    expect(open).toContain("in progress thing");
    expect(open).toContain("important thing");
    expect(open).toContain("question thing");
    expect(open).not.toContain("done thing");
    // raw status char is surfaced
    const imp = queryTasks(db).find((t) => t.description === "important thing")!;
    expect(imp.status_char).toBe("!");
  });

  test("includedFolders whitelist limits indexing (inbox always kept)", async () => {
    vault.write("work/W.md", "- [ ] #task work task\n");
    vault.write("personal/P.md", "- [ ] #task personal task\n");
    settings.includedFolders = ["work"];
    db.exec("DELETE FROM files");
    await indexer.sweep();
    const descs = queryTasks(db).map((t) => t.description);
    expect(descs).toContain("work task");
    expect(descs).toContain("triage me"); // inbox always indexed
    expect(descs).not.toContain("personal task");
    settings.includedFolders = []; // reset for other tests
  });

  test("completed view returns done + cancelled, not open", () => {
    const done = viewCompleted(db).map((t) => t.description);
    expect(done).toContain("already done");
    expect(done).not.toContain("Migrate Production");
  });

  test("projectExcludeFolders hides folders from projects but keeps tasks", async () => {
    vault.write("weekly/2026-W24.md", "- [ ] #task weekly thing 📅 2026-06-13\n");
    await indexer.sweep();
    expect(listProjects(db).some((p) => p.note === "2026-W24")).toBe(true);
    expect(listProjects(db, ["weekly"]).some((p) => p.note === "2026-W24")).toBe(false);
    // task still indexed / open
    expect(queryTasks(db).some((t) => t.description === "weekly thing")).toBe(true);
  });
});

describe("views", () => {
  test("today = overdue + due today", () => {
    const today = viewToday(db, NOW).map((t) => t.description);
    expect(today).toContain("Fix OData 500 #engineering");
    expect(today).toContain("overdue thing");
    expect(today).toContain("weekly review");
    expect(today).not.toContain("Migrate Production"); // due 2026-07-01
  });

  test("upcoming within 7 days", () => {
    const up = viewUpcoming(db, 30, NOW).map((t) => t.description);
    expect(up).toContain("Migrate Production");
  });

  test("projects and tags", () => {
    const projects = listProjects(db);
    expect(projects.find((p) => p.note === "Barreleye")!.open_count).toBeGreaterThan(0);
    const tags = listTags(db);
    expect(tags.find((t) => t.tag === "engineering")).toBeTruthy();
  });
});

describe("write path", () => {
  function find(desc: string) {
    return queryTasks(db, { includeDone: true }).find((t) => t.description === desc)!;
  }

  test("complete marks done and stamps ✅", async () => {
    const t = find("overdue thing");
    const [done] = await svc.complete({ path: t.path, line: t.line, expectedHash: t.file_hash });
    expect(done!.status).toBe("done");
    expect(done!.done).toBe("2026-06-13");
    const text = await store.readText("Projects/Barreleye.md");
    expect(text.text).toContain("- [x] #task overdue thing 📅 2026-06-01 ✅ 2026-06-13");
  });

  test("completing a recurring task inserts the next instance", async () => {
    const t = find("weekly review");
    const result = await svc.complete({ path: t.path, line: t.line, expectedHash: t.file_hash });
    expect(result.length).toBe(2);
    const text = (await store.readText("Projects/Barreleye.md")).text;
    expect(text).toContain("📅 2026-06-20"); // next week
    expect(text).toContain("✅ 2026-06-13"); // completed instance
    const open = queryTasks(db).filter((x) => x.description === "weekly review");
    expect(open.length).toBe(1);
    expect(open[0]!.due).toBe("2026-06-20");
  });

  test("reschedule changes the due date", async () => {
    const t = find("Migrate Production");
    await svc.reschedule({ path: t.path, line: t.line, expectedHash: t.file_hash }, { due: "2026-08-01" });
    expect(find("Migrate Production").due).toBe("2026-08-01");
  });

  test("update priority and description", async () => {
    const t = find("Fix OData 500 #engineering");
    await svc.update({ path: t.path, line: t.line, expectedHash: t.file_hash }, { priority: "highest" });
    expect(find("Fix OData 500 #engineering").priority).toBe("highest");
  });

  test("remove deletes the line and shifts the rest", async () => {
    const before = queryTasks(db, { includeDone: true }).length;
    const t = find("overdue thing");
    await svc.remove({ path: t.path, line: t.line, expectedHash: t.file_hash });
    const after = queryTasks(db, { includeDone: true });
    expect(after.length).toBe(before - 1);
    expect(after.find((x) => x.description === "overdue thing")).toBeUndefined();
    // sibling still parses correctly after the shift
    expect(after.find((x) => x.description === "Migrate Production")).toBeTruthy();
  });

  test("stale hash → conflict with fresh task list", async () => {
    const t = find("Migrate Production");
    await expect(
      svc.complete({ path: t.path, line: t.line, expectedHash: "deadbeef0000" }),
    ).rejects.toBeInstanceOf(TaskConflictError);
  });

  test("MCP-style relocation by description when line shifted", async () => {
    const t = find("Migrate Production");
    // prepend a line so the line number is now wrong, but description still unique
    const file = await store.readText("Projects/Barreleye.md");
    await store.write("Projects/Barreleye.md", "Inserted top line\n" + file.text);
    await indexer.sweep();
    // use the OLD line number with description anchor (no hash) — should relocate
    const [done] = await svc.complete({ path: t.path, line: t.line, description: "Migrate Production" });
    expect(done!.status).toBe("done");
  });

  test("add appends to Inbox by default", async () => {
    const created = await svc.add({ description: "buy milk", due: "2026-06-20", priority: "high" });
    expect(created.path).toBe("Inbox.md");
    expect(created.due).toBe("2026-06-20");
    const text = (await store.readText("Inbox.md")).text;
    expect(text).toContain("- [ ] #task buy milk ⏫ 📅 2026-06-20");
    expect(tasksInFile(db, "Inbox.md").some((x) => x.description === "buy milk")).toBe(true);
  });

  test("add to a specific note, creating it if missing", async () => {
    const created = await svc.add({ description: "new project task", targetNote: "Projects/New.md" });
    expect(created.path).toBe("Projects/New.md");
    expect(store.exists("Projects/New.md")).toBe(true);
  });
});
