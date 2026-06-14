import * as Dialog from "@radix-ui/react-dialog";
import { QuickAdd } from "./QuickAdd";

/** Mobile FAB capture: a bottom sheet wrapping the quick-add (NLP + AI). */
export function CaptureSheet({
  open,
  onClose,
  aiEnabled,
  onOpenAi,
}: {
  open: boolean;
  onClose: () => void;
  aiEnabled: boolean;
  onOpenAi: () => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content
          className="safe-b fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border p-4 shadow-2xl outline-none"
          style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Dialog.Title className="mb-2 text-sm font-semibold">New task</Dialog.Title>
          <QuickAdd
            autoFocus
            aiEnabled={aiEnabled}
            onOpenAi={() => {
              onClose();
              onOpenAi();
            }}
            onSubmitted={onClose}
          />
          <p className="mt-2 text-xs" style={{ color: "var(--color-text-3)" }}>
            Try “Email Dana tomorrow #work !!” — dates, tags and priority are parsed automatically.
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
