/**
 * Read the Obsidian Tasks plugin's own configuration from the vault, so we can
 * import the user's global filter and custom statuses instead of asking them to
 * re-enter everything. Requires `.obsidian/plugins/obsidian-tasks-plugin/data.json`
 * to be present (synced via Obsidian Sync `--configs` or Syncthing).
 */

import type { VaultStore } from "./store.ts";
import type { StatusDef, StatusType } from "../settings.ts";

const CONFIG_PATH = ".obsidian/plugins/obsidian-tasks-plugin/data.json";
const VALID: StatusType[] = ["TODO", "DONE", "IN_PROGRESS", "CANCELLED", "NON_TASK"];

export interface TasksPluginConfig {
  available: boolean;
  globalFilter?: string;
  statuses?: StatusDef[];
}

interface RawStatus {
  symbol?: unknown;
  name?: unknown;
  type?: unknown;
}

export async function readTasksPluginConfig(store: VaultStore): Promise<TasksPluginConfig> {
  if (!store.exists(CONFIG_PATH)) return { available: false };
  let data: Record<string, unknown>;
  try {
    data = JSON.parse((await store.readText(CONFIG_PATH)).text) as Record<string, unknown>;
  } catch {
    return { available: false };
  }

  const globalFilter =
    typeof data.globalFilter === "string" && data.globalFilter.trim() ? data.globalFilter.trim() : undefined;

  const ss = data.statusSettings as { coreStatuses?: RawStatus[]; customStatuses?: RawStatus[] } | undefined;
  const raw = [...(ss?.coreStatuses ?? []), ...(ss?.customStatuses ?? [])];
  const statuses: StatusDef[] = [];
  const seen = new Set<string>();
  for (const s of raw) {
    const symbol = typeof s.symbol === "string" && s.symbol.length >= 1 ? s.symbol[0]! : null;
    const type = typeof s.type === "string" && VALID.includes(s.type as StatusType) ? (s.type as StatusType) : null;
    if (!symbol || !type || seen.has(symbol)) continue; // skip EMPTY/dupes
    seen.add(symbol);
    statuses.push({ symbol, name: typeof s.name === "string" && s.name ? s.name : symbol, type });
  }

  return { available: true, globalFilter, statuses: statuses.length ? statuses : undefined };
}
