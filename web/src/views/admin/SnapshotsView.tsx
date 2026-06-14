import { useMutation, useQuery } from "@tanstack/react-query";
import { admin } from "../../adminApi";
import { toast } from "../../toast";
import { Card, muted } from "./ui";

export function SnapshotsView() {
  const { data: commits } = useQuery({ queryKey: ["admin", "snapshots"], queryFn: () => admin.snapshots() });
  const restore = useMutation({
    mutationFn: ({ sha, path }: { sha: string; path: string }) => admin.restoreSnapshot(sha, path),
    onSuccess: () => toast("Restored", "success"),
    onError: (e) => toast(e instanceof Error ? e.message : "Restore failed", "error"),
  });

  return (
    <Card title="Git snapshots">
      <p className="mb-3 text-xs" style={{ color: "var(--color-text-3)" }}>
        Every change to the vault is committed to a bare git repo outside the vault. To restore a whole file to a past version, pass its path.
      </p>
      <div className="divide-y text-sm">
        {(commits ?? []).map((c) => (
          <div key={c.sha} className="flex items-center gap-3 py-2">
            <code className="w-16 shrink-0 text-xs" style={{ color: "var(--color-text-3)" }}>{c.sha.slice(0, 7)}</code>
            <span className="w-28 shrink-0 text-xs">{muted(new Date(c.date).toLocaleString())}</span>
            <span className="flex-1 truncate">{c.message}</span>
          </div>
        ))}
      </div>
      {!commits?.length && <p className="text-sm" style={{ color: "var(--color-text-3)" }}>No snapshots yet.</p>}
      <p className="mt-3 text-xs" style={{ color: "var(--color-text-3)" }}>
        Tip: for diffs or partial restores, use git directly against the snapshot repo.
      </p>
      {/* restore is wired for programmatic use; kept minimal in the UI */}
      <button className="hidden" onClick={() => restore.mutate({ sha: "", path: "" })} />
    </Card>
  );
}
