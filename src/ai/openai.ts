/**
 * Optional AI features, gated on a user-supplied OpenAI key (stored in settings,
 * never shipped to the browser). Two capabilities:
 *   - parseTextToTasks: a block of text → structured task additions.
 *   - transcribeAudio: dictated audio → text (Whisper), fed back through parse.
 */

import type { AppSettings } from "../settings.ts";
import type { Priority } from "../tasks/types.ts";
import { todayYmd } from "../tasks/dates.ts";

export class AiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface ParsedTaskDraft {
  description: string;
  due?: string;
  scheduled?: string;
  start?: string;
  priority?: Priority;
  recurrence?: string;
  tags?: string[];
  target_note?: string;
}

const PRIORITIES: Priority[] = ["highest", "high", "medium", "normal", "low", "lowest"];

function systemPrompt(today: string, notes: string[]): string {
  const noteList = notes.length ? `\nKnown project notes the user may target: ${notes.slice(0, 80).join(", ")}.` : "";
  return [
    "You turn natural-language text into concrete to-do tasks. Be GENEROUS and eager: the user is brain-dumping things they want to get done, so lean toward producing tasks.",
    "Treat imperatives, reminders, intentions, wishes, questions-to-self, and even terse fragments as tasks. 'call dentist', 'milk', 'follow up with Dana', 'the roof is leaking' should all become tasks (e.g. 'Fix the leaking roof'). Rephrase fragments into short imperative task text.",
    "Only return an empty task list if the text genuinely contains NO actionable intent at all (e.g. pure greetings, gibberish, or an empty/garbled dictation). When in doubt, create a task.",
    `Today is ${today}. Resolve all relative dates (\"tomorrow\", \"next Friday\", \"in 3 days\") to absolute YYYY-MM-DD.`,
    "Return STRICT JSON: {\"confidence\": 0.0-1.0, \"tasks\":[{...}]}.",
    "confidence = how sure you are the input contains actionable intent. Any reasonable task or fragment → 0.7+. Use below 0.4 ONLY for clearly non-task input (greetings, gibberish, unintelligible dictation).",
    "Each task object may have:",
    "  description (string, required) — short imperative task text, WITHOUT a leading checkbox or #task tag.",
    "  due (YYYY-MM-DD), scheduled (YYYY-MM-DD), start (YYYY-MM-DD) — optional.",
    "  priority — one of: highest, high, medium, normal, low, lowest. Map 'urgent'/'asap'→high or highest.",
    "  recurrence — an Obsidian Tasks rule like 'every week', 'every 3 days', 'every month' if the text implies repetition.",
    "  tags — array of bare tag words (no #) the text implies, e.g. ['engineering'].",
    "  target_note — a note basename from the known list if the text clearly belongs to a project; otherwise omit.",
    "Split distinct action items into separate tasks. Don't fabricate specific dates or priorities that aren't implied, but DO infer a sensible imperative description.",
    noteList,
  ].join("\n");
}

export interface ParseResult {
  drafts: ParsedTaskDraft[];
  /** 0..1 — the model's confidence the input describes real tasks. */
  confidence: number;
}

export async function parseTextToTasks(
  settings: AppSettings,
  text: string,
  opts: { notes?: string[]; now?: Date } = {},
): Promise<ParseResult> {
  if (!settings.openaiKey) throw new AiError("NO_KEY", "OpenAI API key is not configured. Add it in Settings.");
  const today = todayYmd(opts.now ?? new Date());

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${settings.openaiKey}` },
    body: JSON.stringify({
      model: settings.openaiModel || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt(today, opts.notes ?? []) },
        { role: "user", content: text },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new AiError("OPENAI_ERROR", `OpenAI request failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content ?? "{}";
  const drafts = normalizeDrafts(content);
  let confidence = 0.5;
  try {
    const c = (JSON.parse(content) as { confidence?: unknown }).confidence;
    if (typeof c === "number" && isFinite(c)) confidence = Math.max(0, Math.min(1, c));
    else confidence = drafts.length ? 0.7 : 0.1;
  } catch {
    confidence = drafts.length ? 0.7 : 0.1;
  }
  return { drafts, confidence };
}

export function normalizeDrafts(content: string): ParsedTaskDraft[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new AiError("BAD_OUTPUT", "AI returned non-JSON output.");
  }
  const arr = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { tasks?: unknown }).tasks)
      ? (parsed as { tasks: unknown[] }).tasks
      : [];
  const out: ParsedTaskDraft[] = [];
  for (const raw of arr) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const description = typeof o.description === "string" ? o.description.trim() : "";
    if (!description) continue;
    const draft: ParsedTaskDraft = { description };
    if (isYmd(o.due)) draft.due = o.due as string;
    if (isYmd(o.scheduled)) draft.scheduled = o.scheduled as string;
    if (isYmd(o.start)) draft.start = o.start as string;
    if (typeof o.priority === "string" && PRIORITIES.includes(o.priority as Priority)) draft.priority = o.priority as Priority;
    if (typeof o.recurrence === "string" && o.recurrence.trim()) draft.recurrence = o.recurrence.trim();
    if (Array.isArray(o.tags)) draft.tags = o.tags.map((t) => String(t).replace(/^#/, "")).filter(Boolean);
    if (typeof o.target_note === "string" && o.target_note.trim()) draft.target_note = o.target_note.trim();
    out.push(draft);
  }
  return out;
}

function isYmd(v: unknown): boolean {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/** Whisper transcription. Accepts the raw audio bytes + a filename hint. */
export async function transcribeAudio(settings: AppSettings, audio: Blob, filename = "audio.webm"): Promise<string> {
  if (!settings.openaiKey) throw new AiError("NO_KEY", "OpenAI API key is not configured. Add it in Settings.");
  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", "whisper-1");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { authorization: `Bearer ${settings.openaiKey}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new AiError("OPENAI_ERROR", `Whisper request failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { text?: string };
  return (data.text ?? "").trim();
}
