import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useSaveSettings } from "../queries";
import { obsidianUrl } from "../lib/format";

/**
 * Asks once for the Obsidian vault's exact name (which only lives in the
 * Obsidian app, not the vault), saves it, then opens the note. Replaces the
 * raw window.prompt.
 */
export function VaultNameDialog({ path, defaultName, onClose }: { path: string | null; defaultName: string; onClose: () => void }) {
  const save = useSaveSettings();
  const [name, setName] = useState(defaultName);
  useEffect(() => setName(defaultName), [defaultName, path]);

  const open = path !== null;
  const go = () => {
    const n = name.trim();
    if (!n) return;
    save.mutate({ obsidianVaultName: n });
    window.location.href = obsidianUrl(n, path!);
    onClose();
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[70] w-[min(92vw,26rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border p-5 shadow-2xl outline-none"
          style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
        >
          <Dialog.Title className="text-sm font-semibold">Open in Obsidian</Dialog.Title>
          <p className="mb-3 mt-1 text-xs" style={{ color: "var(--color-text-3)" }}>
            What's this vault called in Obsidian? (Exactly as it appears in the vault switcher — case-sensitive. We'll
            remember it.)
          </p>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && go()}
            placeholder="My Vault"
            className="w-full rounded-md border bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
            style={{ borderColor: "var(--color-border)" }}
          />
          <div className="mt-4 flex justify-end gap-2">
            <Dialog.Close className="rounded-md border px-4 py-2 text-sm" style={{ borderColor: "var(--color-border-strong)" }}>Cancel</Dialog.Close>
            <button onClick={go} disabled={!name.trim()} className="rounded-md px-4 py-2 text-sm font-medium disabled:opacity-40" style={{ background: "var(--color-accent)", color: "white" }}>
              Save & open
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
