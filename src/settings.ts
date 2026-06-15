/**
 * App settings — everything is configurable from the UI (no env editing needed
 * to run). Backed by the key/value `settings` table. This module owns the
 * typed shape, the defaults, and validation.
 */

import type { Database } from "bun:sqlite";
import { getSetting, setSetting } from "./db/index.ts";
import type { TaskStatus } from "./tasks/types.ts";

export type StatusType = "TODO" | "DONE" | "IN_PROGRESS" | "CANCELLED" | "NON_TASK";

/** A custom checkbox status, à la the Obsidian Tasks plugin. */
export interface StatusDef {
  symbol: string; // the single char inside [ ]
  name: string;
  type: StatusType;
}

export const DEFAULT_STATUSES: StatusDef[] = [
  { symbol: " ", name: "Unchecked", type: "TODO" },
  { symbol: "x", name: "Checked", type: "DONE" },
  { symbol: "X", name: "Checked", type: "DONE" },
  { symbol: "/", name: "In progress", type: "IN_PROGRESS" },
  { symbol: "-", name: "Dropped", type: "CANCELLED" },
  { symbol: "!", name: "Important", type: "TODO" },
  { symbol: "?", name: "Question", type: "TODO" },
  { symbol: "W", name: "Waiting", type: "IN_PROGRESS" },
];

const STATUS_TYPE_TO_ENUM: Record<StatusType, TaskStatus> = {
  TODO: "todo",
  DONE: "done",
  IN_PROGRESS: "in_progress",
  CANCELLED: "cancelled",
  NON_TASK: "other",
};

/** Classify a raw checkbox char into our status enum using the configured set. */
export function classifyStatus(char: string, statuses: StatusDef[]): TaskStatus {
  const def = statuses.find((s) => s.symbol === char);
  if (def) return STATUS_TYPE_TO_ENUM[def.type];
  // Unknown custom char: treat as actionable (open), preserving the char.
  return "other";
}

export interface AppSettings {
  /** Global-filter tag that gates managed tasks. */
  globalFilter: string;
  /** Note that capture (quick-add, MCP add_task) appends to by default. */
  inboxNote: string;
  /** Vault-relative folder prefixes to ignore when indexing. */
  excludedFolders: string[];
  /** If non-empty, ONLY index tasks under these folders (whitelist). */
  includedFolders: string[];
  /** Folders whose notes are indexed but NOT shown as projects (e.g. weekly notes). */
  projectExcludeFolders: string[];
  /** The vault's name in Obsidian, for `obsidian://open` deep links. */
  obsidianVaultName: string;
  /** ntfy base URL, e.g. https://ntfy.sh (empty disables ntfy). */
  ntfyUrl: string;
  /** ntfy topic to publish due/overdue/reminder alerts to. */
  ntfyTopic: string;
  /** Optional ntfy access token (Bearer) for protected topics. */
  ntfyToken: string;
  /** OpenAI API key (enables AI capture + dictation). Stored server-side only. */
  openaiKey: string;
  /** OpenAI model for text→tasks. */
  openaiModel: string;
  /** Hour (0-23, local) the daily due/overdue digest is sent. */
  notifyHour: number;
  /** Whether the notification scheduler is active. */
  notifyEnabled: boolean;
  /** Custom checkbox statuses (symbol → name/type). */
  statuses: StatusDef[];
  /** How the vault is kept in sync — drives whether we warn when `ob` is down. */
  syncMode: "obsidian" | "external" | "none";
  /** Whether the first-run wizard has been completed. */
  onboarded: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  globalFilter: "#task",
  inboxNote: "Inbox.md",
  excludedFolders: ["templates", ".trash", "attachments"],
  includedFolders: [],
  projectExcludeFolders: [],
  obsidianVaultName: "",
  ntfyUrl: "",
  ntfyTopic: "",
  ntfyToken: "",
  openaiKey: "",
  openaiModel: "gpt-4o-mini",
  notifyHour: 8,
  notifyEnabled: false,
  statuses: DEFAULT_STATUSES,
  syncMode: "external",
  onboarded: false,
};

// settings-table keys
const KEY = {
  globalFilter: "global_filter",
  inboxNote: "inbox_note",
  excludedFolders: "excluded_folders",
  includedFolders: "included_folders",
  projectExcludeFolders: "project_exclude_folders",
  obsidianVaultName: "obsidian_vault_name",
  ntfyUrl: "ntfy_url",
  ntfyTopic: "ntfy_topic",
  ntfyToken: "ntfy_token",
  openaiKey: "openai_key",
  openaiModel: "openai_model",
  notifyHour: "notify_hour",
  notifyEnabled: "notify_enabled",
  statuses: "statuses",
  syncMode: "sync_mode",
  onboarded: "onboarded",
} as const;

export function loadSettings(db: Database): AppSettings {
  const s = { ...DEFAULT_SETTINGS };
  const gf = getSetting(db, KEY.globalFilter);
  if (gf) s.globalFilter = gf;
  const inbox = getSetting(db, KEY.inboxNote);
  if (inbox) s.inboxNote = inbox;
  const excl = getSetting(db, KEY.excludedFolders);
  if (excl) {
    try {
      const arr = JSON.parse(excl);
      if (Array.isArray(arr)) s.excludedFolders = arr.map(String);
    } catch {}
  }
  const incl = getSetting(db, KEY.includedFolders);
  if (incl) {
    try {
      const arr = JSON.parse(incl);
      if (Array.isArray(arr)) s.includedFolders = arr.map(String);
    } catch {}
  }
  const projExcl = getSetting(db, KEY.projectExcludeFolders);
  if (projExcl) {
    try {
      const arr = JSON.parse(projExcl);
      if (Array.isArray(arr)) s.projectExcludeFolders = arr.map(String);
    } catch {}
  }
  s.obsidianVaultName = getSetting(db, KEY.obsidianVaultName) ?? s.obsidianVaultName;
  s.ntfyUrl = getSetting(db, KEY.ntfyUrl) ?? s.ntfyUrl;
  s.ntfyTopic = getSetting(db, KEY.ntfyTopic) ?? s.ntfyTopic;
  s.ntfyToken = getSetting(db, KEY.ntfyToken) ?? s.ntfyToken;
  s.openaiKey = getSetting(db, KEY.openaiKey) ?? s.openaiKey;
  s.openaiModel = getSetting(db, KEY.openaiModel) ?? s.openaiModel;
  const hour = getSetting(db, KEY.notifyHour);
  if (hour !== null) s.notifyHour = Math.min(23, Math.max(0, parseInt(hour, 10) || 0));
  s.notifyEnabled = getSetting(db, KEY.notifyEnabled) === "1";
  const statusesRaw = getSetting(db, KEY.statuses);
  if (statusesRaw) {
    try {
      const arr = JSON.parse(statusesRaw);
      if (Array.isArray(arr) && arr.length) {
        s.statuses = arr
          .filter((x) => x && typeof x.symbol === "string" && x.symbol.length >= 1)
          .map((x) => ({ symbol: String(x.symbol)[0]!, name: String(x.name ?? ""), type: x.type as StatusType }));
      }
    } catch {}
  }
  const mode = getSetting(db, KEY.syncMode);
  if (mode === "obsidian" || mode === "external" || mode === "none") s.syncMode = mode;
  s.onboarded = getSetting(db, KEY.onboarded) === "1";
  return s;
}

/** Patch a subset of settings. Returns the full new settings. */
export function saveSettings(db: Database, patch: Partial<AppSettings>): AppSettings {
  if (patch.globalFilter !== undefined) {
    const gf = patch.globalFilter.trim();
    setSetting(db, KEY.globalFilter, gf.startsWith("#") ? gf : `#${gf}`);
  }
  if (patch.inboxNote !== undefined) {
    let inbox = patch.inboxNote.trim() || "Inbox.md";
    if (!/\.md$/i.test(inbox)) inbox += ".md";
    setSetting(db, KEY.inboxNote, inbox);
  }
  if (patch.excludedFolders !== undefined) {
    const arr = patch.excludedFolders.map((f) => f.trim().replace(/^\/+|\/+$/g, "")).filter(Boolean);
    setSetting(db, KEY.excludedFolders, JSON.stringify(arr));
  }
  if (patch.includedFolders !== undefined) {
    const arr = patch.includedFolders.map((f) => f.trim().replace(/^\/+|\/+$/g, "")).filter(Boolean);
    setSetting(db, KEY.includedFolders, JSON.stringify(arr));
  }
  if (patch.projectExcludeFolders !== undefined) {
    const arr = patch.projectExcludeFolders.map((f) => f.trim().replace(/^\/+|\/+$/g, "")).filter(Boolean);
    setSetting(db, KEY.projectExcludeFolders, JSON.stringify(arr));
  }
  if (patch.obsidianVaultName !== undefined) setSetting(db, KEY.obsidianVaultName, patch.obsidianVaultName.trim());
  if (patch.ntfyUrl !== undefined) setSetting(db, KEY.ntfyUrl, patch.ntfyUrl.trim().replace(/\/+$/, ""));
  if (patch.ntfyTopic !== undefined) setSetting(db, KEY.ntfyTopic, patch.ntfyTopic.trim());
  if (patch.ntfyToken !== undefined) setSetting(db, KEY.ntfyToken, patch.ntfyToken.trim());
  if (patch.openaiKey !== undefined) setSetting(db, KEY.openaiKey, patch.openaiKey.trim());
  if (patch.openaiModel !== undefined) setSetting(db, KEY.openaiModel, patch.openaiModel.trim() || "gpt-4o-mini");
  if (patch.notifyHour !== undefined) setSetting(db, KEY.notifyHour, String(Math.min(23, Math.max(0, patch.notifyHour))));
  if (patch.notifyEnabled !== undefined) setSetting(db, KEY.notifyEnabled, patch.notifyEnabled ? "1" : "0");
  if (patch.statuses !== undefined) {
    const valid: StatusType[] = ["TODO", "DONE", "IN_PROGRESS", "CANCELLED", "NON_TASK"];
    const clean = patch.statuses
      .filter((x) => x && typeof x.symbol === "string" && x.symbol.length >= 1 && valid.includes(x.type))
      .map((x) => ({ symbol: x.symbol[0]!, name: x.name?.trim() || x.symbol[0]!, type: x.type }));
    if (clean.length) setSetting(db, KEY.statuses, JSON.stringify(clean));
  }
  if (patch.syncMode !== undefined) setSetting(db, KEY.syncMode, patch.syncMode);
  if (patch.onboarded !== undefined) setSetting(db, KEY.onboarded, patch.onboarded ? "1" : "0");
  return loadSettings(db);
}

/**
 * Settings safe to expose to the browser: secrets are reduced to booleans so
 * the UI can show "configured" without ever shipping the key.
 */
export function publicSettings(s: AppSettings) {
  return {
    globalFilter: s.globalFilter,
    inboxNote: s.inboxNote,
    excludedFolders: s.excludedFolders,
    includedFolders: s.includedFolders,
    projectExcludeFolders: s.projectExcludeFolders,
    obsidianVaultName: s.obsidianVaultName,
    ntfyUrl: s.ntfyUrl,
    ntfyTopic: s.ntfyTopic,
    ntfyConfigured: Boolean(s.ntfyUrl && s.ntfyTopic),
    ntfyTokenSet: Boolean(s.ntfyToken),
    openaiConfigured: Boolean(s.openaiKey),
    openaiModel: s.openaiModel,
    notifyHour: s.notifyHour,
    notifyEnabled: s.notifyEnabled,
    statuses: s.statuses,
    syncMode: s.syncMode,
    onboarded: s.onboarded,
  };
}

export function isExcluded(path: string, excludedFolders: string[]): boolean {
  return excludedFolders.some((f) => path === f || path.startsWith(f + "/"));
}

function underAny(path: string, folders: string[]): boolean {
  return folders.some((f) => path === f || path.startsWith(f + "/"));
}

/**
 * Should this vault path be indexed for tasks?
 * - Always index the configured inbox note (so capture never disappears).
 * - Excluded folders win.
 * - If includedFolders is non-empty, only paths under them are indexed
 *   (whitelist); otherwise everything not excluded is indexed.
 */
export function isIndexable(path: string, s: Pick<AppSettings, "excludedFolders" | "includedFolders" | "inboxNote">): boolean {
  if (path === s.inboxNote) return true;
  if (isExcluded(path, s.excludedFolders)) return false;
  if (s.includedFolders.length === 0) return true;
  return underAny(path, s.includedFolders);
}
