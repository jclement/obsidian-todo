/**
 * Live-sync over a single Bun WebSocket. The model is "writes = REST, reads =
 * push": after any reindex (from a UI write, an MCP write, or an Obsidian/sync
 * edit picked up by the watcher) we broadcast a small message and every
 * connected client refetches the affected views. All devices stay in sync.
 *
 * `createBunWebSocket` is a module-level singleton so the route handler (app.tsx)
 * and Bun.serve's `websocket` option (server.ts) share one instance.
 */

import { createBunWebSocket } from "hono/bun";
import type { ServerWebSocket } from "bun";

const bun = createBunWebSocket<ServerWebSocket>();
export const upgradeWebSocket = bun.upgradeWebSocket;
export const websocket = bun.websocket;

export type WsMessage =
  | { type: "tasks_changed"; paths: string[]; conflicts: boolean }
  | { type: "hello"; serverTime: number };

interface Sendable {
  send(data: string): void;
}

export class WsHub {
  private clients = new Set<Sendable>();

  add(client: Sendable) {
    this.clients.add(client);
  }
  remove(client: Sendable) {
    this.clients.delete(client);
  }
  get size() {
    return this.clients.size;
  }

  broadcast(msg: WsMessage) {
    const data = JSON.stringify(msg);
    for (const c of this.clients) {
      try {
        c.send(data);
      } catch {
        this.clients.delete(c);
      }
    }
  }
}
