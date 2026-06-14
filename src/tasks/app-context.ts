/**
 * The task subsystem's process-wide handle: the index DB, vault store, indexer,
 * write service, the live settings cache, and the WebSocket hub. Built once at
 * boot and shared by the HTTP API, the MCP tools, and the notification
 * scheduler.
 */

import type { Database } from "bun:sqlite";
import type { VaultStore } from "../vault/store.ts";
import type { Snapshotter } from "../snapshots/snapshotter.ts";
import { Indexer } from "../index/indexer.ts";
import { TaskService } from "./service.ts";
import { loadSettings, saveSettings, type AppSettings } from "../settings.ts";
import { WsHub } from "../web/ws.ts";

export interface TaskAppContext {
  db: Database;
  store: VaultStore;
  indexer: Indexer;
  service: TaskService;
  snapshotter: Snapshotter;
  hub: WsHub;
  getSettings(): AppSettings;
  updateSettings(patch: Partial<AppSettings>): AppSettings;
  now(): Date;
}

export function createTaskContext(args: {
  db: Database;
  store: VaultStore;
  snapshotter: Snapshotter;
  now?: () => Date;
}): TaskAppContext {
  const { db, store, snapshotter } = args;
  const now = args.now ?? (() => new Date());

  let settings = loadSettings(db);
  const getSettings = () => settings;

  const hub = new WsHub();
  const indexer = new Indexer(db, store, getSettings);
  const service = new TaskService(db, store, snapshotter, indexer, getSettings, now);

  // Every reindex (UI/MCP write OR external Obsidian/sync edit) → broadcast.
  indexer.subscribe(({ paths, conflicts }) => {
    hub.broadcast({ type: "tasks_changed", paths, conflicts });
  });

  const updateSettings = (patch: Partial<AppSettings>) => {
    const prevFilter = settings.globalFilter;
    const prevExcludes = JSON.stringify(settings.excludedFolders);
    settings = saveSettings(db, patch);
    // A changed gate or exclude set means the whole index must be rebuilt.
    if (settings.globalFilter !== prevFilter || JSON.stringify(settings.excludedFolders) !== prevExcludes) {
      db.exec("DELETE FROM files"); // cascades to tasks
      void indexer.sweep();
    }
    return settings;
  };

  return { db, store, indexer, service, snapshotter, hub, getSettings, updateSettings, now };
}
