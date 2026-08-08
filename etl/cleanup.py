"""Entry point: purges Daily Records DB rows past their retention window.
Mirrors worker/src/lib/cleanup.ts's tiered retention — this file used to
apply a flat 35 days to every table including wallet_details, which was
stale/wrong: wallet_details actually needs a much shorter window (see
cleanup.ts's comment) since it scales with total bet COUNT, not (users x
games), and hit D1's 500MB size cap twice (2026-07-26, 2026-08-08) sitting
at the old, too-long retention figure. In practice worker-upload's own
daily cron already runs cleanupOldSyncRuns() with the correct tiered
retention (see worker-upload/wrangler.jsonc), so this script is currently
redundant belt-and-suspenders rather than the primary enforcement — but it
needs to match, not silently apply a wrong/longer retention, in case that
cron is ever the one that's down. R2 archiving is included since Python has
no issue talking to R2's S3-compatible API directly; skipped automatically
if R2_BUCKET isn't set."""
import os
from datetime import datetime, timedelta, timezone

import cf_client

DAILY_DB_ID = os.environ["DAILY_DB_ID"]
RETENTION_DAYS = 35
WALLET_DETAILS_RETENTION_DAYS = 7
WALLET_DAILY_AGG_RETENTION_DAYS = 40

TABLES = [
    ("sync_runs", "started_at", RETENTION_DAYS),
    ("deposits", "synced_at", RETENTION_DAYS),
    ("withdrawals", "synced_at", RETENTION_DAYS),
    ("wallet_details", "synced_at", WALLET_DETAILS_RETENTION_DAYS),
    # dateColumn is "d" (the calendar day the row summarizes), not
    # synced_at — wallet_daily_agg rows are recomputed in place each run,
    # not append-only, so there's no separate sync timestamp to purge by.
    ("wallet_daily_agg", "d", WALLET_DAILY_AGG_RETENTION_DAYS),
]


def main():
    now = datetime.now(timezone.utc)
    total_deleted = 0

    for table, date_column, retention_days in TABLES:
        cutoff = (now - timedelta(days=retention_days)).isoformat()
        old_rows = cf_client.d1_query(DAILY_DB_ID, f"SELECT COUNT(*) as c FROM {table} WHERE {date_column} < ?", [cutoff])
        count = old_rows[0]["c"] if old_rows else 0
        if count == 0:
            print(f"[{table}] nothing older than {retention_days} days")
            continue

        # R2 archiving intentionally omitted here until R2 is enabled in the
        # dashboard (see UPLOADS binding notes in the Workers version) —
        # add a boto3-based archive step here once a bucket exists.

        cf_client.d1_query(DAILY_DB_ID, f"DELETE FROM {table} WHERE {date_column} < ?", [cutoff])
        total_deleted += count
        print(f"[{table}] deleted {count} rows older than {retention_days} days")

    print(f"cleanup complete — {total_deleted} total rows deleted")


if __name__ == "__main__":
    main()
