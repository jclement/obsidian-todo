import { useTasks } from "../queries";
import { useAppCtx } from "../app-context";
import { TaskRow } from "../components/TaskRow";
import { EmptyState, Loading } from "../components/TaskList";
import { Page } from "./View";
import { dueLabel } from "../lib/format";
import type { Task } from "../types";

export function UpcomingView() {
  const q = useTasks("upcoming", { view: "upcoming", days: "14" });
  const { vaultName, openEditor } = useAppCtx();

  const groups = new Map<string, Task[]>();
  for (const t of q.data ?? []) {
    const key = t.due ?? t.scheduled ?? "later";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }
  const days = [...groups.keys()].sort();

  return (
    <Page title="Upcoming" subtitle="Next 14 days">
      {q.isLoading ? (
        <Loading />
      ) : days.length === 0 ? (
        <EmptyState title="Nothing scheduled" hint="Tasks due in the next two weeks show here, grouped by day." />
      ) : (
        <div className="space-y-5">
          {days.map((day) => (
            <div key={day}>
              <div className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-3)" }}>
                {day === "later" ? "Later" : dueLabel(day)}
              </div>
              <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--color-border)" }}>
                {groups.get(day)!.map((t) => (
                  <TaskRow key={`${t.path}:${t.line}`} task={t} vaultName={vaultName} onEdit={openEditor} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}
