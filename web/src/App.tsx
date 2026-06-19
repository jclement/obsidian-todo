import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, Route, Routes, useLocation, useSearchParams } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { todayStr, obsidianUrl } from "./lib/format";
import { useVisualViewport } from "./lib/useVisualViewport";
import { useBootstrap } from "./queries";
import { VaultNameDialog } from "./components/VaultNameDialog";
import { AppContext } from "./app-context";
import type { Task } from "./types";
import { Sidebar } from "./components/Sidebar";
import { MobileNav } from "./components/MobileNav";
import { UserMenu } from "./components/UserMenu";
import { CommandPalette } from "./components/CommandPalette";
import { HelpDialog } from "./components/HelpDialog";
import { CaptureModal } from "./components/CaptureModal";
import { BulkAddModal } from "./components/BulkAddModal";
import { VoiceModal } from "./components/VoiceModal";
import { TaskEditor } from "./components/TaskEditor";
import { Toaster } from "./components/Toaster";
import { TodayView } from "./views/TodayView";
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
  useVisualViewport();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [capture, setCapture] = useState<CaptureMode>(null);
  // Bulk-add seed: voice drops a transcript here and asks AI to clean it up.
  const [bulkSeed, setBulkSeed] = useState<{ text: string; autoClean: boolean }>({ text: "", autoClean: false });
  const [editing, setEditing] = useState<Task | null>(null);
  const [live, setLive] = useState<"connected" | "reconnecting">("reconnecting");
  const [captureTarget, setCaptureTarget] = useState<string | undefined>(undefined);
  const [obsidianPath, setObsidianPath] = useState<string | null>(null);
  const loc = useLocation();
  const title = useRouteTitle();

  // New tasks inherit the current view: due today on Today, the tag on a tag
  // view. (Project target is handled separately via captureTarget.)
  const captureDefaults = useMemo<{ due?: string; tag?: string }>(() => {
    if (loc.pathname === "/") return { due: todayStr() };
    if (loc.pathname.startsWith("/tag/")) return { tag: decodeURIComponent(loc.pathname.slice("/tag/".length)) };
    return {};
  }, [loc.pathname]);

  // Quick (q) opens an empty bulk add; voice routes its transcript through here.
  const openBulk = useCallback((text = "", autoClean = false) => {
    setBulkSeed({ text, autoClean });
    setCapture("bulk");
  }, []);

  const openObsidian = useCallback(
    (path: string) => {
      const name = boot.data?.settings.obsidianVaultName?.trim();
      if (name) window.location.href = obsidianUrl(name, path);
      else setObsidianPath(path); // prompt once via the styled dialog
    },
    [boot.data],
  );

  useEffect(() => {
    const onStatus = (e: Event) => setLive((e as CustomEvent).detail);
    window.addEventListener("live:status", onStatus);
    return () => window.removeEventListener("live:status", onStatus);
  }, []);

  // Keyboard: ⌘K palette · q single · b bulk · v voice.
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
      if (e.key === "/") { e.preventDefault(); setPaletteOpen(true); return; } // global search
      if (e.key === "?") { e.preventDefault(); setHelpOpen((o) => !o); return; } // shortcuts help
      if (capture) return; // a capture modal is already open
      if (e.key === "q") { e.preventDefault(); setCapture("single"); }
      else if (e.key === "b") { e.preventDefault(); openBulk(); }
      else if (e.key === "v") { e.preventDefault(); setCapture("voice"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openBulk, capture]);

  const settings = boot.data?.settings;
  const vaultName = boot.data?.vaultName ?? "Vault";
  const aiEnabled = !!settings?.openaiConfigured;
  const conflicts = boot.data?.conflicts ?? [];
  const sync = boot.data?.sync;
  const syncDown =
    settings?.syncMode === "obsidian" && !!sync && sync.desired && sync.state !== "running" && sync.state !== "starting";

  return (
    <AppContext.Provider value={{ vaultName, aiEnabled, openEditor: setEditing, openObsidian, captureTarget, setCaptureTarget }}>
      <MotionConfig reducedMotion="user">
      <div className="flex h-[100dvh] overflow-hidden">
        <aside className="hidden w-64 shrink-0 border-r md:block" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
          <Sidebar />
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          {/* Reverse status indicator: a banner only when the live link is down. */}
          {live === "reconnecting" && (
            <div className="shrink-0 px-4 py-1.5 text-center text-xs font-medium" style={{ background: "var(--color-red)", color: "white" }}>
              Reconnecting… live updates are paused
            </div>
          )}

          {/* Mobile-only top bar: centered view title + user menu. No hamburger —
              the bottom tabs cover navigation. Desktop has no top bar at all. */}
          <header
            className="sticky top-0 z-30 flex items-center gap-2 border-b px-4 pb-2.5 pt-[max(0.875rem,env(safe-area-inset-top))] backdrop-blur-xl md:hidden"
            style={{ borderColor: "var(--color-border)", background: "color-mix(in oklab, var(--color-surface) 80%, transparent)" }}
          >
            <div className="size-8 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1 truncate text-center text-base font-semibold">{title}</div>
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

          <div className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto overscroll-contain px-5 pt-5 pb-[calc(var(--nav-h,4rem)+1rem)] [-webkit-overflow-scrolling:touch] sm:px-6 md:max-w-5xl md:px-8 md:pt-7 md:pb-8">
            <Routes>
              <Route path="/" element={<TodayView />} />
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

          {/* Subtle desktop shortcut strip; ? opens the full list. */}
          <footer
            className="hidden shrink-0 items-center justify-center gap-4 border-t px-6 py-1.5 text-[0.7rem] md:flex"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text-3)", background: "var(--color-surface)" }}
          >
            <FooterKey k="q" label="add" />
            <FooterKey k="/" label="search" />
            <FooterKey k="j k" label="move" />
            <FooterKey k="x" label="done" />
            <FooterKey k="e" label="edit" />
            <button onClick={() => setHelpOpen(true)} className="flex items-center gap-1.5 rounded outline-none hover:text-[var(--color-text-2)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]">
              <FooterKbd>?</FooterKbd> shortcuts
            </button>
          </footer>
        </main>
      </div>

      <MobileNav onAdd={() => setCapture("single")} onVoice={() => setCapture("voice")} aiEnabled={aiEnabled} />
      <CaptureModal open={capture === "single"} onClose={() => setCapture(null)} targetNote={captureTarget} defaults={captureDefaults} />
      <BulkAddModal open={capture === "bulk"} onClose={() => setCapture(null)} aiEnabled={aiEnabled} initialText={bulkSeed.text} autoClean={bulkSeed.autoClean} targetNote={captureTarget} defaults={captureDefaults} />
      <VoiceModal open={capture === "voice"} onClose={() => setCapture(null)} aiEnabled={aiEnabled} onTranscript={(t) => openBulk(t, true)} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onNewTask={() => setCapture("single")} onBulkAdd={() => openBulk()} onVoice={() => setCapture("voice")} />
      <TaskEditor task={editing} vaultName={vaultName} onClose={() => setEditing(null)} />
      {settings && !settings.onboarded && <Wizard settings={settings} mcpUrl={location.origin + "/mcp"} />}
      <VaultNameDialog path={obsidianPath} defaultName={vaultName} onClose={() => setObsidianPath(null)} />
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      <Toaster />
      </MotionConfig>
    </AppContext.Provider>
  );
}

/** Title for the mobile top bar, derived from the current route. */
function useRouteTitle(): string {
  const loc = useLocation();
  const [params] = useSearchParams();
  const p = loc.pathname;
  if (p === "/") return "Due";
  if (p === "/inbox") return "Inbox";
  if (p === "/all") return "All open";
  if (p === "/completed") return "Completed";
  if (p === "/tags") return "Browse";
  if (p === "/search") return "Search";
  if (p.startsWith("/settings")) return "Settings";
  if (p.startsWith("/tag/")) return "#" + decodeURIComponent(p.slice("/tag/".length));
  if (p === "/project") return params.get("path")?.split("/").pop()?.replace(/\.md$/, "") ?? "Project";
  return "Obsidian Todo";
}

function FooterKbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded px-1 py-0.5 text-[0.7rem] font-medium" style={{ background: "var(--color-surface-3)", color: "var(--color-text-2)" }}>
      {children}
    </kbd>
  );
}

function FooterKey({ k, label }: { k: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <FooterKbd>{k}</FooterKbd> {label}
    </span>
  );
}
