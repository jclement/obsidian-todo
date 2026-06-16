import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Sparkles } from "lucide-react";
import { api } from "../api";
import { useAddMany } from "../queries";
import { parseQuickAdd } from "../lib/quickAddParse";
import type { Priority, TaskDraft } from "../types";
import { toast } from "../toast";

// Importance markup that parseQuickAdd reads back on import.
const PRI_MARK: Record<Priority, string> = {
  highest: "!!!",
  high: "!!",
  medium: "!",
  normal: "",
  low: "🔽",
  lowest: "⏬",
};

/** Serialize an AI draft into one editable quick-add line that round-trips
 *  through parseQuickAdd on import (description #tags !pri YYYY-MM-DD every … > note). */
function draftToLine(d: TaskDraft): string {
  let s = d.description.trim();
  for (const t of d.tags ?? []) {
    if (!new RegExp(`#${t}(?![\\w/-])`).test(s)) s += ` #${t}`;
  }
  const pri = d.priority ? PRI_MARK[d.priority] : "";
  if (pri) s += ` ${pri}`;
  if (d.due) s += ` ${d.due}`;
  if (d.recurrence) s += ` ${d.recurrence}`;
  if (d.target_note) s += ` > ${d.target_note}`;
  return s;
}

/**
 * Bulk add — one task per line, each parsed with the same NLP as quick-add.
 * "Clean up with AI" rewrites whatever you've typed (or a dictated transcript)
 * into tidy one-per-line tasks with date/priority markup you can then edit.
 */
export function BulkAddModal({
  open,
  onClose,
  targetNote,
  defaults,
  aiEnabled,
  initialText = "",
  autoClean = false,
}: {
  open: boolean;
  onClose: () => void;
  targetNote?: string;
  defaults?: { due?: string; tag?: string };
  aiEnabled: boolean;
  initialText?: string;
  autoClean?: boolean;
}) {
  const [text, setText] = useState(initialText);
  const [cleaning, setCleaning] = useState(false);
  const addMany = useAddMany();
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  const clean = async (override?: string) => {
    const t = override ?? text;
    if (!aiEnabled || !t.trim()) return;
    setCleaning(true);
    try {
      const { drafts } = await api.aiParse(t);
      if (drafts.length) setText(drafts.map(draftToLine).join("\n"));
      else toast("AI didn't find tasks to clean up — edit the lines and import", "info");
    } catch (e) {
      toast(e instanceof Error ? e.message : "AI cleanup failed", "error");
    } finally {
      setCleaning(false);
    }
  };

  // Reset on open; for voice (autoClean) run the cleanup once on the transcript.
  const ranAuto = useRef(false);
  useEffect(() => {
    if (!open) { ranAuto.current = false; return; }
    setText(initialText);
    if (autoClean && initialText.trim() && aiEnabled && !ranAuto.current) {
      ranAuto.current = true;
      void clean(initialText);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialText]);

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
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) { (document.activeElement as HTMLElement | null)?.blur(); onClose(); } }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-[14%] z-50 w-[min(92vw,40rem)] -translate-x-1/2 rounded-2xl border p-5 shadow-2xl outline-none"
          style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-sm font-semibold">Bulk add</Dialog.Title>
              <p className="mt-0.5 text-xs" style={{ color: "var(--color-text-3)" }}>One task per line — dates, #tags and !priority are parsed.</p>
            </div>
            {aiEnabled && (
              <button
                onClick={() => clean()}
                disabled={cleaning || !text.trim()}
                title="Rewrite what you typed into tidy one-per-line tasks"
                className="flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] disabled:opacity-40"
                style={{ borderColor: "transparent", background: "var(--color-accent-soft)", color: "var(--color-accent-2)" }}
              >
                <Sparkles className="size-4" /> {cleaning ? "Cleaning…" : "Clean up with AI"}
              </button>
            )}
          </div>
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            placeholder={"Pay rent on the 1st\nReview PRs #engineering\nCall dentist tomorrow !!"}
            className="mt-3 w-full resize-none rounded-lg border bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
            style={{ borderColor: "var(--color-border)" }}
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
