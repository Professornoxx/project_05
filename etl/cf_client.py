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


def kv_get(key: str) -> str | None:
    res = requests.get(f"{BASE}/storage/kv/namespaces/{KV_NAMESPACE_ID}/values/{key}", headers=HEADERS)
    if res.status_code == 404:
        return None
    res.raise_for_status()
    return res.text


def kv_put(key: str, value: str) -> None:
    res = requests.put(
        f"{BASE}/storage/kv/namespaces/{KV_NAMESPACE_ID}/values/{key}",
        headers=HEADERS,
        data=value,
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
    )
    res.raise_for_status()


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
    )
    if not res.ok:
        raise RuntimeError(f"D1 HTTP {res.status_code}: {res.text[:1000]}")
    body = res.json()
    if not body.get("success"):
        raise RuntimeError(f"D1 query failed: {body.get('errors')}")
    results = body.get("result", [])
    return results[0]["results"] if results else []
