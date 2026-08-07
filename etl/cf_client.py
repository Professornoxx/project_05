"""
Thin client for the Cloudflare REST APIs this ETL needs: Workers KV and D1.
No Cloudflare Worker is involved in any of this — GitHub Actions talks
directly to Cloudflare's platform APIs, which is the whole point of moving
the ETL off Workers: none of the CPU-time, subrequest-count, or self-fetch
restrictions we hit while building the Workers-based version apply here.
"""
import os
import requests

ACCOUNT_ID = os.environ["CLOUDFLARE_ACCOUNT_ID"]
API_TOKEN = os.environ["CLOUDFLARE_API_TOKEN"]
KV_NAMESPACE_ID = os.environ["KV_NAMESPACE_ID"]

BASE = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}"
HEADERS = {"Authorization": f"Bearer {API_TOKEN}"}

# Every call in this file used to have no timeout at all, so a single stalled
# request (confirmed live 2026-08-07: a wallet sync's D1 writes hung for 20+
# minutes with the database sitting right at its size cap) blocked the whole
# GitHub Actions job forever instead of failing and logging an error — and
# since the hourly workflow runs sequentially, that one hang stalled every
# later sync too, compounding into hours of dashboard staleness. 30s is
# generous for a single D1/KV/R2 call; anything slower than that is not
# going to succeed anyway and should fail fast so the run can log the error
# and move on to the next source instead of hanging indefinitely.
REQUEST_TIMEOUT_SECONDS = 30


def kv_get(key: str) -> str | None:
    res = requests.get(f"{BASE}/storage/kv/namespaces/{KV_NAMESPACE_ID}/values/{key}", headers=HEADERS, timeout=REQUEST_TIMEOUT_SECONDS)
    if res.status_code == 404:
        return None
    res.raise_for_status()
    return res.text


def kv_put(key: str, value: str) -> None:
    res = requests.put(
        f"{BASE}/storage/kv/namespaces/{KV_NAMESPACE_ID}/values/{key}",
        headers=HEADERS,
        data=value,
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    res.raise_for_status()


def r2_put_json(bucket: str, key: str, payload: dict) -> None:
    """Writes a JSON object to an R2 bucket via Cloudflare's REST API — same
    account, same style of call as kv_put above, just a different storage
    product. Used by build_reports.py to publish precomputed Platform
    Analysis "Month" tab reports for the dashboard Worker's REPORTS binding
    to read (see worker/wrangler.jsonc's comment on that binding). Requires
    the CLOUDFLARE_API_TOKEN secret to include R2 write scope — if it
    doesn't, this raises the same way d1_query/kv_put do on any other API
    error, so a missing-scope token fails loudly in the Action's logs
    rather than silently skipping the report.
    """
    import json
    res = requests.put(
        f"{BASE}/r2/buckets/{bucket}/objects/{key}",
        headers={**HEADERS, "Content-Type": "application/json"},
        data=json.dumps(payload),
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    res.raise_for_status()


def r2_get_json(bucket: str, key: str) -> list | dict | None:
    """Reads a JSON object back from an R2 bucket. Returns None on a 404
    (object doesn't exist) rather than raising, since callers here use this
    to read archived-logs/ backups that may or may not exist for a given
    day — a missing archive is an expected, checkable condition, not an
    error."""
    res = requests.get(f"{BASE}/r2/buckets/{bucket}/objects/{key}", headers=HEADERS, timeout=REQUEST_TIMEOUT_SECONDS)
    if res.status_code == 404:
        return None
    res.raise_for_status()
    return res.json()


def d1_query(db_id: str, sql: str, params: list | None = None) -> list[dict]:
    """Executes one SQL statement against a D1 database, returns result rows.
    Same underlying SQLite engine and limits as the Workers D1 binding (this
    is a different transport, not a different database) — batch sizes proven
    safe there (150 rows/statement for our 7-column tables) apply here too.
    """
    res = requests.post(
        f"{BASE}/d1/database/{db_id}/query",
        headers=HEADERS,
        json={"sql": sql, "params": params or []},
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    if not res.ok:
        raise RuntimeError(f"D1 HTTP {res.status_code}: {res.text[:1000]}")
    body = res.json()
    if not body.get("success"):
        raise RuntimeError(f"D1 query failed: {body.get('errors')}")
    results = body.get("result", [])
    return results[0]["results"] if results else []
