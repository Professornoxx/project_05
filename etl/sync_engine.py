"""
Core sync logic shared by deposit/withdraw/wallet. Mirrors chunkedUpsert.ts +
sync.ts + aggregate.ts from the Workers version, but with none of the
Workers-side ceilings: no 50-subrequest cap, no CPU-time limit, no self-fetch
restriction. Row batching (150/statement) is still used because it's a real
D1-engine limit (same SQLite engine regardless of transport), not a
Workers-specific one — but the NUMBER of batches is now unbounded, since a
GitHub Actions job has no per-request budget to run out of.
"""
import os
import sys
import time
from datetime import datetime, timezone

import requests

import cf_client
import common

MASTER_DB_ID = os.environ["MASTER_DB_ID"]
DAILY_DB_ID = os.environ["DAILY_DB_ID"]
PACKAGE_ID = os.environ.get("PACKAGE_ID", "10")

CHUNK_SIZE = 150  # proven safe D1 batch size (see chunkedUpsert.ts history)
REQUEST_TIMEOUT_SECONDS = 120  # generous — no Workers-style CPU clock to protect here

TABLE_BY_SOURCE = {"deposit": "deposits", "withdraw": "withdrawals", "wallet": "wallet_details"}


def fetch_export_rows(source: str, begin_time: str, end_time: str) -> list[dict]:
    url = common.get_export_url(source)
    token = common.get_bearer_token()

    params = {
        "packageId": PACKAGE_ID,
        "pageNum": "1",
        "pageSize": "100000",
        "useUpiQuery": "true",
        "queryDate[0]": begin_time,
        "queryDate[1]": end_time,
    }
    started = time.time()
    try:
        res = requests.post(
            url, params=params, headers={"Authorization": f"Bearer {token}"}, timeout=REQUEST_TIMEOUT_SECONDS
        )
    except requests.exceptions.RequestException as e:
        elapsed = int((time.time() - started) * 1000)
        raise RuntimeError(f"{source} export fetch failed after {elapsed}ms: {e}")

    if not res.ok:
        raise RuntimeError(f"{source} export failed: {res.status_code} {res.reason}")

    content_type = res.headers.get("content-type", "")
    if "json" in content_type:
        body = res.json()
        code = body.get("code")
        if code is not None and code != 200:
            raise RuntimeError(f"{source} export error (code {code}): {body.get('msg', 'no message')}")
        return body if isinstance(body, list) else body.get("rows", [])

    content = res.content
    if content[:2] != b"PK":
        preview = content[:200].decode("utf-8", errors="replace")
        raise RuntimeError(
            f"{source} export: response is not a valid .xlsx (magic bytes {content[:4].hex()}). "
            f"content-type={content_type} size={len(content)} preview={preview!r}"
        )
    return common.parse_excel_rows(content)


def upsert_rows(table: str, rows: list[dict]) -> tuple[int, list[int]]:
    """Returns (rows_written, touched_user_ids)."""
    if not rows:
        return 0, []

    now = datetime.now(timezone.utc).isoformat()
    touched_user_ids = []

    for i in range(0, len(rows), CHUNK_SIZE):
        chunk = rows[i : i + CHUNK_SIZE]
        values_sql = []
        params = []
        for row in chunk:
            key = common.record_key(row)
            fields = common.extract_common_fields(row)
            values_sql.append("(?, ?, ?, ?, ?, ?)")
            params.extend([key, fields["user_id"], fields["amount"], fields["status"], fields["create_time"], now])
            if fields["user_id"] is not None:
                try:
                    touched_user_ids.append(int(float(fields["user_id"])))
                except (ValueError, TypeError):
                    pass

        sql = (
            f"INSERT INTO {table} (record_key, user_id, amount, status, create_time, synced_at) "
            f"VALUES {','.join(values_sql)} "
            "ON CONFLICT(record_key) DO UPDATE SET "
            "user_id = excluded.user_id, amount = excluded.amount, status = excluded.status, "
            "create_time = excluded.create_time, synced_at = excluded.synced_at"
        )
        cf_client.d1_query(DAILY_DB_ID, sql, params)

    return len(rows), touched_user_ids


def update_master_aggregates(table: str, user_ids: list[int]) -> int:
    """Mirrors aggregate.ts: after Daily Records DB is updated, refresh the
    touched users' summary columns in the Master DB. Only deposit/withdraw
    map to a Master DB column; wallet_details has none yet."""
    unique_ids = list({uid for uid in user_ids if uid is not None})
    if not unique_ids:
        return 0

    column = "total_deposit" if table == "deposits" else "total_withdrawal"
    count_column = "deposit_count" if table == "deposits" else None

    updated = 0
    for i in range(0, len(unique_ids), 100):
        chunk = unique_ids[i : i + 100]
        placeholders = ",".join("?" for _ in chunk)
        sums = cf_client.d1_query(
            DAILY_DB_ID,
            f"SELECT user_id, SUM(amount) as total, COUNT(*) as cnt FROM {table} "
            f"WHERE user_id IN ({placeholders}) GROUP BY user_id",
            chunk,
        )
        for row in sums:
            now = datetime.now(timezone.utc).isoformat()
            if count_column:
                cf_client.d1_query(
                    MASTER_DB_ID,
                    f"UPDATE users SET {column} = ?, {count_column} = ?, update_time = ? WHERE user_id = ?",
                    [row["total"], row["cnt"], now, row["user_id"]],
                )
            else:
                cf_client.d1_query(
                    MASTER_DB_ID,
                    f"UPDATE users SET {column} = ?, update_time = ? WHERE user_id = ?",
                    [row["total"], now, row["user_id"]],
                )
            updated += 1
    return updated


def log_run(source: str, started_at: str, status: str, rows_upserted: int, error_message: str | None) -> None:
    cf_client.d1_query(
        DAILY_DB_ID,
        "INSERT INTO sync_runs (source, started_at, finished_at, status, rows_upserted, error_message) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        [source, started_at, datetime.now(timezone.utc).isoformat(), status, rows_upserted, error_message],
    )


def sync_source(source: str, begin_time: str, end_time: str) -> None:
    table = TABLE_BY_SOURCE[source]
    started_at = datetime.now(timezone.utc).isoformat()
    print(f"[{source}] window {begin_time} to {end_time}")
    try:
        rows = fetch_export_rows(source, begin_time, end_time)
        print(f"[{source}] fetched {len(rows)} rows")
        written, user_ids = upsert_rows(table, rows)

        if source in ("deposit", "withdraw"):
            updated = update_master_aggregates(table, user_ids)
            print(f"[{source}] updated Master DB aggregates for {updated} users")

        log_run(source, started_at, "success", written, None)
        print(f"[{source}] SUCCESS — {written} rows upserted")
    except Exception as e:
        log_run(source, started_at, "failed", 0, str(e))
        print(f"[{source}] FAILED — {e}", file=sys.stderr)
        raise
