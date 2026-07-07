"""
Shared logic ported from the Workers version (excelParse.ts / exportClient.ts)
so both implementations agree on field names and window/date calculations.
"""
import hashlib
import json
from datetime import datetime, timedelta, timezone

import pandas as pd

import cf_client

IST_OFFSET = timedelta(hours=5, minutes=30)

ID_FIELD_CANDIDATES = [
    "id", "orderId", "orderNo", "flowId", "recordId", "withdrawId",
    "depositId", "detailId", "serialNo", "serialNumber", "记录ID", "订单号",
]
USER_ID_FIELD_CANDIDATES = ["userId", "UserId", "user_id", "uid", "用户ID", "用户id"]
AMOUNT_FIELD_CANDIDATES = [
    "amount", "money", "orderAmount", "WithDrawAmount", "ReceivedAmount", "总额", "金额",
]
STATUS_FIELD_CANDIDATES = [
    "status", "state", "COMPLETE is done",
    "0 Under review, 1 Payment processing, 2 Completed, 3 Rejected, 4 Failed", "状态",
]
TIME_FIELD_CANDIDATES = ["createTime", "create_time", "time", "创建时间"]


def _pick(row: dict, candidates: list[str]):
    for c in candidates:
        v = row.get(c)
        if v is not None and v != "" and not (isinstance(v, float) and pd.isna(v)):
            return v
    return None


def _coerce(v):
    if v is None:
        return None
    if isinstance(v, float) and pd.isna(v):
        return None
    if isinstance(v, pd.Timestamp) or isinstance(v, datetime):
        return v.isoformat()
    # pandas/numpy scalar types (numpy.int64, numpy.float64, ...) don't
    # satisfy isinstance(v, int)/(v, float) — they're not JSON-serializable
    # as-is either, and were silently falling through to str(v) below,
    # which produced garbage values sent to D1's HTTP API (unlike the
    # Workers binding, which accepted JS numbers natively). .item()
    # converts a numpy scalar to its native Python equivalent.
    if hasattr(v, "item") and callable(v.item):
        return v.item()
    if isinstance(v, (int, float, str)):
        return v
    return str(v)


def record_key(row: dict) -> str:
    for c in ID_FIELD_CANDIDATES:
        v = row.get(c)
        if v is not None and v != "" and not (isinstance(v, float) and pd.isna(v)):
            return str(v)
    # Fallback: deterministic content hash, matching excelParse.ts's recordKey
    canonical = json.dumps(sorted(row.items()), default=str, sort_keys=True)
    return hashlib.sha256(canonical.encode()).hexdigest()


def extract_common_fields(row: dict) -> dict:
    return {
        "user_id": _coerce(_pick(row, USER_ID_FIELD_CANDIDATES)),
        "amount": _coerce(_pick(row, AMOUNT_FIELD_CANDIDATES)),
        "status": _coerce(_pick(row, STATUS_FIELD_CANDIDATES)),
        "create_time": _coerce(_pick(row, TIME_FIELD_CANDIDATES)),
    }


def parse_excel_rows(content: bytes) -> list[dict]:
    """Reads every sheet, returns every non-empty row as a dict — same
    "every worksheet, every valid record" behavior as parseAllSheets in
    excelParse.ts."""
    import io

    xls = pd.read_excel(io.BytesIO(content), sheet_name=None)
    rows = []
    for _, df in xls.items():
        for _, row in df.iterrows():
            d = row.to_dict()
            if any(v is not None and v != "" and not (isinstance(v, float) and pd.isna(v)) for v in d.values()):
                rows.append(d)
    return rows


def today_utc_date() -> datetime:
    now = datetime.now(timezone.utc)
    return datetime(now.year, now.month, now.day, tzinfo=timezone.utc)


def today_ist_date() -> datetime:
    """IST calendar date, expressed as a UTC-midnight-anchored datetime for
    consistent date-string formatting — mirrors todayIST() in exportClient.ts."""
    shifted = datetime.now(timezone.utc) + IST_OFFSET
    return datetime(shifted.year, shifted.month, shifted.day, tzinfo=timezone.utc)


def fmt_date(d: datetime) -> str:
    return d.strftime("%Y-%m-%d")


def deposit_withdraw_window(sync_window_days: int = 5) -> tuple[str, str]:
    """N calendar days including today — mirrors syncWindow() in exportClient.ts."""
    today = today_utc_date()
    start = today - timedelta(days=sync_window_days - 1)
    return fmt_date(start), fmt_date(today)


WALLET_LAST_RUN_DATE_KEY = "wallet:last_run_date"


def is_first_wallet_run_of_day() -> bool:
    """True exactly once per IST calendar day — mirrors isFirstWalletRunOfDay()
    in exportClient.ts, using the SAME KV key, so the Python and (now retired)
    Workers logic can never disagree about which run is "first" even if both
    were ever run side by side."""
    today_str = fmt_date(today_ist_date())
    last_run_date = cf_client.kv_get(WALLET_LAST_RUN_DATE_KEY)
    if last_run_date == today_str:
        return False
    cf_client.kv_put(WALLET_LAST_RUN_DATE_KEY, today_str)
    return True


def wallet_window(is_first_run_of_day: bool) -> tuple[str, str]:
    today = today_ist_date()
    day = today - timedelta(days=1) if is_first_run_of_day else today
    date_str = fmt_date(day)
    return date_str, date_str


def get_bearer_token() -> str:
    stored = cf_client.kv_get("config:bearer_token")
    if stored:
        return stored
    raise RuntimeError("No Bearer Token found in KV (config:bearer_token) — save one via the Configuration page first.")


def get_export_url(source: str) -> str:
    stored = cf_client.kv_get(f"config:export_url:{source}")
    if stored:
        return stored
    raise RuntimeError(f"No export URL found in KV for {source} (config:export_url:{source}).")
