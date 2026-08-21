"""
Precomputes the Platform Analysis "Month" tab reports (Bonus Claim Report,
Game Activity's Top Games / Highest Single Bet / High & Low Roller Active)
and publishes them to R2, so the dashboard Worker can serve that view from a
small JSON object instead of scanning raw wallet_details live on every page
load. Day/Week/15-days tabs are cheap enough to stay live and are untouched
by this.

Also owns wallet_daily_agg: a one-row-per-(day, user, game, is_bonus)
rollup of wallet_details, refreshed idempotently for the last 2 days on
every run (today + yesterday, covering the same "which day is this sync
touching" ambiguity sync_wallet.py already handles). This exists because
raw wallet_details hit D1's 500MB size cap at only ~19 days old
(2026-07-26 incident) — it stores every individual bet/bonus event, so it
scales with total bet COUNT, not with (users x games), which is orders of
magnitude smaller. Every report below reads from wallet_daily_agg over a
29-day window instead of scanning 29 raw days, which is what actually lets
raw wallet_details retention shrink safely (see cleanup.ts) without losing
Month-tab accuracy — a precomputed report alone doesn't fix this, since it
still needs SOMETHING to hold 29 real days of data at compute time; this
table is that something, at roughly (unique players) x (unique games) rows
per day instead of (total bets placed).

Run as a step in etl-hourly.yml, AFTER sync_deposit_withdraw.py and
sync_wallet.py, so it always reads freshly-synced data. Report SQL mirrors
the shape each corresponding endpoint in worker/src/index.ts computes for
period=month (same thresholds) — the two must be kept in sync by hand if
either changes, same as etl/sync_engine.py already mirrors
chunkedUpsert.ts/aggregate.ts/sync.ts by hand.

Report shape written to R2 (one JSON object per report):
  { generatedAt, period: "month", date, range: {start, end}, total, rows: [...] }
No page/pageSize here — that's the Worker's job when it slices `rows` for
pagination on read, same total row count either way.
"""
import os
from datetime import datetime, timezone

import cf_client
import common

DAILY_DB_ID = os.environ["DAILY_DB_ID"]
R2_BUCKET = "daily-records-archive"

# Sentinel game_name for wallet_details rows with a blank/NULL game_name —
# wallet_daily_agg.game_name is NOT NULL (part of its primary key), so these
# still-valid rows need a real value instead of being dropped. See
# refresh_daily_agg's docstring. Every per-game/per-bonus-category report
# below must exclude this category explicitly.
NO_GAME_NAME = "(no game)"

VIP_CASE = """CASE
    WHEN {expr} < 100 THEN 0 WHEN {expr} < 600 THEN 1 WHEN {expr} < 5600 THEN 2
    WHEN {expr} < 15600 THEN 3 WHEN {expr} < 95600 THEN 4 WHEN {expr} < 295600 THEN 5
    WHEN {expr} < 795600 THEN 6 WHEN {expr} < 1795600 THEN 7 WHEN {expr} < 3795600 THEN 8
    WHEN {expr} < 8795600 THEN 9 WHEN {expr} < 16795600 THEN 10 WHEN {expr} < 28795600 THEN 11
    WHEN {expr} < 44795600 THEN 12 WHEN {expr} < 69795600 THEN 13 ELSE 14 END"""


def _put(key: str, payload: dict) -> None:
    cf_client.r2_put_json(R2_BUCKET, key, payload)
    print(f"wrote {key}: {payload.get('total', len(payload.get('rows', [])))} rows")


def refresh_daily_agg(day: str) -> None:
    """Idempotent full recompute of wallet_daily_agg for one calendar day,
    from that day's raw wallet_details rows. Safe to call repeatedly (e.g.
    every hourly run for "today") since it deletes-then-reinserts rather
    than incrementing — matches how wallet syncs themselves re-fetch the
    same day repeatedly until it closes. max_amount_time is picked via a
    ranked subquery (not a plain MAX(create_time), which would give the
    LATEST bet's time, not the time of the LARGEST bet).

    Rows with a blank/NULL game_name used to be dropped entirely (the old
    WHERE required game_name NOT NULL/!= ''), which silently undercounted
    total wallet activity in this table — confirmed 2026-08-21: 511 of
    2026-08-20's distinct wallet_details users had ONLY blank-game_name
    rows that day, invisible to any query reading this rollup instead of
    raw wallet_details. Those rows are now kept under the NO_GAME_NAME
    sentinel category (game_name is NOT NULL in the schema, so blank/NULL
    both need a real value) instead of being discarded, so this table's
    per-day totals now match wallet_details' exactly. Every consumer that
    reads is_bonus-scoped per-game data (Bonus Claims/Top Games/Highest
    Bet/Roller Active, here and in worker/src/index.ts) must exclude
    NO_GAME_NAME explicitly — those features are about real games/bonus
    categories, not generic wallet events, same as their raw-table queries
    already required game_name to be populated."""
    cf_client.d1_query(DAILY_DB_ID, "DELETE FROM wallet_daily_agg WHERE d = ?", [day])
    sql = f"""WITH ranked AS (
        SELECT user_id, COALESCE(NULLIF(game_name, ''), '{NO_GAME_NAME}') as game_name,
               CASE WHEN source_name IS NULL OR source_name = '' THEN 1 ELSE 0 END as is_bonus,
               amount, create_time,
               ROW_NUMBER() OVER (
                 PARTITION BY user_id, COALESCE(NULLIF(game_name, ''), '{NO_GAME_NAME}'), CASE WHEN source_name IS NULL OR source_name = '' THEN 1 ELSE 0 END
                 ORDER BY amount DESC, create_time DESC
               ) as rn
        FROM wallet_details
        WHERE date(create_time) = ? AND user_id IS NOT NULL
      ),
      agg AS (
        SELECT user_id, game_name, is_bonus,
               SUM(amount) as total_amount, COUNT(*) as bet_count,
               MIN(create_time) as first_time, MAX(create_time) as last_active
        FROM ranked GROUP BY user_id, game_name, is_bonus
      )
      INSERT INTO wallet_daily_agg (d, user_id, game_name, is_bonus, total_amount, bet_count, max_amount, max_amount_time, first_time, last_active)
      SELECT ?, a.user_id, a.game_name, a.is_bonus, a.total_amount, a.bet_count, r.amount, r.create_time, a.first_time, a.last_active
      FROM agg a
      JOIN ranked r ON r.user_id = a.user_id AND r.game_name = a.game_name AND r.is_bonus = a.is_bonus AND r.rn = 1"""
    cf_client.d1_query(DAILY_DB_ID, sql, [day, day])
    print(f"refreshed wallet_daily_agg for {day}")


def backfill_daily_agg_from_archive(day: str) -> bool:
    """Rebuilds wallet_daily_agg for a day whose raw wallet_details rows
    have already aged out of D1 (see cleanup.ts's 15-day retention on that
    table) but survive as a JSON archive in R2 — same aggregation as
    refresh_daily_agg (grouped by user+game+is_bonus, tracking sum/count/
    max/first/last), computed here in Python from the archived rows
    instead of via SQL against live wallet_details, since the raw rows no
    longer exist in D1 to query. One-time recovery tool for days that
    predate wallet_daily_agg's existence (2026-07-26 and earlier) — not
    part of the normal hourly flow, which always has live rows to work
    from via refresh_daily_agg. Returns False (does nothing) if no archive
    exists for that day, so callers can distinguish "already covered by
    refresh_daily_agg" from "genuinely no data available."""
    rows = cf_client.r2_get_json(R2_BUCKET, f"archived-logs/wallet_details-{day}.json")
    if rows is None:
        print(f"no archive for {day}, skipping")
        return False

    groups: dict[tuple, dict] = {}
    for r in rows:
        game_name = r.get("game_name") or NO_GAME_NAME
        user_id = r.get("user_id")
        if user_id is None:
            continue
        is_bonus = 0 if (r.get("source_name") or "").strip() else 1
        key = (user_id, game_name, is_bonus)
        amount = r.get("amount") or 0
        ct = r.get("create_time")
        g = groups.setdefault(key, {"total": 0.0, "count": 0, "max_amount": None, "max_amount_time": None, "first_time": None, "last_active": None})
        g["total"] += amount
        g["count"] += 1
        if g["max_amount"] is None or amount > g["max_amount"]:
            g["max_amount"], g["max_amount_time"] = amount, ct
        if ct and (g["first_time"] is None or ct < g["first_time"]):
            g["first_time"] = ct
        if ct and (g["last_active"] is None or ct > g["last_active"]):
            g["last_active"] = ct

    cf_client.d1_query(DAILY_DB_ID, "DELETE FROM wallet_daily_agg WHERE d = ?", [day])
    items = list(groups.items())
    # 10 columns/row. Both 90 and 20 rows/statement hit the SAME "too many
    # SQL variables at offset 370" error — confirms this is a small, fixed
    # per-statement ceiling (not scaling with how many rows were
    # requested), unlike chunkedUpsert.ts's 150-row chunks, which use
    # env.daily_records_db.batch() (many independent small statements),
    # not one large multi-VALUES INSERT like this. 9 is the largest chunk
    # confirmed working for this column count, 2026-07-26.
    CHUNK = 9
    for i in range(0, len(items), CHUNK):
        chunk = items[i:i + CHUNK]
        placeholders = ",".join(["(?,?,?,?,?,?,?,?,?,?)"] * len(chunk))
        params = []
        for (user_id, game_name, is_bonus), g in chunk:
            params += [day, user_id, game_name, is_bonus, g["total"], g["count"], g["max_amount"], g["max_amount_time"], g["first_time"], g["last_active"]]
        cf_client.d1_query(
            DAILY_DB_ID,
            f"INSERT INTO wallet_daily_agg (d, user_id, game_name, is_bonus, total_amount, bet_count, max_amount, max_amount_time, first_time, last_active) VALUES {placeholders}",
            params,
        )
    print(f"backfilled wallet_daily_agg for {day} from archive: {len(rows)} raw rows -> {len(items)} agg rows")
    return True


def build_bonus_claims(anchor_date: str, range_start: str) -> None:
    """Mirrors /api/dashboard/platform-analysis/bonus-claims (period=month),
    reading from wallet_daily_agg instead of raw wallet_details."""
    sql = f"""WITH bonus_claims AS (
        SELECT user_id, game_name as category,
               MIN(first_time) as first_claim_time,
               SUM(bet_count) as claim_count, SUM(total_amount) as claim_amount
        FROM wallet_daily_agg
        WHERE is_bonus = 1 AND game_name != '{NO_GAME_NAME}' AND d BETWEEN ? AND ?
        GROUP BY user_id, game_name
      ),
      category_totals AS (
        SELECT category, COUNT(*) as claimed_users, COALESCE(SUM(claim_amount), 0) as total_bonus
        FROM bonus_claims GROUP BY category
      ),
      dep_after AS (
        SELECT bc.user_id, bc.category, SUM(d.amount) as dep_amt
        FROM bonus_claims bc
        JOIN deposits d ON d.user_id = bc.user_id AND d.status = 'COMPLETE' AND d.create_time > bc.first_claim_time
        GROUP BY bc.user_id, bc.category
      ),
      dep_after_totals AS (
        SELECT category, COUNT(*) as deposited_after, COALESCE(SUM(dep_amt), 0) as deposit_amount
        FROM dep_after GROUP BY category
      )
      SELECT ct.category, ct.claimed_users, ct.total_bonus,
             COALESCE(dat.deposited_after, 0) as deposited_after,
             COALESCE(dat.deposit_amount, 0) as deposit_amount,
             (100.0 * COALESCE(dat.deposited_after, 0) / ct.claimed_users) as pct
      FROM category_totals ct LEFT JOIN dep_after_totals dat ON dat.category = ct.category
      ORDER BY ct.claimed_users DESC LIMIT 50"""
    rows = cf_client.d1_query(DAILY_DB_ID, sql, [range_start, anchor_date])
    _put("reports/platform-analysis/bonus-claims-month.json", {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "period": "month", "date": anchor_date,
        "range": {"start": range_start, "end": anchor_date},
        "total": len(rows), "rows": rows,
    })


def _new_users_cte(new_user_cutoff: str, anchor_date: str) -> str:
    return f"""WITH first_dep AS (
        SELECT user_id, MIN(date(create_time)) as first_dep_date
        FROM deposits WHERE is_first_deposit = 1 AND user_id IS NOT NULL GROUP BY user_id
      ),
      new_users AS (
        SELECT fd.user_id FROM first_dep fd
        JOIN users u ON u.user_id = fd.user_id AND COALESCE(u.is_banned, 0) = 0
        WHERE fd.first_dep_date BETWEEN '{new_user_cutoff}' AND '{anchor_date}'
      )"""


def build_top_games(anchor_date: str, new_user_cutoff: str, range_start: str) -> None:
    """Mirrors /api/dashboard/platform-analysis/game-activity/top-games (period=month)."""
    cte = _new_users_cte(new_user_cutoff, anchor_date)
    sql = f"""{cte},
      agg AS (
        SELECT wa.user_id, wa.game_name, SUM(wa.total_amount) as total_bet, MAX(wa.last_active) as last_active
        FROM wallet_daily_agg wa
        JOIN new_users nu ON nu.user_id = wa.user_id
        WHERE wa.is_bonus = 0 AND wa.game_name != '{NO_GAME_NAME}' AND wa.d BETWEEN ? AND ?
        GROUP BY wa.user_id, wa.game_name
      )
      SELECT a.user_id, a.game_name, a.total_bet, a.last_active,
             {VIP_CASE.format(expr="COALESCE(u.total_deposit, 0)")} as vip,
             COALESCE(u.assigned_agent, 'Unassigned') as agent
      FROM agg a LEFT JOIN users u ON u.user_id = a.user_id
      ORDER BY a.total_bet DESC"""
    rows = cf_client.d1_query(DAILY_DB_ID, sql, [range_start, anchor_date])
    _put("reports/platform-analysis/top-games-month.json", {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "period": "month", "date": anchor_date,
        "range": {"start": range_start, "end": anchor_date},
        "total": len(rows), "rows": rows,
    })


def build_highest_bet(anchor_date: str, new_user_cutoff: str, range_start: str) -> None:
    """Mirrors /api/dashboard/platform-analysis/game-activity/highest-bet
    (period=month). The window's single highest bet per user is the max of
    each qualifying day's already-tracked max_amount, ranked again here to
    also recover which game/day it happened on."""
    cte = _new_users_cte(new_user_cutoff, anchor_date)
    sql = f"""{cte},
      ranked AS (
        SELECT wa.user_id, wa.game_name, wa.max_amount as amount, wa.max_amount_time as create_time,
               ROW_NUMBER() OVER (PARTITION BY wa.user_id ORDER BY wa.max_amount DESC, wa.max_amount_time DESC) as rn
        FROM wallet_daily_agg wa
        JOIN new_users nu ON nu.user_id = wa.user_id
        WHERE wa.is_bonus = 0 AND wa.game_name != '{NO_GAME_NAME}' AND wa.d BETWEEN ? AND ?
      )
      SELECT r.user_id, r.game_name, r.amount as highest_bet, r.create_time as last_active,
             {VIP_CASE.format(expr="COALESCE(u.total_deposit, 0)")} as vip,
             COALESCE(u.assigned_agent, 'Unassigned') as agent
      FROM ranked r LEFT JOIN users u ON u.user_id = r.user_id
      WHERE r.rn = 1
      ORDER BY r.amount DESC"""
    rows = cf_client.d1_query(DAILY_DB_ID, sql, [range_start, anchor_date])
    _put("reports/platform-analysis/highest-bet-month.json", {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "period": "month", "date": anchor_date,
        "range": {"start": range_start, "end": anchor_date},
        "total": len(rows), "rows": rows,
    })


def build_roller_active(tier: str, anchor_date: str, range_start: str) -> None:
    """Mirrors /api/dashboard/platform-analysis/game-activity/roller-active
    (period=month), one tier at a time, reading wallet_daily_agg instead of
    raw wallet_details. avg_bet across the window is SUM(total_amount)/
    SUM(bet_count) over the qualifying days — mathematically identical to
    averaging the raw rows directly, since it's sum-of-sums over sum-of-
    counts, not an average-of-averages."""
    if tier == "high":
        min_vip, max_vip, max_inactive_days = 7, 14, 15
        avg_dep_cmp, dep_count_cmp, total_dep_cmp, avg_bet_cmp = ">=", ">=", ">=", ">"
    else:
        min_vip, max_vip, max_inactive_days = 2, 6, 10
        avg_dep_cmp, dep_count_cmp, total_dep_cmp, avg_bet_cmp = "<", "<", "<", "<"

    sql = f"""WITH elig AS (
        SELECT user_id, total_deposit, user_balance, last_active_time, deposit_count,
               COALESCE(assigned_agent, 'Unassigned') as agent,
               (total_deposit * 1.0 / NULLIF(deposit_count, 0)) as avg_lifetime_deposit,
               CAST((julianday('now') - julianday(last_active_time)) AS INTEGER) as inactive_days,
               {VIP_CASE.format(expr="total_deposit")} as vip
        FROM users
        WHERE total_deposit IS NOT NULL AND deposit_count IS NOT NULL AND last_active_time IS NOT NULL
          AND COALESCE(is_banned, 0) = 0
      ),
      gameplay AS (
        SELECT user_id, game_name, total_amount, bet_count
        FROM wallet_daily_agg
        WHERE is_bonus = 0 AND game_name != '{NO_GAME_NAME}' AND d BETWEEN ? AND ?
      ),
      bet_agg AS (
        SELECT user_id, SUM(total_amount) * 1.0 / NULLIF(SUM(bet_count), 0) as avg_bet
        FROM gameplay GROUP BY user_id
      ),
      game_totals AS (
        SELECT user_id, game_name, SUM(total_amount) as game_total,
               ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY SUM(total_amount) DESC) as rn
        FROM gameplay GROUP BY user_id, game_name
      )
      SELECT e.user_id, e.vip, e.agent, e.total_deposit, e.user_balance,
             COALESCE(tg.game_name, '—') as top_game_played
      FROM elig e
      JOIN bet_agg b ON b.user_id = e.user_id
      LEFT JOIN game_totals tg ON tg.user_id = e.user_id AND tg.rn = 1
      WHERE e.vip BETWEEN {min_vip} AND {max_vip}
        AND e.avg_lifetime_deposit {avg_dep_cmp} 500
        AND e.deposit_count {dep_count_cmp} 20
        AND e.total_deposit {total_dep_cmp} 12000
        AND b.avg_bet {avg_bet_cmp} 40
        AND e.inactive_days BETWEEN 0 AND {max_inactive_days}
      ORDER BY e.total_deposit DESC"""
    rows = cf_client.d1_query(DAILY_DB_ID, sql, [range_start, anchor_date])
    _put(f"reports/platform-analysis/roller-active-{tier}-month.json", {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "tier": tier, "period": "month", "date": anchor_date,
        "range": {"start": range_start, "end": anchor_date},
        "total": len(rows), "rows": rows,
    })


def main() -> None:
    anchor_date = common.fmt_date(common.today_ist_date())
    yesterday = common.shift_date(anchor_date, -1)
    range_start = common.shift_date(anchor_date, -29)      # 29 days back, matches period=month's inclusive range
    new_user_cutoff = common.shift_date(anchor_date, -32)  # "last 33 days" cohort, fixed regardless of period

    # Refresh today + yesterday every run (idempotent), same "which day is
    # this touching" coverage sync_wallet.py already handles for the raw
    # sync — catches both mid-day accumulation and the just-closed prior day.
    refresh_daily_agg(anchor_date)
    refresh_daily_agg(yesterday)

    build_bonus_claims(anchor_date, range_start)
    build_top_games(anchor_date, new_user_cutoff, range_start)
    build_highest_bet(anchor_date, new_user_cutoff, range_start)
    build_roller_active("high", anchor_date, range_start)
    build_roller_active("low", anchor_date, range_start)


if __name__ == "__main__":
    main()
