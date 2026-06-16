import { useEffect, useRef, useState } from "react";
import { CircleCheck } from "lucide-react";
import type { Task } from "../types";
import { TaskRow } from "./TaskRow";
import { useComplete } from "../queries";

function isTyping() {
  const el = document.activeElement;
  return el instanceof HTMLElement && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

export function TaskList({
  tasks,
  vaultName,
  onEdit,
  showNote = true,
}: {
  tasks: Task[];
  vaultName: string;
  onEdit: (t: Task) => void;
  showNote?: boolean;
}) {
  const [sel, setSel] = useState(0);
  const complete = useComplete();
  const containerRef = useRef<HTMLDivElement>(null);

  // Keyboard-first: j/k move, x completes, e/Enter edits the selected row.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping() || e.metaKey || e.ctrlKey || e.altKey) return;
      if (!tasks.length) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setSel((s) => Math.min(tasks.length - 1, s + 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setSel((s) => Math.max(0, s - 1));
      } else if (e.key === "x") {
        const t = tasks[Math.min(sel, tasks.length - 1)];
        if (t) complete.mutate(t);
      } else if (e.key === "e") {
        e.preventDefault();
        const t = tasks[Math.min(sel, tasks.length - 1)];
        if (t) onEdit(t);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tasks, sel, complete, onEdit]);

  useEffect(() => {
    if (sel >= tasks.length) setSel(Math.max(0, tasks.length - 1));
  }, [tasks.length, sel]);

  if (!tasks.length) return null;

  return (
    <div ref={containerRef} className="overflow-hidden rounded-2xl border shadow-[var(--shadow-card)]" style={{ borderColor: "var(--color-border)" }}>
      {tasks.map((t, i) => (
        <TaskRow key={`${t.path}:${t.line}`} task={t} vaultName={vaultName} selected={i === sel} onEdit={onEdit} showNote={showNote} />
      ))}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="animate-in flex flex-col items-center justify-center gap-3 py-20 text-center">
      <div className="grid size-16 place-items-center rounded-full" style={{ background: "var(--color-accent-soft)" }}>
        <CircleCheck className="size-7" style={{ color: "var(--color-accent)" }} />
      </div>
      <div className="text-base font-medium" style={{ color: "var(--color-text)" }}>{title}</div>
      {hint && <div className="max-w-xs text-sm" style={{ color: "var(--color-text-3)" }}>{hint}</div>}
    </div>
  );
}

export function Loading() {
  return (
    <div className="overflow-hidden rounded-2xl border shadow-[var(--shadow-card)]" style={{ borderColor: "var(--color-border)" }}>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-start gap-3 border-b px-4 py-3.5 last:border-b-0">
          <div className="size-[22px] shrink-0 animate-pulse rounded-md" style={{ background: "var(--color-surface-2)" }} />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-2/3 animate-pulse rounded" style={{ background: "var(--color-surface-2)" }} />
            <div className="h-3 w-1/3 animate-pulse rounded" style={{ background: "var(--color-surface-2)" }} />
          </div>
        </div>
      ))}
    </div>
  );
}
