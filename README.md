# Obsidian Todo

A fast, self-hosted task manager that lives on top of your **Obsidian vault**. Your markdown checkboxes (Obsidian [Tasks plugin](https://publish.obsidian.md/tasks/) format) stay the single source of truth — this puts a clean, dense, mobile-friendly web UI and an MCP endpoint on top of them. Built to replace Todoist without giving up plain-text ownership.

```
┌── Obsidian vault (markdown #task lines) ──┐   ← single source of truth
│   - [ ] #task Ship release 📅 2026-07-01 ⏫ │
└───────────────────────────────────────────┘
        ▲ write-through (hash-CAS)   │ watch + reindex
┌───────┴────────────────────────────▼───────┐
│  Bun + Hono service   ·  SQLite index (cache)│
│   /api  (JSON)   ·   /mcp  (task tools)      │
└───────▲───────────────────────────▲─────────┘
   WebSocket live sync          OAuth / bearer
        │                            │
   React SPA (web/PWA)          Claude / agents
```

## Features

- **Vault = truth, index = cache.** The SQLite index is disposable and rebuilt from markdown; on any conflict, markdown wins. Survives concurrent Obsidian/Syncthing edits via content-hash optimistic concurrency.
- **Dense, keyboard-first SPA.** Today / Upcoming / Inbox / Projects, auto-generated tag folders, full-text search. `j/k` move, `x` complete, `e` edit, `c` capture, `⌘K` command palette.
- **Mobile PWA.** Installable, responsive, swipe-to-complete / swipe-to-edit, offline read cache.
- **Live everywhere.** Writes are REST; reads are pushed over a WebSocket — every device (and Obsidian itself) stays in sync instantly.
- **Quick-add NLP.** `Fix OData 500 tomorrow #barreleye !!` → due date + tag + priority, previewed before commit.
- **AI capture & dictation** (bring your own OpenAI key). Paste a brain-dump or hit the mic; it becomes structured tasks with dates, tags, and priorities.
- **Recurrence** with full Tasks semantics — completing a recurring task spawns the next instance.
- **Notifications** via [ntfy](https://ntfy.sh): a daily due/overdue digest and per-task `⏰` reminders.
- **MCP server** of focused task tools (`list_tasks`, `add_task`, `complete_task`, …) so Claude and other agents manage the same tasks.
- **Secure & self-hosted.** Passkey login, OAuth 2.1 + bearer tokens for MCP, automatic git snapshots of every change, single container.
- **Everything UI-configurable** — inbox note, global-filter tag, excluded folders, OpenAI key, ntfy, notification time. No env editing to run it.

## Quick start (dev)

```bash
mise install            # pins Bun + Node
bun install
mise run dev            # Bun API :3000 + Tailwind watch + Vite :5173
# open http://localhost:5173  → first run prints a setup token in the API logs
```

Point `DATA_DIR` at a folder containing your vault under `Vault/` (or let it create one). Register a passkey on first run, then configure everything from **Settings** (user menu, top-right).

## Build & deploy

```bash
mise run build          # → public/app.css, dist/client (SPA), dist/server.js
mise run docker:build   # single container (server + SPA + obsidian-headless)
```

The container serves the SPA, the JSON API, and the MCP endpoint behind one port; put it behind your usual tunnel (Cloudflare/gatecrash). See `deploy/` for compose examples.

### Securing a public deployment

The whole app (SPA, `/api`, `/mcp`) is behind auth — passkeys for the UI, hashed bearer/OAuth tokens for MCP — and there is no unauthenticated route that returns data or touches the vault. To keep it that way when exposing it to the internet:

- **Set `PUBLIC_URL=https://your-host`.** This pins the origin (so a spoofed `Host`/`X-Forwarded-Host` can't poison auth/CSRF), forces `Secure` cookies, and enables strict host rejection. Deriving the origin from forwarded headers is only safe for localhost/dev.
- **Terminate TLS at the tunnel/proxy and never publish the app port (3000)** to the internet — only the tunnel should reach it (the compose files already do this).
- **Ensure the proxy *sets* (not passes through) `X-Forwarded-Host` / `X-Forwarded-Proto`** — Cloudflare and gatecrash do.
- **Complete first-run `/setup` (register your passkey) promptly.** Setup locks itself once a passkey exists; don't leave a fresh, un-set-up instance publicly reachable.
- **Never run with `AUTH_RESET=1` in production** — it wipes passkeys and re-opens setup (it's a local recovery escape hatch).
- HSTS is sent automatically over HTTPS. A tighter Content-Security-Policy and a trusted-proxy allowlist for rate-limiting are reasonable additional hardening (see code comments).

## Task format

Standard Obsidian Tasks **emoji** format, gated by a global filter (default `#task`):

```
- [ ] #task Migrate Production 📅 2026-07-01 ⏫ 🔁 every month
- [x] #task Confirm tests pass ✅ 2026-06-11
```

The parser also *reads* Dataview inline fields (`[due:: 2026-05-25]`) so nothing is missed, but always *writes* emoji format. Tasks are discovered anywhere in the vault; the containing note becomes a "project".

## License

MIT
