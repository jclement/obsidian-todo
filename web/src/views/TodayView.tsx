import { useTasks } from "../queries";
import { useAppCtx } from "../app-context";
import { TaskRow } from "../components/TaskRow";
import { EmptyState, Loading } from "../components/TaskList";
import { Page } from "./View";
import { todayStr, dueLabel } from "../lib/format";
import type { Task } from "../types";

/** One dated section: a (optionally highlighted) header + a card of rows. */
function Section({ label, color, tint, tasks }: { label: string; color?: string; tint?: string; tasks: Task[] }) {
  const { vaultName, openEditor } = useAppCtx();
  return (
    <div>
      <div
        className="mb-1.5 flex items-center gap-2 rounded-md px-2 py-1 text-xs font-semibold uppercase tracking-wider"
        style={{ color: color ?? "var(--color-text-3)", background: tint }}
      >
        <span>{label}</span>
        <span className="tabular-nums opacity-70">{tasks.length}</span>
      </div>
      <div className="overflow-hidden rounded-xl border shadow-[var(--shadow-card)]" style={{ borderColor: "var(--color-border)" }}>
        {tasks.map((t) => (
          <TaskRow key={`${t.path}:${t.line}`} task={t} vaultName={vaultName} onEdit={openEditor} />
        ))}
      </div>
    </div>
  );
}

/** "Due" — everything with a due date: Overdue, Due Today, then grouped by day. */
export function TodayView() {
  const q = useTasks("due", { view: "due" });
  const today = todayStr();
  const tasks = q.data ?? [];

  const overdue = tasks.filter((t) => t.due && t.due < today);
  const dueToday = tasks.filter((t) => t.due === today);
  const future = tasks.filter((t) => t.due && t.due > today);

  const futureGroups = new Map<string, Task[]>();
  for (const t of future) {
    const k = t.due!;
    if (!futureGroups.has(k)) futureGroups.set(k, []);
    futureGroups.get(k)!.push(t);
  }
  const futureDays = [...futureGroups.keys()].sort();

  return (
    <Page title="Due" subtitle="Everything with a due date">
      {q.isLoading ? (
        <Loading />
      ) : tasks.length === 0 ? (
        <EmptyState title="Nothing with a due date" hint="Tasks with a due date show here — grouped into overdue, today, and upcoming days." />
      ) : (
        <div className="space-y-5">
          {overdue.length > 0 && (
            <Section label="Overdue" color="var(--color-red)" tint="color-mix(in oklab, var(--color-red) 12%, transparent)" tasks={overdue} />
          )}
          {dueToday.length > 0 && (
            <Section label="Due Today" color="var(--color-amber)" tint="color-mix(in oklab, var(--color-amber) 14%, transparent)" tasks={dueToday} />
          )}
          {futureDays.map((day) => (
            <Section key={day} label={dueLabel(day)} tasks={futureGroups.get(day)!} />
          ))}
        </div>
      )}
    </Page>
  );
}
