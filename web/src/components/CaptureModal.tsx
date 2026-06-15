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
  aiEnabled,
  onOpenAi,
  targetNote,
  defaults,
}: {
  open: boolean;
  onClose: () => void;
  aiEnabled: boolean;
  onOpenAi: () => void;
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
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content
          className="safe-b fixed inset-x-0 bottom-0 z-50 mx-auto rounded-t-2xl border p-4 shadow-2xl outline-none sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-[18%] sm:w-[min(92vw,38rem)] sm:-translate-x-1/2 sm:rounded-2xl"
          style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Dialog.Title className="sr-only">New task</Dialog.Title>
          <QuickAdd
            autoFocus
            aiEnabled={aiEnabled}
            targetNote={targetNote}
            defaults={defaults}
            placeholder={placeholder}
            onOpenAi={() => { onClose(); onOpenAi(); }}
          />
          <p className="mt-2 px-1 text-xs" style={{ color: "var(--color-text-3)" }}>
            Enter adds another · Esc to close · dates, #tags and ! priority are parsed
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
