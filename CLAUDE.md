# CLAUDE.md

Guidance for working in this repo. Read this before making changes.

## What this is

A self-hosted, single-container **task manager on top of an Obsidian vault**. The vault's markdown checkbox lines (Obsidian Tasks plugin format, gated by a `#task` global filter) are the single source of truth; a SQLite index is a disposable, rebuildable cache. Two heads share that index and one write path: a **React SPA** for fast keyboard/mobile task management, and an **MCP server** of task tools for agents. Keeps the original project's passkey auth, OAuth 2.1 + bearer, optional Obsidian Sync, and git snapshots.

Runtime is **Bun + TypeScript + Hono**; state is **bun:sqlite**. Two UIs:
- **Task SPA** — `web/` (Vite + React + TypeScript + Tailwind v4), talks JSON to `/api` and live-syncs over a **Bun WebSocket**. Builds to `dist/client`, served by the Bun server in prod.
- **Auth/admin pages** — still **server-rendered Hono JSX + HTMX** (`src/web/routes/*.tsx`) under `/setup`, `/login`, `/app/*`; reached from the SPA's user menu. Tailwind for these builds from `styles/app.css` → `public/app.css`.

## Commands

Use mise tasks (they pin the toolchain). **Dev:** `mise run dev` runs the Bun API (`:3000`), the Tailwind watcher, and the **Vite dev server (`:5173`) — open `:5173`** (it proxies `/api`, `/login`, `/app`, etc. to `:3000`).

| Task | What |
|---|---|
| `mise run dev` | Bun API + Tailwind watch + Vite dev server → open http://localhost:5173 |
| `mise run test` | Full `bun test` suite |
| `mise run typecheck` | `tsc --noEmit` (server) + `tsc -p web/tsconfig.json` (SPA) |
| `mise run build` | Tailwind CSS + Vite SPA (`dist/client`) + bundle server (`dist/server.js`) |
| `mise run docker:build` | Build the container image |

Direct: `bun test test/tasks-service.test.ts` (single file), `bun test -t "name"`, `bunx tsc --noEmit`, `bun scripts/dump-tasks.ts` (read-only: dump parsed tasks from the vault).

**Always run both typechecks and `bun test` before committing.** Note: in a sandboxed shell the **snapshot/sync tests time out on `git`** (env limitation, not a regression) and the local server boot hangs in `snapshotter.commit` — they pass on real machines/CI. The task suite (`tasks-*`, `quick-add`, `mcp.integration` with a stub snapshotter) runs anywhere.

## Architecture

**Task domain (`src/tasks/`)** — the heart, pure and well-tested:
- `parse.ts` — parse one checkbox line (reads emoji **and** dataview fields; excises signifiers from anywhere like the Tasks plugin, so interspersed prose survives). `file.ts` — extract managed tasks from a note (code-fence aware, subtask parent-by-indent). `format.ts` — canonical **emoji** writer (never reflows prose) + `buildTask`. `recurrence.ts` — Tasks recurrence rules → next occurrence. `dates.ts`, `types.ts`, `dto.ts`.
- `service.ts` — **the write path**: read file + hash → edit line(s) → write guarded by hash (optimistic CAS) → reindex that file → broadcast. `complete` auto-creates the next recurrence; MCP relocates a shifted line by description. Throws `TaskConflictError` (→ 409 / teaching MCP error). All mutations go through here.
- `app-context.ts` — process handle: db, store, indexer, service, settings cache, WS hub.

**Index (`src/index/`)** — `indexer.ts` (content-hash reindex, fs.watch + debounced sweep safety net, sync-conflict surfacing), `queries.ts` (views: today/upcoming/inbox; projects; tags; filters). The index is a **cache**: drop `files`/`tasks` and re-sweep anytime; markdown wins.

**Web/API (`src/web/`)** — `routes/api.ts` (JSON task API at `/api`, behind passkey session + a custom-header CSRF that survives the Vite proxy), `ws.ts` (Bun WebSocket hub; broadcasts `tasks_changed` on every reindex), plus the legacy `routes/*.tsx` HTMX admin pages, `layout.tsx`, `origin.ts`.

**Other backend** — `settings.ts` (typed settings over the `settings` table; secrets reduced to booleans for the client). `ai/openai.ts` (text→tasks + Whisper, gated on a user key). `notify/scheduler.ts` (ntfy digest + ⏰ reminders, dedupe ledger). `mcp/` (`server.ts` + `tools/tasks.ts`: the 9 task tools). `auth/`, `oauth/`, `snapshots/`, `sync/`, `vault/` (filesystem core: `paths.ts` chokepoint, `store.ts` atomic hashed writes), `db/` (numbered migrations; `0004_tasks.sql` is the index schema).

**Frontend (`web/src/`)** — `api.ts` (fetch client), `ws.ts` (live sync → react-query invalidation), `queries.ts` (react-query hooks + optimistic mutations), `lib/quickAddParse.ts` (client NLP), `App.tsx` (shell, shortcuts), `views/*` (Today/Upcoming/Inbox/All/Project/Tag/Search/Settings), `components/*` (TaskRow w/ swipe, TaskEditor, QuickAdd, AiCaptureDialog, DictateButton, CommandPalette, Sidebar, UserMenu, MobileNav).

## Conventions

**Code style:** match the surrounding file. Comments explain *constraints the code can't show* (a race, a spec requirement, a workaround) — not what the next line does. Keep error messages actionable; MCP tool errors are written to *teach the model the correct next call* (see `mcp/respond.ts`).

**Imports:** ESM with explicit `.ts`/`.tsx` extensions (`allowImportingTsExtensions`). JSX uses `hono/jsx` (`jsxImportSource` in tsconfig) — files with JSX must be `.tsx`.

**UI — two surfaces.** (1) **Task SPA** in `web/` (React, `web/tsconfig.json`, jsx `react-jsx`, imports without extensions). Writes = REST to `/api`; reads = react-query, invalidated live by the WebSocket. Optimistic mutations live in `web/src/queries.ts`. Dark, Obsidian-themed; tokens in `web/src/index.css` `@theme`. Vite handles its CSS — no manual rebuild. (2) **Auth/admin HTMX pages** (`src/web/routes/*.tsx`, `hono/jsx`, vendored in `public/vendor/`): if you change their Tailwind classes, rebuild `public/app.css` (`bunx @tailwindcss/cli -i styles/app.css -o public/app.css`). Both share accent `#7c3aed`.

**Database:** `bun:sqlite`, WAL. Schema changes are **new numbered migration files** in `src/db/migrations/` (e.g. `0003_*.sql`) — never edit an applied migration. Migrations run on boot. Simple key/value config goes in the `settings` table via `getSetting`/`setSetting` (no migration needed).

**Tests:** `bun:test`. Use `test/helpers.ts` `tmpVault()` / `fixtureVault()` for throwaway vaults. Unit-test vault/markdown/links logic directly; integration tests boot the real app on `port: 0` and drive it with the MCP SDK client (`test/mcp.integration.test.ts`) or `fetch` (`test/auth.test.ts`, `test/origin.test.ts`). Tests that exercise timing (snapshots, supervisor) poll for a condition rather than sleeping a fixed time.

**Adding an MCP tool:** the task tools live in `src/mcp/tools/tasks.ts` (`registerTaskTools(server, ctx)` where `ctx` is the `TaskAppContext`). Wrap handlers in `guarded()` (it already turns `TaskConflictError`/`TaskNotFoundError`/`VaultError` into teaching messages), set `annotations`, write descriptions like onboarding docs, and add the tool name to the integration test's expected list. **Mutations go through `ctx.service`** — never write the vault directly; the service handles hash-CAS, reindex, broadcast, snapshot, and recurrence.

**Adding a task API route / changing the wire shape:** the DTO is `src/tasks/dto.ts` (`TaskDTO`), mirrored in `web/src/types.ts` (`Task`) — keep them in sync. JSON routes are in `src/web/routes/api.ts`.

**Auth/origin:** never read the hostname from the raw `Host` header for security decisions — use the resolved `c.var.publicOrigin` / `c.var.rpId` (set by `resolveOriginMiddleware`). Tokens are stored as SHA-256 hashes and shown once.

## Versions & upgrades

Toolchain is exact-pinned in `.mise.toml` (Bun, Node LTS); deps are pinned by the committed `bun.lock` (`--frozen-lockfile` in CI + Docker); Docker base images and CI `bun-version` are pinned to exact patches. **Hold list:** `@modelcontextprotocol/sdk` stays on `1.x` (v2 is pre-alpha) and `zod` stays on `3.25.x` (MCP SDK peer compat). To bump anything, use the **`/upgrade`** skill (`.claude/skills/upgrade/`) — it encodes soaking discipline and where each version is pinned.

## Gotchas

- Env vars (esp. `PUBLIC_URL`) are read at boot; `bun --watch` reloads code but **not** env — restart `mise run dev` to change them.
- The vault can change underneath the server (Obsidian Sync / Syncthing). Reads carry a `file_hash`; mutations verify it. Don't bypass `tasks/service.ts` for task writes or `vault/store.ts` for raw writes.
- The index is a **cache**. On a parser/schema change, `DELETE FROM files` and re-sweep — never migrate task data. Changing the global filter or excluded folders triggers a full rebuild (see `app-context.ts`).
- Most config is **UI-configurable** in Settings (inbox note, global filter, excluded folders, OpenAI key, ntfy, notify hour) — stored in the `settings` table, not env. Secrets never leave the server (`publicSettings` exposes booleans).
- Deletes are soft (`.trash/`); every mutation is git-snapshotted. Both recoverable, but say what changed.
- The whole UI is the SPA at `/`; legacy admin lives at `/app/*` (server-rendered), reached from the user menu. Setup/login/OAuth-consent stay server-rendered by design.
