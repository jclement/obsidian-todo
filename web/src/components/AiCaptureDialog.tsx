import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { api } from "../api";
import { useAddMany } from "../queries";
import { toast } from "../toast";
import { DictateButton } from "./DictateButton";
import type { TaskDraft } from "../types";

/**
 * Paste a block of text (or dictate it) and turn it into structured tasks via
 * OpenAI. Shows a preview you can prune before committing.
 */
export function AiCaptureDialog({
  open,
  onClose,
  aiEnabled,
  initialText = "",
  autoProcess = false,
}: {
  open: boolean;
  onClose: () => void;
  aiEnabled: boolean;
  initialText?: string;
  autoProcess?: boolean;
}) {
  const [text, setText] = useState(initialText);
  const [drafts, setDrafts] = useState<TaskDraft[] | null>(null);
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const addMany = useAddMany();

  useEffect(() => {
    if (open) {
      setText(initialText);
      setDrafts(null);
      setSkip(new Set());
      if (autoProcess && initialText.trim()) void process(initialText);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialText]);

  const process = async (override?: string) => {
    const t = override ?? text;
    if (!t.trim()) return;
    setLoading(true);
    try {
      setDrafts(await api.aiParse(t));
    } catch (e) {
      toast(e instanceof Error ? e.message : "AI parse failed", "error");
    } finally {
      setLoading(false);
    }
  };

  const commit = () => {
    const chosen = (drafts ?? []).filter((_, i) => !skip.has(i));
    if (!chosen.length) return;
    addMany.mutate(chosen, {
      onSuccess: (created) => {
        toast(`Added ${created.length} task${created.length === 1 ? "" : "s"}`, "success");
        onClose();
      },
      onError: (e) => toast(e instanceof Error ? e.message : "Failed to add", "error"),
    });
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[min(92vw,40rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 overflow-hidden rounded-2xl border p-5 shadow-2xl outline-none"
          style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
        >
          <Dialog.Title className="text-sm font-semibold">✨ Capture with AI</Dialog.Title>
          {!aiEnabled && (
            <p className="rounded-md border px-3 py-2 text-xs" style={{ borderColor: "var(--color-amber)", color: "var(--color-amber)" }}>
              Add an OpenAI API key in Settings to enable AI capture and dictation.
            </p>
          )}
          {!drafts && (
            <>
              <div className="flex gap-2">
                <textarea
                  autoFocus
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={6}
                  placeholder="Paste notes, an email, or a brain-dump… or dictate. AI will extract tasks with dates, tags, and priorities."
                  className="flex-1 resize-none rounded-md border bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
                  style={{ borderColor: "var(--color-border)" }}
                />
                <DictateButton enabled={aiEnabled} onText={(t) => setText((cur) => (cur ? cur + "\n" + t : t))} />
              </div>
              <div className="flex justify-end gap-2">
                <Dialog.Close className="rounded-md border px-4 py-2 text-sm" style={{ borderColor: "var(--color-border-strong)" }}>
                  Cancel
                </Dialog.Close>
                <button
                  onClick={() => process()}
                  disabled={!aiEnabled || loading || !text.trim()}
                  className="rounded-md px-4 py-2 text-sm font-medium disabled:opacity-40"
                  style={{ background: "var(--color-accent)", color: "white" }}
                >
                  {loading ? "Thinking…" : "Extract tasks"}
                </button>
              </div>
            </>
          )}
          {drafts && (
            <>
              <div className="flex-1 overflow-y-auto">
                {drafts.length === 0 && <p className="text-sm" style={{ color: "var(--color-text-3)" }}>No tasks found.</p>}
                {drafts.map((d, i) => (
                  <label key={i} className="flex cursor-pointer items-start gap-2 border-b px-1 py-2 text-sm" style={{ borderColor: "var(--color-border)" }}>
                    <input
                      type="checkbox"
                      checked={!skip.has(i)}
                      onChange={(e) => {
                        const n = new Set(skip);
                        e.target.checked ? n.delete(i) : n.add(i);
                        setSkip(n);
                      }}
                      className="mt-1"
                    />
                    <span>
                      <span>{d.description}</span>{" "}
                      {d.due && <span style={{ color: "var(--color-amber)" }}>📅 {d.due}</span>}{" "}
                      {d.priority && d.priority !== "normal" && <span style={{ color: "var(--color-text-3)" }}>{d.priority}</span>}{" "}
                      {d.recurrence && <span style={{ color: "var(--color-text-3)" }}>🔁 {d.recurrence}</span>}{" "}
                      {d.target_note && <span style={{ color: "var(--color-text-3)" }}>→ {d.target_note}</span>}
                    </span>
                  </label>
                ))}
              </div>
              <div className="flex justify-between gap-2">
                <button onClick={() => setDrafts(null)} className="rounded-md border px-4 py-2 text-sm" style={{ borderColor: "var(--color-border-strong)" }}>
                  ← Back
                </button>
                <button
                  onClick={commit}
                  disabled={drafts.length - skip.size === 0}
                  className="rounded-md px-4 py-2 text-sm font-medium disabled:opacity-40"
                  style={{ background: "var(--color-accent)", color: "white" }}
                >
                  Add {drafts.length - skip.size} task{drafts.length - skip.size === 1 ? "" : "s"}
                </button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
