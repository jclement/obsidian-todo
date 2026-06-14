# Obsidian-Backed Task Manager — Technical Spec

A self-hosted task system where the **Obsidian vault stays the single source of truth** and a small service puts two heads on it: a clean web UI and an MCP endpoint. Replaces the Todoist setup; tasks live as markdown checkboxes in the vault, mostly on project notes.

---

## 1. Goals & non-goals

**Goals**
- Markdown task lines in the vault are canonical. The app never owns task state.
- Interact with tasks faster and cleaner than editing markdown by hand, especially on mobile.
- One backend, two heads: responsive web UI + MCP server, sharing one index.
- Notifications for due/overdue tasks.
- Survive concurrent edits from Obsidian + sync without corrupting notes.

**Non-goals**
- Not a general note editor. Tasks only.
- No proprietary task store. The SQLite index is a disposable cache, always rebuildable from markdown.
- No moving tasks between files on completion (no "archive sweep") — completed tasks stay in place.

---

## 2. Core principles

1. **Vault = truth, index = cache.** State lives in the file. SQLite is a derived index that can be dropped and rebuilt at any time. On any conflict, markdown wins.
2. **`#task` is the gate.** Only checkbox lines carrying the global-filter tag (`#task`, configurable) are indexed as managed tasks. The vault is full of in-document checklists (action items in meeting/project/product notes); those stay invisible to the app. Promoting a checklist item to a real task = add `#task`.
3. **Filename doesn't matter.** Tasks are auto-discovered anywhere in the vault. The containing note is metadata (used for grouping into "projects"), not structure.
4. **Identity = `(file_path, line_number)`, validated by file hash.** No embedded task id required. The file's content hash is the version/CAS token. A line number is only trusted when the current file hash matches the one we indexed against.
5. **Write-through + optimistic concurrency.** Every mutation checks the hash, edits the line, recomputes the hash, and updates the index in one transaction. Mismatch → reject and reindex.

---

## 3. Task format (Obsidian Tasks plugin)

Reviewed against the current Tasks plugin docs. Default = **Emoji format** (matches the vault today, e.g. `📅 2026-05-25 ✅ 2026-03-30`). The parser should also *read* Dataview-style inline fields (`[due:: 2026-05-25]`) so nothing is missed, but **write** in the configured format (emoji by default).

A task line: `<list marker> [<status>] <description> <signifiers...>`

### Status characters (checkbox)
| Char | Status type |
|------|-------------|
| ` ` (space) | TODO |
| `x` / `X` | DONE |
| `/` | IN_PROGRESS |
| `-` | CANCELLED |
| other | custom → treat as NON_TASK unless mapped |

### Priority signifiers (0 or 1 per task)
| Emoji | Priority |
|-------|----------|
| 🔺 | Highest |
| ⏫ | High |
| 🔼 | Medium |
| *(none)* | Normal |
| 🔽 | Low |
| ⏬ | Lowest |

### Date signifiers (all `YYYY-MM-DD`, date-only)
| Emoji | Field |
|-------|-------|
| ➕ | created |
| 🛫 | start |
| ⏳ | scheduled |
| 📅 | due |
| ❌ | cancelled |
| ✅ | done |

### Other signifiers
| Emoji | Field | Notes |
|-------|-------|-------|
| 🔁 | recurrence | e.g. `🔁 every week`, `🔁 every 3 days`, `🔁 every month when done`. Recurring tasks need ≥1 of due/scheduled/start. |
| 🆔 | id | optional; parsed & preserved if present, not required by us |
| ⛔ | dependsOn | comma-separated ids |
| ⏰ | reminder time | **extension** (not core Tasks), `HH:MM`; optional, used for notifications |

**Parsing rules**
- Description is the text before the first recognised signifier; **tags stay in the description** (including the `#task` global filter, which is stripped for display).
- Field order: signifiers come after the description; recurrence rule + its reference date come after the description. Order among signifiers doesn't affect parsing, but **we emit in a canonical order on write** (below).
- Preserve indentation (subtasks) and any trailing block reference (`^id`).

**Canonical write order** (for clean round-trips with the Tasks plugin):
`description … #tags  <priority>  🔁<rec>  ➕<created>  🛫<start>  ⏳<sched>  📅<due>  ❌<cancelled>  ✅<done>  🆔<id>  ⛔<deps>`

---

## 4. Index schema (SQLite)

```sql
CREATE TABLE files (
  path        TEXT PRIMARY KEY,      -- vault-relative
  hash        TEXT NOT NULL,         -- sha256 of file bytes (the CAS token)
  mtime       INTEGER,               -- advisory only; never trusted for change detection
  indexed_at  INTEGER NOT NULL
);

CREATE TABLE tasks (
  rowid_pk    INTEGER PRIMARY KEY,   -- surrogate; NOT a durable external id
  path        TEXT NOT NULL REFERENCES files(path) ON DELETE CASCADE,
  line        INTEGER NOT NULL,      -- 1-based line number in the file
  raw         TEXT NOT NULL,         -- exact original line (for safe rewrite)
  status      TEXT NOT NULL,         -- todo | done | in_progress | cancelled | other
  description TEXT NOT NULL,         -- display text (global-filter tag stripped)
  priority    TEXT,                  -- highest|high|medium|normal|low|lowest
  due         TEXT, scheduled TEXT, start TEXT,
  created     TEXT, done TEXT, cancelled TEXT,
  recurrence  TEXT,
  reminder    TEXT,                  -- HH:MM, optional
  tags        TEXT,                  -- JSON array (excl. global filter)
  task_id     TEXT,                  -- 🆔 value if present, else NULL
  depends_on  TEXT,                  -- JSON array of ids
  source_note TEXT NOT NULL,         -- note title/basename, for "project" grouping
  indent      INTEGER NOT NULL DEFAULT 0,
  parent_line INTEGER,               -- for subtask hierarchy
  UNIQUE(path, line)
);

CREATE INDEX idx_tasks_due    ON tasks(due);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_note   ON tasks(source_note);
```

Client-facing task handle = `{ path, line, file_hash }`. The `file_hash` is what the client echoes back on every write (the CAS token).

---

## 5. Sync & indexing

**Change detection: content hash, never mtime.** The vault lives on Docker storage and syncs via Syncthing; mtimes are unreliable across bind mounts and sync. Flow:
1. **Watcher** (`inotify` via Elixir `FileSystem`) detects a touched `.md` file → enqueue it.
2. **Hash check.** Read the file, compute sha256, compare to `files.hash`. Equal → no-op (this filters watcher noise and our own echoes). Different → reindex.
3. **Per-file reindex (delete + recreate).** Delete all `tasks` rows for that path, re-parse the file, insert the current tasks, update `files.hash`. Granular and simple.

**Fallback periodic scan.** inotify events don't always propagate across Docker bind mounts / network FS / Syncthing. Run a debounced full sweep every N seconds (default 15s) that hashes files and reindexes any drift. Watcher is the fast path; the sweep is the safety net.

**Syncthing conflicts.** If a `*.sync-conflict-*.md` file appears, surface it in the UI (banner + list) rather than indexing it silently — never let a sync conflict quietly drop a task.

**Realtime.** After a reindex, broadcast over Phoenix PubSub so open LiveView clients update live (Obsidian edits show up in the web UI instantly, and vice versa).

---

## 6. Write path (the heart of it)

All writes are **write-through with optimistic concurrency**, and **serialized per file** (a per-path mutex/queue) so rapid edits don't collide with their own echoes.

**Web UI / REST (hash-CAS):**
1. Client sends the mutation with `expected_hash` (the `file_hash` it last saw).
2. Server takes the per-path lock, reads the file, computes the current hash.
3. **Match** → apply the line edit, recompute hash, rewrite file, reindex that one file, store new hash, release lock. Return the updated task(s) + new `file_hash`.
4. **Mismatch** → 409 Conflict; trigger a reindex of that file; return the fresh task list for the note so the client can refresh. (User-visible cost: a stale click asks to refresh instead of acting on the wrong line. Rare for a single writer; acceptable.)

**MCP (description-verified just-in-time):** LLMs shouldn't juggle hashes. MCP mutating tools take `{ path, line, description }`. Server takes the lock, re-reads the file, and verifies the line still matches the expected description; if the line shifted, it relocates by description within the file. If it can't confidently match, it returns the note's current tasks and asks the agent to retry. Same safety guarantee, friendlier for agents.

**Edit rules per operation**
- **Complete:** set status → `x`, append `✅ <today>`. If `recurrence` present, also insert the next occurrence as a new TODO line above/below (computed from the rule + reference date), with `🆔`/`⛔` stripped per Tasks semantics.
- **Cancel:** status → `-`, append `❌ <today>`.
- **Reschedule:** replace/insert `📅` (or `⏳`/`🛫`) date.
- **Edit fields/priority/tags:** rewrite the line from parsed fields in canonical order, preserving description text and indentation.
- **Remove:** delete the line. **This shifts every line below it** — handled automatically because we reindex the whole file as part of the same write-through (we already hold the new content).
- **Add:** see §7.

---

## 7. Capture & file conventions

- **New tasks** from the web UI / MCP with no explicit home → append to the existing **`Inbox.md`** (configurable), formatted with `#task` + any parsed fields. Optionally target a specific note ("add to *Barreleye Inventory Management*").
- **Filename otherwise irrelevant** — discover tasks anywhere.
- **Completed tasks stay in place** (`- [x] … ✅ date`); filtered out of active views. No archive-move churn.
- **Projects are emergent:** `source_note` groups tasks. A note with tasks *is* a project view; no enforced folder structure.

---

## 8. API surface (JSON over HTTP)

Shared by the web UI and mirrored by MCP tools.

```
GET    /tasks?filter=...            → [{path,line,file_hash, ...fields}]
GET    /tasks/views/today           → due/overdue/scheduled today
GET    /tasks/views/upcoming?days=7
GET    /tasks/views/inbox           → tasks in Inbox.md
GET    /notes                       → [{note, open_count, …}]  (project grouping)
POST   /tasks                       → add {description, due?, priority?, target_note?}
PATCH  /tasks                       → edit {path, line, expected_hash, changes:{…}}
POST   /tasks/complete              → {path, line, expected_hash}
POST   /tasks/cancel                → {path, line, expected_hash}
DELETE /tasks                       → {path, line, expected_hash}
POST   /reindex                     → {path?}  (one file or full)
GET    /health
```

Filter grammar (subset of Tasks query ideas): `status`, `due before/after/on`, `tag`, `priority`, `note`, `has/ no recurrence`, free-text on description. Multi-condition AND/OR, multi-sort, group-by (default: due then priority; project view: group by `source_note`).

---

## 9. MCP server

Tools mirror the API; mutating tools use the description-verified write path (§6).

- `list_tasks(filter)` — returns tasks with `{path, line, description, fields}`.
- `add_task(description, due?, priority?, tags?, target_note?)`
- `complete_task(path, line, description)`
- `reschedule_task(path, line, description, due)`
- `update_task(path, line, description, changes)`
- `cancel_task(path, line, description)` / `remove_task(...)`
- `list_projects()` — notes with open task counts.
- `query(text)` — natural filter → structured filter.

Exposed at `tasks.onewheelgeek.net/mcp` behind the same tunnel/auth as the web app.

---

## 10. Web UI

**Design intent:** fast, keyboard-first, optimistic, quiet. Minimal chrome, content-dense but calm. No emoji noise in the chrome (the markdown keeps emoji; the UI renders them as clean icons/badges). Dark-first.

**Information architecture (left rail):**
- **Today** — overdue + due/scheduled today. The default landing view.
- **Upcoming** — next 7 days, grouped by day.
- **Inbox** — untriaged (`Inbox.md`, or no date/tags).
- **Projects** — grouped by `source_note`; this is the primary work view since most tasks are project work.
- **Tags** — saved tag views (your existing `#engineering`, `#product`, `#quick-win`, `#big-bet`, etc. become filters for free).
- **Someday** — `#someday`-tagged.
- **Search** — full-text + filter grammar.

**Task row anatomy:** checkbox (click = optimistic complete) · description · priority badge · due chip (red overdue / amber today) · recurrence glyph · source-note pill (click → project view) · subtle "open in Obsidian" deep link (`obsidian://`).

**Interactions**
- **Quick add** with natural-language parsing: `Fix OData 500 tomorrow #barreleye ⏫` → due date + tag + priority resolved on the client, previewed before commit.
- Inline edit; drag to reschedule on Upcoming; `j/k` navigate, `x` complete, `e` edit, `c` create — keyboard-first.
- **Realtime**: PubSub pushes vault changes live; a small "synced / reindexing / conflict" indicator.
- **Conflict UX**: on 409, the affected rows soft-refresh with a "changed in Obsidian — updated" toast rather than a hard error.

*(Build will follow the frontend-design skill for tokens/typography/spacing.)*

---

## 11. Mobile

You asked for a native phone app. Recommendation is a **PWA-first** path, because it reuses the web UI and — since your daily phone is Android — **Web Push is first-class** (unlike iOS PWAs).

- **Phase 1 — Installable PWA:** responsive layout, home-screen install, offline read cache of the index, Web Push (VAPID) for due/overdue. Swipe-to-complete, swipe-to-reschedule, big quick-add. This likely *is* the "cleaner than Obsidian on mobile" win you're after.
- **Phase 2 — Native (optional):** if you want home-screen widgets and rock-solid background notifications, wrap the PWA (Capacitor/Tauri-mobile) or build a thin native/Expo client against the same JSON API. Same backend, more native affordances. Decide after living on the PWA.

**Notifications:** a backend scheduler scans for due/overdue/reminder (`⏰`) tasks and fires via **ntfy** (you already run it) and/or Web Push. ntfy gives you reliable phone alerts immediately with near-zero build cost.

---

## 12. Architecture & deployment

- **One Phoenix (Elixir/LiveView) app**, co-located with the synced vault directory. Reads the vault over the filesystem directly — **not** the Obsidian Local REST API (that needs the desktop app running; the backend must work headless).
- **SQLite** index (ecto_sqlite3), rebuildable; `PRAGMA journal_mode=WAL`.
- **Watcher** (`FileSystem`/inotify) + debounced periodic sweep fallback (§5).
- **PubSub** for realtime LiveView updates.
- **MCP endpoint** as a route in the same app (HTTP/SSE), sharing the index and write path.
- **Exposure:** Cloudflare Tunnel sidecar (your standard pattern), `tasks.onewheelgeek.net`. **Auth:** single user — Cloudflare Access (Zero Trust) in front, or WebAuthn/passkey login at the app. Both fine; Access is least code.
- **Deploy:** Kamal + Forgejo Actions + Cloudflare Tunnel, matching your other services.
- **Notifications:** scheduler GenServer + ntfy publish (+ optional Web Push).

---

## 13. Edge cases & decisions

- **Recurrence engine** is the meatiest sub-component: must replicate Tasks' rules (`every day`, `every 3 weeks`, `every month on the 1st`, and the `when done` variant) and generate the next instance on completion, stripping `🆔`/`⛔`. Port or wrap an existing rrule-ish parser; validate against real recurring tasks in the vault.
- **Multi-format:** read both emoji + dataview fields; write the configured format (emoji default). Confirm your Tasks plugin's configured format so writes match.
- **Subtasks:** indentation → `parent_line`; project view can nest. Completing a parent doesn't auto-complete children (mirror Tasks).
- **Dependencies (`🆔`/`⛔`):** parse, preserve, surface "blocked/blocking" in views; not required for v1 actions.
- **Non-`#task` checkboxes:** ignored by default. Optional later "discover mode" to surface untagged checklists per-folder, if ever wanted.
- **Block refs / links in description (e.g. ADO URLs):** preserve verbatim on rewrite.

---

## 14. Build phases

0. **Parser + indexer + SQLite**, plus a read-only CLI that dumps parsed tasks — validate against the real vault before anything else.
1. **Backend service**: watcher + sweep, read REST API, write path (hash-CAS), per-file serialization, reindex.
2. **Web UI** (LiveView): Today / Upcoming / Inbox / Projects / Tags, quick-add NLP, complete/edit/reschedule, realtime, conflict UX.
3. **MCP endpoint**: tools over the same write path.
4. **Notifications + PWA**: scheduler → ntfy/Web Push; installable PWA, swipe actions, offline read.
5. **(Optional) Native/widgets.**

---

## 15. Open questions

1. Confirm the Tasks plugin's configured format (emoji vs dataview) so writes round-trip cleanly. (Vault currently shows emoji.)
2. Adopt `⏰ HH:MM` reminder times as a supported extension, or keep due-date-granularity only?
3. Recurrence: port Tasks' exact semantics, or define a simpler rule subset for v1?
4. Auth: Cloudflare Access vs app-level WebAuthn?
5. Do you want a global "Next Actions" concept (e.g. a `#next` tag view) carried over from the Todoist GTD setup, or is due-date + project grouping enough?