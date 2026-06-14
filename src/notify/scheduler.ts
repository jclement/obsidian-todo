/**
 * Notification scheduler. Polls the index on an interval and publishes to ntfy:
 *   - a once-a-day digest of overdue + due-today at the configured hour, and
 *   - per-task reminders for tasks carrying a ⏰ HH:MM time, when that time
 *     passes on the day they're due/scheduled.
 *
 * A dedupe ledger (notifications_sent) guarantees at-most-once per task per day,
 * so restarts and the polling cadence never double-fire.
 */

import type { Database } from "bun:sqlite";
import type { TaskAppContext } from "../tasks/app-context.ts";
import { todayYmd } from "../tasks/dates.ts";
import { viewToday } from "../index/queries.ts";
import type { TaskRow } from "../tasks/dto.ts";
import { rowToDTO } from "../tasks/dto.ts";
import { logger } from "../log.ts";

const log = logger("notify");

export class NotificationScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private db: Database,
    private ctx: TaskAppContext,
    private intervalMs = 60_000,
  ) {}

  start() {
    this.timer = setInterval(() => void this.tick().catch((e) => log.error(String(e))), this.intervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  private alreadySent(key: string): boolean {
    const row = this.db.query("SELECT 1 FROM notifications_sent WHERE key = ?").get(key);
    if (row) return true;
    this.db.query("INSERT INTO notifications_sent (key) VALUES (?) ON CONFLICT(key) DO NOTHING").run(key);
    return false;
  }

  async tick() {
    const s = this.ctx.getSettings();
    if (!s.notifyEnabled || !s.ntfyUrl || !s.ntfyTopic) return;
    const now = this.ctx.now();
    const today = todayYmd(now);

    // Daily digest at/after the configured hour.
    if (now.getHours() >= s.notifyHour) {
      const key = `digest:${today}`;
      if (!this.alreadySent(key)) {
        const todays = viewToday(this.db, now);
        if (todays.length) {
          const overdue = todays.filter((t) => t.due && t.due < today).length;
          const title = `${todays.length} task${todays.length === 1 ? "" : "s"} for today`;
          const body = todays.slice(0, 12).map((t) => `• ${t.description}`).join("\n") +
            (todays.length > 12 ? `\n…and ${todays.length - 12} more` : "");
          await this.publish(s, title, body, overdue > 0 ? "high" : "default");
        }
      }
    }

    // Per-task ⏰ reminders for tasks due/scheduled today.
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const rows = this.db
      .query<TaskRow, [string, string]>(
        `SELECT t.*, f.hash AS file_hash FROM tasks t JOIN files f ON f.path = t.path
         WHERE t.status IN ('todo','in_progress','other') AND t.reminder IS NOT NULL
         AND (t.due = ? OR t.scheduled = ?)`,
      )
      .all(today, today);
    for (const row of rows) {
      const t = rowToDTO(row);
      if (!t.reminder || t.reminder > hhmm) continue; // not time yet
      const key = `reminder:${t.path}:${t.line}:${today}`;
      if (this.alreadySent(key)) continue;
      await this.publish(s, `⏰ ${t.description}`, t.due ? `Due today` : `Scheduled today`, "high");
    }
  }

  private async publish(
    s: { ntfyUrl: string; ntfyTopic: string; ntfyToken: string },
    title: string,
    body: string,
    priority: "default" | "high",
  ) {
    try {
      const headers: Record<string, string> = {
        Title: title,
        Priority: priority === "high" ? "high" : "default",
        Tags: "obsidian-todo",
      };
      if (s.ntfyToken) headers.Authorization = `Bearer ${s.ntfyToken}`;
      const res = await fetch(`${s.ntfyUrl}/${encodeURIComponent(s.ntfyTopic)}`, {
        method: "POST",
        headers,
        body,
      });
      if (!res.ok) log.warn(`ntfy publish failed (${res.status})`);
    } catch (err) {
      log.warn(`ntfy publish error: ${String(err)}`);
    }
  }
}
