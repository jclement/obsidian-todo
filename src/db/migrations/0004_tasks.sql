-- Task index. This is a DERIVED CACHE: it can be dropped and rebuilt from the
-- markdown at any time. The vault is the single source of truth; on any conflict
-- markdown wins. Identity is (path, line) validated by the file content hash.

CREATE TABLE files (
  path        TEXT PRIMARY KEY,      -- vault-relative
  hash        TEXT NOT NULL,         -- content hash (the CAS token)
  mtime       INTEGER,               -- advisory only; never trusted for change detection
  indexed_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE tasks (
  id          INTEGER PRIMARY KEY,   -- surrogate; NOT a durable external id
  path        TEXT NOT NULL REFERENCES files(path) ON DELETE CASCADE,
  line        INTEGER NOT NULL,      -- 1-based line number in the file
  raw         TEXT NOT NULL,         -- exact original line (for safe rewrite)
  status      TEXT NOT NULL,         -- todo | done | in_progress | cancelled | other
  description TEXT NOT NULL,         -- display text (global-filter tag stripped)
  priority    TEXT NOT NULL DEFAULT 'normal',
  due         TEXT,
  scheduled   TEXT,
  start       TEXT,
  created     TEXT,
  done        TEXT,
  cancelled   TEXT,
  recurrence  TEXT,
  reminder    TEXT,                  -- HH:MM, optional
  tags        TEXT NOT NULL DEFAULT '[]', -- JSON array (excl. global filter)
  task_id     TEXT,                  -- 🆔 value if present
  depends_on  TEXT NOT NULL DEFAULT '[]', -- JSON array of ids
  source_note TEXT NOT NULL,         -- note title/basename, for "project" grouping
  indent      INTEGER NOT NULL DEFAULT 0,
  parent_line INTEGER,               -- for subtask hierarchy
  UNIQUE(path, line)
);

CREATE INDEX idx_tasks_due    ON tasks(due);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_note   ON tasks(source_note);
CREATE INDEX idx_tasks_path   ON tasks(path);

-- Sync-conflict files surfaced to the UI rather than indexed silently.
CREATE TABLE sync_conflicts (
  path       TEXT PRIMARY KEY,
  seen_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Dedupe ledger so a due/reminder notification fires at most once per task/day.
CREATE TABLE notifications_sent (
  key        TEXT PRIMARY KEY,       -- e.g. "<path>:<line>:<kind>:<yyyy-mm-dd>"
  sent_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
