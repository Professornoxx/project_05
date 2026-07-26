"""
Precomputes the Platform Analysis "Month" tab reports (Bonus Claim Report,
Game Activity's Top Games / Highest Single Bet / High & Low Roller Active)
and publishes them to R2, so the dashboard Worker can serve that view from a
small JSON object instead of scanning up to 29 days of wallet_details live
on every page load. Day/Week/15-days tabs are cheap enough to stay live and
are untouched by this.

Run as a step in etl-hourly.yml, AFTER sync_deposit_withdraw.py and
sync_wallet.py, so it always reads freshly-synced data. Mirrors the exact
SQL each corresponding endpoint in worker/src/index.ts runs for period=month
(same thresholds, same CTEs) — the two must be kept in sync by hand if either
changes, same as etl/sync_engine.py already mirrors chunkedUpsert.ts/
aggregate.ts/sync.ts by hand.

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

VIP_CASE = """CASE
    WHEN {expr} < 100 THEN 0 WHEN {expr} < 600 THEN 1 WHEN {expr} < 5600 THEN 2
    WHEN {expr} < 15600 THEN 3 WHEN {expr} < 95600 THEN 4 WHEN {expr} < 295600 THEN 5
    WHEN {expr} < 795600 THEN 6 WHEN {expr} < 1795600 THEN 7 WHEN {expr} < 3795600 THEN 8
    WHEN {expr} < 8795600 THEN 9 WHEN {expr} < 16795600 THEN 10 WHEN {expr} < 28795600 THEN 11
    WHEN {expr} < 44795600 THEN 12 WHEN {expr} < 69795600 THEN 13 ELSE 14 END"""


def _put(key: str, payload: dict) -> None:
    cf_client.r2_put_json(R2_BUCKET, key, payload)
    print(f"wrote {key}: {payload.get('total', len(payload.get('rows', [])))} rows")


def build_bonus_claims(anchor_date: str, range_start: str, range_end_exclusive: str) -> None:
    """Mirrors /api/dashboard/platform-analysis/bonus-claims (period=month)."""
    sql = f"""WITH bonus_claims AS (
        SELECT user_id, game_name as category, MIN(create_time) as first_claim_time, COUNT(*) as claim_count, SUM(amount) as claim_amount
        FROM wallet_details
        WHERE game_name IS NOT NULL AND game_name != ''
          AND (source_name IS NULL OR source_name = '')
          AND create_time >= ? AND create_time < ? AND user_id IS NOT NULL
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
    rows = cf_client.d1_query(DAILY_DB_ID, sql, [range_start, range_end_exclusive])
    _put("reports/platform-analysis/bonus-claims-month.json", {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "period": "month", "date": anchor_date,
        "range": {"start": range_start, "end": anchor_date},
        "total": len(rows), "rows": rows,
    })


def _game_activity_cte(new_user_cutoff: str, anchor_date: str, range_start: str, range_end_exclusive: str) -> str:
    """Shared first_dep/new_users/gameplay CTEs, mirrors both top-games and
    highest-bet's identical prefix in index.ts."""
    return f"""WITH first_dep AS (
        SELECT user_id, MIN(date(create_time)) as first_dep_date
        FROM deposits WHERE is_first_deposit = 1 AND user_id IS NOT NULL GROUP BY user_id
      ),
      new_users AS (
        SELECT fd.user_id FROM first_dep fd
        JOIN users u ON u.user_id = fd.user_id AND COALESCE(u.is_banned, 0) = 0
        WHERE fd.first_dep_date BETWEEN '{new_user_cutoff}' AND '{anchor_date}'
      ),
      gameplay AS (
        SELECT wd.user_id, wd.game_name, wd.amount, wd.create_time
        FROM wallet_details wd
        JOIN new_users nu ON nu.user_id = wd.user_id
        WHERE wd.game_name IS NOT NULL AND wd.game_name != ''
          AND wd.source_name IS NOT NULL AND wd.source_name != ''
          AND wd.create_time >= '{range_start}' AND wd.create_time < '{range_end_exclusive}'
      )"""


def build_top_games(anchor_date: str, new_user_cutoff: str, range_start: str, range_end_exclusive: str) -> None:
    """Mirrors /api/dashboard/platform-analysis/game-activity/top-games (period=month)."""
    cte = _game_activity_cte(new_user_cutoff, anchor_date, range_start, range_end_exclusive)
    sql = f"""{cte},
      agg AS (
        SELECT user_id, game_name, SUM(amount) as total_bet, MAX(create_time) as last_active
        FROM gameplay GROUP BY user_id, game_name
      )
      SELECT a.user_id, a.game_name, a.total_bet, a.last_active,
             {VIP_CASE.format(expr="COALESCE(u.total_deposit, 0)")} as vip,
             COALESCE(u.assigned_agent, 'Unassigned') as agent
      FROM agg a LEFT JOIN users u ON u.user_id = a.user_id
      ORDER BY a.total_bet DESC"""
    rows = cf_client.d1_query(DAILY_DB_ID, sql)
    _put("reports/platform-analysis/top-games-month.json", {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "period": "month", "date": anchor_date,
        "range": {"start": range_start, "end": anchor_date},
        "total": len(rows), "rows": rows,
    })


def build_highest_bet(anchor_date: str, new_user_cutoff: str, range_start: str, range_end_exclusive: str) -> None:
    """Mirrors /api/dashboard/platform-analysis/game-activity/highest-bet (period=month)."""
    cte = _game_activity_cte(new_user_cutoff, anchor_date, range_start, range_end_exclusive)
    sql = f"""{cte},
      ranked AS (
        SELECT user_id, game_name, amount, create_time,
               ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY amount DESC, create_time DESC) as rn
        FROM gameplay
      )
      SELECT r.user_id, r.game_name, r.amount as highest_bet, r.create_time as last_active,
             {VIP_CASE.format(expr="COALESCE(u.total_deposit, 0)")} as vip,
             COALESCE(u.assigned_agent, 'Unassigned') as agent
      FROM ranked r LEFT JOIN users u ON u.user_id = r.user_id
      WHERE r.rn = 1
      ORDER BY r.amount DESC"""
    rows = cf_client.d1_query(DAILY_DB_ID, sql)
    _put("reports/platform-analysis/highest-bet-month.json", {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "period": "month", "date": anchor_date,
        "range": {"start": range_start, "end": anchor_date},
        "total": len(rows), "rows": rows,
    })


def build_roller_active(tier: str, anchor_date: str, range_start: str, range_end_exclusive: str) -> None:
    """Mirrors /api/dashboard/platform-analysis/game-activity/roller-active
    (period=month), one tier at a time. Thresholds must match index.ts's
    TARGETS-equivalent block exactly — see that endpoint's comment for
    where 500/20/12000/40 and the VIP/inactive-day bounds came from."""
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
        SELECT user_id, game_name, amount
        FROM wallet_details
        WHERE game_name IS NOT NULL AND game_name != ''
          AND source_name IS NOT NULL AND source_name != ''
          AND create_time >= ? AND create_time < ?
      ),
      bet_agg AS (
        SELECT user_id, AVG(amount) as avg_bet FROM gameplay GROUP BY user_id
      ),
      top_game AS (
        SELECT user_id, game_name,
               ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY SUM(amount) DESC) as rn
        FROM gameplay GROUP BY user_id, game_name
      )
      SELECT e.user_id, e.vip, e.agent, e.total_deposit, e.user_balance,
             COALESCE(tg.game_name, '—') as top_game_played
      FROM elig e
      JOIN bet_agg b ON b.user_id = e.user_id
      LEFT JOIN top_game tg ON tg.user_id = e.user_id AND tg.rn = 1
      WHERE e.vip BETWEEN {min_vip} AND {max_vip}
        AND e.avg_lifetime_deposit {avg_dep_cmp} 500
        AND e.deposit_count {dep_count_cmp} 20
        AND e.total_deposit {total_dep_cmp} 12000
        AND b.avg_bet {avg_bet_cmp} 40
        AND e.inactive_days BETWEEN 0 AND {max_inactive_days}
      ORDER BY e.total_deposit DESC"""
    rows = cf_client.d1_query(DAILY_DB_ID, sql, [range_start, range_end_exclusive])
    _put(f"reports/platform-analysis/roller-active-{tier}-month.json", {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "tier": tier, "period": "month", "date": anchor_date,
        "range": {"start": range_start, "end": anchor_date},
        "total": len(rows), "rows": rows,
    })


def main() -> None:
    anchor_date = common.fmt_date(common.today_ist_date())
    range_start = common.shift_date(anchor_date, -29)          # 29 days back, matches period=month's inclusive range
    new_user_cutoff = common.shift_date(anchor_date, -32)      # "last 33 days" cohort, fixed regardless of period
    range_end_exclusive = common.shift_date(anchor_date, 1)    # exclusive upper bound for raw create_time comparisons

    build_bonus_claims(anchor_date, range_start, range_end_exclusive)
    build_top_games(anchor_date, new_user_cutoff, range_start, range_end_exclusive)
    build_highest_bet(anchor_date, new_user_cutoff, range_start, range_end_exclusive)
    build_roller_active("high", anchor_date, range_start, range_end_exclusive)
    build_roller_active("low", anchor_date, range_start, range_end_exclusive)


if __name__ == "__main__":
    main()
