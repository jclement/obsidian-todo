import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { admin } from "../../adminApi";
import { toast } from "../../toast";
import { Card, btnGhost, btnGhostStyle, btnPrimary, btnPrimaryStyle } from "./ui";

const STATE_COLOR: Record<string, string> = {
  running: "var(--color-green)",
  starting: "var(--color-amber)",
  stopped: "var(--color-text-3)",
  crashed: "var(--color-red)",
  disabled: "var(--color-text-3)",
};

export function SyncView() {
  const qc = useQueryClient();
  const { data: status } = useQuery({ queryKey: ["admin", "sync"], queryFn: admin.sync, refetchInterval: 3000 });
  const act = useMutation({
    mutationFn: (a: "start" | "stop") => admin.syncAction(a),
    onSuccess: (s) => { qc.setQueryData(["admin", "sync"], s); },
    onError: (e) => toast(e instanceof Error ? e.message : "Failed", "error"),
  });

  const state = status?.state ?? "…";

  return (
    <div className="space-y-4">
      <Card title="Obsidian Sync (headless)">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full" style={{ background: STATE_COLOR[state] ?? "var(--color-text-3)" }} />
            <span className="text-sm font-medium capitalize">{state}</span>
            {status?.restartAttempts ? <span className="text-xs" style={{ color: "var(--color-text-3)" }}>· {status.restartAttempts} restarts</span> : null}
          </div>
          <div className="flex gap-2">
            <button className={btnPrimary} style={btnPrimaryStyle} onClick={() => act.mutate("start")}>Start</button>
            <button className={btnGhost} style={btnGhostStyle} onClick={() => act.mutate("stop")}>Stop</button>
          </div>
        </div>
        {status?.lastError && <p className="mt-2 text-xs" style={{ color: "var(--color-red)" }}>{status.lastError}</p>}
      </Card>

      {status?.log?.length ? (
        <Card title="Log">
          <pre className="max-h-80 overflow-auto rounded-md p-3 text-xs leading-relaxed" style={{ background: "var(--color-bg)", color: "var(--color-text-2)" }}>
            {status.log.slice(-100).join("\n")}
          </pre>
        </Card>
      ) : null}
    </div>
  );
}
