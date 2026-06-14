import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import { todayStr } from "./lib/format";
import { useBootstrap } from "./queries";
import { AppContext } from "./app-context";
import type { Task } from "./types";
import { Sidebar } from "./components/Sidebar";
import { MobileNav } from "./components/MobileNav";
import { UserMenu } from "./components/UserMenu";
import { CommandPalette } from "./components/CommandPalette";
import { CaptureModal } from "./components/CaptureModal";
import { BulkAddModal } from "./components/BulkAddModal";
import { VoiceModal } from "./components/VoiceModal";
import { AiCaptureDialog } from "./components/AiCaptureDialog";
import { TaskEditor } from "./components/TaskEditor";
import { Toaster } from "./components/Toaster";
import { TodayView } from "./views/TodayView";
import { UpcomingView } from "./views/UpcomingView";
import { InboxView } from "./views/InboxView";
import { AllView } from "./views/AllView";
import { CompletedView } from "./views/CompletedView";
import { ProjectView } from "./views/ProjectView";
import { TagView } from "./views/TagView";
import { TagsView } from "./views/TagsView";
import { SearchView } from "./views/SearchView";
import { SettingsView } from "./views/SettingsView";
import { SettingsLayout } from "./views/SettingsLayout";
import { PasskeysView } from "./views/admin/PasskeysView";
import { TokensView } from "./views/admin/TokensView";
import { ConnectionsView } from "./views/admin/ConnectionsView";
import { ActivityView } from "./views/admin/ActivityView";
import { SnapshotsView } from "./views/admin/SnapshotsView";
import { SyncView } from "./views/admin/SyncView";
import { GuidanceView } from "./views/admin/GuidanceView";
import { Wizard } from "./components/Wizard";

type CaptureMode = null | "single" | "bulk" | "voice";

export function App() {
  const boot = useBootstrap();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [capture, setCapture] = useState<CaptureMode>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInitial, setAiInitial] = useState("");
  const [aiAuto, setAiAuto] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [live, setLive] = useState<"connected" | "reconnecting">("reconnecting");
  const [captureTarget, setCaptureTarget] = useState<string | undefined>(undefined);
  const loc = useLocation();

  // New tasks inherit the current view: due today on Today, the tag on a tag
  // view. (Project target is handled separately via captureTarget.)
  const captureDefaults = useMemo<{ due?: string; tag?: string }>(() => {
    if (loc.pathname === "/") return { due: todayStr() };
    if (loc.pathname.startsWith("/tag/")) return { tag: decodeURIComponent(loc.pathname.slice("/tag/".length)) };
    return {};
  }, [loc.pathname]);

  const openAi = useCallback((initial = "", auto = false) => {
    setAiInitial(initial);
    setAiAuto(auto);
    setAiOpen(true);
  }, []);

  useEffect(() => {
    const onStatus = (e: Event) => setLive((e as CustomEvent).detail);
    window.addEventListener("live:status", onStatus);
    return () => window.removeEventListener("live:status", onStatus);
  }, []);

  // Keyboard: ⌘K palette · q single · b bulk · v voice · a AI.
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
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "q") { e.preventDefault(); setCapture("single"); }
      else if (e.key === "b") { e.preventDefault(); setCapture("bulk"); }
      else if (e.key === "v") { e.preventDefault(); setCapture("voice"); }
      else if (e.key === "a") { e.preventDefault(); openAi(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openAi]);

  const settings = boot.data?.settings;
  const vaultName = boot.data?.vaultName ?? "Vault";
  const aiEnabled = !!settings?.openaiConfigured;
  const conflicts = boot.data?.conflicts ?? [];
  const sync = boot.data?.sync;
  const syncDown =
    settings?.syncMode === "obsidian" && !!sync && sync.desired && sync.state !== "running" && sync.state !== "starting";

  return (
    <AppContext.Provider value={{ vaultName, aiEnabled, openEditor: setEditing, captureTarget, setCaptureTarget }}>
      <div className="flex h-full">
        <aside className="hidden w-64 shrink-0 border-r md:block" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
          <Sidebar />
        </aside>

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
              onClick={() => setCapture("single")}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium text-white"
              style={{ background: "var(--color-accent)" }}
              title="New task (q)"
            >
              <span className="text-base leading-none">+</span> Add
            </button>
            <button
              onClick={() => setPaletteOpen(true)}
              className="hidden items-center gap-2 rounded-md border px-2.5 py-1 text-xs sm:flex"
              style={{ borderColor: "var(--color-border-strong)", color: "var(--color-text-3)" }}
            >
              <span>Search…</span>
              <kbd className="rounded bg-[var(--color-surface-3)] px-1">⌘K</kbd>
            </button>
            <span title={live === "connected" ? "Live updates connected" : "Reconnecting…"} className="size-2 rounded-full" style={{ background: live === "connected" ? "var(--color-green)" : "var(--color-amber)" }} />
            <UserMenu name={vaultName} />
          </header>

          {syncDown && (
            <div className="flex items-center justify-between gap-3 border-b px-4 py-2 text-sm" style={{ background: "var(--color-surface-2)", borderColor: "var(--color-amber)", color: "var(--color-amber)" }}>
              <span>⚠ Obsidian Sync is {sync!.state} — edits won't reach your other devices until it reconnects. The vault on disk still works.</span>
              <Link to="/settings/sync" className="shrink-0 underline">Fix</Link>
            </div>
          )}
          {conflicts.length > 0 && (
            <div className="border-b px-4 py-2 text-sm" style={{ background: "var(--color-surface-2)", borderColor: "var(--color-red)", color: "var(--color-amber)" }}>
              ⚠ {conflicts.length} sync-conflict file(s) in the vault — resolve them in Obsidian: {conflicts.slice(0, 3).join(", ")}
            </div>
          )}

          <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-3 pb-28 pt-4 sm:px-5 md:pb-8">
            <Routes>
              <Route path="/" element={<TodayView />} />
              <Route path="/upcoming" element={<UpcomingView />} />
              <Route path="/inbox" element={<InboxView />} />
              <Route path="/all" element={<AllView />} />
              <Route path="/completed" element={<CompletedView />} />
              <Route path="/project" element={<ProjectView />} />
              <Route path="/tag/:tag" element={<TagView />} />
              <Route path="/tags" element={<TagsView />} />
              <Route path="/search" element={<SearchView />} />
              <Route path="/settings" element={<SettingsLayout />}>
                <Route index element={<SettingsView />} />
                <Route path="passkeys" element={<PasskeysView />} />
                <Route path="tokens" element={<TokensView />} />
                <Route path="connections" element={<ConnectionsView />} />
                <Route path="sync" element={<SyncView />} />
                <Route path="snapshots" element={<SnapshotsView />} />
                <Route path="activity" element={<ActivityView />} />
                <Route path="guidance" element={<GuidanceView />} />
              </Route>
            </Routes>
          </div>
        </main>
      </div>

      <MobileNav onAdd={() => setCapture("single")} />
      <CaptureModal open={capture === "single"} onClose={() => setCapture(null)} aiEnabled={aiEnabled} onOpenAi={() => openAi()} targetNote={captureTarget} defaults={captureDefaults} />
      <BulkAddModal open={capture === "bulk"} onClose={() => setCapture(null)} targetNote={captureTarget} defaults={captureDefaults} />
      <VoiceModal open={capture === "voice"} onClose={() => setCapture(null)} aiEnabled={aiEnabled} onTranscript={(t) => { setCapture(null); openAi(t, true); }} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onNewTask={() => setCapture("single")} onBulkAdd={() => setCapture("bulk")} onVoice={() => setCapture("voice")} onAiCapture={() => openAi()} />
      <AiCaptureDialog open={aiOpen} onClose={() => setAiOpen(false)} aiEnabled={aiEnabled} initialText={aiInitial} autoProcess={aiAuto} />
      <TaskEditor task={editing} vaultName={vaultName} onClose={() => setEditing(null)} />
      {settings && !settings.onboarded && <Wizard settings={settings} mcpUrl={location.origin + "/mcp"} />}
      <Toaster />
    </AppContext.Provider>
  );
}
