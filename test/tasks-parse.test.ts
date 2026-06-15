import { describe, expect, test } from "bun:test";
import { hasGlobalFilter, parseTaskLine } from "../src/tasks/parse.ts";
import { parseTasksInFile } from "../src/tasks/file.ts";
import type { StatusDef } from "../src/settings.ts";

describe("parseTaskLine", () => {
  test("returns null for non-checkbox lines", () => {
    expect(parseTaskLine("just a paragraph")).toBeNull();
    expect(parseTaskLine("## a heading")).toBeNull();
    expect(parseTaskLine("- a bullet, not a checkbox")).toBeNull();
  });

  test("parses status characters", () => {
    expect(parseTaskLine("- [ ] #task a")!.status).toBe("todo");
    expect(parseTaskLine("- [x] #task a")!.status).toBe("done");
    expect(parseTaskLine("- [X] #task a")!.status).toBe("done");
    expect(parseTaskLine("- [/] #task a")!.status).toBe("in_progress");
    expect(parseTaskLine("- [-] #task a")!.status).toBe("cancelled");
    expect(parseTaskLine("- [?] #task a")!.status).toBe("other");
  });

  test("strips global filter from display description but keeps it raw", () => {
    const t = parseTaskLine("- [ ] #task Migrate Production 📅 2026-07-01")!;
    expect(t.description).toBe("Migrate Production");
    expect(t.descriptionRaw).toBe("#task Migrate Production");
    expect(t.due).toBe("2026-07-01");
  });

  test("real vault line: priority + due + done", () => {
    const t = parseTaskLine("- [x] #task Confirm unit tests / e2e tests work on PG17 ⏫ 📅 2026-06-11 ✅ 2026-06-11")!;
    expect(t.status).toBe("done");
    expect(t.priority).toBe("high");
    expect(t.due).toBe("2026-06-11");
    expect(t.done).toBe("2026-06-11");
    expect(t.description).toBe("Confirm unit tests / e2e tests work on PG17");
  });

  test("preserves markdown links in the description", () => {
    const t = parseTaskLine(
      "- [ ] #task [#1700](https://dev.azure.com/barreleye/barreleye/_workitems/edit/1700) — Get machine inventory system rolled out (BoxCheckr)",
    )!;
    expect(t.description).toContain("[#1700](https://dev.azure.com/barreleye/barreleye/_workitems/edit/1700)");
    expect(t.due).toBeUndefined();
    expect(t.tags).toEqual([]); // #1700 is not a tag (starts with digit) and link is not dataview
  });

  test("extracts tags excluding the global filter", () => {
    const t = parseTaskLine("- [ ] #task Fix OData 500 #barreleye #engineering 📅 2026-05-25 ⏫")!;
    expect(t.tags.sort()).toEqual(["barreleye", "engineering"]);
    expect(t.priority).toBe("high");
    expect(t.due).toBe("2026-05-25");
    expect(t.description).toBe("Fix OData 500 #barreleye #engineering");
  });

  test("all priority glyphs", () => {
    expect(parseTaskLine("- [ ] #task a 🔺")!.priority).toBe("highest");
    expect(parseTaskLine("- [ ] #task a ⏫")!.priority).toBe("high");
    expect(parseTaskLine("- [ ] #task a 🔼")!.priority).toBe("medium");
    expect(parseTaskLine("- [ ] #task a 🔽")!.priority).toBe("low");
    expect(parseTaskLine("- [ ] #task a ⏬")!.priority).toBe("lowest");
    expect(parseTaskLine("- [ ] #task a")!.priority).toBe("normal");
  });

  test("all date fields", () => {
    const t = parseTaskLine(
      "- [ ] #task a ➕ 2026-01-01 🛫 2026-01-02 ⏳ 2026-01-03 📅 2026-01-04",
    )!;
    expect(t.created).toBe("2026-01-01");
    expect(t.start).toBe("2026-01-02");
    expect(t.scheduled).toBe("2026-01-03");
    expect(t.due).toBe("2026-01-04");
  });

  test("recurrence rule with following signifier", () => {
    const t = parseTaskLine("- [ ] #task water plants 🔁 every 3 days 📅 2026-05-01")!;
    expect(t.recurrence).toBe("every 3 days");
    expect(t.due).toBe("2026-05-01");
  });

  test("recurrence when done", () => {
    const t = parseTaskLine("- [ ] #task gym 🔁 every week when done ⏳ 2026-05-01")!;
    expect(t.recurrence).toBe("every week when done");
    expect(t.scheduled).toBe("2026-05-01");
  });

  test("id, depends-on, reminder", () => {
    const t = parseTaskLine("- [ ] #task ship 📅 2026-05-01 🆔 abc123 ⛔ def456,ghi789 ⏰ 09:30")!;
    expect(t.taskId).toBe("abc123");
    expect(t.dependsOn).toEqual(["def456", "ghi789"]);
    expect(t.reminder).toBe("09:30");
  });

  test("variation-selector emoji parse identically", () => {
    const t = parseTaskLine("- [ ] #task a 📅️ 2026-05-01")!;
    expect(t.due).toBe("2026-05-01");
  });

  test("block reference preserved", () => {
    const t = parseTaskLine("- [ ] #task a 📅 2026-05-01 ^block-1")!;
    expect(t.blockRef).toBe("block-1");
    expect(t.due).toBe("2026-05-01");
  });

  test("dataview fields read as fallback", () => {
    const t = parseTaskLine("- [x] #task did a thing [completion:: 2026-03-26]")!;
    expect(t.done).toBe("2026-03-26");
  });

  test("dataview priority and repeat", () => {
    const t = parseTaskLine("- [ ] #task a [priority:: high] [repeat:: every week] [due:: 2026-05-01]")!;
    expect(t.priority).toBe("high");
    expect(t.recurrence).toBe("every week");
    expect(t.due).toBe("2026-05-01");
  });

  test("emoji wins over dataview when both present", () => {
    const t = parseTaskLine("- [ ] #task a 📅 2026-05-01 [due:: 2026-09-09]")!;
    expect(t.due).toBe("2026-05-01");
  });

  test("indentation captured for subtasks", () => {
    const t = parseTaskLine("    - [ ] #task nested")!;
    expect(t.indent).toBe(4);
    expect(t.indentText).toBe("    ");
  });

  test("ordered-list markers", () => {
    expect(parseTaskLine("1. [ ] #task a")!.listMarker).toBe("1.");
    expect(parseTaskLine("2) [ ] #task a")!.listMarker).toBe("2)");
  });

  test("classifies status via configured statuses", () => {
    const statuses: StatusDef[] = [
      { symbol: " ", name: "Unchecked", type: "TODO" },
      { symbol: "x", name: "Checked", type: "DONE" },
      { symbol: "-", name: "Dropped", type: "CANCELLED" },
      { symbol: "!", name: "Important", type: "TODO" },
      { symbol: "W", name: "Waiting", type: "IN_PROGRESS" },
    ];
    expect(parseTaskLine("- [!] #task a", "#task", statuses)!.status).toBe("todo");
    expect(parseTaskLine("- [W] #task a", "#task", statuses)!.status).toBe("in_progress");
    expect(parseTaskLine("- [-] #task a", "#task", statuses)!.status).toBe("cancelled");
    expect(parseTaskLine("- [x] #task a", "#task", statuses)!.status).toBe("done");
    expect(parseTaskLine("- [Z] #task a", "#task", statuses)!.status).toBe("other"); // unknown → open
  });

  test("custom global filter", () => {
    const t = parseTaskLine("- [ ] #todo buy milk 📅 2026-05-01", "#todo")!;
    expect(t.description).toBe("buy milk");
    expect(t.tags).toEqual([]);
  });
});

describe("hasGlobalFilter", () => {
  test("matches the tag as a whole token", () => {
    expect(hasGlobalFilter("- [ ] #task a")).toBe(true);
    expect(hasGlobalFilter("- [ ] #tasks a")).toBe(false); // not a prefix match
    expect(hasGlobalFilter("- [ ] no tag here")).toBe(false);
  });
});

describe("parseTasksInFile", () => {
  const doc = [
    "# Project",
    "",
    "- [ ] #task top level 📅 2026-05-01",
    "    - [ ] #task a subtask",
    "        - [ ] #task deeper",
    "    - [ ] #task sibling subtask",
    "- [ ] a plain checklist item (untagged)",
    "- [x] #task done one ✅ 2026-04-01",
    "",
    "```",
    "- [ ] #task inside a code fence (ignored)",
    "```",
  ].join("\n");

  test("indexes only #task lines, with line numbers", () => {
    const tasks = parseTasksInFile(doc);
    expect(tasks.map((t) => t.description)).toEqual([
      "top level",
      "a subtask",
      "deeper",
      "sibling subtask",
      "done one",
    ]);
    expect(tasks[0]!.line).toBe(3);
  });

  test("ignores checkbox lines inside code fences", () => {
    const tasks = parseTasksInFile(doc);
    expect(tasks.some((t) => t.description.includes("code fence"))).toBe(false);
  });

  test("captures sub-bullets as notes + toggleable subitems", () => {
    const sample = [
      "- [ ] #task Buy groceries",
      "    - [ ] Apples",
      "    - [x] Oranges",
      "    just a plain note",
      "- [ ] #task next thing",
    ].join("\n");
    const tasks = parseTasksInFile(sample);
    const g = tasks.find((t) => t.description === "Buy groceries")!;
    expect(g.subitems.map((s) => s.text)).toEqual(["Apples", "Oranges"]);
    expect(g.subitems[1]!.checked).toBe(true);
    expect(g.subitems[0]!.line).toBe(2);
    expect(g.notes).toContain("Apples");
    expect(g.notes).toContain("just a plain note");
    expect(tasks.find((t) => t.description === "next thing")!.notes).toBe("");
  });

  test("derives subtask parent from indentation", () => {
    const tasks = parseTasksInFile(doc);
    const byDesc = Object.fromEntries(tasks.map((t) => [t.description, t]));
    expect(byDesc["top level"]!.parentLine).toBeNull();
    expect(byDesc["a subtask"]!.parentLine).toBe(byDesc["top level"]!.line);
    expect(byDesc["deeper"]!.parentLine).toBe(byDesc["a subtask"]!.line);
    expect(byDesc["sibling subtask"]!.parentLine).toBe(byDesc["top level"]!.line);
  });
});
