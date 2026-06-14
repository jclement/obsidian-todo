import type { Bootstrap, Counts, Project, Settings, TagSummary, Task, TaskDraft } from "./types";

/** A 409 carries the note's fresh task list so callers can soft-refresh. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public payload: any,
  ) {
    super(payload?.message ?? `HTTP ${status}`);
  }
  get isConflict() {
    return this.status === 409;
  }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers: {
      "x-obtodo-csrf": "1",
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    window.location.href = "/login?returnTo=" + encodeURIComponent(location.pathname + location.search);
    throw new ApiError(401, { message: "unauthorized" });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export interface Locator {
  path: string;
  line: number;
  expected_hash?: string;
}

function loc(t: { path: string; line: number; file_hash?: string }): Locator {
  return { path: t.path, line: t.line, expected_hash: t.file_hash };
}

export const api = {
  bootstrap: () => req<Bootstrap>("GET", "/bootstrap"),
  me: () => req<{ display_name: string }>("GET", "/me"),
  counts: () => req<Counts>("GET", "/counts"),

  tasks: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return req<{ tasks: Task[] }>("GET", "/tasks" + (qs ? "?" + qs : "")).then((r) => r.tasks);
  },
  projects: () => req<{ projects: Project[] }>("GET", "/projects").then((r) => r.projects),
  tags: () => req<{ tags: TagSummary[] }>("GET", "/tags").then((r) => r.tags),
  notes: () => req<{ notes: { path: string; note: string }[] }>("GET", "/notes").then((r) => r.notes),
  noteTasks: (path: string) => req<{ tasks: Task[] }>("GET", "/notes/tasks?path=" + encodeURIComponent(path)).then((r) => r.tasks),

  add: (draft: TaskDraft) => req<{ task: Task }>("POST", "/tasks", draft).then((r) => r.task),
  addMany: (drafts: TaskDraft[]) => req<{ tasks: Task[] }>("POST", "/tasks", { drafts }).then((r) => r.tasks),
  update: (t: Task, changes: Partial<Record<string, unknown>>) =>
    req<{ tasks: Task[] }>("PATCH", "/tasks", { ...loc(t), changes }).then((r) => r.tasks),
  complete: (t: Task) => req<{ tasks: Task[] }>("POST", "/tasks/complete", loc(t)).then((r) => r.tasks),
  uncomplete: (t: Task) => req<{ tasks: Task[] }>("POST", "/tasks/uncomplete", loc(t)).then((r) => r.tasks),
  cancel: (t: Task) => req<{ tasks: Task[] }>("POST", "/tasks/cancel", loc(t)).then((r) => r.tasks),
  remove: (t: Task) => req<{ ok: true }>("DELETE", "/tasks", loc(t)),

  settings: () => req<Settings>("GET", "/settings"),
  saveSettings: (patch: Partial<Settings> & { openaiKey?: string; ntfyToken?: string }) =>
    req<Settings>("PUT", "/settings", patch),

  aiParse: (text: string) => req<{ drafts: TaskDraft[] }>("POST", "/ai/parse", { text }).then((r) => r.drafts),
  aiCapture: (text: string) => req<{ tasks: Task[] }>("POST", "/ai/capture", { text }).then((r) => r.tasks),
  transcribe: async (audio: Blob): Promise<string> => {
    const form = new FormData();
    form.append("audio", audio, "dictation.webm");
    const res = await fetch("/api/ai/transcribe", { method: "POST", credentials: "same-origin", headers: { "x-obtodo-csrf": "1" }, body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, data);
    return (data as { text: string }).text;
  },
  reindex: () => req<{ ok: true }>("POST", "/reindex", {}),
};
