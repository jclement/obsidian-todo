import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useNavigate } from "react-router-dom";
import { Settings2 } from "lucide-react";
import { api } from "../api";
import { toast } from "../toast";

const item = "flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm outline-none data-[highlighted]:bg-[var(--color-surface-3)]";

function Group({ children }: { children: React.ReactNode }) {
  return <div className="px-2.5 pb-0.5 pt-2 text-[0.7rem] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-3)" }}>{children}</div>;
}

export function UserMenu({ name, variant = "avatar" }: { name: string; variant?: "avatar" | "gear" }) {
  const navigate = useNavigate();
  const reindex = async () => {
    await api.reindex();
    toast("Reindexing vault…", "info");
  };
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        {variant === "gear" ? (
          <button
            aria-label="Menu"
            className="grid size-8 shrink-0 place-items-center rounded-md outline-none transition-colors hover:bg-[var(--color-surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            style={{ color: "var(--color-text-3)" }}
          >
            <Settings2 className="size-[1.05rem]" />
          </button>
        ) : (
          <button className="grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]" style={{ background: "var(--color-accent)", color: "white" }}>
            {name.slice(0, 1).toUpperCase()}
          </button>
        )}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 w-56 rounded-lg border p-1 shadow-xl"
          style={{ background: "var(--color-surface-2)", borderColor: "var(--color-border)" }}
        >
          <div className="px-2.5 py-1.5 text-xs" style={{ color: "var(--color-text-3)" }}>{name}</div>
          <DropdownMenu.Item className={item} onSelect={() => navigate("/settings")}>Settings</DropdownMenu.Item>
          <DropdownMenu.Item className={item} onSelect={reindex}>Reindex vault</DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px" style={{ background: "var(--color-border)" }} />
          <Group>Account</Group>
          <DropdownMenu.Item className={item} onSelect={() => navigate("/settings/passkeys")}>Passkeys</DropdownMenu.Item>
          <Group>Integration</Group>
          <DropdownMenu.Item className={item} onSelect={() => navigate("/settings/tokens")}>API tokens</DropdownMenu.Item>
          <DropdownMenu.Item className={item} onSelect={() => navigate("/settings/connections")}>Connections</DropdownMenu.Item>
          <DropdownMenu.Item className={item} onSelect={() => navigate("/settings/guidance")}>MCP guidance</DropdownMenu.Item>
          <Group>Vault</Group>
          <DropdownMenu.Item className={item} onSelect={() => navigate("/settings/sync")}>Obsidian Sync</DropdownMenu.Item>
          <DropdownMenu.Item className={item} onSelect={() => navigate("/settings/snapshots")}>Snapshots</DropdownMenu.Item>
          <DropdownMenu.Item className={item} onSelect={() => navigate("/settings/activity")}>Activity log</DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px" style={{ background: "var(--color-border)" }} />
          <DropdownMenu.Item className={item} onSelect={() => (window.location.href = "/logout")} style={{ color: "var(--color-red)" }}>
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
