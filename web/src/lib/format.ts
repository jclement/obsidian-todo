import type { Priority } from "../types";

export function todayStr(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export type DueClass = "overdue" | "today" | "soon" | "future" | "none";

export function dueClass(due: string | null, now = new Date()): DueClass {
  if (!due) return "none";
  const t = todayStr(now);
  if (due < t) return "overdue";
  if (due === t) return "today";
  const soon = todayStr(new Date(now.getTime() + 2 * 86400000));
  if (due <= soon) return "soon";
  return "future";
}

/** Human chip label for a date relative to today. */
export function dueLabel(due: string, now = new Date()): string {
  const t = todayStr(now);
  if (due === t) return "Today";
  const yest = todayStr(new Date(now.getTime() - 86400000));
  const tom = todayStr(new Date(now.getTime() + 86400000));
  if (due === yest) return "Yesterday";
  if (due === tom) return "Tomorrow";
  const d = new Date(due + "T00:00:00");
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

export const PRIORITY_META: Record<Priority, { glyph: string; label: string; color: string } | null> = {
  highest: { glyph: "🔺", label: "Highest", color: "var(--color-red)" },
  high: { glyph: "⏫", label: "High", color: "var(--color-amber)" },
  medium: { glyph: "🔼", label: "Medium", color: "var(--color-blue)" },
  normal: null,
  low: { glyph: "🔽", label: "Low", color: "var(--color-text-3)" },
  lowest: { glyph: "⏬", label: "Lowest", color: "var(--color-text-3)" },
};

/** Strip inline #tags and the global filter from display text. */
export function descWithoutTags(desc: string): string {
  return desc.replace(/#[A-Za-z0-9_/-]*[A-Za-z_/-][A-Za-z0-9_/-]*/g, "").replace(/\s+/g, " ").trim();
}

export function extractTags(desc: string): string[] {
  return [...desc.matchAll(/#([A-Za-z0-9_/-]*[A-Za-z_/-][A-Za-z0-9_/-]*)/g)].map((m) => m[1]!);
}

/** obsidian:// deep link to open the note. */
export function obsidianUrl(vaultName: string, path: string): string {
  return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(path.replace(/\.md$/, ""))}`;
}
