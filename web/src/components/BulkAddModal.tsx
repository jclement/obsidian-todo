import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useAddMany } from "../queries";
import { parseQuickAdd } from "../lib/quickAddParse";
import { toast } from "../toast";

/** Bulk add — one task per line, each parsed with the same NLP as quick-add. */
export function BulkAddModal({
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
  const [text, setText] = useState("");
  const addMany = useAddMany();
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  const submit = () => {
    if (!lines.length) return;
    const drafts = lines.map((line) => {
      const { draft } = parseQuickAdd(line);
      let description = draft.description;
      if (defaults?.tag && !new RegExp(`#${defaults.tag}(?![\\w/-])`).test(description)) description += ` #${defaults.tag}`;
      return {
        ...draft,
        description,
        due: draft.due ?? defaults?.due,
        target_note: draft.target_note ?? targetNote,
      };
    });
    addMany.mutate(drafts, {
      onSuccess: (created) => { toast(`Added ${created.length} tasks`, "success"); setText(""); onClose(); },
      onError: (e) => toast(e instanceof Error ? e.message : "Failed", "error"),
    });
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-[14%] z-50 w-[min(92vw,40rem)] -translate-x-1/2 rounded-2xl border p-5 shadow-2xl outline-none"
          style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
        >
          <Dialog.Title className="text-sm font-semibold">Bulk add</Dialog.Title>
          <p className="mb-3 mt-0.5 text-xs" style={{ color: "var(--color-text-3)" }}>One task per line. Each line gets the same parsing (dates, #tags, ! priority).</p>
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            placeholder={"Pay rent on the 1st\nReview PRs #engineering\nCall dentist tomorrow !!"}
            className="w-full resize-none rounded-lg border bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
          />
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs" style={{ color: "var(--color-text-3)" }}>{lines.length} task{lines.length === 1 ? "" : "s"}</span>
            <div className="flex gap-2">
              <Dialog.Close className="rounded-lg border px-4 py-1.5 text-sm" style={{ borderColor: "var(--color-border-strong)" }}>Cancel</Dialog.Close>
              <button onClick={submit} disabled={!lines.length || addMany.isPending} className="rounded-lg px-4 py-1.5 text-sm font-medium disabled:opacity-40" style={{ background: "var(--color-accent)", color: "white" }}>
                {addMany.isPending ? "Adding…" : `Add ${lines.length}`}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
