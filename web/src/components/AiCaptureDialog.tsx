import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Calendar, Repeat } from "lucide-react";
import { api } from "../api";
import { useAddMany } from "../queries";
import { toast } from "../toast";
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
  const [warn, setWarn] = useState<string | null>(null);
  const [lowConf, setLowConf] = useState(false);
  const addMany = useAddMany();

  useEffect(() => {
    if (open) {
      setText(initialText);
      setDrafts(null);
      setSkip(new Set());
      setWarn(null);
      setLowConf(false);
      if (autoProcess && initialText.trim()) void process(initialText);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialText]);

  const editDesc = (i: number, value: string) =>
    setDrafts((cur) => (cur ? cur.map((d, j) => (j === i ? { ...d, description: value } : d)) : cur));

  // Low confidence (or nothing found) → keep the (possibly transcribed) text
  // editable with a hint, rather than dropping the user on an empty preview.
  const process = async (override?: string) => {
    const t = override ?? text;
    if (!t.trim()) return;
    setLoading(true);
    try {
      const { drafts: d, confidence } = await api.aiParse(t);
      // Be eager: if the model produced any tasks, show them for review. Only
      // fall back to the editable text when it found nothing at all. Low
      // confidence doesn't refuse — it just flags the list for a closer look
      // (every row is editable before you approve).
      if (d.length === 0) {
        setText(t);
        setWarn("AI didn't find anything actionable here — tweak the wording and try again.");
        setDrafts(null);
      } else {
        setWarn(null);
        setLowConf(confidence < 0.5);
        setDrafts(d);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "AI parse failed", "error");
    } finally {
      setLoading(false);
    }
  };

  const commit = () => {
    const chosen = (drafts ?? []).filter((d, i) => !skip.has(i) && d.description.trim());
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
          <Dialog.Title className="text-sm font-semibold">Capture with AI</Dialog.Title>
          {!aiEnabled && (
            <p className="rounded-md border px-3 py-2 text-xs" style={{ borderColor: "var(--color-amber)", color: "var(--color-amber)" }}>
              Add an OpenAI API key in Settings to enable AI capture.
            </p>
          )}
          {!drafts && (
            <>
              {warn && (
                <p className="rounded-md border px-3 py-2 text-xs" style={{ borderColor: "var(--color-amber)", color: "var(--color-amber)" }}>
                  {warn}
                </p>
              )}
              <textarea
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
                placeholder="Paste notes, an email, or a brain-dump. AI extracts tasks with dates, tags, and priorities."
                className="w-full resize-none rounded-md border bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
                style={{ borderColor: "var(--color-border)" }}
              />
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
                  {loading ? "Thinking…" : warn ? "Try again" : "Extract tasks"}
                </button>
              </div>
            </>
          )}
          {drafts && (
            <>
              {lowConf && (
                <p className="rounded-md border px-3 py-2 text-xs" style={{ borderColor: "var(--color-amber)", color: "var(--color-amber)" }}>
                  AI wasn't fully confident here — review and edit each line below before adding.
                </p>
              )}
              <div className="flex-1 space-y-2 overflow-y-auto">
                {drafts.length === 0 && <p className="text-sm" style={{ color: "var(--color-text-3)" }}>No tasks found.</p>}
                {drafts.map((d, i) => {
                  const on = !skip.has(i);
                  const hasMeta = d.due || (d.priority && d.priority !== "normal") || d.recurrence || d.target_note;
                  return (
                    <div key={i} className="flex items-start gap-2 border-b px-1 pb-2.5 text-sm" style={{ borderColor: "var(--color-border)" }}>
                      <input
                        type="checkbox"
                        checked={on}
                        aria-label="Include this task"
                        onChange={(e) => {
                          const n = new Set(skip);
                          e.target.checked ? n.delete(i) : n.add(i);
                          setSkip(n);
                        }}
                        className="mt-2.5"
                      />
                      <div className="min-w-0 flex-1" style={{ opacity: on ? 1 : 0.45 }}>
                        <input
                          value={d.description}
                          disabled={!on}
                          onChange={(e) => editDesc(i, e.target.value)}
                          placeholder="Task description"
                          className="w-full rounded-md border bg-[var(--color-surface-2)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
                          style={{ borderColor: "var(--color-border)" }}
                        />
                        {hasMeta && (
                          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 px-0.5 text-xs">
                            {d.due && <span className="inline-flex items-center gap-1" style={{ color: "var(--color-amber)" }}><Calendar className="size-3.5" /> {d.due}</span>}
                            {d.priority && d.priority !== "normal" && <span style={{ color: "var(--color-text-3)" }}>{d.priority}</span>}
                            {d.recurrence && <span className="inline-flex items-center gap-1" style={{ color: "var(--color-text-3)" }}><Repeat className="size-3.5" /> {d.recurrence}</span>}
                            {d.target_note && <span style={{ color: "var(--color-text-3)" }}>→ {d.target_note}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between gap-2">
                <button onClick={() => setDrafts(null)} className="rounded-md border px-4 py-2 text-sm" style={{ borderColor: "var(--color-border-strong)" }}>
                  ← Back
                </button>
                {(() => {
                  const n = drafts.filter((d, i) => !skip.has(i) && d.description.trim()).length;
                  return (
                    <button
                      onClick={commit}
                      disabled={n === 0}
                      className="rounded-md px-4 py-2 text-sm font-medium disabled:opacity-40"
                      style={{ background: "var(--color-accent)", color: "white" }}
                    >
                      Add {n} task{n === 1 ? "" : "s"}
                    </button>
                  );
                })()}
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
