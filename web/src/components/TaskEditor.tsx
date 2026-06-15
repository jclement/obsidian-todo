import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
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
  "w-full rounded-lg border bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--color-accent)]";
const fieldStyle = { borderColor: "var(--color-border)" } as const;
const noFill = { autoComplete: "off", "data-1p-ignore": true, "data-lpignore": "true", "data-form-type": "other" } as const;
const lbl = "mb-1.5 block text-[0.7rem] font-medium uppercase tracking-wide";
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
    <Dialog.Root open={!!task} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92vh] w-full max-w-lg flex-col overflow-y-auto rounded-t-2xl border shadow-2xl outline-none sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
          style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
        >
          <Dialog.Title className="sr-only">Edit task</Dialog.Title>

          <div className="px-5 pt-5">
            <textarea
              autoFocus
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={1}
              className="w-full resize-none rounded-lg bg-transparent text-[1.05rem] font-medium leading-snug outline-none placeholder:text-[var(--color-text-3)]"
              placeholder="Task description"
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void save(); }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 px-5 pt-2">
            <Field label="Due"><input type="date" {...noFill} value={due} onChange={(e) => setDue(e.target.value)} className={field} style={fieldStyle} /></Field>
            <Field label="Scheduled"><input type="date" {...noFill} value={scheduled} onChange={(e) => setScheduled(e.target.value)} className={field} style={fieldStyle} /></Field>
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

          <div className="mt-4 flex items-center gap-2 px-5">
            <button onClick={() => act(() => complete.mutate(wt))} className="rounded-lg px-3 py-1.5 text-sm font-medium" style={{ background: "var(--color-green)", color: "#0a0a0a" }}>✓ Complete</button>
            <button onClick={() => act(() => cancel.mutate(wt))} className="rounded-lg border px-3 py-1.5 text-sm" style={{ borderColor: "var(--color-border-strong)", color: "var(--color-text-2)" }}>Cancel task</button>
            <button onClick={() => act(() => remove.mutate(wt))} className="ml-auto rounded-lg px-3 py-1.5 text-sm hover:bg-[var(--color-surface-2)]" style={{ color: "var(--color-red)" }}>Delete</button>
          </div>

          <div className="mt-4 flex items-center justify-between gap-2 border-t px-5 py-3" style={{ borderColor: "var(--color-border)" }}>
            <button onClick={() => openInObsidian(wt.path)} className="truncate text-xs hover:underline" style={{ color: "var(--color-text-3)" }}>
              {wt.path}:{wt.line} ↗
            </button>
            <div className="flex shrink-0 gap-2">
              <Dialog.Close className="rounded-lg border px-4 py-1.5 text-sm" style={{ borderColor: "var(--color-border-strong)", color: "var(--color-text-2)" }}>Close</Dialog.Close>
              <button onClick={() => void save()} className="rounded-lg px-4 py-1.5 text-sm font-medium" style={{ background: "var(--color-accent)", color: "white" }}>Save</button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
