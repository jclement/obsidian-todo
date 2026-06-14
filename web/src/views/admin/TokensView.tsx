import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { admin, ago } from "../../adminApi";
import { toast } from "../../toast";
import { Card, Table, btnPrimary, btnPrimaryStyle, input, inputStyle, muted } from "./ui";

export function TokensView() {
  const qc = useQueryClient();
  const { data: tokens } = useQuery({ queryKey: ["admin", "tokens"], queryFn: admin.tokens });
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => admin.createToken(name.trim() || "Token"),
    onSuccess: (r) => { qc.setQueryData(["admin", "tokens"], r.tokens); setFresh(r.token); setName(""); },
    onError: (e) => toast(String(e), "error"),
  });
  const revoke = useMutation({ mutationFn: admin.revokeToken, onSuccess: (t) => qc.setQueryData(["admin", "tokens"], t) });

  return (
    <div className="space-y-4">
      <Card title="Create a bearer token" >
        <p className="mb-3 text-xs" style={{ color: "var(--color-text-3)" }}>For MCP clients that use a static token instead of OAuth.</p>
        <div className="flex gap-2">
          <input className={input + " flex-1"} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Claude Code on laptop" />
          <button className={btnPrimary} style={btnPrimaryStyle} onClick={() => create.mutate()}>Create</button>
        </div>
        {fresh && (
          <div className="mt-3 rounded-md border p-3" style={{ borderColor: "var(--color-green)" }}>
            <div className="mb-1 text-xs" style={{ color: "var(--color-green)" }}>Copy now — shown once:</div>
            <code className="block break-all text-xs">{fresh}</code>
            <button className="mt-2 text-xs hover:underline" onClick={() => { navigator.clipboard?.writeText(fresh); toast("Copied", "success"); }}>Copy</button>
          </div>
        )}
      </Card>

      <Card title="Active tokens">
        <Table head={["Name", "Prefix", "Created", "Last used", ""]}>
          {(tokens ?? []).filter((t) => !t.revoked_at).map((t) => (
            <tr key={t.id} className="border-b" style={{ borderColor: "var(--color-border)" }}>
              <td className="py-2 pr-4">{t.name}</td>
              <td className="py-2 pr-4"><code className="text-xs">{t.token_prefix}…</code></td>
              <td className="py-2 pr-4">{muted(ago(t.created_at))}</td>
              <td className="py-2 pr-4">{muted(ago(t.last_used_at))}</td>
              <td className="py-2 text-right"><button onClick={() => confirm(`Revoke '${t.name}'?`) && revoke.mutate(t.id)} style={{ color: "var(--color-red)" }} className="text-sm hover:underline">Revoke</button></td>
            </tr>
          ))}
        </Table>
        {!tokens?.filter((t) => !t.revoked_at).length && <p className="text-sm" style={{ color: "var(--color-text-3)" }}>No active tokens.</p>}
      </Card>
    </div>
  );
}
