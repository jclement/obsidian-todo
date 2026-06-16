import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUpRight, Check } from "lucide-react";
import type { Priority, StatusDef, Task } from "../types";
import { useBootstrap, useCancel, useComplete, useRemove } from "../queries";
import { api, ApiError } from "../api";
import { toast } from "../toast";
import { useOpenInObsidian } from "../lib/obsidian";
import { SubtaskNotes, type SubtaskNotesHandle } from "./SubtaskNotes";

const FALLBACK_STATUSES: StatusDef[] = [
  { symbol: " ", name: "To do", type: "TODO" },
  { symbol: "/", name: "In progress", type: "IN_PROGRESS" },
  { symbol: "x", name: "Done", type: "DONE" },
  { symbol: "-", name: "Cancelled", type: "CANCELLED" },
];

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: "highest", label: "Highest" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "normal", label: "Normal" },
  { value: "low", label: "Low" },
  { value: "lowest", label: "Lowest" },
];

const field =
  "w-full rounded-lg border bg-[var(--color-surface-2)] px-3 py-2.5 text-base outline-none transition-colors focus:border-[var(--color-accent)] md:py-2 md:text-sm";
const fieldStyle = { borderColor: "var(--color-border)" } as const;
const noFill = { autoComplete: "off", "data-1p-ignore": true, "data-lpignore": "true", "data-form-type": "other" } as const;
const lbl = "mb-1.5 block text-[0.75rem] font-medium uppercase tracking-wide md:text-[0.7rem]";
const lblStyle = { color: "var(--color-text-3)" } as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={lbl} style={lblStyle}>{label}</span>
      {children}
    </label>
  );
}

export function TaskEditor({ task, onClose }: { task: Task | null; vaultName?: string; onClose: () => void }) {
  const complete = useComplete();
  const cancel = useCancel();
  const remove = useRemove();
  const openInObsidian = useOpenInObsidian();
  const boot = useBootstrap();
  const statuses = boot.data?.settings.statuses?.length ? boot.data.settings.statuses : FALLBACK_STATUSES;
  const subRef = useRef<SubtaskNotesHandle>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  // workingTask carries the freshest file_hash (updated after every write) so we
  // never reuse a stale hash across sub-task toggles + the property save.
  const [workingTask, setWorkingTask] = useState<Task | null>(task);
  const [desc, setDesc] = useState("");
  const [statusChar, setStatusChar] = useState(" ");
  const [priority, setPriority] = useState<Priority>("normal");
  const [due, setDue] = useState("");
  const [scheduled, setScheduled] = useState("");
  const [recurrence, setRecurrence] = useState("");
  const [reminder, setReminder] = useState("");

  useEffect(() => {
    if (!task) return;
    setWorkingTask(task);
    setDesc(task.description);
    setStatusChar(task.status_char || " ");
    setPriority(task.priority);
    setDue(task.due ?? "");
    setScheduled(task.scheduled ?? "");
    setRecurrence(task.recurrence ?? "");
    setReminder(task.reminder ?? "");
  }, [task]);

  // Auto-grow the title so long descriptions wrap instead of scrolling (no
  // stray inner scrollbar).
  useEffect(() => {
    const el = titleRef.current;
    if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; }
  }, [desc, task]);

  if (!task) return null;
  // Always operate on a Task that matches the open task (workingTask if fresh).
  const wt: Task = workingTask && workingTask.path === task.path && workingTask.line === task.line ? workingTask : task;

  const save = async () => {
    try {
      const cur = (await subRef.current?.commit()) ?? wt; // flush notes; freshest hash
      const changes: Record<string, unknown> = {};
      if (desc !== cur.description) changes.description = desc;
      if (statusChar !== (cur.status_char || " ")) changes.status_char = statusChar;
      if (priority !== cur.priority) changes.priority = priority;
      if ((due || null) !== cur.due) changes.due = due || null;
      if ((scheduled || null) !== cur.scheduled) changes.scheduled = scheduled || null;
      if ((recurrence || null) !== cur.recurrence) changes.recurrence = recurrence || null;
      if ((reminder || null) !== cur.reminder) changes.reminder = reminder || null;
      if (Object.keys(changes).length) await api.update(cur, changes);
    } catch (e) {
      const conflict = e instanceof ApiError && e.isConflict;
      toast(conflict ? "Task changed elsewhere — reopen to retry" : e instanceof Error ? e.message : "Save failed", conflict ? "info" : "error");
    } finally {
      onClose();
    }
  };

  const act = (fn: () => void) => { fn(); onClose(); };

  return (
    <Dialog.Root open={!!task} onOpenChange={(o) => { if (!o) { (document.activeElement as HTMLElement | null)?.blur(); onClose(); } }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          className="safe-x fixed inset-x-0 bottom-[var(--kb,0px)] z-50 mx-auto flex max-h-[calc(var(--vvh,100dvh)-env(safe-area-inset-top)-1rem)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border shadow-2xl outline-none sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[92vh] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
          style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
        >
          <Dialog.Title className="sr-only">Edit task</Dialog.Title>
          <div aria-hidden className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full sm:hidden" style={{ background: "var(--color-border-strong)" }} />

          <div
            className="flex-1 overflow-y-auto"
            onFocusCapture={(e) => {
              // Don't fight the keyboard animation on the autofocused title; only
              // ease a clipped field into view.
              const el = e.target as HTMLElement;
              if (el !== titleRef.current) el.scrollIntoView?.({ block: "nearest", behavior: "auto" });
            }}
          >
          <div className="px-5 pt-5">
            <textarea
              ref={titleRef}
              autoFocus
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={1}
              className="w-full resize-none overflow-hidden rounded-lg bg-transparent text-[1.05rem] font-medium leading-snug outline-none placeholder:text-[var(--color-text-3)]"
              placeholder="Task description"
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void save(); }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 px-5 pt-2">
            <div className="col-span-2 sm:col-span-1"><Field label="Due"><input type="date" {...noFill} value={due} onChange={(e) => setDue(e.target.value)} className={field} style={fieldStyle} /></Field></div>
            <div className="col-span-2 sm:col-span-1"><Field label="Scheduled"><input type="date" {...noFill} value={scheduled} onChange={(e) => setScheduled(e.target.value)} className={field} style={fieldStyle} /></Field></div>
            <Field label="Status">
              <select value={statusChar} onChange={(e) => setStatusChar(e.target.value)} className={field} style={fieldStyle}>
                {statuses.map((s, i) => (
                  <option key={`${s.symbol}-${i}`} value={s.symbol}>{s.name} [{s.symbol === " " ? "·" : s.symbol}]</option>
                ))}
                {!statuses.some((s) => s.symbol === statusChar) && <option value={statusChar}>Custom [{statusChar}]</option>}
              </select>
            </Field>
            <Field label="Priority">
              <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className={field} style={fieldStyle}>
                {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </Field>
            <Field label="Reminder"><input type="time" {...noFill} value={reminder} onChange={(e) => setReminder(e.target.value)} className={field} style={fieldStyle} /></Field>
            <div className="col-span-2">
              <Field label="Recurrence">
                <input {...noFill} value={recurrence} onChange={(e) => setRecurrence(e.target.value)} className={field} style={fieldStyle} placeholder="every week · every 3 days when done" />
              </Field>
            </div>
          </div>

          <SubtaskNotes ref={subRef} task={wt} onTaskChange={setWorkingTask} />

          <div className="mt-4 flex items-center gap-2 px-5 pb-4">
            <button onClick={() => act(() => complete.mutate(wt))} className="flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium" style={{ background: "var(--color-green)", color: "#0a0a0a" }}><Check className="size-4" strokeWidth={2.5} /> Complete</button>
            <button onClick={() => act(() => cancel.mutate(wt))} className="min-h-[40px] rounded-lg border px-3 py-1.5 text-sm" style={{ borderColor: "var(--color-border-strong)", color: "var(--color-text-2)" }}>Cancel task</button>
            <button onClick={() => act(() => remove.mutate(wt))} className="ml-auto min-h-[40px] rounded-lg px-3 py-1.5 text-sm hover:bg-[var(--color-surface-2)]" style={{ color: "var(--color-red)" }}>Delete</button>
          </div>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-2 border-t px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" style={{ borderColor: "var(--color-border)" }}>
            <button onClick={() => openInObsidian(wt.path)} className="flex min-w-0 items-center gap-1 text-xs hover:underline" style={{ color: "var(--color-text-3)" }}>
              <span className="truncate">{wt.path}:{wt.line}</span> <ArrowUpRight className="size-3.5 shrink-0" />
            </button>
            <div className="flex shrink-0 gap-2">
              <Dialog.Close className="min-h-[40px] rounded-lg border px-4 py-1.5 text-sm" style={{ borderColor: "var(--color-border-strong)", color: "var(--color-text-2)" }}>Close</Dialog.Close>
              <button onClick={() => void save()} className="min-h-[40px] rounded-lg px-4 py-1.5 text-sm font-medium" style={{ background: "var(--color-accent)", color: "white" }}>Save</button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
