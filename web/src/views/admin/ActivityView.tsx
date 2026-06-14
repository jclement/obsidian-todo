import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { admin, ago } from "../../adminApi";
import { Card, muted } from "./ui";
import clsx from "clsx";

const SOURCES = [
  { key: "", label: "All" },
  { key: "agent", label: "Agent" },
  { key: "security", label: "Security" },
  { key: "config", label: "Config" },
];

const STATUS_COLOR: Record<string, string> = { ok: "var(--color-green)", error: "var(--color-red)" };

export function ActivityView() {
  const [source, setSource] = useState("");
  const { data: entries } = useQuery({ queryKey: ["admin", "audit", source], queryFn: () => admin.audit(source || undefined) });

  return (
    <Card
      title="Activity log"
      action={
        <div className="flex gap-1">
          {SOURCES.map((s) => (
            <button
              key={s.key}
              onClick={() => setSource(s.key)}
              className={clsx("rounded-full px-2.5 py-1 text-xs", source === s.key ? "bg-[var(--color-accent-soft)]" : "")}
              style={{ color: source === s.key ? "var(--color-text)" : "var(--color-text-3)" }}
            >
              {s.label}
            </button>
          ))}
        </div>
      }
    >
      <div className="divide-y text-sm" style={{ ["--tw-divide-opacity" as any]: 1 }}>
        {(entries ?? []).map((e) => (
          <div key={e.id} className="flex items-center gap-3 py-2" style={{ borderColor: "var(--color-border)" }}>
            <span className="w-16 shrink-0 text-xs" style={{ color: "var(--color-text-3)" }}>{ago(e.ts)}</span>
            <span className="w-20 shrink-0 text-xs">{muted(e.actor_name ?? e.source)}</span>
            <span className="flex-1 truncate">
              <span className="font-medium">{e.action ?? e.event}</span> {e.target && muted(e.target)}
            </span>
            {e.status && <span className="text-xs" style={{ color: STATUS_COLOR[e.status] ?? "var(--color-text-3)" }}>{e.status}</span>}
          </div>
        ))}
      </div>
      {!entries?.length && <p className="text-sm" style={{ color: "var(--color-text-3)" }}>No activity yet.</p>}
    </Card>
  );
}
