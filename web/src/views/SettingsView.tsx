import { useEffect, useState } from "react";
import { useSettings, useSaveSettings } from "../queries";
import { getThemePref, setThemePref, type ThemePref } from "../theme";

const field = "w-full rounded-md border bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";
const label = "mb-1 block text-xs font-medium";
const hint = "mt-1 text-xs";

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border p-4" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
      <h2 className="text-sm font-semibold">{title}</h2>
      {desc && <p className="mb-3 mt-0.5 text-xs" style={{ color: "var(--color-text-3)" }}>{desc}</p>}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

export function SettingsView() {
  const { data: s } = useSettings();
  const save = useSaveSettings();

  const [form, setForm] = useState({
    inboxNote: "",
    globalFilter: "",
    excludedFolders: "",
    includedFolders: "",
    projectExcludeFolders: "",
    obsidianVaultName: "",
    openaiModel: "",
    ntfyUrl: "",
    ntfyTopic: "",
    notifyEnabled: false,
    notifyHour: 8,
  });
  const [openaiKey, setOpenaiKey] = useState("");
  const [ntfyToken, setNtfyToken] = useState("");
  const [theme, setTheme] = useState<ThemePref>(getThemePref());

  useEffect(() => {
    if (!s) return;
    setForm({
      inboxNote: s.inboxNote,
      globalFilter: s.globalFilter,
      excludedFolders: s.excludedFolders.join(", "),
      includedFolders: s.includedFolders.join(", "),
      projectExcludeFolders: s.projectExcludeFolders.join(", "),
      obsidianVaultName: s.obsidianVaultName,
      openaiModel: s.openaiModel,
      ntfyUrl: s.ntfyUrl,
      ntfyTopic: s.ntfyTopic,
      notifyEnabled: s.notifyEnabled,
      notifyHour: s.notifyHour,
    });
  }, [s]);

  const submit = () => {
    const patch: Record<string, unknown> = {
      inboxNote: form.inboxNote,
      globalFilter: form.globalFilter,
      excludedFolders: form.excludedFolders.split(",").map((x) => x.trim()).filter(Boolean),
      includedFolders: form.includedFolders.split(",").map((x) => x.trim()).filter(Boolean),
      projectExcludeFolders: form.projectExcludeFolders.split(",").map((x) => x.trim()).filter(Boolean),
      obsidianVaultName: form.obsidianVaultName,
      openaiModel: form.openaiModel,
      ntfyUrl: form.ntfyUrl,
      ntfyTopic: form.ntfyTopic,
      notifyEnabled: form.notifyEnabled,
      notifyHour: form.notifyHour,
    };
    if (openaiKey) patch.openaiKey = openaiKey;
    if (ntfyToken) patch.ntfyToken = ntfyToken;
    save.mutate(patch as any, { onSuccess: () => { setOpenaiKey(""); setNtfyToken(""); } });
  };

  if (!s) return <div />;

  return (
      <div className="space-y-4">
        <Section title="Appearance" desc="Theme follows your system by default.">
          <div className="inline-flex rounded-lg border p-0.5" style={{ borderColor: "var(--color-border)" }}>
            {(["system", "light", "dark"] as ThemePref[]).map((t) => (
              <button
                key={t}
                onClick={() => { setTheme(t); setThemePref(t); }}
                className="rounded-md px-3 py-1.5 text-sm capitalize"
                style={theme === t ? { background: "var(--color-accent)", color: "white" } : { color: "var(--color-text-2)" }}
              >
                {t}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Capture" desc="Where new tasks go and which lines count as tasks.">
          <div>
            <label className={label}>Inbox note</label>
            <input className={field} value={form.inboxNote} onChange={(e) => setForm({ ...form, inboxNote: e.target.value })} />
            <p className={hint} style={{ color: "var(--color-text-3)" }}>Quick-adds without a project append here.</p>
          </div>
          <div>
            <label className={label}>Global filter tag</label>
            <input className={field} value={form.globalFilter} onChange={(e) => setForm({ ...form, globalFilter: e.target.value })} />
            <p className={hint} style={{ color: "var(--color-text-3)" }}>Only checkbox lines with this tag are managed. Changing it rebuilds the index.</p>
          </div>
          <div>
            <label className={label}>Excluded folders</label>
            <input className={field} value={form.excludedFolders} onChange={(e) => setForm({ ...form, excludedFolders: e.target.value })} placeholder="templates, .trash, attachments" />
            <p className={hint} style={{ color: "var(--color-text-3)" }}>Comma-separated. These folders are never indexed.</p>
          </div>
          <div>
            <label className={label}>Included folders (optional)</label>
            <input className={field} value={form.includedFolders} onChange={(e) => setForm({ ...form, includedFolders: e.target.value })} placeholder="projects, work  (blank = whole vault)" />
            <p className={hint} style={{ color: "var(--color-text-3)" }}>If set, ONLY these folders are scanned for tasks (the inbox note is always included). Leave blank to scan everything except excluded folders. Changing this rebuilds the index.</p>
          </div>
          <div>
            <label className={label}>Folders that aren't projects</label>
            <input className={field} value={form.projectExcludeFolders} onChange={(e) => setForm({ ...form, projectExcludeFolders: e.target.value })} placeholder="weekly, journal, meetings" />
            <p className={hint} style={{ color: "var(--color-text-3)" }}>Tasks in these folders still appear in Today/Upcoming/All, but the notes won't show up as Projects in the sidebar.</p>
          </div>
          <div>
            <label className={label}>Obsidian vault name</label>
            <input className={field} value={form.obsidianVaultName} onChange={(e) => setForm({ ...form, obsidianVaultName: e.target.value })} placeholder="(your vault's name in Obsidian)" />
            <p className={hint} style={{ color: "var(--color-text-3)" }}>Used for “Open in Obsidian” links. Must match the vault name shown in the Obsidian app. Defaults to the vault folder name.</p>
          </div>
        </Section>

        <Section title="AI" desc="An OpenAI key enables text→tasks capture and voice dictation. Stored server-side only.">
          <div>
            <label className={label}>OpenAI API key {s.openaiConfigured && <span style={{ color: "var(--color-green)" }}>· configured</span>}</label>
            <input className={field} type="password" value={openaiKey} onChange={(e) => setOpenaiKey(e.target.value)} placeholder={s.openaiConfigured ? "••••••••  (leave blank to keep)" : "sk-…"} />
          </div>
          <div>
            <label className={label}>Model</label>
            <input className={field} value={form.openaiModel} onChange={(e) => setForm({ ...form, openaiModel: e.target.value })} placeholder="gpt-4o-mini" />
          </div>
        </Section>

        <Section title="Notifications" desc="Daily due/overdue digest and per-task ⏰ reminders via ntfy.">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.notifyEnabled} onChange={(e) => setForm({ ...form, notifyEnabled: e.target.checked })} />
            Enable notifications
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>ntfy server URL</label>
              <input className={field} value={form.ntfyUrl} onChange={(e) => setForm({ ...form, ntfyUrl: e.target.value })} placeholder="https://ntfy.sh" />
            </div>
            <div>
              <label className={label}>Topic</label>
              <input className={field} value={form.ntfyTopic} onChange={(e) => setForm({ ...form, ntfyTopic: e.target.value })} placeholder="my-tasks" />
            </div>
            <div>
              <label className={label}>ntfy token {s.ntfyTokenSet && <span style={{ color: "var(--color-green)" }}>· set</span>}</label>
              <input className={field} type="password" value={ntfyToken} onChange={(e) => setNtfyToken(e.target.value)} placeholder={s.ntfyTokenSet ? "••••  (leave blank to keep)" : "optional"} />
            </div>
            <div>
              <label className={label}>Daily digest hour</label>
              <input className={field} type="number" min={0} max={23} value={form.notifyHour} onChange={(e) => setForm({ ...form, notifyHour: parseInt(e.target.value || "0", 10) })} />
            </div>
          </div>
        </Section>

        <div className="flex justify-end">
          <button onClick={submit} disabled={save.isPending} className="rounded-md px-5 py-2 text-sm font-medium disabled:opacity-50" style={{ background: "var(--color-accent)", color: "white" }}>
            {save.isPending ? "Saving…" : "Save settings"}
          </button>
        </div>
      </div>
  );
}
