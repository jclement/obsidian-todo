import { startRegistration } from "@simplewebauthn/browser";
import { ApiError } from "./api";

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch("/api/admin" + path, {
    method,
    credentials: "same-origin",
    headers: { "x-obtodo-csrf": "1", ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    window.location.href = "/login?returnTo=" + encodeURIComponent(location.pathname);
    throw new ApiError(401, {});
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export interface Passkey { id: string; name: string; device_type: string | null; created_at: number; last_used_at: number | null }
export interface ApiToken { id: string; name: string; token_prefix: string; created_at: number; last_used_at: number | null; revoked_at: number | null }
export interface Connection { client_id: string; client_name: string; created_at: number; last_used_at: number | null }
export interface AuditEntry { id: number; ts: number; source: string; actor_name: string | null; event: string; action: string | null; target: string | null; status: string | null; detail: string | null }
export interface Commit { sha: string; message: string; date: string; files?: number }
export interface SyncStatus { state: string; pid?: number | null; desired?: boolean; restartAttempts?: number; lastError?: string | null; log?: string[] }

export const admin = {
  overview: () => req<any>("GET", "/overview"),

  passkeys: () => req<{ passkeys: Passkey[] }>("GET", "/passkeys").then((r) => r.passkeys),
  renamePasskey: (id: string, name: string) => req<{ passkeys: Passkey[] }>("POST", `/passkeys/${encodeURIComponent(id)}/rename`, { name }).then((r) => r.passkeys),
  deletePasskey: (id: string) => req<{ passkeys: Passkey[] }>("DELETE", `/passkeys/${encodeURIComponent(id)}`).then((r) => r.passkeys),
  addPasskey: async (name: string) => {
    const { options, challengeId } = await req<{ options: any; challengeId: string }>("POST", "/passkeys/register/options");
    const response = await startRegistration({ optionsJSON: options });
    return req<{ passkeys: Passkey[] }>("POST", "/passkeys/register/verify", { response, challengeId, name }).then((r) => r.passkeys);
  },
  clearOtherSessions: () => req<{ ok: true }>("POST", "/sessions/clear-others"),

  tokens: () => req<{ tokens: ApiToken[] }>("GET", "/tokens").then((r) => r.tokens),
  createToken: (name: string) => req<{ token: string; tokens: ApiToken[] }>("POST", "/tokens", { name }),
  revokeToken: (id: string) => req<{ tokens: ApiToken[] }>("DELETE", `/tokens/${id}`).then((r) => r.tokens),

  connections: () => req<{ connections: Connection[] }>("GET", "/connections").then((r) => r.connections),
  revokeConnection: (clientId: string) => req<{ connections: Connection[] }>("DELETE", `/connections/${encodeURIComponent(clientId)}`).then((r) => r.connections),

  audit: (source?: string) => req<{ entries: AuditEntry[] }>("GET", "/audit" + (source ? `?source=${source}` : "")).then((r) => r.entries),

  snapshots: (path?: string) => req<{ commits: Commit[] }>("GET", "/snapshots" + (path ? `?path=${encodeURIComponent(path)}` : "")).then((r) => r.commits),
  restoreSnapshot: (sha: string, path: string) => req<{ ok: true }>("POST", "/snapshots/restore", { sha, path }),

  sync: () => req<SyncStatus>("GET", "/sync"),
  syncAction: (action: "start" | "stop") => req<SyncStatus>("POST", `/sync/${action}`),
  syncAccount: () => req<{ installed: boolean; configured: boolean }>("GET", "/sync/account"),
  syncLogin: (email: string, password: string, mfa?: string) => req<{ ok: true; vaults: string }>("POST", "/sync/login", { email, password, mfa }),
  syncLink: (vault: string, password?: string, deviceName?: string) => req<{ ok: true }>("POST", "/sync/link", { vault, password, deviceName }),
  syncUnlink: () => req<{ ok: true }>("POST", "/sync/unlink"),

  guidance: () => req<{ guidance: string }>("GET", "/guidance").then((r) => r.guidance),
  saveGuidance: (guidance: string) => req<{ guidance: string }>("PUT", "/guidance", { guidance }).then((r) => r.guidance),
};

export function ago(unix: number | null | undefined): string {
  if (!unix) return "never";
  const s = Math.floor(Date.now() / 1000) - unix;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
