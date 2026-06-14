import type { Priority, TaskDraft } from "../types";

/**
 * Client-side natural-language quick-add. Pure + tested. Recognises dates,
 * priority, recurrence, a target note (after " > "), and leaves #tags inline in
 * the description (tags live in the description in the Tasks format).
 *
 *   Fix OData 500 tomorrow #barreleye !!         → due tomorrow, high priority
 *   Water plants every 3 days                    → recurring
 *   Draft proposal next friday > Barreleye       → due next Fri, added to Barreleye
 */

export interface QuickAddResult {
  draft: TaskDraft;
  chips: { label: string; kind: "due" | "priority" | "recurrence" | "note" | "tag" }[];
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3, thursday: 4, thu: 4, thurs: 4, friday: 5, fri: 5, saturday: 6, sat: 6,
};

const PRIORITY_EMOJI: Record<string, Priority> = {
  "🔺": "highest", "⏫": "high", "🔼": "medium", "🔽": "low", "⏬": "lowest",
};

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function nextWeekday(from: Date, target: number): Date {
  let delta = (target - from.getDay() + 7) % 7;
  if (delta === 0) delta = 7;
  return addDays(from, delta);
}

export function parseQuickAdd(input: string, now: Date = new Date()): QuickAddResult {
  let text = " " + input.trim() + " ";
  const draft: TaskDraft = { description: "" };
  const chips: QuickAddResult["chips"] = [];

  // Target note: anything after " > "
  const gt = text.indexOf(" > ");
  if (gt >= 0) {
    const note = text.slice(gt + 3).trim();
    if (note) {
      draft.target_note = note;
      chips.push({ label: note, kind: "note" });
    }
    text = text.slice(0, gt) + " ";
  }

  // Recurrence: "every <rule>" to end of string.
  const rec = / every ([a-z0-9 ]+?)\s*$/i.exec(text);
  if (rec) {
    draft.recurrence = "every " + rec[1]!.trim();
    chips.push({ label: "🔁 " + draft.recurrence, kind: "recurrence" });
    text = text.slice(0, rec.index) + " ";
  }

  // Priority: emoji, or bang style (!!! highest, !! high, ! medium).
  for (const [emoji, p] of Object.entries(PRIORITY_EMOJI)) {
    if (text.includes(emoji)) {
      draft.priority = p;
      chips.push({ label: emoji, kind: "priority" });
      text = text.replaceAll(emoji, " ");
    }
  }
  if (!draft.priority) {
    const bang = / (!{1,3}) /.exec(text);
    if (bang) {
      const n = bang[1]!.length;
      draft.priority = n === 3 ? "highest" : n === 2 ? "high" : "medium";
      chips.push({ label: "!".repeat(n), kind: "priority" });
      text = text.slice(0, bang.index) + " " + text.slice(bang.index + bang[0].length);
    }
  }

  // Dates (first match wins). Each pattern, if matched, sets due + removes token.
  const setDue = (date: Date, label: string, start: number, end: number) => {
    draft.due = ymd(date);
    chips.push({ label: "📅 " + label, kind: "due" });
    text = text.slice(0, start) + " " + text.slice(end);
  };

  const iso = /\s(\d{4}-\d{2}-\d{2})\s/.exec(text);
  const tod = /\s(today|tod)\s/i.exec(text);
  const tom = /\s(tomorrow|tmr|tom)\s/i.exec(text);
  const inN = /\sin (\d+) (day|days|week|weeks)\s/i.exec(text);
  const nextWk = /\snext week\s/i.exec(text);
  const wd = new RegExp(`\\s(next )?(${Object.keys(WEEKDAYS).join("|")})\\s`, "i").exec(text);

  if (iso) setDue(new Date(iso[1]! + "T00:00:00"), iso[1]!, iso.index, iso.index + iso[0].length - 1);
  else if (tod) setDue(now, "today", tod.index, tod.index + tod[0].length - 1);
  else if (tom) setDue(addDays(now, 1), "tomorrow", tom.index, tom.index + tom[0].length - 1);
  else if (inN) {
    const n = parseInt(inN[1]!, 10) * (/week/i.test(inN[2]!) ? 7 : 1);
    setDue(addDays(now, n), `in ${inN[1]} ${inN[2]}`, inN.index, inN.index + inN[0].length - 1);
  } else if (nextWk) setDue(addDays(now, 7), "next week", nextWk.index, nextWk.index + nextWk[0].length - 1);
  else if (wd) {
    const day = WEEKDAYS[wd[2]!.toLowerCase()]!;
    setDue(nextWeekday(now, day), wd[2]!.toLowerCase(), wd.index, wd.index + wd[0].length - 1);
  }

  // Tags stay in the description; capture them for chips.
  for (const m of text.matchAll(/#([A-Za-z0-9_/-]*[A-Za-z_/-][A-Za-z0-9_/-]*)/g)) {
    chips.push({ label: "#" + m[1], kind: "tag" });
  }

  draft.description = text.replace(/\s+/g, " ").trim();
  return { draft, chips };
}
