"""Entry point: purges Daily Records DB rows older than 35 days. Mirrors
cleanup.ts. R2 archiving is included since Python has no issue talking to
R2's S3-compatible API directly; skipped automatically if R2_BUCKET isn't set
(R2 hasn't been enabled in the Cloudflare dashboard yet as of this writing)."""
import os
from datetime import datetime, timedelta, timezone

import cf_client

DAILY_DB_ID = os.environ["DAILY_DB_ID"]
RETENTION_DAYS = 35

TABLES = [
    ("sync_runs", "started_at"),
    ("deposits", "synced_at"),
    ("withdrawals", "synced_at"),
    ("wallet_details", "synced_at"),
]


def main():
    cutoff = (datetime.now(timezone.utc) - timedelta(days=RETENTION_DAYS)).isoformat()
    total_deleted = 0

    for table, date_column in TABLES:
        old_rows = cf_client.d1_query(DAILY_DB_ID, f"SELECT COUNT(*) as c FROM {table} WHERE {date_column} < ?", [cutoff])
        count = old_rows[0]["c"] if old_rows else 0
        if count == 0:
            print(f"[{table}] nothing older than {RETENTION_DAYS} days")
            continue

        # R2 archiving intentionally omitted here until R2 is enabled in the
        # dashboard (see UPLOADS binding notes in the Workers version) —
        # add a boto3-based archive step here once a bucket exists.

        cf_client.d1_query(DAILY_DB_ID, f"DELETE FROM {table} WHERE {date_column} < ?", [cutoff])
        total_deleted += count
        print(f"[{table}] deleted {count} rows older than {RETENTION_DAYS} days")

    print(f"cleanup complete — {total_deleted} total rows deleted")


if __name__ == "__main__":
    main()
