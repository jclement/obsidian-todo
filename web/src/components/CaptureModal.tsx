import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { QuickAdd } from "./QuickAdd";
import { SAMPLE_TASKS } from "../lib/placeholders";

// Stable-ish index without Math.random (varies by mount time).
let cursor = Math.floor(performance.now()) % SAMPLE_TASKS.length;

/** Single quick-add, opened by `q` / the + button / the mobile FAB. */
export function CaptureModal({
  open,
  onClose,
  targetNote,
  defaults,
}: {
  open: boolean;
  onClose: () => void;
  targetNote?: string;
  defaults?: { due?: string; tag?: string };
}) {
  const [placeholder, setPlaceholder] = useState(SAMPLE_TASKS[cursor]!);

  useEffect(() => {
    if (!open) return;
    cursor = (cursor + 1) % SAMPLE_TASKS.length;
    setPlaceholder(SAMPLE_TASKS[cursor]!);
    const t = setInterval(() => {
      cursor = (cursor + 1) % SAMPLE_TASKS.length;
      setPlaceholder(SAMPLE_TASKS[cursor]!);
    }, 3500);
    return () => clearInterval(t);
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) { (document.activeElement as HTMLElement | null)?.blur(); onClose(); } }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed inset-x-0 bottom-[var(--kb,0px)] z-50 mx-auto max-h-[calc(var(--vvh,100dvh)-env(safe-area-inset-top)-1rem)] overflow-y-auto rounded-t-2xl border px-6 pb-[max(1.5rem,calc(env(safe-area-inset-bottom)+1rem))] pt-6 shadow-2xl outline-none sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-[18%] sm:max-h-[85vh] sm:w-[min(92vw,38rem)] sm:-translate-x-1/2 sm:rounded-2xl"
          style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Dialog.Title className="sr-only">New task</Dialog.Title>
          <div aria-hidden className="mx-auto mb-4 h-1 w-9 rounded-full sm:hidden" style={{ background: "var(--color-border-strong)" }} />
          <QuickAdd
            autoFocus
            targetNote={targetNote}
            defaults={defaults}
            placeholder={placeholder}
          />
          <p className="mt-5 border-t pt-4 text-xs" style={{ borderColor: "var(--color-border)", color: "var(--color-text-3)" }}>
            <kbd className="rounded bg-[var(--color-surface-3)] px-1.5 py-0.5">↵</kbd> adds another&nbsp;·&nbsp;
            <kbd className="rounded bg-[var(--color-surface-3)] px-1.5 py-0.5">esc</kbd> to close&nbsp;·&nbsp;dates, #tags and !priority are parsed
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
