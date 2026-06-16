import { forwardRef, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { parseQuickAdd } from "../lib/quickAddParse";
import { useAdd } from "../queries";

const CHIP_COLOR: Record<string, string> = {
  due: "var(--color-amber)",
  priority: "var(--color-red)",
  recurrence: "var(--color-blue)",
  note: "var(--color-accent-2)",
  tag: "var(--color-text-2)",
};

export const QuickAdd = forwardRef<
  HTMLInputElement,
  {
    targetNote?: string;
    autoFocus?: boolean;
    onSubmitted?: () => void;
    defaults?: { due?: string; tag?: string };
    placeholder?: string;
  }
>(function QuickAdd({ targetNote, autoFocus, onSubmitted, defaults, placeholder }, ref) {
    const [text, setText] = useState("");
    const add = useAdd();
    const { draft, chips } = useMemo(() => parseQuickAdd(text), [text]);

    // Inherit the current view's context unless the typed text overrides it.
    const tagInText = !!defaults?.tag && new RegExp(`#${defaults.tag}(?![\\w/-])`).test(draft.description);
    const inheritDue = defaults?.due && !draft.due;
    const inheritTag = defaults?.tag && !tagInText;

    const submit = () => {
      if (!text.trim()) return;
      let description = draft.description;
      if (inheritTag) description = `${description} #${defaults!.tag}`.trim();
      add.mutate({
        ...draft,
        description,
        due: draft.due ?? (inheritDue ? defaults!.due : undefined),
        target_note: draft.target_note ?? targetNote,
      });
      setText("");
      onSubmitted?.();
    };

    return (
      <div>
        <div className="flex items-center gap-3">
          <Plus className="size-5 shrink-0" style={{ color: "var(--color-accent)" }} />
          <input
            ref={ref}
            autoFocus={autoFocus}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") (e.target as HTMLInputElement).blur();
            }}
            placeholder={placeholder ?? "Add a task…  e.g. Fix OData 500 tomorrow #barreleye !!"}
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-[var(--color-text-3)] md:text-[0.95rem]"
          />
        </div>
        {(chips.length > 0 || inheritDue || inheritTag) && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
            {chips.map((c, i) => (
              <span key={i} className="rounded-full px-2 py-0.5" style={{ background: "var(--color-surface-3)", color: CHIP_COLOR[c.kind] }}>
                {c.label}
              </span>
            ))}
            {(inheritDue || inheritTag) && (
              <span className="flex items-center gap-1.5" title="Inherited from the current view">
                {inheritDue && <span className="rounded-full px-2 py-0.5 opacity-60" style={{ background: "var(--color-surface-3)", color: CHIP_COLOR.due }}>📅 {defaults!.due}</span>}
                {inheritTag && <span className="rounded-full px-2 py-0.5 opacity-60" style={{ background: "var(--color-surface-3)", color: CHIP_COLOR.tag }}>#{defaults!.tag}</span>}
              </span>
            )}
          </div>
        )}
      </div>
    );
  },
);
