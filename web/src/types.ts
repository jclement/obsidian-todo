export type TaskStatus = "todo" | "done" | "in_progress" | "cancelled" | "other";
export type Priority = "highest" | "high" | "medium" | "normal" | "low" | "lowest";

export interface Task {
  id: number;
  path: string;
  line: number;
  file_hash: string;
  status: TaskStatus;
  description: string;
  priority: Priority;
  due: string | null;
  scheduled: string | null;
  start: string | null;
  created: string | null;
  done: string | null;
  cancelled: string | null;
  recurrence: string | null;
  reminder: string | null;
  tags: string[];
  task_id: string | null;
  depends_on: string[];
  source_note: string;
  indent: number;
  parent_line: number | null;
}

export interface Project {
  note: string;
  path: string;
  open_count: number;
  total_count: number;
  next_due: string | null;
}

export interface TagSummary {
  tag: string;
  count: number;
}

export interface Counts {
  today: number;
  upcoming: number;
  inbox: number;
  total_open: number;
}

export interface Settings {
  globalFilter: string;
  inboxNote: string;
  excludedFolders: string[];
  ntfyUrl: string;
  ntfyTopic: string;
  ntfyConfigured: boolean;
  ntfyTokenSet: boolean;
  openaiConfigured: boolean;
  openaiModel: string;
  notifyHour: number;
  notifyEnabled: boolean;
  syncMode: "obsidian" | "external" | "none";
  onboarded: boolean;
}

export interface Bootstrap {
  settings: Settings;
  counts: Counts;
  conflicts: string[];
  vaultName: string;
  sync: { state: string; desired: boolean } | null;
}

export interface TaskDraft {
  description: string;
  due?: string;
  scheduled?: string;
  start?: string;
  priority?: Priority;
  recurrence?: string;
  tags?: string[];
  target_note?: string;
}
