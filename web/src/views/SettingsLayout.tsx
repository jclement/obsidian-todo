import { NavLink, Outlet } from "react-router-dom";
import clsx from "clsx";

const tabs = [
  { to: "/settings", label: "General", end: true },
  { to: "/settings/passkeys", label: "Passkeys" },
  { to: "/settings/tokens", label: "API tokens" },
  { to: "/settings/connections", label: "Connections" },
  { to: "/settings/sync", label: "Obsidian Sync" },
  { to: "/settings/snapshots", label: "Snapshots" },
  { to: "/settings/activity", label: "Activity" },
  { to: "/settings/guidance", label: "MCP guidance" },
];

export function SettingsLayout() {
  return (
    <div className="animate-in">
      <h1 className="mb-3 text-xl font-semibold tracking-tight">Settings</h1>
      <nav className="-mx-1 mb-4 flex gap-1 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              clsx(
                "whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition-colors",
                isActive ? "bg-[var(--color-accent-soft)] text-[var(--color-text)]" : "text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)]",
              )
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
