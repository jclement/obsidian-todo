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
  const status = useQuery({ queryKey: ["admin", "sync"], queryFn: admin.sync, refetchInterval: 3000 });

  const refetchAccount = () => qc.invalidateQueries({ queryKey: ["admin", "sync", "account"] });
  const installed = account.data?.installed;
  const loggedIn = account.data?.loggedIn;

  if (account.isLoading) return <div />;

  if (!installed) {
    return (
      <Card title="obsidian-headless not installed">
        <p className="text-sm" style={{ color: "var(--color-text-2)" }}>
          The headless Obsidian Sync client isn't on this server. Install it (the container image bundles it), or sync your
          vault folder with Syntything/filesystem instead and set sync mode to “external” in the first-run wizard.
        </p>
        <pre className="mt-3 rounded-md p-3 text-xs" style={{ background: "var(--color-bg)", color: "var(--color-text-2)" }}>npm install -g obsidian-headless</pre>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {!loggedIn ? <LoginCard onDone={refetchAccount} /> : <LinkCard />}

      {loggedIn && (
        <Card
          title="Sync process"
          action={
            <div className="flex gap-2">
              <button className={btnPrimary} style={btnPrimaryStyle} onClick={() => admin.syncAction("start").then((s) => qc.setQueryData(["admin", "sync"], s))}>Start</button>
              <button className={btnGhost} style={btnGhostStyle} onClick={() => admin.syncAction("stop").then((s) => qc.setQueryData(["admin", "sync"], s))}>Stop</button>
            </div>
          }
        >
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full" style={{ background: STATE_COLOR[status.data?.state ?? ""] ?? "var(--color-text-3)" }} />
            <span className="text-sm font-medium capitalize">{status.data?.state ?? "…"}</span>
          </div>
          {status.data?.lastError && <p className="mt-2 text-xs" style={{ color: "var(--color-red)" }}>{status.data.lastError}</p>}
          {status.data?.log?.length ? (
            <pre className="mt-3 max-h-72 overflow-auto rounded-md p-3 text-xs leading-relaxed" style={{ background: "var(--color-bg)", color: "var(--color-text-2)" }}>
              {status.data.log.slice(-100).join("\n")}
            </pre>
          ) : null}
        </Card>
      )}

      {loggedIn && (
        <Card title="Account">
          <button
            className="text-sm hover:underline"
            style={{ color: "var(--color-red)" }}
            onClick={() => confirm("Sign out of Obsidian Sync on this server?") && admin.syncLogout().then(refetchAccount)}
          >
            Sign out of Obsidian Sync
          </button>
        </Card>
      )}
    </div>
  );
}

function LoginCard({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfa, setMfa] = useState("");
  const login = useMutation({
    mutationFn: () => admin.syncLogin(email, password, mfa || undefined),
    onSuccess: () => { toast("Signed in to Obsidian", "success"); onDone(); },
    onError: (e) => toast(e instanceof Error ? e.message : "Login failed", "error"),
  });
  return (
    <Card title="Sign in to Obsidian">
      <p className="mb-3 text-xs" style={{ color: "var(--color-text-3)" }}>Your Obsidian account credentials, used by the headless sync client. Stored only on this server.</p>
      <div className="space-y-3">
        <input className={field} style={inputStyle} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className={field} style={inputStyle} type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <input className={field} style={inputStyle} placeholder="2FA code (if enabled)" value={mfa} onChange={(e) => setMfa(e.target.value)} />
        <div className="flex justify-end">
          <button className={btnPrimary} style={btnPrimaryStyle} disabled={login.isPending || !email || !password} onClick={() => login.mutate()}>
            {login.isPending ? "Signing in…" : "Sign in"}
          </button>
        </div>
      </div>
    </Card>
  );
}

function LinkCard() {
  const [vaults, setVaults] = useState<string[] | null>(null);
  const [vault, setVault] = useState("");
  const [password, setPassword] = useState("");
  const [device, setDevice] = useState("obsidian-todo");

  const list = useMutation({
    mutationFn: admin.syncRemoteVaults,
    onSuccess: (r) => { setVaults(r.vaults); if (r.vaults[0]) setVault(r.vaults[0]); },
    onError: (e) => toast(e instanceof Error ? e.message : "Could not list vaults", "error"),
  });
  const link = useMutation({
    mutationFn: () => admin.syncLink(vault, password || undefined, device),
    onSuccess: () => toast("Vault linked — press Start to begin syncing", "success"),
    onError: (e) => toast(e instanceof Error ? e.message : "Link failed", "error"),
  });

  return (
    <Card title="Link a remote vault" action={<button className={btnGhost} style={btnGhostStyle} onClick={() => list.mutate()}>{list.isPending ? "Loading…" : "List vaults"}</button>}>
      <p className="mb-3 text-xs" style={{ color: "var(--color-text-3)" }}>Pick the remote vault to sync into this server's vault folder. For an encrypted vault, supply its encryption password.</p>
      {vaults && (
        <div className="space-y-3">
          <select className={field} style={inputStyle} value={vault} onChange={(e) => setVault(e.target.value)}>
            {vaults.length === 0 && <option value="">No vaults found</option>}
            {vaults.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <input className={field} style={inputStyle} type="password" placeholder="Encryption password (if encrypted)" value={password} onChange={(e) => setPassword(e.target.value)} />
          <input className={field} style={inputStyle} placeholder="Device name" value={device} onChange={(e) => setDevice(e.target.value)} />
          <div className="flex justify-end">
            <button className={btnPrimary} style={btnPrimaryStyle} disabled={!vault || link.isPending} onClick={() => link.mutate()}>
              {link.isPending ? "Linking…" : "Link vault"}
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
