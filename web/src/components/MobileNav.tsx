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
        <span
          className="absolute right-[16%] -top-0.5 grid h-[1.1rem] min-w-[1.1rem] place-items-center rounded-full px-1 text-[0.6rem] font-semibold leading-none tabular-nums text-white"
          style={{ background: "var(--color-accent)" }}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </NavLink>
  );
}

export function MobileNav({ onAdd }: { onAdd: () => void }) {
  const counts = useCounts();
  return (
    <nav className="safe-b fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t md:hidden" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
      <Tab to="/" icon="☀" label="Due" badge={counts.data?.today} />
      <Tab to="/inbox" icon="✉" label="Inbox" badge={counts.data?.inbox} />
      <button onClick={onAdd} aria-label="New task" className="flex flex-1 flex-col items-center justify-center">
        <span className="grid size-11 -translate-y-3 place-items-center rounded-full text-2xl text-white shadow-lg" style={{ background: "var(--color-accent)" }}>＋</span>
      </button>
      <Tab to="/tags" icon="▦" label="Browse" />
      <Tab to="/settings" icon="⚙" label="Settings" />
    </nav>
  );
}
