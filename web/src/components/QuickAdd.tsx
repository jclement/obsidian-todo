import { forwardRef, useMemo, useState } from "react";
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
  { targetNote?: string; aiEnabled: boolean; onOpenAi: () => void; autoFocus?: boolean; onSubmitted?: () => void }
>(function QuickAdd({ targetNote, aiEnabled, onOpenAi, autoFocus, onSubmitted }, ref) {
    const [text, setText] = useState("");
    const add = useAdd();
    const { draft, chips } = useMemo(() => parseQuickAdd(text), [text]);

    const submit = () => {
      if (!text.trim()) return;
      add.mutate({ ...draft, target_note: draft.target_note ?? targetNote });
      setText("");
      onSubmitted?.();
    };

    return (
      <div className="rounded-xl border" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
        <div className="flex items-center gap-2 px-3 py-2">
          <span style={{ color: "var(--color-accent)" }}>+</span>
          <input
            ref={ref}
            autoFocus={autoFocus}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") (e.target as HTMLInputElement).blur();
            }}
            placeholder="Add a task…  e.g. Fix OData 500 tomorrow #barreleye !!"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--color-text-3)]"
          />
          <button
            onClick={onOpenAi}
            title="Capture with AI / dictate"
            className="grid size-9 shrink-0 place-items-center rounded-md border text-sm"
            style={{ borderColor: "var(--color-border-strong)", color: aiEnabled ? "var(--color-accent-2)" : "var(--color-text-3)" }}
          >
            ✨
          </button>
        </div>
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-t px-3 py-2 text-xs" style={{ borderColor: "var(--color-border)" }}>
            {chips.map((c, i) => (
              <span key={i} className="rounded-full px-2 py-0.5" style={{ background: "var(--color-surface-3)", color: CHIP_COLOR[c.kind] }}>
                {c.label}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  },
);
