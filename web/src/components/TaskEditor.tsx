import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { Priority, Task, TaskStatus } from "../types";
import { useCancel, useComplete, useRemove, useUpdate } from "../queries";
import { useOpenInObsidian } from "../lib/obsidian";

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
// Suppress password-manager autofill badges (the stray red square) on these fields.
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

export function TaskEditor({ task, vaultName, onClose }: { task: Task | null; vaultName: string; onClose: () => void }) {
  const update = useUpdate();
  const complete = useComplete();
  const cancel = useCancel();
  const remove = useRemove();
  const openInObsidian = useOpenInObsidian();

  const [desc, setDesc] = useState("");
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [priority, setPriority] = useState<Priority>("normal");
  const [due, setDue] = useState("");
  const [scheduled, setScheduled] = useState("");
  const [recurrence, setRecurrence] = useState("");
  const [reminder, setReminder] = useState("");

  useEffect(() => {
    if (!task) return;
    setDesc(task.description);
    setStatus(task.status);
    setPriority(task.priority);
    setDue(task.due ?? "");
    setScheduled(task.scheduled ?? "");
    setRecurrence(task.recurrence ?? "");
    setReminder(task.reminder ?? "");
  }, [task]);

  if (!task) return null;

  const save = () => {
    update.mutate({
      task,
      changes: { description: desc, status, priority, due: due || null, scheduled: scheduled || null, recurrence: recurrence || null, reminder: reminder || null },
    });
    onClose();
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

          {/* Title */}
          <div className="px-5 pt-5">
            <textarea
              autoFocus
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={1}
              className="w-full resize-none rounded-lg bg-transparent text-[1.05rem] font-medium leading-snug outline-none placeholder:text-[var(--color-text-3)]"
              placeholder="Task description"
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save(); }}
            />
          </div>

          {/* Properties */}
          <div className="grid grid-cols-2 gap-3 px-5 pt-2">
            <Field label="Due"><input type="date" {...noFill} value={due} onChange={(e) => setDue(e.target.value)} className={field} style={fieldStyle} /></Field>
            <Field label="Scheduled"><input type="date" {...noFill} value={scheduled} onChange={(e) => setScheduled(e.target.value)} className={field} style={fieldStyle} /></Field>
            <Field label="Status">
              <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)} className={field} style={fieldStyle}>
                <option value="todo">To do</option>
                <option value="in_progress">In progress</option>
                <option value="done">Done</option>
                <option value="cancelled">Cancelled</option>
                {task.status === "other" && <option value="other">Custom [{task.status_char}]</option>}
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

          {/* Quick actions */}
          <div className="mt-4 flex items-center gap-2 px-5">
            <button onClick={() => act(() => complete.mutate(task))} className="rounded-lg px-3 py-1.5 text-sm font-medium" style={{ background: "var(--color-green)", color: "#0a0a0a" }}>✓ Complete</button>
            <button onClick={() => act(() => cancel.mutate(task))} className="rounded-lg border px-3 py-1.5 text-sm" style={{ borderColor: "var(--color-border-strong)", color: "var(--color-text-2)" }}>Cancel task</button>
            <button onClick={() => act(() => remove.mutate(task))} className="ml-auto rounded-lg px-3 py-1.5 text-sm hover:bg-[var(--color-surface-2)]" style={{ color: "var(--color-red)" }}>Delete</button>
          </div>

          {/* Footer */}
          <div className="mt-4 flex items-center justify-between gap-2 border-t px-5 py-3" style={{ borderColor: "var(--color-border)" }}>
            <button onClick={() => openInObsidian(task.path)} className="truncate text-xs hover:underline" style={{ color: "var(--color-text-3)" }}>
              {task.path}:{task.line} ↗
            </button>
            <div className="flex shrink-0 gap-2">
              <Dialog.Close className="rounded-lg border px-4 py-1.5 text-sm" style={{ borderColor: "var(--color-border-strong)", color: "var(--color-text-2)" }}>Close</Dialog.Close>
              <button onClick={save} className="rounded-lg px-4 py-1.5 text-sm font-medium" style={{ background: "var(--color-accent)", color: "white" }}>Save</button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
