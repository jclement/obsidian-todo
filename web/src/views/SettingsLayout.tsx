import { Outlet, useLocation } from "react-router-dom";

const TITLES: Record<string, string> = {
  "/settings": "Settings",
  "/settings/passkeys": "Passkeys",
  "/settings/tokens": "API tokens",
  "/settings/connections": "Connections",
  "/settings/sync": "Obsidian Sync",
  "/settings/snapshots": "Snapshots",
  "/settings/activity": "Activity",
  "/settings/guidance": "MCP guidance",
};

export function SettingsLayout() {
  const { pathname } = useLocation();
  const title = TITLES[pathname] ?? "Settings";
  return (
    <div className="animate-in">
      <h1 className="mb-4 text-xl font-semibold tracking-tight">{title}</h1>
      <Outlet />
    </div>
  );
}
