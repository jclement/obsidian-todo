import { describe, expect, test } from "bun:test";
import { parseQuickAdd } from "../web/src/lib/quickAddParse.ts";

const NOW = new Date("2026-06-13T12:00:00"); // a Saturday

describe("parseQuickAdd", () => {
  test("plain text", () => {
    const { draft } = parseQuickAdd("buy milk", NOW);
    expect(draft.description).toBe("buy milk");
    expect(draft.due).toBeUndefined();
  });

  test("tomorrow + tag + high priority", () => {
    const { draft } = parseQuickAdd("Fix OData 500 tomorrow #barreleye !!", NOW);
    expect(draft.description).toBe("Fix OData 500 #barreleye");
    expect(draft.due).toBe("2026-06-14");
    expect(draft.priority).toBe("high");
  });

  test("today and ISO date", () => {
    expect(parseQuickAdd("ship it today", NOW).draft.due).toBe("2026-06-13");
    expect(parseQuickAdd("ship it 2026-07-01", NOW).draft.due).toBe("2026-07-01");
  });

  test("in N days / weeks", () => {
    expect(parseQuickAdd("review in 3 days", NOW).draft.due).toBe("2026-06-16");
    expect(parseQuickAdd("review in 2 weeks", NOW).draft.due).toBe("2026-06-27");
  });

  test("weekday resolves to the next one", () => {
    // 2026-06-13 is Saturday; next Monday is 2026-06-15
    expect(parseQuickAdd("standup monday", NOW).draft.due).toBe("2026-06-15");
    expect(parseQuickAdd("call next friday", NOW).draft.due).toBe("2026-06-19");
  });

  test("emoji priority", () => {
    expect(parseQuickAdd("urgent thing 🔺", NOW).draft.priority).toBe("highest");
  });

  test("recurrence", () => {
    const { draft } = parseQuickAdd("water plants every 3 days", NOW);
    expect(draft.recurrence).toBe("every 3 days");
    expect(draft.description).toBe("water plants");
  });

  test("target note after >", () => {
    const { draft } = parseQuickAdd("Draft proposal tomorrow > Barreleye", NOW);
    expect(draft.target_note).toBe("Barreleye");
    expect(draft.due).toBe("2026-06-14");
    expect(draft.description).toBe("Draft proposal");
  });

  test("tags stay in the description and surface as chips", () => {
    const { draft, chips } = parseQuickAdd("plan #product #q3", NOW);
    expect(draft.description).toBe("plan #product #q3");
    expect(chips.filter((c) => c.kind === "tag").map((c) => c.label)).toEqual(["#product", "#q3"]);
  });
});
