import type { ReactNode } from "react";
import { useAppCtx } from "../app-context";
import { TaskList, EmptyState, Loading } from "../components/TaskList";
import type { Task } from "../types";

export function Page({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="animate-in">
      {/* Desktop has no top bar, so the page title lives here. On mobile the
          top bar shows it, so this is hidden to avoid duplication. */}
      <div className="mb-4 hidden md:flex md:flex-row md:items-baseline md:justify-between">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <span className="text-xs" style={{ color: "var(--color-text-3)" }}>{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

/** Standard list body with loading / empty handling. */
export function ListBody({
  loading,
  tasks,
  empty,
  showNote = true,
}: {
  loading: boolean;
  tasks: Task[] | undefined;
  empty: { title: string; hint?: string };
  showNote?: boolean;
}) {
  const { vaultName, openEditor } = useAppCtx();
  if (loading) return <Loading />;
  if (!tasks || tasks.length === 0) return <EmptyState title={empty.title} hint={empty.hint} />;
  return <TaskList tasks={tasks} vaultName={vaultName} onEdit={openEditor} showNote={showNote} />;
}
