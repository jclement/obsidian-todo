import { useRef, useState } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { useDrag } from "@use-gesture/react";
import { ArrowUpRight, Bell, Calendar, Check, FileText, ListChecks, Repeat, X } from "lucide-react";
import clsx from "clsx";
import type { Task } from "../types";
import { useComplete, useUncomplete } from "../queries";
import { dueClass, dueLabel, PRIORITY_META, descWithoutTags, extractTags } from "../lib/format";
import { useOpenInObsidian } from "../lib/obsidian";
import { Inline } from "./Inline";
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
  const openInObsidian = useOpenInObsidian();
  const [committing, setCommitting] = useState(false);
  const x = useMotionValue(0);
  // A committed swipe also emits a trailing synthetic click; this flag lets the
  // onClick handlers ignore it so a swipe doesn't also toggle/open the task.
  const dragged = useRef(false);
  // Swipe backgrounds fill with color as the row is dragged (premium feel).
  const doneBg = useTransform(x, [0, 90], ["rgba(26,158,96,0)", "rgba(26,158,96,0.18)"]);
  const editBg = useTransform(x, [-90, 0], ["rgba(124,58,237,0.18)", "rgba(124,58,237,0)"]);

  const done = task.status === "done" || task.status === "cancelled";
  const markDragged = () => {
    dragged.current = true;
    window.setTimeout(() => { dragged.current = false; }, 400); // outlast the synthetic click
  };
  const doComplete = () => {
    if (dragged.current) return;
    setCommitting(true);
    (done ? uncomplete : complete).mutate(task);
  };
  const openEdit = () => {
    if (dragged.current) return;
    onEdit(task);
  };

  // Swipe: right → complete (green), left → edit (purple). Touch-first.
  const bind = useDrag(
    ({ last, movement: [mx] }) => {
      if (last) {
        if (mx > 90) {
          markDragged();
          animate(x, 0, { duration: 0.15 });
          setCommitting(true);
          (done ? uncomplete : complete).mutate(task);
        } else if (mx < -90) {
          markDragged();
          animate(x, 0, { duration: 0.15 });
          onEdit(task);
        } else {
          animate(x, 0, { type: "spring", stiffness: 500, damping: 40 });
        }
      } else {
        x.set(Math.max(-120, Math.min(120, mx)));
      }
    },
    { axis: "x", filterTaps: true, pointer: { touch: true } },
  );

  const tags = extractTags(task.description);
  const desc = descWithoutTags(task.description);
  const dc = dueClass(task.due);
  const prio = PRIORITY_META[task.priority];

  return (
    <div className="relative overflow-hidden">
      {/* swipe action backgrounds (fill with color as the row is dragged) */}
      <motion.div style={{ background: doneBg }} className="absolute inset-y-0 left-0 right-0 flex items-center px-5 text-sm font-medium">
        <span className="flex items-center gap-1.5" style={{ color: "var(--color-green)" }}><Check className="size-4" /> Done</span>
      </motion.div>
      <motion.div style={{ background: editBg }} className="absolute inset-y-0 left-0 right-0 flex items-center justify-end px-5 text-sm font-medium">
        <span style={{ color: "var(--color-accent-2)" }}>Edit</span>
      </motion.div>

      <div {...bind()} style={{ touchAction: "pan-y" }}>
      <motion.div
        style={{ x }}
        whileTap={{ scale: 0.985 }}
        className={clsx(
          "group relative flex items-start gap-3 border-b px-4 py-3 transition-colors md:py-1.5",
          selected
            ? "bg-[var(--color-accent-soft)]"
            : "bg-[var(--color-surface)] active:bg-[var(--color-surface-2)] md:hover:bg-[var(--color-surface-2)]",
          committing && "opacity-50",
        )}
      >
        <div
          className={clsx("pointer-events-none absolute inset-y-0 left-0 w-[3px]", selected && "bg-[var(--color-accent)]")}
        />
        <button
          aria-label={`${done ? "Mark incomplete" : "Complete"}: ${desc || "untitled"}`}
          title={`Status: [${task.status_char}]`}
          onClick={doComplete}
          className="relative mt-0.5 grid size-[22px] shrink-0 place-items-center rounded-[6px] border text-[0.65rem] font-bold leading-none outline-none transition-colors before:absolute before:-inset-y-3 before:-left-3 before:right-0 hover:border-[var(--color-accent)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] md:size-5"
          style={{ borderColor: "var(--color-border-strong)", color: "var(--color-text-2)" }}
        >
          {task.status === "done" ? <Check className="size-3.5" strokeWidth={3} /> : task.status === "cancelled" ? <X className="size-3.5" strokeWidth={3} /> : task.status === "todo" ? "" : task.status_char}
        </button>

        <div
          role="button"
          tabIndex={0}
          aria-label={`Edit: ${desc || "untitled"}`}
          className="min-w-0 flex-1 cursor-pointer rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] md:flex md:items-baseline md:gap-3"
          onClick={openEdit}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openEdit(); } }}
        >
          <div className="flex min-w-0 items-center gap-2 md:flex-1">
            {prio && <span title={prio.label} className="text-xs">{prio.glyph}</span>}
            <span
              className={clsx("min-w-0 break-words text-[1.0625rem] leading-[1.35] md:text-[0.95rem] md:leading-snug", (task.status === "done" || task.status === "cancelled") && "line-through")}
              style={{ color: task.status === "done" || task.status === "cancelled" ? "var(--color-text)" : "var(--color-text)", opacity: task.status === "done" || task.status === "cancelled" ? 0.55 : 1 }}
            >
              {desc ? <Inline text={desc} onWikilink={openInObsidian} /> : "(untitled)"}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[0.8125rem] md:mt-0 md:shrink-0 md:flex-nowrap md:gap-x-4 md:text-xs" style={{ color: "var(--color-text-3)" }}>
            {task.due && (
              <span style={{ color: DUE_COLOR[dc] }} className="flex items-center gap-1 font-medium">
                <Calendar className="size-3.5" /> {dueLabel(task.due)}
              </span>
            )}
            {task.recurrence && <span title={task.recurrence} className="flex items-center"><Repeat className="size-3.5" /></span>}
            {task.reminder && <span className="flex items-center gap-1"><Bell className="size-3.5" /> {task.reminder}</span>}
            {task.subitems.length > 0 && (
              <span title="Sub-checklist" className="flex items-center gap-1"><ListChecks className="size-3.5" /> {task.subitems.filter((s) => s.checked).length}/{task.subitems.length}</span>
            )}
            {task.subitems.length === 0 && task.notes && <span title="Has notes" className="flex items-center"><FileText className="size-3.5" /></span>}
            {tags.map((t) => (
              <Link key={t} to={`/tag/${encodeURIComponent(t)}`} className="inline-flex min-h-[28px] items-center hover:text-[var(--color-accent-2)] md:min-h-0" onClick={(e) => e.stopPropagation()}>
                #{t}
              </Link>
            ))}
            {showNote && (
              <Link
                to={`/project?path=${encodeURIComponent(task.path)}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex min-h-[28px] max-w-[40vw] items-center truncate rounded-full px-2 py-1 hover:text-[var(--color-text)] md:min-h-0 md:max-w-[14rem]"
                style={{ background: "var(--color-surface-3)" }}
              >
                {task.source_note}
              </Link>
            )}
          </div>
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); openInObsidian(task.path); }}
          title="Open in Obsidian"
          aria-label="Open in Obsidian"
          className="grid size-8 shrink-0 -mr-1.5 -mt-1 place-items-center rounded-md opacity-60 outline-none transition-opacity hover:!opacity-100 focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] md:opacity-0 md:group-hover:opacity-60"
          style={{ color: "var(--color-text-3)" }}
        >
          <ArrowUpRight className="size-4" />
        </button>
      </motion.div>
      </div>
    </div>
  );
}
