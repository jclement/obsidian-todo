/**
 * Admin JSON API for the SPA (mounted at /api/admin, inheriting the /api/*
 * session + CSRF middleware). Mirrors what the legacy server-rendered /app/*
 * pages did, so the React app can own the full management surface.
 */

import { Hono } from "hono";
import type { AppEnv } from "../../app.tsx";
import { recordAdmin } from "../../audit.ts";
import { listAudit, type AuditSource } from "../../audit.ts";
import { deleteSetting, getSetting, setSetting } from "../../db/index.ts";
import { deleteOtherSessions } from "../../auth/sessions.ts";
import {
  deletePasskey,
  finishRegistration,
  listPasskeys,
  renamePasskey,
  startRegistration,
} from "../../auth/webauthn.ts";
import { createApiToken, listApiTokens, revokeApiToken } from "../../auth/tokens.ts";
import { listConnections, revokeClient } from "../../oauth/router.ts";
import { counts } from "../../index/queries.ts";
import { readTasksPluginConfig } from "../../vault/tasks-plugin.ts";
import { ALL_SYNC_CONFIGS, obInstalled, obListRemoteVaults, obLogin, obLogout, obSyncConfig, obSyncSetup, obSyncUnlink } from "../../sync/ob.ts";

export function adminApiRouter() {
  const app = new Hono<AppEnv>();

  const deps = (c: { var: AppEnv["Variables"] }) => c.var.deps;

  // --- overview / dashboard ---
  app.get("/overview", async (c) => {
    const { db, config, taskCtx, sync } = deps(c);
    let snapshots = 0;
    try {
      snapshots = (await taskCtx.snapshotter.listCommits(1000)).length;
    } catch {}
    return c.json({
      counts: counts(db, taskCtx.getSettings().inboxNote, taskCtx.now()),
      passkeys: listPasskeys(db).length,
      tokens: listApiTokens(db).filter((t) => !t.revoked_at).length,
      connections: listConnections(db).length,
      snapshots,
      sync: sync ? sync.status() : null,
      mcpUrl: c.var.publicOrigin + "/mcp",
    });
  });

  // --- passkeys ---
  app.get("/passkeys", (c) => c.json({ passkeys: listPasskeys(deps(c).db) }));

  app.post("/passkeys/register/options", async (c) => {
    const { db } = deps(c);
    const { options, challengeId, userHandle } = await startRegistration(db, { rpId: c.var.rpId, origin: c.var.publicOrigin });
    pendingHandles.set(challengeId, userHandle);
    return c.json({ options, challengeId });
  });

  app.post("/passkeys/register/verify", async (c) => {
    const { db } = deps(c);
    const body = await c.req.json().catch(() => ({}));
    const handle = pendingHandles.get(body.challengeId);
    if (!handle) return c.json({ error: "No registration in progress." }, 400);
    pendingHandles.delete(body.challengeId);
    const name = String(body.name ?? "").trim() || "Unnamed passkey";
    const result = await finishRegistration(db, { rpId: c.var.rpId, origin: c.var.publicOrigin }, body.response, body.challengeId, name, handle);
    if ("error" in result) return c.json(result, 400);
    recordAdmin(db, "passkey.add", { target: name });
    return c.json({ ok: true, passkeys: listPasskeys(db) });
  });

  app.post("/passkeys/:id/rename", async (c) => {
    const { db } = deps(c);
    const id = decodeURIComponent(c.req.param("id"));
    const { name } = await c.req.json();
    renamePasskey(db, id, String(name ?? "").trim() || "Unnamed passkey");
    return c.json({ passkeys: listPasskeys(db) });
  });

  app.delete("/passkeys/:id", (c) => {
    const { db } = deps(c);
    const id = decodeURIComponent(c.req.param("id"));
    const name = listPasskeys(db).find((p) => p.id === id)?.name ?? id;
    const result = deletePasskey(db, id);
    if ("error" in result) return c.json(result, 400);
    recordAdmin(db, "passkey.delete", { target: name });
    return c.json({ passkeys: listPasskeys(db) });
  });

  app.post("/sessions/clear-others", (c) => {
    const { db } = deps(c);
    if (c.var.sessionCookie) deleteOtherSessions(db, c.var.sessionCookie);
    recordAdmin(db, "session.revoke_others");
    return c.json({ ok: true });
  });

  // --- API tokens ---
  app.get("/tokens", (c) => c.json({ tokens: listApiTokens(deps(c).db) }));
  app.post("/tokens", async (c) => {
    const { db } = deps(c);
    const { name } = await c.req.json();
    const { token, row } = createApiToken(db, String(name ?? "").trim() || "Unnamed token");
    recordAdmin(db, "token.create", { target: row.name });
    return c.json({ token, row, tokens: listApiTokens(db) }); // token shown once
  });
  app.delete("/tokens/:id", (c) => {
    const { db } = deps(c);
    const id = c.req.param("id");
    const name = listApiTokens(db).find((t) => t.id === id)?.name ?? id;
    revokeApiToken(db, id);
    recordAdmin(db, "token.revoke", { target: name });
    return c.json({ tokens: listApiTokens(db) });
  });

  // --- OAuth connections ---
  app.get("/connections", (c) => c.json({ connections: listConnections(deps(c).db) }));
  app.delete("/connections/:clientId", (c) => {
    const { db } = deps(c);
    const clientId = decodeURIComponent(c.req.param("clientId"));
    revokeClient(db, clientId);
    recordAdmin(db, "oauth.revoke", { target: clientId });
    return c.json({ connections: listConnections(db) });
  });

  // --- activity log ---
  app.get("/audit", (c) => {
    const { db } = deps(c);
    const source = c.req.query("source") as AuditSource | undefined;
    const limit = Math.min(500, parseInt(c.req.query("limit") ?? "200", 10) || 200);
    return c.json({ entries: listAudit(db, { limit, source: source || undefined }) });
  });

  // --- snapshots ---
  app.get("/snapshots", async (c) => {
    const path = c.req.query("path") || undefined;
    const commits = await deps(c).taskCtx.snapshotter.listCommits(80, path);
    return c.json({ commits });
  });
  app.post("/snapshots/restore", async (c) => {
    const { db, taskCtx } = deps(c);
    const { sha, path } = await c.req.json();
    if (!sha || !path) return c.json({ error: "sha and path required" }, 400);
    const content = await taskCtx.snapshotter.fileAt(sha, path);
    if (content === null) return c.json({ error: "File not found at that snapshot" }, 404);
    await taskCtx.store.write(path, content);
    await taskCtx.snapshotter.commit(`restore: ${path} from ${String(sha).slice(0, 7)}`);
    recordAdmin(db, "snapshot.restore", { target: path, detail: `from ${String(sha).slice(0, 7)}` });
    taskCtx.indexer.reindexAndBroadcast(path);
    return c.json({ ok: true });
  });

  // --- Obsidian Sync: two-step wizard (sign in → pick vault) ---
  // Whether sync is set up is tracked by the `sync_configured` setting — not by
  // sniffing for an auth-token file, which is unreliable across ob versions.
  app.get("/sync/account", (c) => {
    const { db, config } = deps(c);
    return c.json({ installed: obInstalled(config), configured: getSetting(db, "sync_configured") === "1" });
  });
  // Sign in and, on success, return the remote vault listing so the client can
  // advance straight to the pick-vault step (mirrors the original flow).
  app.post("/sync/login", async (c) => {
    const { db, config } = deps(c);
    const { email, password, mfa } = await c.req.json();
    if (!email || !password) return c.json({ error: "Email and password are required." }, 400);
    const r = await obLogin(config, String(email), String(password), mfa ? String(mfa) : undefined);
    if (!r.ok) {
      recordAdmin(db, "sync.login", { status: "error", target: String(email) });
      return c.json({ error: `Login failed: ${(r.stderr || r.stdout).trim().slice(0, 500)}` }, 400);
    }
    recordAdmin(db, "sync.login", { target: String(email) });
    const listing = await obListRemoteVaults(config);
    if (!listing.ok) return c.json({ error: `Signed in, but listing vaults failed: ${(listing.stderr || listing.stdout).trim().slice(0, 500)}` }, 400);
    return c.json({ ok: true, vaults: listing.stdout.trim() || "(no vaults found)" });
  });
  // Connect a remote vault into this server's vault dir. `password` is the
  // end-to-end encryption password for encrypted vaults.
  app.post("/sync/link", async (c) => {
    const { db, config, sync } = deps(c);
    const { vault, password, deviceName, configs } = await c.req.json();
    if (!vault) return c.json({ error: "Vault name or ID is required." }, 400);
    const r = await obSyncSetup(config, String(vault).trim(), password ? String(password) : undefined, deviceName ? String(deviceName) : "obsidian-todo");
    if (!r.ok) return c.json({ error: `Connect failed: ${(r.stderr || r.stdout).trim().slice(0, 500)}` }, 400);
    setSetting(db, "sync_configured", "1");
    recordAdmin(db, "sync.configure", { target: String(vault) });
    // Pull Obsidian config (Tasks plugin data.json, etc.) — a SEPARATE `ob
    // sync-config` command, before the daemon starts. Non-fatal.
    const cfg = typeof configs === "string" ? configs.trim() : ALL_SYNC_CONFIGS;
    if (cfg) {
      const cr = await obSyncConfig(config, cfg);
      if (!cr.ok) recordAdmin(db, "sync.config", { status: "error", detail: (cr.stderr || cr.stdout).trim().slice(0, 200) });
    }
    sync?.start();
    return c.json({ ok: true });
  });
  // Re-pull Obsidian config on an already-linked vault (the daemon holds a
  // per-vault lock, so stop → sync-config → restart).
  app.post("/sync/config", async (c) => {
    const { db, config, sync } = deps(c);
    if (sync) await sync.stop();
    const r = await obSyncConfig(config, ALL_SYNC_CONFIGS);
    recordAdmin(db, "sync.config", { status: r.ok ? "ok" : "error" });
    if (sync) sync.start();
    if (!r.ok) return c.json({ error: (r.stderr || r.stdout).trim().slice(0, 500) }, 400);
    return c.json({ ok: true });
  });

  app.post("/sync/unlink", async (c) => {
    const { db, config, sync } = deps(c);
    if (sync) await sync.stop();
    await obSyncUnlink(config);
    await obLogout(config);
    deleteSetting(db, "sync_configured");
    recordAdmin(db, "sync.unlink");
    return c.json({ ok: true });
  });

  // --- Obsidian Sync supervisor (the continuous process) ---
  app.get("/sync", (c) => {
    const { sync } = deps(c);
    return c.json(sync ? sync.status() : { state: "disabled" });
  });
  app.post("/sync/start", (c) => {
    const { db, sync } = deps(c);
    if (!sync) return c.json({ error: "sync disabled" }, 400);
    sync.start();
    recordAdmin(db, "sync.start");
    return c.json(sync.status());
  });
  app.post("/sync/stop", async (c) => {
    const { db, sync } = deps(c);
    if (!sync) return c.json({ error: "sync disabled" }, 400);
    await sync.stop();
    recordAdmin(db, "sync.stop");
    return c.json(sync.status());
  });

  // --- Import config from the Obsidian Tasks plugin ---
  app.get("/tasks-config", async (c) => c.json(await readTasksPluginConfig(deps(c).taskCtx.store)));

  // --- MCP guidance ---
  app.get("/guidance", (c) => c.json({ guidance: getSetting(deps(c).db, "vault_instructions") ?? "" }));
  app.put("/guidance", async (c) => {
    const { db } = deps(c);
    const { guidance } = await c.req.json();
    setSetting(db, "vault_instructions", String(guidance ?? "").trim().slice(0, 8000));
    recordAdmin(db, "guidance.update");
    return c.json({ guidance: getSetting(db, "vault_instructions") ?? "" });
  });

  return app;
}

// challengeId → userHandle, held across the options/verify round-trip.
const pendingHandles = new Map<string, Uint8Array>();
