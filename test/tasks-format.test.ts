import { describe, expect, test } from "bun:test";
import { buildTask, ensureGlobalFilter, formatTaskLine } from "../src/tasks/format.ts";
import { parseTaskLine } from "../src/tasks/parse.ts";

describe("ensureGlobalFilter", () => {
  test("prepends the filter when missing", () => {
    expect(ensureGlobalFilter("buy milk")).toBe("#task buy milk");
  });
  test("leaves it in place when present (front or middle)", () => {
    expect(ensureGlobalFilter("#task buy milk")).toBe("#task buy milk");
    expect(ensureGlobalFilter("buy milk #task")).toBe("buy milk #task");
  });
});

describe("formatTaskLine round-trips", () => {
  const cases = [
    "- [ ] #task Migrate Production 📅 2026-07-01",
    "- [x] #task Confirm unit tests work ⏫ 📅 2026-06-11 ✅ 2026-06-11",
    "- [ ] #task Fix OData 500 #barreleye 📅 2026-05-25",
    "- [ ] #task water plants 🔁 every 3 days 📅 2026-05-01",
    "    - [ ] #task nested subtask 📅 2026-05-01",
  ];
  for (const line of cases) {
    test(`round-trips: ${line}`, () => {
      const parsed = parseTaskLine(line)!;
      expect(formatTaskLine(parsed)).toBe(line);
    });
  }

  test("preserves markdown link in description on rewrite", () => {
    const line = "- [ ] #task [#1700](https://dev.azure.com/x/_workitems/edit/1700) — roll out 📅 2026-05-01";
    const parsed = parseTaskLine(line)!;
    expect(formatTaskLine(parsed)).toBe(line);
  });

  test("emits signifiers in canonical order regardless of input order", () => {
    const parsed = parseTaskLine("- [ ] #task a 📅 2026-05-01 ⏫ ➕ 2026-01-01")!;
    expect(formatTaskLine(parsed)).toBe("- [ ] #task a ⏫ ➕ 2026-01-01 📅 2026-05-01");
  });

  test("flipping status to done writes x", () => {
    const parsed = parseTaskLine("- [ ] #task a 📅 2026-05-01")!;
    parsed.status = "done";
    parsed.done = "2026-06-13";
    expect(formatTaskLine(parsed)).toBe("- [x] #task a 📅 2026-05-01 ✅ 2026-06-13");
  });

  test("preserves block ref", () => {
    const line = "- [ ] #task a 📅 2026-05-01 ^abc";
    expect(formatTaskLine(parseTaskLine(line)!)).toBe(line);
  });

  test("reminder emitted last", () => {
    const parsed = buildTask({ description: "ship", due: "2026-05-01", reminder: "09:30" });
    expect(formatTaskLine(parsed)).toBe("- [ ] #task ship 📅 2026-05-01 ⏰ 09:30");
  });
});

describe("buildTask", () => {
  test("creates a todo with global filter at the front", () => {
    const t = buildTask({ description: "buy milk", due: "2026-05-01", priority: "high" });
    expect(formatTaskLine(t)).toBe("- [ ] #task buy milk ⏫ 📅 2026-05-01");
    expect(t.description).toBe("buy milk");
  });

  test("keeps user-provided tags and global filter once", () => {
    const t = buildTask({ description: "fix bug #engineering" });
    expect(t.tags).toEqual(["engineering"]);
    expect(formatTaskLine(t)).toBe("- [ ] #task fix bug #engineering");
  });
});
