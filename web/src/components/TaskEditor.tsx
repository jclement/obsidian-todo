import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { Priority, Task } from "../types";
import { useCancel, useComplete, useRemove, useUpdate } from "../queries";
import { obsidianUrl } from "../lib/format";

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: "highest", label: "🔺 Highest" },
  { value: "high", label: "⏫ High" },
  { value: "medium", label: "🔼 Medium" },
  { value: "normal", label: "— Normal" },
  { value: "low", label: "🔽 Low" },
  { value: "lowest", label: "⏬ Lowest" },
];

const field = "w-full rounded-md border bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";
const label = "text-xs font-medium";

export function TaskEditor({ task, vaultName, onClose }: { task: Task | null; vaultName: string; onClose: () => void }) {
  const update = useUpdate();
  const complete = useComplete();
  const cancel = useCancel();
  const remove = useRemove();

  const [desc, setDesc] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [due, setDue] = useState("");
  const [scheduled, setScheduled] = useState("");
  const [recurrence, setRecurrence] = useState("");
  const [reminder, setReminder] = useState("");

  useEffect(() => {
    if (!task) return;
    setDesc(task.description);
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
      changes: {
        description: desc,
        priority,
        due: due || null,
        scheduled: scheduled || null,
        recurrence: recurrence || null,
        reminder: reminder || null,
      },
    });
    onClose();
  };

  const act = (fn: () => void) => {
    fn();
    onClose();
  };

  return (
    <Dialog.Root open={!!task} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92vh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-t-2xl border p-5 shadow-2xl outline-none sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
          style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
        >
          <Dialog.Title className="sr-only">Edit task</Dialog.Title>
          <textarea
            autoFocus
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            rows={2}
            className={field + " resize-none text-base"}
            placeholder="Task description"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
            }}
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className={label}>Priority</div>
              <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className={field}>
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <div className={label}>Reminder</div>
              <input type="time" value={reminder} onChange={(e) => setReminder(e.target.value)} className={field} />
            </div>
            <div>
              <div className={label}>Due</div>
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={field} />
            </div>
            <div>
              <div className={label}>Scheduled</div>
              <input type="date" value={scheduled} onChange={(e) => setScheduled(e.target.value)} className={field} />
            </div>
            <div className="col-span-2">
              <div className={label}>Recurrence</div>
              <input
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value)}
                className={field}
                placeholder="e.g. every week, every 3 days when done"
              />
            </div>
          </div>

          <div className="mt-1 flex items-center justify-between gap-2">
            <div className="flex gap-2">
              <button onClick={() => act(() => complete.mutate(task))} className="rounded-md px-3 py-2 text-sm font-medium" style={{ background: "var(--color-green)", color: "#0a0a0a" }}>
                Complete
              </button>
              <button onClick={() => act(() => cancel.mutate(task))} className="rounded-md border px-3 py-2 text-sm" style={{ borderColor: "var(--color-border-strong)" }}>
                Cancel task
              </button>
            </div>
            <button
              onClick={() => act(() => remove.mutate(task))}
              className="rounded-md px-3 py-2 text-sm"
              style={{ color: "var(--color-red)" }}
            >
              Delete
            </button>
          </div>

          <div className="mt-1 flex items-center justify-between gap-2 border-t pt-3" style={{ borderColor: "var(--color-border)" }}>
            <a href={obsidianUrl(vaultName, task.path)} className="text-xs" style={{ color: "var(--color-text-3)" }}>
              {task.path}:{task.line} ↗
            </a>
            <div className="flex gap-2">
              <Dialog.Close className="rounded-md border px-4 py-2 text-sm" style={{ borderColor: "var(--color-border-strong)" }}>
                Close
              </Dialog.Close>
              <button onClick={save} className="rounded-md px-4 py-2 text-sm font-medium" style={{ background: "var(--color-accent)", color: "white" }}>
                Save
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
