import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSaveSettings } from "../queries";
import type { Settings } from "../types";

const field = "w-full rounded-md border bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";
const fieldStyle = { borderColor: "var(--color-border)" } as const;
const label = "mb-1 block text-xs font-medium";

type SyncMode = Settings["syncMode"];

/** First-run setup. Blocks the app until completed (or skipped) the first time. */
export function Wizard({ settings, mcpUrl }: { settings: Settings; mcpUrl: string }) {
  const save = useSaveSettings();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [globalFilter, setGlobalFilter] = useState(settings.globalFilter);
  const [inboxNote, setInboxNote] = useState(settings.inboxNote);
  const [syncMode, setSyncMode] = useState<SyncMode>(settings.syncMode);
  const [openaiKey, setOpenaiKey] = useState("");
  const [ntfyUrl, setNtfyUrl] = useState(settings.ntfyUrl);
  const [ntfyTopic, setNtfyTopic] = useState(settings.ntfyTopic);
  const [notifyEnabled, setNotifyEnabled] = useState(settings.notifyEnabled);

  const finish = (skip = false) => {
    const patch: any = { onboarded: true };
    if (!skip) {
      patch.globalFilter = globalFilter;
      patch.inboxNote = inboxNote;
      patch.syncMode = syncMode;
      patch.ntfyUrl = ntfyUrl;
      patch.ntfyTopic = ntfyTopic;
      patch.notifyEnabled = notifyEnabled;
      if (openaiKey) patch.openaiKey = openaiKey;
    }
    save.mutate(patch); // bootstrap refetch hides the wizard
    // Obsidian Sync needs login + vault selection — hand off to that screen.
    if (!skip && syncMode === "obsidian") navigate("/settings/sync");
  };

  const steps = [
    {
      title: "Welcome to Obsidian Todo",
      body: (
        <div className="space-y-3 text-sm" style={{ color: "var(--color-text-2)" }}>
          <p>This is a fast task manager on top of your Obsidian vault. Your markdown <code>#task</code> checkboxes stay the source of truth — nothing is locked into a separate database.</p>
          <p>Let's set a few things up. Takes about 30 seconds, and you can change all of it later in Settings.</p>
        </div>
      ),
    },
    {
      title: "Capture",
      body: (
        <div className="space-y-4">
          <div>
            <label className={label}>Global filter tag</label>
            <input className={field} style={fieldStyle} value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)} />
            <p className="mt-1 text-xs" style={{ color: "var(--color-text-3)" }}>Only checkbox lines with this tag are managed as tasks. The Obsidian Tasks default is <code>#task</code>.</p>
          </div>
          <div>
            <label className={label}>Inbox note</label>
            <input className={field} style={fieldStyle} value={inboxNote} onChange={(e) => setInboxNote(e.target.value)} />
            <p className="mt-1 text-xs" style={{ color: "var(--color-text-3)" }}>New quick-adds without a project are appended here.</p>
          </div>
        </div>
      ),
    },
    {
      title: "How do you sync your vault?",
      body: (
        <div className="space-y-2">
          {([
            ["external", "Syncthing / filesystem", "The vault folder is synced by something else (Syncthing, a bind mount, Dropbox…). Recommended for this setup."],
            ["obsidian", "Obsidian Sync", "Use the built-in headless Obsidian Sync client. We'll take you to sign in and pick your vault on the next screen, and warn you if it goes down."],
            ["none", "No sync", "This is the only device touching the vault."],
          ] as [SyncMode, string, string][]).map(([val, title, desc]) => (
            <button
              key={val}
              onClick={() => setSyncMode(val)}
              className="flex w-full items-start gap-3 rounded-lg border p-3 text-left"
              style={{ borderColor: syncMode === val ? "var(--color-accent)" : "var(--color-border)", background: syncMode === val ? "var(--color-accent-soft)" : "transparent" }}
            >
              <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border" style={{ borderColor: syncMode === val ? "var(--color-accent)" : "var(--color-border-strong)" }}>
                {syncMode === val && <span className="size-2 rounded-full" style={{ background: "var(--color-accent)" }} />}
              </span>
              <span>
                <span className="text-sm font-medium">{title}</span>
                <span className="block text-xs" style={{ color: "var(--color-text-3)" }}>{desc}</span>
              </span>
            </button>
          ))}
        </div>
      ),
    },
    {
      title: "AI & notifications (optional)",
      body: (
        <div className="space-y-4">
          <div>
            <label className={label}>OpenAI API key</label>
            <input className={field} style={fieldStyle} type="password" value={openaiKey} onChange={(e) => setOpenaiKey(e.target.value)} placeholder="sk-…  (enables AI capture + voice dictation)" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>ntfy server</label>
              <input className={field} style={fieldStyle} value={ntfyUrl} onChange={(e) => setNtfyUrl(e.target.value)} placeholder="https://ntfy.sh" />
            </div>
            <div>
              <label className={label}>ntfy topic</label>
              <input className={field} style={fieldStyle} value={ntfyTopic} onChange={(e) => setNtfyTopic(e.target.value)} placeholder="my-tasks" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={notifyEnabled} onChange={(e) => setNotifyEnabled(e.target.checked)} />
            Send a daily due/overdue digest + ⏰ reminders
          </label>
        </div>
      ),
    },
    {
      title: "You're set 🎉",
      body: (
        <div className="space-y-3 text-sm" style={{ color: "var(--color-text-2)" }}>
          <p>Add tasks from the quick-add bar (try <code>Email Dana tomorrow #work !!</code>), the ＋ button on mobile, or by editing your vault directly.</p>
          <p>To connect Claude or another agent over MCP, point it at:</p>
          <code className="block break-all rounded-md p-2 text-xs" style={{ background: "var(--color-bg)" }}>{mcpUrl}</code>
          <p>Create a bearer token (or use OAuth) in Settings → API tokens.</p>
        </div>
      ),
    },
  ];

  const cur = steps[step]!;
  const last = step === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div className="w-full max-w-md rounded-2xl border p-6 shadow-2xl animate-in" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
        <div className="mb-4 flex items-center gap-1.5">
          {steps.map((_, i) => (
            <span key={i} className="h-1 flex-1 rounded-full" style={{ background: i <= step ? "var(--color-accent)" : "var(--color-surface-3)" }} />
          ))}
        </div>
        <h2 className="text-lg font-semibold">{cur.title}</h2>
        <div className="mt-4">{cur.body}</div>
        <div className="mt-6 flex items-center justify-between">
          <button
            className="text-xs"
            style={{ color: "var(--color-text-3)" }}
            onClick={() => (step === 0 ? finish(true) : setStep(step - 1))}
          >
            {step === 0 ? "Skip setup" : "← Back"}
          </button>
          <button
            className="rounded-md px-5 py-2 text-sm font-medium"
            style={{ background: "var(--color-accent)", color: "white" }}
            disabled={save.isPending}
            onClick={() => (last ? finish() : setStep(step + 1))}
          >
            {last ? (save.isPending ? "Finishing…" : "Get started") : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
