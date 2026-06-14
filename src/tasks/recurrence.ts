/**
 * Recurrence engine for Obsidian Tasks rules.
 *
 * Supports the rules that actually occur in practice:
 *   every [N] day(s) | week(s) | month(s) | year(s)
 *   every weekday                       (Mon–Fri)
 *   every [N] week(s) on <weekday[,…]>
 *   every [N] month(s) on the <ordinal|last> [weekday]
 *   … with an optional trailing "when done".
 *
 * "when done" computes the next instance from the completion date; otherwise it
 * advances from the task's reference date (due ▸ scheduled ▸ start). All present
 * date fields shift by the same delta so a task with both scheduled and due
 * keeps their gap. Rules we can't parse return null — the caller then preserves
 * the recurrence text but does not fabricate a next date.
 */

import type { ParsedTask } from "./types.ts";

const DOW: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

type Unit = "day" | "week" | "month" | "year" | "weekday";

interface Rule {
  unit: Unit;
  interval: number;
  weekdays?: number[]; // for weekly "on <day,…>"
  monthOrdinal?: number | "last"; // for monthly "on the Nth/last"
  monthWeekday?: number; // for monthly "on the Nth <weekday>"
  whenDone: boolean;
}

function ymd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fromYmd(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000);
}

/** Add months with end-of-month clamping (Jan 31 + 1mo → Feb 28/29). */
function addMonths(d: Date, n: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  const day = d.getUTCDate();
  const targetY = y + Math.floor(m / 12);
  const targetM = ((m % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetY, targetM + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetY, targetM, Math.min(day, lastDay)));
}

function addYears(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear() + n, d.getUTCMonth(), d.getUTCDate()));
}

const dayDiff = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 86400000);

/** Parse a recurrence rule string into structure, or null if unrecognised. */
export function parseRecurrence(input: string): Rule | null {
  let text = input.toLowerCase().trim();
  const whenDone = /\bwhen done\b/.test(text);
  text = text.replace(/\bwhen done\b/, "").trim();
  if (!text.startsWith("every")) return null;
  text = text.slice("every".length).trim();

  if (/^weekdays?$/.test(text)) return { unit: "weekday", interval: 1, whenDone };

  const intMatch = /^(\d+)\s+/.exec(text);
  const interval = intMatch ? parseInt(intMatch[1]!, 10) : 1;
  if (intMatch) text = text.slice(intMatch[0].length);

  // unit keyword
  const unitMatch = /^(day|days|week|weeks|month|months|year|years)\b/.exec(text);
  if (!unitMatch) {
    // bare weekday(s): "every monday" / "every monday, friday"
    const days = parseWeekdayList(text);
    if (days) return { unit: "week", interval, weekdays: days, whenDone };
    return null;
  }
  const unit = unitMatch[1]!.replace(/s$/, "") as Unit;
  let rest = text.slice(unitMatch[0].length).trim();

  if (unit === "week" && rest.startsWith("on ")) {
    const days = parseWeekdayList(rest.slice(3));
    if (!days) return null;
    return { unit, interval, weekdays: days, whenDone };
  }

  if (unit === "month" && rest.startsWith("on the ")) {
    rest = rest.slice("on the ".length).trim();
    if (rest.startsWith("last")) {
      const wd = parseWeekdayList(rest.slice(4).trim());
      return { unit, interval, monthOrdinal: "last", monthWeekday: wd?.[0], whenDone };
    }
    const ord = /^(\d+)(st|nd|rd|th)?/.exec(rest);
    if (!ord) return null;
    const wd = parseWeekdayList(rest.slice(ord[0].length).trim());
    return { unit, interval, monthOrdinal: parseInt(ord[1]!, 10), monthWeekday: wd?.[0], whenDone };
  }

  return { unit, interval, whenDone };
}

function parseWeekdayList(text: string): number[] | null {
  const parts = text.split(/[,\s]+/).map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  const days: number[] = [];
  for (const p of parts) {
    const d = DOW[p];
    if (d === undefined) return null;
    days.push(d);
  }
  return [...new Set(days)].sort((a, b) => a - b);
}

/** Next single date strictly after `from`, per the rule. */
function advance(from: Date, rule: Rule): Date {
  switch (rule.unit) {
    case "day":
      return addDays(from, rule.interval);
    case "year":
      return addYears(from, rule.interval);
    case "weekday": {
      let d = addDays(from, 1);
      while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d = addDays(d, 1);
      return d;
    }
    case "week": {
      if (rule.weekdays && rule.weekdays.length) {
        // next listed weekday after `from`; if none remain this week, jump
        // `interval` weeks and take the first listed weekday.
        for (let i = 1; i <= 7; i++) {
          const d = addDays(from, i);
          if (rule.weekdays.includes(d.getUTCDay())) return d;
        }
      }
      return addDays(from, 7 * rule.interval);
    }
    case "month": {
      if (rule.monthOrdinal !== undefined) {
        const base = addMonths(from, rule.interval);
        return nthWeekdayOfMonth(base, rule.monthOrdinal, rule.monthWeekday);
      }
      return addMonths(from, rule.interval);
    }
  }
}

function nthWeekdayOfMonth(monthAnchor: Date, ordinal: number | "last", weekday?: number): Date {
  const y = monthAnchor.getUTCFullYear();
  const m = monthAnchor.getUTCMonth();
  if (weekday === undefined) {
    // "on the Nth" with no weekday = Nth day of the month.
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const day = ordinal === "last" ? lastDay : Math.min(ordinal, lastDay);
    return new Date(Date.UTC(y, m, day));
  }
  if (ordinal === "last") {
    let d = new Date(Date.UTC(y, m + 1, 0));
    while (d.getUTCDay() !== weekday) d = addDays(d, -1);
    return d;
  }
  let d = new Date(Date.UTC(y, m, 1));
  let count = 0;
  while (true) {
    if (d.getUTCDay() === weekday) {
      count++;
      if (count === ordinal) return d;
    }
    d = addDays(d, 1);
    if (d.getUTCMonth() !== m) return new Date(Date.UTC(y, m + 1, 0)); // overflow guard
  }
}

export interface NextOccurrence {
  created?: string;
  start?: string;
  scheduled?: string;
  due?: string;
}

/**
 * Compute the next occurrence's date fields when completing `task` on
 * `completionYmd`. Returns null if the task has no recurrence, no anchor date,
 * or an unparseable rule.
 */
export function nextOccurrence(task: ParsedTask, completionYmd: string): NextOccurrence | null {
  if (!task.recurrence) return null;
  const rule = parseRecurrence(task.recurrence);
  if (!rule) return null;

  const anchorStr = task.due ?? task.scheduled ?? task.start;
  if (!anchorStr) return null;
  const anchor = fromYmd(anchorStr);
  if (!anchor) return null;

  const base = rule.whenDone ? fromYmd(completionYmd) ?? anchor : anchor;
  const nextPrimary = advance(base, rule);
  const delta = dayDiff(nextPrimary, anchor);

  const shift = (s?: string): string | undefined => {
    if (!s) return undefined;
    const d = fromYmd(s);
    return d ? ymd(addDays(d, delta)) : undefined;
  };

  // Carry start/scheduled/due (shifted); a recurring instance starts fresh, so
  // created/done/cancelled are dropped by the caller.
  return {
    start: shift(task.start),
    scheduled: shift(task.scheduled),
    due: shift(task.due),
  };
}
