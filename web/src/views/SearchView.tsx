import { useState } from "react";
import { useTasks } from "../queries";
import { Page, ListBody } from "./View";

export function SearchView() {
  const [text, setText] = useState("");
  const [includeDone, setIncludeDone] = useState(false);
  const params: Record<string, string> = { sort: "due" };
  if (text.trim()) params.text = text.trim();
  if (includeDone) params.include_done = "1";
  const q = useTasks("search:" + text + ":" + includeDone, params);

  return (
    <Page title="Search">
      <div className="mb-3 flex items-center gap-3">
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search descriptions…"
          className="flex-1 rounded-lg border bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
          style={{ borderColor: "var(--color-border)" }}
        />
        <label className="flex items-center gap-1.5 text-xs" style={{ color: "var(--color-text-2)" }}>
          <input type="checkbox" checked={includeDone} onChange={(e) => setIncludeDone(e.target.checked)} />
          Include done
        </label>
      </div>
      <ListBody
        loading={q.isLoading}
        tasks={q.data}
        empty={{ title: text ? "No matches" : "Type to search", hint: text ? undefined : "Searches across every task description." }}
      />
    </Page>
  );
}
