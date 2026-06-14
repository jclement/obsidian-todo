import type { QueryClient } from "@tanstack/react-query";

/**
 * Live sync: connect to the server WebSocket and, on any "tasks_changed"
 * broadcast (from this client, another device, an MCP agent, or an Obsidian/sync
 * edit), invalidate the task queries so every view refetches. Reconnects with
 * backoff. This is the "reads = push" half of the model.
 */
export function connectLiveSync(qc: QueryClient): () => void {
  let ws: WebSocket | null = null;
  let closed = false;
  let backoff = 1000;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["tags"] });
    qc.invalidateQueries({ queryKey: ["counts"] });
    qc.invalidateQueries({ queryKey: ["conflicts"] });
  };

  const connect = () => {
    if (closed) return;
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${proto}//${location.host}/api/ws`);
    ws.onopen = () => {
      backoff = 1000;
      window.dispatchEvent(new CustomEvent("live:status", { detail: "connected" }));
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "tasks_changed") invalidate();
      } catch {}
    };
    ws.onclose = () => {
      window.dispatchEvent(new CustomEvent("live:status", { detail: "reconnecting" }));
      if (!closed) {
        setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 15000);
      }
    };
    ws.onerror = () => ws?.close();
  };

  connect();
  return () => {
    closed = true;
    ws?.close();
  };
}
