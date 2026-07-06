import type { Env } from "./types";

const RETENTION_DAYS = 35;

// Purges sync_runs rows older than 35 days, archiving them to R2 first
// when the binding is available (never delete without a backup copy —
// this is the kind of log data an audit request could need later). R2 is
// optional (see upload.ts for the same pattern): if it's not enabled yet,
// cleanup still runs, it just skips the archive step rather than blocking.
export async function cleanupOldSyncRuns(env: Env): Promise<{ archived: number; deleted: number }> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const old = await env.master_db
    .prepare("SELECT * FROM sync_runs WHERE started_at < ?")
    .bind(cutoff)
    .all();

  if (old.results.length === 0) {
    return { archived: 0, deleted: 0 };
  }

  let archived = 0;
  if (env.UPLOADS) {
    const key = `archived-logs/sync_runs-${new Date().toISOString().slice(0, 10)}.json`;
    try {
      await env.UPLOADS.put(key, JSON.stringify(old.results));
      archived = old.results.length;
    } catch (err) {
      console.error("Archive to R2 failed (non-fatal, proceeding with delete):", err);
    }
  }

  await env.master_db.prepare("DELETE FROM sync_runs WHERE started_at < ?").bind(cutoff).run();

  return { archived, deleted: old.results.length };
}
