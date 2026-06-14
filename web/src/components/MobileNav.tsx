import { NavLink } from "react-router-dom";
import clsx from "clsx";
import { useCounts } from "../queries";

function Tab({ to, icon, label, badge }: { to: string; icon: string; label: string; badge?: number }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        clsx("relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[0.65rem]", isActive ? "text-[var(--color-accent-2)]" : "text-[var(--color-text-3)]")
      }
    >
      <span className="text-base">{icon}</span>
      {label}
      {badge != null && badge > 0 && (
        <span className="absolute right-[22%] top-1 min-w-3.5 rounded-full px-1 text-[0.55rem] leading-tight text-white" style={{ background: "var(--color-accent)" }}>
          {badge}
        </span>
      )}
    </NavLink>
  );
}

export function MobileNav({ onAdd }: { onAdd: () => void }) {
  const counts = useCounts();
  return (
    <nav className="safe-b fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t md:hidden" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
      <Tab to="/" icon="☀" label="Today" badge={counts.data?.today} />
      <Tab to="/upcoming" icon="▤" label="Upcoming" />
      <button onClick={onAdd} className="flex flex-1 flex-col items-center justify-center">
        <span className="grid size-9 -translate-y-2 place-items-center rounded-full text-xl text-white shadow-lg" style={{ background: "var(--color-accent)" }}>＋</span>
      </button>
      <Tab to="/inbox" icon="✉" label="Inbox" badge={counts.data?.inbox} />
      <Tab to="/search" icon="⌕" label="Search" />
    </nav>
  );
}
