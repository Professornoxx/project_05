import json
from pathlib import Path

SRC_DIR = Path("/tmp/migration")
OUT_DIR = Path("/tmp/migration/batches")
OUT_DIR.mkdir(exist_ok=True)
BATCH_SIZE = 150

TABLES = {
    "deposits": ["id", "record_key", "user_id", "amount", "status", "create_time", "raw_json", "synced_at"],
    "withdrawals": ["id", "record_key", "user_id", "amount", "status", "create_time", "raw_json", "synced_at"],
    "sync_runs": ["id", "source", "started_at", "finished_at", "status", "rows_upserted", "error_message"],
}

def sql_val(v):
    if v is None:
        return "NULL"
    if isinstance(v, (int, float)):
        return str(v)
    s = str(v).replace("'", "''")
    return f"'{s}'"

file_count = 0
for table, cols in TABLES.items():
    data = json.loads(Path(SRC_DIR / f"{table}.json").read_text())
    rows = data[0]["results"]
    print(f"{table}: {len(rows)} rows")
    for b in range(0, len(rows), BATCH_SIZE):
        chunk = rows[b:b+BATCH_SIZE]
        lines = []
        for row in chunk:
            vals = ",".join(sql_val(row.get(c)) for c in cols)
            lines.append(f"INSERT INTO {table} ({','.join(cols)}) VALUES ({vals}) ON CONFLICT DO NOTHING;")
        out_path = OUT_DIR / f"{table}_{file_count:04d}.sql"
        out_path.write_text("\n".join(lines))
        file_count += 1

print(f"wrote {file_count} batch files to {OUT_DIR}")
