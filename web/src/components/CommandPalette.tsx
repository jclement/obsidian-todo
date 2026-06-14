import { Command } from "cmdk";
import { useNavigate } from "react-router-dom";
import { useProjects, useTags } from "../queries";
import { api } from "../api";
import { toast } from "../toast";

export function CommandPalette({
  open,
  onClose,
  onNewTask,
  onAiCapture,
}: {
  open: boolean;
  onClose: () => void;
  onNewTask: () => void;
  onAiCapture: () => void;
}) {
  const navigate = useNavigate();
  const projects = useProjects();
  const tags = useTags();

  const go = (to: string) => {
    navigate(to);
    onClose();
  };
  const run = (fn: () => void) => {
    fn();
    onClose();
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      label="Command palette"
      className="fixed left-1/2 top-[15%] z-[60] w-[min(92vw,36rem)] -translate-x-1/2 overflow-hidden rounded-xl border shadow-2xl"
      style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
    >
      <Command.Input
        placeholder="Jump to a view, project, or run a command…"
        className="w-full border-b bg-transparent px-4 py-3 text-sm outline-none"
        style={{ borderColor: "var(--color-border)" }}
      />
      <Command.List className="max-h-[60vh] overflow-y-auto p-2 text-sm">
        <Command.Empty className="px-3 py-6 text-center" style={{ color: "var(--color-text-3)" }}>No results.</Command.Empty>

        <Command.Group heading="Actions" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-[var(--color-text-3)]">
          <Item onSelect={() => run(onNewTask)}>＋ New task</Item>
          <Item onSelect={() => run(onAiCapture)}>✨ Capture with AI / dictate</Item>
          <Item onSelect={() => run(async () => { await api.reindex(); toast("Reindexing…", "info"); })}>↻ Reindex vault</Item>
        </Command.Group>

        <Command.Group heading="Go to" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-[var(--color-text-3)]">
          <Item onSelect={() => go("/")}>☀ Today</Item>
          <Item onSelect={() => go("/upcoming")}>▤ Upcoming</Item>
          <Item onSelect={() => go("/inbox")}>✉ Inbox</Item>
          <Item onSelect={() => go("/all")}>≣ All open</Item>
          <Item onSelect={() => go("/search")}>⌕ Search</Item>
          <Item onSelect={() => go("/settings")}>⚙ Settings</Item>
        </Command.Group>

        {!!projects.data?.length && (
          <Command.Group heading="Projects" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-[var(--color-text-3)]">
            {projects.data.slice(0, 50).map((p) => (
              <Item key={p.path} onSelect={() => go(`/project?path=${encodeURIComponent(p.path)}`)}>
                # {p.note} <span className="ml-auto text-xs" style={{ color: "var(--color-text-3)" }}>{p.open_count}</span>
              </Item>
            ))}
          </Command.Group>
        )}

        {!!tags.data?.length && (
          <Command.Group heading="Tags" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-[var(--color-text-3)]">
            {tags.data.slice(0, 50).map((t) => (
              <Item key={t.tag} onSelect={() => go(`/tag/${encodeURIComponent(t.tag)}`)}>⊙ #{t.tag}</Item>
            ))}
          </Command.Group>
        )}
      </Command.List>
    </Command.Dialog>
  );
}

function Item({ children, onSelect }: { children: React.ReactNode; onSelect: () => void }) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 outline-none data-[selected=true]:bg-[var(--color-accent-soft)]"
    >
      {children}
    </Command.Item>
  );
}
