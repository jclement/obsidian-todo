import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { admin } from "../../adminApi";
import { toast } from "../../toast";
import { Card, btnGhost, btnGhostStyle, btnPrimary, btnPrimaryStyle, input, inputStyle } from "./ui";

const STATE_COLOR: Record<string, string> = {
  running: "var(--color-green)", starting: "var(--color-amber)",
  stopped: "var(--color-text-3)", crashed: "var(--color-red)", disabled: "var(--color-text-3)",
};
const field = input + " w-full";

export function SyncView() {
  const qc = useQueryClient();
  const account = useQuery({ queryKey: ["admin", "sync", "account"], queryFn: admin.syncAccount });

  if (account.isLoading) return <div />;
  if (!account.data?.installed) {
    return (
      <Card title="obsidian-headless not installed">
        <p className="text-sm" style={{ color: "var(--color-text-2)" }}>
          The headless Obsidian Sync client isn't on this server. The container image bundles it; locally run the command
          below. If you sync the vault folder another way (Syncthing/filesystem), leave sync mode “external” and ignore this.
        </p>
        <pre className="mt-3 rounded-md p-3 text-xs" style={{ background: "var(--color-bg)", color: "var(--color-text-2)" }}>npm install -g obsidian-headless</pre>
      </Card>
    );
  }

  return account.data.configured
    ? <Daemon onUnlinked={() => qc.invalidateQueries({ queryKey: ["admin", "sync", "account"] })} />
    : <SetupWizard onConfigured={() => qc.invalidateQueries({ queryKey: ["admin", "sync", "account"] })} />;
}

function SetupWizard({ onConfigured }: { onConfigured: () => void }) {
  const [vaults, setVaults] = useState<string | null>(null); // raw listing → step 2
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfa, setMfa] = useState("");
  const [vault, setVault] = useState("");
  const [encPassword, setEncPassword] = useState("");
  const [device, setDevice] = useState("obsidian-todo");
  const [configs, setConfigs] = useState("app,appearance,appearance-data,hotkey,core-plugin,core-plugin-data,community-plugin,community-plugin-data");

  const login = useMutation({
    mutationFn: () => admin.syncLogin(email, password, mfa || undefined),
    onSuccess: (r) => setVaults(r.vaults),
    onError: (e) => toast(e instanceof Error ? e.message : "Login failed", "error"),
  });
  const link = useMutation({
    mutationFn: () => admin.syncLink({ vault, password: encPassword || undefined, deviceName: device, configs }),
    onSuccess: () => { toast("Connected — sync started", "success"); onConfigured(); },
    onError: (e) => toast(e instanceof Error ? e.message : "Connect failed", "error"),
  });

  if (!vaults) {
    return (
      <Card title="Set up Obsidian Sync">
        <p className="mb-3 text-xs" style={{ color: "var(--color-text-3)" }}>
          Step 1 of 2 — sign in with your Obsidian account (needs an Obsidian Sync subscription). Credentials go to the
          ob CLI and are never stored by this server.
        </p>
        <div className="space-y-3">
          <input className={field} style={inputStyle} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className={field} style={inputStyle} type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <input className={field} style={inputStyle} placeholder="2FA code (if enabled)" autoComplete="one-time-code" value={mfa} onChange={(e) => setMfa(e.target.value)} />
          <div className="flex justify-end">
            <button className={btnPrimary} style={btnPrimaryStyle} disabled={login.isPending || !email || !password} onClick={() => login.mutate()}>
              {login.isPending ? "Signing in…" : "Sign in to Obsidian"}
            </button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card title="Connect a vault">
      <p className="mb-2 text-xs" style={{ color: "var(--color-text-3)" }}>Step 2 of 2 — your remote vaults (from <code>ob sync-list-remote</code>):</p>
      <pre className="mb-3 max-h-40 overflow-y-auto rounded-md p-3 text-xs" style={{ background: "var(--color-bg)", color: "var(--color-text-2)" }}>{vaults}</pre>
      <div className="space-y-3">
        <input className={field} style={inputStyle} placeholder="Vault name or ID (exactly as listed)" value={vault} onChange={(e) => setVault(e.target.value)} />
        <input className={field} style={inputStyle} type="password" placeholder="Encryption password (end-to-end encrypted vaults only)" value={encPassword} onChange={(e) => setEncPassword(e.target.value)} />
        <input className={field} style={inputStyle} placeholder="Device name" value={device} onChange={(e) => setDevice(e.target.value)} />
        <label className="block text-xs" style={{ color: "var(--color-text-3)" }}>
          Obsidian config to sync — runs <code>ob sync-config</code> after linking so the app can read your Tasks-plugin
          settings. Blank to skip. (Config sync is bidirectional. Attachments — images/PDFs — are never synced; a todo
          doesn't need them.)
          <input className={field + " mt-1"} style={inputStyle} value={configs} onChange={(e) => setConfigs(e.target.value)} placeholder="blank to skip" />
        </label>
        <p className="text-xs" style={{ color: "var(--color-amber)" }}>
          Connecting downloads the remote vault into this server's vault folder and starts bidirectional sync. Existing
          local notes will sync up too.
        </p>
        <div className="flex justify-between">
          <button className={btnGhost} style={btnGhostStyle} onClick={() => setVaults(null)}>← Back</button>
          <button className={btnPrimary} style={btnPrimaryStyle} disabled={!vault || link.isPending} onClick={() => link.mutate()}>
            {link.isPending ? "Connecting…" : "Connect & start sync"}
          </button>
        </div>
      </div>
    </Card>
  );
}

function Daemon({ onUnlinked }: { onUnlinked: () => void }) {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ["admin", "sync"], queryFn: admin.sync, refetchInterval: 3000 });
  const state = status.data?.state ?? "…";
  return (
    <div className="space-y-4">
      <Card
        title="Sync daemon"
        action={
          <div className="flex gap-2">
            <button className={btnPrimary} style={btnPrimaryStyle} onClick={() => admin.syncAction("start").then((s) => qc.setQueryData(["admin", "sync"], s))}>Start</button>
            <button className={btnGhost} style={btnGhostStyle} onClick={() => admin.syncAction("stop").then((s) => qc.setQueryData(["admin", "sync"], s))}>Stop</button>
          </div>
        }
      >
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: STATE_COLOR[state] ?? "var(--color-text-3)" }} />
          <span className="text-sm font-medium capitalize">{state}</span>
        </div>
        {status.data?.lastError && <p className="mt-2 text-xs" style={{ color: "var(--color-red)" }}>{status.data.lastError}</p>}
        {status.data?.log?.length ? (
          <pre className="mt-3 max-h-72 overflow-auto rounded-md p-3 text-xs leading-relaxed" style={{ background: "var(--color-bg)", color: "var(--color-text-2)" }}>
            {status.data.log.slice(-100).join("\n")}
          </pre>
        ) : null}
      </Card>
      <Card title="Obsidian config">
        <button
          className={btnGhost}
          style={btnGhostStyle}
          onClick={() => admin.syncConfigNow().then(() => toast("Pulled Obsidian config — re-import in Settings → Task statuses", "success")).catch((e) => toast(e instanceof Error ? e.message : "Failed", "error"))}
        >
          Sync Obsidian config now
        </button>
        <p className="mt-2 text-xs" style={{ color: "var(--color-text-3)" }}>
          Pulls .obsidian (incl. the Tasks plugin's settings) into the vault via <code>ob sync-config</code>, so you can import them in Settings.
        </p>
      </Card>

      <Card title="Danger zone">
        <button
          className="rounded-lg border px-4 py-1.5 text-sm"
          style={{ borderColor: "var(--color-red)", color: "var(--color-red)" }}
          onClick={() => confirm("Disconnect Obsidian Sync? Local files stay intact.") && admin.syncUnlink().then(onUnlinked)}
        >
          Disconnect Obsidian Sync
        </button>
        <p className="mt-2 text-xs" style={{ color: "var(--color-text-3)" }}>Stops the daemon, unlinks the vault, and signs out. Local files are untouched.</p>
      </Card>
    </div>
  );
}
