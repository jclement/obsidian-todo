import { useCallback, useEffect, useRef, useState } from "react";
import { Route, Routes } from "react-router-dom";
import { useBootstrap } from "./queries";
import { AppContext } from "./app-context";
import type { Task } from "./types";
import { Sidebar } from "./components/Sidebar";
import { MobileNav } from "./components/MobileNav";
import { UserMenu } from "./components/UserMenu";
import { QuickAdd } from "./components/QuickAdd";
import { CommandPalette } from "./components/CommandPalette";
import { AiCaptureDialog } from "./components/AiCaptureDialog";
import { TaskEditor } from "./components/TaskEditor";
import { Toaster } from "./components/Toaster";
import { TodayView } from "./views/TodayView";
import { UpcomingView } from "./views/UpcomingView";
import { InboxView } from "./views/InboxView";
import { AllView } from "./views/AllView";
import { ProjectView } from "./views/ProjectView";
import { TagView } from "./views/TagView";
import { SearchView } from "./views/SearchView";
import { SettingsView } from "./views/SettingsView";

export function App() {
  const boot = useBootstrap();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInitial, setAiInitial] = useState("");
  const [editing, setEditing] = useState<Task | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [live, setLive] = useState<"connected" | "reconnecting">("reconnecting");
  const [captureTarget, setCaptureTarget] = useState<string | undefined>(undefined);
  const quickAddRef = useRef<HTMLInputElement>(null);

  const focusQuickAdd = useCallback(() => quickAddRef.current?.focus(), []);
  const openAiCapture = useCallback((initial = "") => {
    setAiInitial(initial);
    setAiOpen(true);
  }, []);

  useEffect(() => {
    const onStatus = (e: Event) => setLive((e as CustomEvent).detail);
    window.addEventListener("live:status", onStatus);
    return () => window.removeEventListener("live:status", onStatus);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing =
        document.activeElement instanceof HTMLElement &&
        (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA" || document.activeElement.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if (typing) return;
      if (e.key === "c") {
        e.preventDefault();
        focusQuickAdd();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusQuickAdd]);

  const settings = boot.data?.settings;
  const vaultName = boot.data?.vaultName ?? "Vault";
  const aiEnabled = !!settings?.openaiConfigured;
  const conflicts = boot.data?.conflicts ?? [];

  return (
    <AppContext.Provider value={{ vaultName, aiEnabled, openEditor: setEditing, openAiCapture, focusQuickAdd, captureTarget, setCaptureTarget }}>
      <div className="flex h-full">
        {/* Desktop sidebar */}
        <aside className="hidden w-64 shrink-0 border-r md:block" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
          <Sidebar />
        </aside>

        {/* Mobile drawer */}
        {navOpen && (
          <div className="fixed inset-0 z-50 md:hidden" onClick={() => setNavOpen(false)}>
            <div className="absolute inset-0 bg-black/50" />
            <aside className="absolute inset-y-0 left-0 w-72 border-r" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }} onClick={(e) => e.stopPropagation()}>
              <Sidebar onNavigate={() => setNavOpen(false)} />
            </aside>
          </div>
        )}

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-3 border-b px-4 py-2.5" style={{ borderColor: "var(--color-border)" }}>
            <button className="md:hidden" onClick={() => setNavOpen(true)} aria-label="Menu">☰</button>
            <div className="flex-1" />
            <button
              onClick={() => setPaletteOpen(true)}
              className="hidden items-center gap-2 rounded-md border px-2.5 py-1 text-xs sm:flex"
              style={{ borderColor: "var(--color-border-strong)", color: "var(--color-text-3)" }}
            >
              <span>Search…</span>
              <kbd className="rounded bg-[var(--color-surface-3)] px-1">⌘K</kbd>
            </button>
            <span title={live === "connected" ? "Live" : "Reconnecting"} className="size-2 rounded-full" style={{ background: live === "connected" ? "var(--color-green)" : "var(--color-amber)" }} />
            <UserMenu name={vaultName} />
          </header>

          {conflicts.length > 0 && (
            <div className="border-b px-4 py-2 text-sm" style={{ background: "var(--color-surface-2)", borderColor: "var(--color-red)", color: "var(--color-amber)" }}>
              ⚠ {conflicts.length} sync-conflict file(s) in the vault — resolve them in Obsidian: {conflicts.slice(0, 3).join(", ")}
            </div>
          )}

          <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-3 pb-28 pt-4 sm:px-5 md:pb-8">
            <div className="mb-4">
              <QuickAdd ref={quickAddRef} aiEnabled={aiEnabled} onOpenAi={() => openAiCapture()} targetNote={captureTarget} />
            </div>
            <Routes>
              <Route path="/" element={<TodayView />} />
              <Route path="/upcoming" element={<UpcomingView />} />
              <Route path="/inbox" element={<InboxView />} />
              <Route path="/all" element={<AllView />} />
              <Route path="/project" element={<ProjectView />} />
              <Route path="/tag/:tag" element={<TagView />} />
              <Route path="/search" element={<SearchView />} />
              <Route path="/settings" element={<SettingsView />} />
            </Routes>
          </div>
        </main>
      </div>

      <MobileNav onAdd={() => focusQuickAdd()} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onNewTask={focusQuickAdd} onAiCapture={() => openAiCapture()} />
      <AiCaptureDialog open={aiOpen} onClose={() => setAiOpen(false)} aiEnabled={aiEnabled} initialText={aiInitial} />
      <TaskEditor task={editing} vaultName={vaultName} onClose={() => setEditing(null)} />
      <Toaster />
    </AppContext.Provider>
  );
}
