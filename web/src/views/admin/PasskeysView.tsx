import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { admin, ago } from "../../adminApi";
import { toast } from "../../toast";
import { Card, Table, btnGhost, btnGhostStyle, btnPrimary, btnPrimaryStyle, input, inputStyle, muted } from "./ui";

export function PasskeysView() {
  const qc = useQueryClient();
  const { data: passkeys } = useQuery({ queryKey: ["admin", "passkeys"], queryFn: admin.passkeys });
  const [name, setName] = useState("");

  const set = (p: any) => qc.setQueryData(["admin", "passkeys"], p);
  const add = useMutation({
    mutationFn: () => admin.addPasskey(name.trim() || "New passkey"),
    onSuccess: (p) => { set(p); setName(""); toast("Passkey added", "success"); },
    onError: (e) => toast(e instanceof Error ? e.message : "Failed", "error"),
  });
  const del = useMutation({ mutationFn: admin.deletePasskey, onSuccess: set, onError: (e) => toast(String(e), "error") });
  const clearOthers = useMutation({ mutationFn: admin.clearOtherSessions, onSuccess: () => toast("Other sessions signed out", "success") });

  return (
    <div className="space-y-4">
      <Card title="Registered passkeys">
        <Table head={["Name", "Type", "Created", "Last used", ""]}>
          {(passkeys ?? []).map((p) => (
            <tr key={p.id} className="border-b" style={{ borderColor: "var(--color-border)" }}>
              <td className="py-2 pr-4">{p.name}</td>
              <td className="py-2 pr-4">{muted(p.device_type === "multiDevice" ? "synced" : "device-bound")}</td>
              <td className="py-2 pr-4">{muted(ago(p.created_at))}</td>
              <td className="py-2 pr-4">{muted(ago(p.last_used_at))}</td>
              <td className="py-2 text-right">
                {(passkeys?.length ?? 0) > 1 ? (
                  <button onClick={() => confirm(`Delete '${p.name}'?`) && del.mutate(p.id)} style={{ color: "var(--color-red)" }} className="text-sm hover:underline">Delete</button>
                ) : muted("last one")}
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card title="Add a passkey">
        <div className="flex gap-2">
          <input className={input + " flex-1"} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. iPhone" />
          <button className={btnPrimary} style={btnPrimaryStyle} disabled={add.isPending} onClick={() => add.mutate()}>
            {add.isPending ? "Waiting…" : "Add passkey"}
          </button>
        </div>
      </Card>

      <Card title="Sessions">
        <button className={btnGhost} style={btnGhostStyle} onClick={() => clearOthers.mutate()}>Sign out all other sessions</button>
      </Card>
    </div>
  );
}
