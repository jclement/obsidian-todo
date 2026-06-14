import { Link } from "react-router-dom";
import { useTags } from "../queries";
import { Page } from "./View";
import { EmptyState } from "../components/TaskList";

export function TagsView() {
  const { data: tags, isLoading } = useTags();
  return (
    <Page title="Tags" subtitle={tags ? `${tags.length} tags` : undefined}>
      {isLoading ? null : !tags?.length ? (
        <EmptyState title="No tags yet" hint="Tags on your #task lines show up here automatically." />
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {tags.map((t) => (
            <Link
              key={t.tag}
              to={`/tag/${encodeURIComponent(t.tag)}`}
              className="flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm transition-colors hover:border-[var(--color-accent)]"
              style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
            >
              <span className="truncate">#{t.tag}</span>
              <span className="text-xs tabular-nums" style={{ color: "var(--color-text-3)" }}>{t.count}</span>
            </Link>
          ))}
        </div>
      )}
    </Page>
  );
}
