import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { admin, ago } from "../../adminApi";
import { Card, Table, muted } from "./ui";

export function ConnectionsView() {
  const qc = useQueryClient();
  const { data: connections } = useQuery({ queryKey: ["admin", "connections"], queryFn: admin.connections });
  const revoke = useMutation({ mutationFn: admin.revokeConnection, onSuccess: (c) => qc.setQueryData(["admin", "connections"], c) });

  return (
    <Card title="Connected apps (OAuth)">
      <p className="mb-3 text-xs" style={{ color: "var(--color-text-3)" }}>Apps you've authorized over OAuth (e.g. Claude). Revoking ends their access.</p>
      <Table head={["App", "Connected", "Last used", ""]}>
        {(connections ?? []).map((c) => (
          <tr key={c.client_id} className="border-b" style={{ borderColor: "var(--color-border)" }}>
            <td className="py-2 pr-4">{c.client_name || c.client_id}</td>
            <td className="py-2 pr-4">{muted(ago(c.created_at))}</td>
            <td className="py-2 pr-4">{muted(ago(c.last_used_at))}</td>
            <td className="py-2 text-right"><button onClick={() => confirm(`Revoke ${c.client_name || c.client_id}?`) && revoke.mutate(c.client_id)} style={{ color: "var(--color-red)" }} className="text-sm hover:underline">Revoke</button></td>
          </tr>
        ))}
      </Table>
      {!connections?.length && <p className="text-sm" style={{ color: "var(--color-text-3)" }}>No connected apps.</p>}
    </Card>
  );
}
