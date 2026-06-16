import type { ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";

const GROUPS: { title: string; keys: [string, string][] }[] = [
  {
    title: "Capture",
    keys: [
      ["q", "Quick add"],
      ["b", "Bulk add (one per line)"],
      ["v", "Voice capture"],
      ["a", "Capture with AI"],
    ],
  },
  {
    title: "Navigate",
    keys: [
      ["⌘K", "Command palette"],
      ["/", "Search"],
      ["j  ↓", "Move down"],
      ["k  ↑", "Move up"],
    ],
  },
  {
    title: "Selected task",
    keys: [
      ["x", "Complete / un-complete"],
      ["e", "Edit"],
      ["⌘↵", "Save (in editor)"],
      ["esc", "Close dialog"],
    ],
  },
];

function Key({ children }: { children: ReactNode }) {
  return (
    <kbd
      className="inline-grid min-w-[1.5rem] place-items-center rounded-md border px-1.5 py-0.5 text-xs font-medium"
      style={{ borderColor: "var(--color-border-strong)", background: "var(--color-surface-3)", color: "var(--color-text-2)" }}
    >
      {children}
    </kbd>
  );
}

export function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,34rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border p-5 shadow-2xl outline-none"
          style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
        >
          <Dialog.Title className="text-sm font-semibold">Keyboard shortcuts</Dialog.Title>
          <div className="mt-4 grid gap-5 sm:grid-cols-3">
            {GROUPS.map((g) => (
              <div key={g.title}>
                <div className="mb-2 text-[0.7rem] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-3)" }}>
                  {g.title}
                </div>
                <ul className="space-y-2">
                  {g.keys.map(([k, label]) => (
                    <li key={k} className="flex items-center justify-between gap-3 text-sm">
                      <span style={{ color: "var(--color-text-2)" }}>{label}</span>
                      <Key>{k}</Key>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-5 text-xs" style={{ color: "var(--color-text-3)" }}>
            Press <Key>?</Key> anytime to open this.
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
