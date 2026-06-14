import { useState } from "react";
import { motion, useMotionValue, animate } from "framer-motion";
import { useDrag } from "@use-gesture/react";
import clsx from "clsx";
import type { Task } from "../types";
import { useComplete, useUncomplete } from "../queries";
import { dueClass, dueLabel, PRIORITY_META, descWithoutTags, extractTags, obsidianUrl } from "../lib/format";
import { Link } from "react-router-dom";

const DUE_COLOR: Record<string, string> = {
  overdue: "var(--color-red)",
  today: "var(--color-amber)",
  soon: "var(--color-text-2)",
  future: "var(--color-text-3)",
  none: "var(--color-text-3)",
};

export function TaskRow({
  task,
  vaultName,
  selected,
  onEdit,
  showNote = true,
}: {
  task: Task;
  vaultName: string;
  selected?: boolean;
  onEdit: (t: Task) => void;
  showNote?: boolean;
}) {
  const complete = useComplete();
  const uncomplete = useUncomplete();
  const [committing, setCommitting] = useState(false);
  const x = useMotionValue(0);

  const done = task.status === "done" || task.status === "cancelled";
  const doComplete = () => {
    setCommitting(true);
    (done ? uncomplete : complete).mutate(task);
  };

  // Swipe: right → complete (green), left → edit (purple). Touch-first.
  const bind = useDrag(
    ({ last, movement: [mx], cancel }) => {
      if (last) {
        if (mx > 90) {
          animate(x, 0, { duration: 0.15 });
          doComplete();
        } else if (mx < -90) {
          animate(x, 0, { duration: 0.15 });
          onEdit(task);
        } else {
          animate(x, 0, { type: "spring", stiffness: 500, damping: 40 });
        }
      } else {
        x.set(Math.max(-120, Math.min(120, mx)));
      }
      void cancel;
    },
    { axis: "x", filterTaps: true, pointer: { touch: true } },
  );

  const tags = extractTags(task.description);
  const desc = descWithoutTags(task.description);
  const dc = dueClass(task.due);
  const prio = PRIORITY_META[task.priority];

  return (
    <div className="relative overflow-hidden">
      {/* swipe action backgrounds */}
      <div className="absolute inset-0 flex items-center justify-between px-5 text-sm font-medium">
        <span style={{ color: "var(--color-green)" }}>✓ Done</span>
        <span style={{ color: "var(--color-accent-2)" }}>Edit</span>
      </div>

      <div {...bind()} style={{ touchAction: "pan-y" }}>
      <motion.div
        style={{ x, background: "var(--color-surface)" }}
        className={clsx(
          "group relative flex items-start gap-3 border-b px-3 py-2.5 sm:px-4",
          committing && "opacity-50",
        )}
      >
        <div
          className={clsx("pointer-events-none absolute inset-y-0 left-0 w-0.5", selected && "bg-[var(--color-accent)]")}
        />
        <button
          aria-label="Complete task"
          title={`Status: [${task.status_char}]`}
          onClick={doComplete}
          className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-[6px] border text-[0.65rem] font-bold leading-none transition-colors hover:border-[var(--color-accent)]"
          style={{ borderColor: "var(--color-border-strong)", color: "var(--color-text-2)" }}
        >
          {task.status === "done" ? "✓" : task.status === "cancelled" ? "✕" : task.status === "todo" ? "" : task.status_char}
        </button>

        <div className="min-w-0 flex-1 cursor-pointer" onClick={() => onEdit(task)}>
          <div className="flex items-center gap-2">
            {prio && <span title={prio.label} className="text-xs">{prio.glyph}</span>}
            <span
              className={clsx("truncate text-[0.95rem] leading-snug", (task.status === "done" || task.status === "cancelled") && "line-through")}
              style={{ color: task.status === "done" || task.status === "cancelled" ? "var(--color-text-3)" : "var(--color-text)" }}
            >
              {desc || "(untitled)"}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs" style={{ color: "var(--color-text-3)" }}>
            {task.due && (
              <span style={{ color: DUE_COLOR[dc] }} className="font-medium">
                📅 {dueLabel(task.due)}
              </span>
            )}
            {task.recurrence && <span title={task.recurrence}>🔁</span>}
            {task.reminder && <span>⏰ {task.reminder}</span>}
            {tags.map((t) => (
              <Link key={t} to={`/tag/${encodeURIComponent(t)}`} className="hover:text-[var(--color-accent-2)]" onClick={(e) => e.stopPropagation()}>
                #{t}
              </Link>
            ))}
            {showNote && (
              <Link
                to={`/project?path=${encodeURIComponent(task.path)}`}
                onClick={(e) => e.stopPropagation()}
                className="rounded-full px-1.5 py-0.5 hover:text-[var(--color-text)]"
                style={{ background: "var(--color-surface-3)" }}
              >
                {task.source_note}
              </Link>
            )}
          </div>
        </div>

        <a
          href={obsidianUrl(vaultName, task.path)}
          onClick={(e) => e.stopPropagation()}
          title="Open in Obsidian"
          className="opacity-0 transition-opacity group-hover:opacity-60 hover:!opacity-100"
          style={{ color: "var(--color-text-3)" }}
        >
          ↗
        </a>
      </motion.div>
      </div>
    </div>
  );
}
