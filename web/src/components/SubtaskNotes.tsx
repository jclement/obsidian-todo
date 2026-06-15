import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { motion } from "framer-motion";
import { api, ApiError } from "../api";
import { toast } from "../toast";
import { useOpenInObsidian } from "../lib/obsidian";
import { Inline } from "./Inline";
import type { Task } from "../types";

/**
 * Manage a task's sub-checklist + free-text notes (the indented block beneath
 * the #task line) as ONE structured value. Rows render inline Markdown when not
 * being edited (click to edit); the whole block is committed via api.updateNotes,
 * which returns the fresh task so the editor never reuses a stale file_hash.
 */

export interface SubtaskNotesHandle {
  commit: () => Promise<Task>;
}

type Block =
  | { id: number; kind: "item"; char: string; text: string; indent: number }
  | { id: number; kind: "text"; text: string };

const SUB = /^(\s*)([-*+]|\d+[.)])\s+\[(.)\]\s*(.*)$/;
let uid = 1;
const isChecked = (c: string) => c === "x" || c === "X";

function parse(notes: string): Block[] {
  if (notes.trim() === "") return [];
  return notes.replace(/\n+$/, "").split("\n").map((l): Block => {
    const m = SUB.exec(l);
    if (m) {
      const indent = Math.min(2, Math.floor(m[1]!.replace(/\t/g, "  ").length / 2));
      return { id: uid++, kind: "item", char: m[3]!, text: m[4]!.trim(), indent };
    }
    return { id: uid++, kind: "text", text: l };
  });
}

const serialize = (b: Block[]) =>
  b.map((x) => (x.kind === "item" ? `${"  ".repeat(x.indent)}- [${x.char || " "}] ${x.text}` : x.text)).join("\n");

export const SubtaskNotes = forwardRef<SubtaskNotesHandle, { task: Task; onTaskChange: (t: Task) => void }>(
  function SubtaskNotes({ task, onTaskChange }, ref) {
    const [blocks, setBlocks] = useState<Block[]>(() => parse(task.notes));
    const blocksRef = useRef(blocks);
    blocksRef.current = blocks;
    const dirty = useRef(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const inputs = useRef<Record<number, HTMLInputElement | null>>({});
    const openInObsidian = useOpenInObsidian();

    useEffect(() => {
      if (!dirty.current) setBlocks(parse(task.notes));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [task.file_hash, task.notes]);

    useEffect(() => {
      if (editingId != null) inputs.current[editingId]?.focus();
    }, [editingId]);

    const persist = async (nb: Block[]): Promise<Task> => {
      dirty.current = false;
      try {
        const fresh = await api.updateNotes(task, serialize(nb));
        if (fresh) { onTaskChange(fresh); return fresh; }
      } catch (e) {
        if (e instanceof ApiError && e.isConflict) toast("Task changed elsewhere — reloaded", "info");
        else toast(e instanceof Error ? e.message : "Couldn't save notes", "error");
        setBlocks(parse(task.notes));
      }
      return task;
    };

    useImperativeHandle(ref, () => ({
      commit: () => (dirty.current ? persist(blocksRef.current) : Promise.resolve(task)),
    }));

    const patch = (id: number, fn: (b: Block) => Block) => {
      const nb = blocks.map((b) => (b.id === id ? fn(b) : b));
      setBlocks(nb);
      return nb;
    };

    const toggle = (b: Extract<Block, { kind: "item" }>) =>
      void persist(patch(b.id, (x) => (x.kind === "item" ? { ...x, char: isChecked(x.char) ? " " : "x" } : x)));

    const edit = (id: number, text: string) => { patch(id, (b) => ({ ...b, text })); dirty.current = true; };

    const addAfter = (id: number | null, kind: Block["kind"]) => {
      const nb: Block = kind === "item" ? { id: uid++, kind: "item", char: " ", text: "", indent: 0 } : { id: uid++, kind: "text", text: "" };
      setBlocks((bs) => {
        const i = id == null ? bs.length - 1 : bs.findIndex((b) => b.id === id);
        return [...bs.slice(0, i + 1), nb, ...bs.slice(i + 1)];
      });
      dirty.current = true;
      setEditingId(nb.id);
    };

    const removeRow = (id: number, focusPrev = false) => {
      const idx = blocks.findIndex((b) => b.id === id);
      setBlocks((bs) => bs.filter((b) => b.id !== id));
      dirty.current = true;
      setEditingId(focusPrev && idx > 0 ? blocks[idx - 1]!.id : null);
    };

    const move = (idx: number, dir: -1 | 1) => {
      const j = idx + dir;
      if (j < 0 || j >= blocks.length) return;
      setBlocks((bs) => { const c = [...bs]; [c[idx], c[j]] = [c[j]!, c[idx]!]; return c; });
      dirty.current = true;
    };

    const onKey = (e: React.KeyboardEvent, b: Block, idx: number) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (b.text.trim() === "") { setEditingId(null); (e.target as HTMLInputElement).blur(); return; }
        addAfter(b.id, b.kind);
      } else if (e.key === "Backspace" && b.text === "") {
        e.preventDefault();
        removeRow(b.id, true);
      } else if (e.key === "Escape") {
        setEditingId(null);
        (e.target as HTMLInputElement).blur();
      } else if (e.key === "Tab" && b.kind === "item") {
        e.preventDefault();
        patch(b.id, (x) => (x.kind === "item" ? { ...x, indent: Math.max(0, Math.min(2, x.indent + (e.shiftKey ? -1 : 1))) } : x));
        dirty.current = true;
      } else if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        move(idx, e.key === "ArrowUp" ? -1 : 1);
      }
    };

    const items = blocks.filter((b): b is Extract<Block, { kind: "item" }> => b.kind === "item");
    const done = items.filter((i) => isChecked(i.char)).length;
    const addBtn = "flex items-center gap-1.5 rounded-md py-1 pl-1 pr-2 text-sm hover:bg-[var(--color-surface-2)]";

    return (
      <div className="px-5 pt-3" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) void (dirty.current && persist(blocksRef.current)); }}>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[0.7rem] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-3)" }}>Sub-tasks & notes</span>
          {items.length > 0 && <span className="text-[0.7rem] tabular-nums" style={{ color: "var(--color-text-3)" }}>{done}/{items.length}</span>}
        </div>

        {items.length > 0 && (
          <div className="mb-2 h-1 overflow-hidden rounded-full" style={{ background: "var(--color-surface-2)" }}>
            <motion.div className="h-full rounded-full" style={{ background: "var(--color-accent)" }} animate={{ width: `${(done / items.length) * 100}%` }} transition={{ duration: 0.25 }} />
          </div>
        )}

        <div className="space-y-0.5">
          {blocks.map((b, idx) => (
            <div
              key={b.id}
              className="group flex items-start gap-2 rounded-md py-0.5 pl-1 pr-1 hover:bg-[var(--color-surface-2)]"
              style={{ marginLeft: b.kind === "item" ? `${b.indent * 1.1}rem` : 0 }}
            >
              {b.kind === "item" ? (
                <button
                  onClick={() => toggle(b)}
                  className="mt-[3px] grid size-4 shrink-0 place-items-center rounded-[5px] border text-[0.6rem] font-bold leading-none"
                  style={{ borderColor: "var(--color-border-strong)", background: isChecked(b.char) ? "var(--color-accent)" : "transparent", color: "white" }}
                >
                  {isChecked(b.char) ? "✓" : ""}
                </button>
              ) : (
                <span className="mt-[3px] w-4 shrink-0 text-center text-[0.65rem]" style={{ color: "var(--color-text-3)" }}>¶</span>
              )}

              {editingId === b.id ? (
                <input
                  ref={(el) => { inputs.current[b.id] = el; }}
                  value={b.text}
                  onChange={(e) => edit(b.id, e.target.value)}
                  onKeyDown={(e) => onKey(e, b, idx)}
                  onBlur={() => setEditingId(null)}
                  placeholder={b.kind === "item" ? "Sub-task" : "Note"}
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--color-text-3)]"
                />
              ) : (
                <div
                  onClick={() => setEditingId(b.id)}
                  className={"min-w-0 flex-1 cursor-text text-sm " + (b.kind === "item" && isChecked(b.char) ? "line-through" : "")}
                  style={b.kind === "item" && isChecked(b.char) ? { color: "var(--color-text-3)" } : undefined}
                >
                  {b.text.trim() ? <Inline text={b.text} onWikilink={openInObsidian} /> : <span style={{ color: "var(--color-text-3)" }}>{b.kind === "item" ? "Sub-task" : "Note"}</span>}
                </div>
              )}

              <button onClick={() => removeRow(b.id)} className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100" style={{ color: "var(--color-text-3)" }} title="Delete">✕</button>
            </div>
          ))}

          <div className="mt-1 flex gap-2" style={{ color: "var(--color-text-3)" }}>
            <button onClick={() => addAfter(null, "item")} className={addBtn}><span className="w-3 text-center">+</span> Sub-task</button>
            <button onClick={() => addAfter(null, "text")} className={addBtn}><span className="w-3 text-center">¶</span> Note</button>
          </div>
        </div>
      </div>
    );
  },
);
