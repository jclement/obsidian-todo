import { describe, expect, test } from "bun:test";
import { nextOccurrence, parseRecurrence } from "../src/tasks/recurrence.ts";
import { buildTask } from "../src/tasks/format.ts";

function due(task: ReturnType<typeof buildTask>, completion: string) {
  return nextOccurrence(task, completion)?.due;
}

describe("parseRecurrence", () => {
  test("simple intervals", () => {
    expect(parseRecurrence("every day")).toMatchObject({ unit: "day", interval: 1 });
    expect(parseRecurrence("every 3 days")).toMatchObject({ unit: "day", interval: 3 });
    expect(parseRecurrence("every week")).toMatchObject({ unit: "week", interval: 1 });
    expect(parseRecurrence("every 2 weeks")).toMatchObject({ unit: "week", interval: 2 });
    expect(parseRecurrence("every month")).toMatchObject({ unit: "month", interval: 1 });
    expect(parseRecurrence("every year")).toMatchObject({ unit: "year", interval: 1 });
  });

  test("when done flag", () => {
    expect(parseRecurrence("every week when done")).toMatchObject({ unit: "week", whenDone: true });
  });

  test("weekday and weekly-on-days", () => {
    expect(parseRecurrence("every weekday")).toMatchObject({ unit: "weekday" });
    expect(parseRecurrence("every week on monday")).toMatchObject({ unit: "week", weekdays: [1] });
    expect(parseRecurrence("every monday, friday")).toMatchObject({ unit: "week", weekdays: [1, 5] });
  });

  test("monthly on the Nth / last", () => {
    expect(parseRecurrence("every month on the 1st")).toMatchObject({ unit: "month", monthOrdinal: 1 });
    expect(parseRecurrence("every month on the last")).toMatchObject({ unit: "month", monthOrdinal: "last" });
  });

  test("rejects unparseable rules", () => {
    expect(parseRecurrence("sometimes maybe")).toBeNull();
    expect(parseRecurrence("every blue moon")).toBeNull();
  });
});

describe("nextOccurrence", () => {
  test("advances due date by interval (not when-done)", () => {
    const t = buildTask({ description: "a", due: "2026-05-01", recurrence: "every 3 days" });
    expect(due(t, "2026-05-10")).toBe("2026-05-04"); // from due, ignores completion
  });

  test("when done advances from completion date", () => {
    const t = buildTask({ description: "a", due: "2026-05-01", recurrence: "every week when done" });
    expect(due(t, "2026-05-10")).toBe("2026-05-17");
  });

  test("monthly clamps end of month", () => {
    const t = buildTask({ description: "a", due: "2026-01-31", recurrence: "every month" });
    expect(due(t, "2026-01-31")).toBe("2026-02-28");
  });

  test("yearly", () => {
    const t = buildTask({ description: "a", due: "2026-03-15", recurrence: "every year" });
    expect(due(t, "2026-03-15")).toBe("2027-03-15");
  });

  test("shifts scheduled and due together preserving the gap", () => {
    const t = buildTask({ description: "a", scheduled: "2026-05-01", due: "2026-05-05", recurrence: "every week" });
    const next = nextOccurrence(t, "2026-05-05")!;
    expect(next.scheduled).toBe("2026-05-08");
    expect(next.due).toBe("2026-05-12");
  });

  test("weekly on a specific weekday lands on that weekday", () => {
    // 2026-05-01 is a Friday; next Monday is 2026-05-04.
    const t = buildTask({ description: "a", due: "2026-05-01", recurrence: "every week on monday" });
    expect(due(t, "2026-05-01")).toBe("2026-05-04");
  });

  test("every weekday skips the weekend", () => {
    // 2026-05-01 Friday → next weekday is Monday 2026-05-04.
    const t = buildTask({ description: "a", due: "2026-05-01", recurrence: "every weekday" });
    expect(due(t, "2026-05-01")).toBe("2026-05-04");
  });

  test("no recurrence or no anchor → null", () => {
    expect(nextOccurrence(buildTask({ description: "a", due: "2026-05-01" }), "2026-05-01")).toBeNull();
    expect(nextOccurrence(buildTask({ description: "a", recurrence: "every day" }), "2026-05-01")).toBeNull();
  });

  test("unparseable rule → null (preserve, don't fabricate)", () => {
    const t = buildTask({ description: "a", due: "2026-05-01", recurrence: "every blue moon" });
    expect(nextOccurrence(t, "2026-05-01")).toBeNull();
  });
});
