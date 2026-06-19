import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import clsx from "clsx";
import { Check, CircleCheck, Hash, Inbox, ListTodo, Search, Sun, type LucideIcon } from "lucide-react";
import { useCounts, useProjects, useTags } from "../queries";
import { useAppCtx } from "../app-context";
import { UserMenu } from "./UserMenu";

function Item({ to, icon: Icon, label, count, right }: { to: string; icon: LucideIcon; label: string; count?: number; right?: ReactNode }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        clsx(
          "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
          isActive ? "bg-[var(--color-accent-soft)] text-[var(--color-text)]" : "text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)]",
        )
      }
    >
      <Icon className="size-4 shrink-0 opacity-80" />
      <span className="flex-1 truncate">{label}</span>
      {right ?? (count != null && count > 0 && <span className="text-xs tabular-nums" style={{ color: "var(--color-text-3)" }}>{count}</span>)}
    </NavLink>
  );
}

/** Up-to-three-segment pill for the Due item: overdue (red) · today (amber) · later (grey). */
function DueBadge() {
  const counts = useCounts();
  const c = counts.data;
  if (!c) return null;
  const segs = [
    { n: c.overdue, bg: "var(--color-red)", fg: "white" },
    { n: c.due_today, bg: "var(--color-amber)", fg: "#0a0a0a" },
    { n: c.due_later, bg: "var(--color-surface-3)", fg: "var(--color-text-2)" },
  ].filter((s) => s.n > 0);
  if (!segs.length) return null;
  return (
    <span className="flex shrink-0 overflow-hidden rounded-full text-[0.65rem] font-semibold leading-none tabular-nums">
      {segs.map((s, i) => (
        <span key={i} className="px-1.5 py-[3px]" style={{ background: s.bg, color: s.fg }}>{s.n}</span>
      ))}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-2.5 pb-1 pt-4 text-[0.7rem] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-3)" }}>{children}</div>;
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const counts = useCounts();
  const projects = useProjects();
  const tags = useTags();
  const loc = useLocation();
  const { vaultName } = useAppCtx();

  return (
    <nav className="flex h-full flex-col gap-0.5 overflow-y-auto p-2.5" onClick={onNavigate}>
      <div className="flex items-center gap-2 px-2.5 py-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-md" style={{ background: "var(--color-accent)", color: "white" }}><Check className="size-4" strokeWidth={3} /></span>
        <span className="flex-1 truncate text-sm font-semibold">Obsidian Todo</span>
        <UserMenu name={vaultName} variant="gear" />
      </div>

      <Item to="/inbox" icon={Inbox} label="Inbox" count={counts.data?.inbox} />
      <Item to="/" icon={Sun} label="Due" right={<DueBadge />} />
      <Item to="/all" icon={ListTodo} label="All open" count={counts.data?.total_open} />
      <Item to="/completed" icon={CircleCheck} label="Completed" />
      <Item to="/search" icon={Search} label="Search" />

      <SectionLabel>Projects</SectionLabel>
      {projects.data?.slice(0, 30).map((p) => (
        <NavLink
          key={p.path}
          to={`/project?path=${encodeURIComponent(p.path)}`}
          className={clsx(
            "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
            loc.search.includes(encodeURIComponent(p.path)) ? "bg-[var(--color-accent-soft)] text-[var(--color-text)]" : "text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)]",
          )}
        >
          <Hash className="size-4 shrink-0 opacity-60" />
          <span className="flex-1 truncate">{p.note}</span>
          <span className="text-xs tabular-nums" style={{ color: "var(--color-text-3)" }}>{p.open_count}</span>
        </NavLink>
      ))}
      {!projects.data?.length && <div className="px-2.5 text-xs" style={{ color: "var(--color-text-3)" }}>No projects yet</div>}

      {!!tags.data?.length && (
        <>
          <SectionLabel>Tags</SectionLabel>
          {tags.data.slice(0, 40).map((t) => (
            <Item key={t.tag} to={`/tag/${encodeURIComponent(t.tag)}`} icon={Hash} label={`#${t.tag}`} count={t.count} />
          ))}
        </>
      )}
    </nav>
  );
}
