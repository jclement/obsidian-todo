import type { ReactNode } from "react";

export function Card({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border p-4" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between">
          {title && <h2 className="text-sm font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export const btn = "rounded-md px-3 py-1.5 text-sm font-medium";
export const btnPrimary = btn + " text-white";
export const btnPrimaryStyle = { background: "var(--color-accent)" } as const;
export const btnGhost = "rounded-md border px-3 py-1.5 text-sm";
export const btnGhostStyle = { borderColor: "var(--color-border-strong)" } as const;
export const input = "rounded-md border bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";
export const inputStyle = { borderColor: "var(--color-border)" } as const;

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left" style={{ borderColor: "var(--color-border)", color: "var(--color-text-3)" }}>
          {head.map((h) => (
            <th key={h} className="py-2 pr-4 font-medium">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

export function muted(children: ReactNode) {
  return <span style={{ color: "var(--color-text-3)" }}>{children}</span>;
}
