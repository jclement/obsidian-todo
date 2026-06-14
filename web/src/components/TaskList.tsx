import { useEffect, useRef, useState } from "react";
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
      } else if (e.key === "e" || e.key === "Enter") {
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
    <div ref={containerRef} className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--color-border)" }}>
      {tasks.map((t, i) => (
        <TaskRow key={`${t.path}:${t.line}`} task={t} vaultName={vaultName} selected={i === sel} onEdit={onEdit} showNote={showNote} />
      ))}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed py-16 text-center" style={{ borderColor: "var(--color-border)" }}>
      <div className="text-3xl opacity-30">✓</div>
      <div className="text-sm" style={{ color: "var(--color-text-2)" }}>{title}</div>
      {hint && <div className="text-xs" style={{ color: "var(--color-text-3)" }}>{hint}</div>}
    </div>
  );
}

export function Loading() {
  return (
    <div className="space-y-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-12 animate-pulse rounded-lg" style={{ background: "var(--color-surface)" }} />
      ))}
    </div>
  );
}
