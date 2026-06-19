import { Link } from "react-router-dom";
import { CircleCheck, ListTodo, Search, type LucideIcon } from "lucide-react";
import { useProjects, useTags } from "../queries";
import { Page } from "./View";

const VIEWS: { to: string; icon: LucideIcon; label: string }[] = [
  { to: "/all", icon: ListTodo, label: "All open" },
  { to: "/completed", icon: CircleCheck, label: "Completed" },
  { to: "/search", icon: Search, label: "Search" },
];

export function TagsView() {
  const projects = useProjects();
  const tags = useTags();

  return (
    <Page title="Browse">
      {(
        <div className="space-y-6">
          {/* On mobile the bottom tabs don't include these, so surface them here.
              Desktop has them in the sidebar, so this block is mobile-only. */}
          <section className="md:hidden">
            <div className="grid grid-cols-1 gap-2">
              {VIEWS.map((v) => (
                <Link
                  key={v.to}
                  to={v.to}
                  className="flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm hover:border-[var(--color-accent)]"
                  style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
                >
                  <v.icon className="size-4 shrink-0 opacity-80" />
                  <span>{v.label}</span>
                </Link>
              ))}
            </div>
          </section>
          {!!projects.data?.length && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-3)" }}>Projects</h2>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {projects.data.map((p) => (
                  <Link
                    key={p.path}
                    to={`/project?path=${encodeURIComponent(p.path)}`}
                    className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm hover:border-[var(--color-accent)]"
                    style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
                  >
                    <span className="truncate font-medium">{p.note}</span>
                    <span className="flex shrink-0 items-center gap-1 tabular-nums" style={{ color: "var(--color-text-3)" }}>
                      {p.open_count}
                      <span className="text-[0.7rem]">open</span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {!!tags.data?.length && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-3)" }}>Tags</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {tags.data.map((t) => (
                  <Link
                    key={t.tag}
                    to={`/tag/${encodeURIComponent(t.tag)}`}
                    className="flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm hover:border-[var(--color-accent)]"
                    style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
                  >
                    <span className="truncate">#{t.tag}</span>
                    <span className="ml-2 shrink-0 tabular-nums" style={{ color: "var(--color-text-3)" }}>{t.count}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </Page>
  );
}
