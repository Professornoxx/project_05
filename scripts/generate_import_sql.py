import pandas as pd
import sys
from pathlib import Path

SRC = "/Users/bpmac/Downloads/lotteryUserInfo_1783246567852.xlsx"
OUT_DIR = Path("/Users/bpmac/Documents/Project-05/import_batches")
OUT_DIR.mkdir(exist_ok=True)
BATCH_SIZE = 2000

COLS = [
    "user_id","agent_status","agent_user_id","superior_user_id","direct_superior",
    "agent_level_1","agent_level_2","agent_level_3","agent_level_4","agent_level",
    "username","gender","phone","email","register_ip","birth_date","app_version",
    "register_device","login_device","register_channel","is_test_account",
    "inviter_user_id","register_source","last_active_time","last_login_device",
    "device_id","user_status","push_token","member_level","register_version",
    "channel","balance","deposit_count","query_time","start_time","end_time",
    "deposit_count_start","deposit_count_end","user_balance","total_deposit",
    "frozen_amount","total_withdrawal","withdrawal_limit","city","mark",
    "flow_up_time","next_flow_up_time","tag","im_user_id","im_user_status",
    "group_name","adjust_adid","im_customer","create_time","update_time","package_id",
]

def sql_val(v):
    if pd.isna(v):
        return "NULL"
    if isinstance(v, (int, float)):
        return str(v)
    s = str(v).replace("'", "''")
    return f"'{s}'"

df = pd.read_excel(SRC, sheet_name=0)
df.columns = COLS
n = len(df)
n_batches = (n + BATCH_SIZE - 1) // BATCH_SIZE

for b in range(n_batches):
    chunk = df.iloc[b*BATCH_SIZE:(b+1)*BATCH_SIZE]
    lines = []
    for _, row in chunk.iterrows():
        vals = ",".join(sql_val(row[c]) for c in COLS)
        lines.append(f"INSERT INTO users ({','.join(COLS)}) VALUES ({vals}) ON CONFLICT(user_id) DO NOTHING;")
    out_path = OUT_DIR / f"batch_{b:04d}.sql"
    out_path.write_text("\n".join(lines))

print(f"wrote {n_batches} batch files, {n} rows total, to {OUT_DIR}")
