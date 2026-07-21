import type { Env } from "./lib/types";
import { cachedJson } from "./lib/cache";
import { MASTER_STATS_PAGE_HTML } from "./lib/masterStatsPage";
import { renderDashboardShell, EMPTY_CONTENT_PLACEHOLDER, AGENT_NAV_ITEMS } from "./lib/dashboardShell";
import { AGENT_SEARCH_USER_CONTENT_HTML } from "./lib/agentSearchUserContent";
import { HOME_CONTENT_HTML } from "./lib/homeContent";
import { DEPOSIT_ANALYSIS_CONTENT_HTML } from "./lib/depositAnalysisContent";
import { DEPOSIT_HOURLY_ANALYSIS_CONTENT_HTML } from "./lib/depositHourlyAnalysisContent";
import { WITHDRAWAL_ANALYSIS_CONTENT_HTML } from "./lib/withdrawalAnalysisContent";
import { REGION_VIP_MATRIX_CONTENT_HTML } from "./lib/regionVipMatrixContent";
import { ACTION_CENTER_CONTENT_HTML } from "./lib/actionCenterContent";
import { INACTIVE_USERS_CONTENT_HTML } from "./lib/inactiveUsersContent";
import { NEW_USERS_BONUSES_CONTENT_HTML } from "./lib/newUsersBonusesContent";
import { ACTIVE_USERS_CONTENT_HTML } from "./lib/activeUsersContent";
import { ANALYTICS_CONTENT_HTML } from "./lib/analyticsContent";
import { REACTIVATION_CONTENT_HTML } from "./lib/reactivationContent";
import { VIP_UPGRADE_CONTENT_HTML } from "./lib/vipUpgradeContent";
import { RETENTION_CONTENT_HTML } from "./lib/retentionContent";
import { PERFORMANCE_CONTENT_HTML } from "./lib/performanceContent";
import { PLATFORM_ANALYSIS_CONTENT_HTML } from "./lib/platformAnalysisContent";
import { WEEKLY_PERFORMANCE_CONTENT_HTML } from "./lib/weeklyPerformanceContent";
import { SEARCH_USER_CONTENT_HTML } from "./lib/searchUserContent";
import {
  HOME_AMOUNT_RANGE_CARDS,
  ANALYTICS_AMOUNT_RANGE_CARD, PLATFORM_ANALYSIS_AMOUNT_RANGE_CARD,
} from "./lib/amountRangeCard";
import { renderLoginPage } from "./lib/loginPage";
import { renderAgentLoginPage } from "./lib/agentLoginPage";
import { isAuthed, sessionCookieHeader, clearCookieHeader, type AuthArea } from "./lib/auth";
import { verifyPassword, createAgentSession, getAgentSession, destroyAgentSession, agentSessionCookieHeader, clearAgentSessionCookieHeader } from "./lib/agentAuth";

// Source data's create_time values are IST-labeled (naive, no timezone
// suffix) — confirmed by a deposit timestamped 10:50 when actual UTC time
// was only 05:31 (only possible if the stored time is IST = UTC+5:30).
// "Today" for the dashboard must therefore be computed in IST, not UTC —
// using UTC's date here would occasionally show yesterday's tail data (or
// miss the first few real hours of IST-today) during the ~05:30 UTC window
// each day where the two calendar dates can disagree.
function todayIST(): string {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const shifted = new Date(Date.now() + IST_OFFSET_MS);
  return shifted.toISOString().slice(0, 10);
}

// Used by JSON API routes: 401 with no redirect, for programmatic/curl callers.
// area picks which of the two independent sessions (dashboard vs config) to check.
function requireAdmin(request: Request, env: Env, area: AuthArea): Response | null {
  if (!isAuthed(request, env, area)) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}

// Shared by every endpoint the Agent Dashboard reuses from the admin
// dashboard: admins (dashboard session) see everything (agentFilter null),
// agents (agent session) are always scoped to their own assigned_agent —
// never a client-supplied value, so an agent can't request another
// agent's data by editing query params.
//
// dashboard_session and agent_session are separate cookies on the same
// origin, so a browser that's ever logged into BOTH /dashboard and /agent
// sends both cookies on every request to either page — cookie presence
// alone can't tell you which page the request came from. Checking one
// session type unconditionally first broke the OTHER page: agent-first
// made /dashboard show scoped data when an old agent cookie was still
// around (this bug); dashboard-first made /agent show unscoped admin
// data when an admin cookie was still around (the previous bug this was
// "fixed" to solve). Neither ordering is correct — the page itself has
// to say which mode it's rendering, via the x-dashboard-mode header the
// shared shell script attaches to every fetch (see dashboardShell.ts).
// The header only picks WHICH session to check; it can't forge one —
// claiming "admin" mode with no valid dashboard_session still 401s.
async function requireDashboardOrAgentScope(
  request: Request,
  env: Env
): Promise<{ agentFilter: string | null } | Response> {
  const mode = request.headers.get("x-dashboard-mode");
  if (mode === "admin") {
    if (isAuthed(request, env, "dashboard")) return { agentFilter: null };
    return new Response("Unauthorized", { status: 401 });
  }
  if (mode === "agent") {
    const session = await getAgentSession(request, env);
    if (session) return { agentFilter: session.displayName };
    return new Response("Unauthorized", { status: 401 });
  }
  // No mode header (e.g. a direct curl call) — fall back to agent-first,
  // the safer default when we can't tell which page asked.
  const session = await getAgentSession(request, env);
  if (session) return { agentFilter: session.displayName };
  if (isAuthed(request, env, "dashboard")) return { agentFilter: null };
  return new Response("Unauthorized", { status: 401 });
}

// Same 14-bracket VIP ladder repeated as an inline CASE expression
// throughout this file (see e.g. the reactivation/vip-upgrade endpoints) —
// factored out here for the newer Platform Analysis endpoints so they don't
// duplicate it a 9th time. `expr` is any SQL expression evaluating to a
// deposit total, e.g. "total_deposit" or "u.total_deposit".
function vipLevelCase(expr: string): string {
  return `CASE
    WHEN ${expr} < 100 THEN 0 WHEN ${expr} < 600 THEN 1 WHEN ${expr} < 5600 THEN 2
    WHEN ${expr} < 15600 THEN 3 WHEN ${expr} < 95600 THEN 4 WHEN ${expr} < 295600 THEN 5
    WHEN ${expr} < 795600 THEN 6 WHEN ${expr} < 1795600 THEN 7 WHEN ${expr} < 3795600 THEN 8
    WHEN ${expr} < 8795600 THEN 9 WHEN ${expr} < 16795600 THEN 10 WHEN ${expr} < 28795600 THEN 11
    WHEN ${expr} < 44795600 THEN 12 WHEN ${expr} < 69795600 THEN 13 ELSE 14 END`;
}

// Companion to vipLevelCase: the upper bound of each bracket above (i.e.
// the deposit total needed to reach the NEXT level) — same 14 brackets,
// same duplication problem, factored out for the same reason.
function vipNextLevelMinCase(expr: string): string {
  return `CASE
    WHEN ${expr} < 100 THEN 100 WHEN ${expr} < 600 THEN 600 WHEN ${expr} < 5600 THEN 5600
    WHEN ${expr} < 15600 THEN 15600 WHEN ${expr} < 95600 THEN 95600 WHEN ${expr} < 295600 THEN 295600
    WHEN ${expr} < 795600 THEN 795600 WHEN ${expr} < 1795600 THEN 1795600 WHEN ${expr} < 3795600 THEN 3795600
    WHEN ${expr} < 8795600 THEN 8795600 WHEN ${expr} < 16795600 THEN 16795600 WHEN ${expr} < 28795600 THEN 28795600
    WHEN ${expr} < 44795600 THEN 44795600 WHEN ${expr} < 69795600 THEN 69795600 ELSE NULL END`;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Block the local test endpoint in production (see cron-triggers gotchas).
    if (url.pathname === "/__scheduled") {
      return new Response("Not Found", { status: 404 });
    }

    // New sidebar-based dashboard — its own URL per page, all under /dashboard,
    // with its own independent login session (dashboard_session), separate
    // from Configuration's session. Content is placeholder until each
    // page's design is given.
    const DASHBOARD_ROUTES: Record<string, { key: string; title: string }> = {
      "/dashboard": { key: "home", title: "Home" },
      "/dashboard/action-center": { key: "action-center", title: "Action Center" },
      "/dashboard/performance": { key: "performance", title: "Performance" },
      "/dashboard/analytics": { key: "analytics", title: "Analytics" },
      "/dashboard/platform-analysis": { key: "platform-analysis", title: "Platform Analysis" },
      "/dashboard/search-user": { key: "search-user", title: "Search User" },
    };
    const dashboardRoute = DASHBOARD_ROUTES[url.pathname];
    if (dashboardRoute && request.method === "GET") {
      if (!isAuthed(request, env, "dashboard")) {
        return new Response(null, { status: 302, headers: { Location: "/login" } });
      }
      const content =
        dashboardRoute.key === "home"
          ? HOME_CONTENT_HTML + DEPOSIT_ANALYSIS_CONTENT_HTML + DEPOSIT_HOURLY_ANALYSIS_CONTENT_HTML + WITHDRAWAL_ANALYSIS_CONTENT_HTML + HOME_AMOUNT_RANGE_CARDS + REGION_VIP_MATRIX_CONTENT_HTML
          : dashboardRoute.key === "action-center"
          ? NEW_USERS_BONUSES_CONTENT_HTML + ACTION_CENTER_CONTENT_HTML + INACTIVE_USERS_CONTENT_HTML + ACTIVE_USERS_CONTENT_HTML
          : dashboardRoute.key === "analytics"
          ? ANALYTICS_CONTENT_HTML + REACTIVATION_CONTENT_HTML + VIP_UPGRADE_CONTENT_HTML + RETENTION_CONTENT_HTML + ANALYTICS_AMOUNT_RANGE_CARD
          : dashboardRoute.key === "performance"
          ? PERFORMANCE_CONTENT_HTML
          : dashboardRoute.key === "platform-analysis"
          ? WEEKLY_PERFORMANCE_CONTENT_HTML + PLATFORM_ANALYSIS_CONTENT_HTML + PLATFORM_ANALYSIS_AMOUNT_RANGE_CARD
          : dashboardRoute.key === "search-user"
          ? SEARCH_USER_CONTENT_HTML
          : EMPTY_CONTENT_PLACEHOLDER;
      return new Response(
        renderDashboardShell(dashboardRoute.key, dashboardRoute.title, content, { mode: "admin" }),
        { headers: { "content-type": "text/html; charset=utf-8" } }
      );
    }

    // Action Center section 1: VIP Near Upgrade. VIP level is computed live
    // from total_deposit against the brackets below — this is intentionally
    // NOT the same as master_db.users.member_level (whatever the upstream
    // system currently has synced); the point of this list is to surface
    // users whose deposit total already qualifies them for a bracket bump
    // regardless of whether the source system has caught up yet.
    // Agent is always "Unassigned" for now — no real agent-assignment data
    // source exists yet (see Search User page, blocked on the same gap).
    if (url.pathname === "/api/dashboard/action-center/vip-near-upgrade" && request.method === "GET") {
      const scope = await requireDashboardOrAgentScope(request, env);
      if (scope instanceof Response) return scope;
      const { agentFilter } = scope;

      const tier = url.searchParams.get("tier") === "high" ? "high" : "low";
      const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
      const pageSize = 10;

      // WHEN d < X THEN Y pairs are the upper bound of each VIP bracket —
      // shared by both the "current level" and "next level's floor" CASE
      // expressions below, just returning a different value per branch.
      const CURRENT_LEVEL = vipLevelCase("total_deposit");
      const NEXT_LEVEL_MIN = vipNextLevelMinCase("total_deposit");

      const [minLevel, maxLevel, maxGap] = tier === "low" ? [2, 4, 1000] : [5, 13, 50000];

      const BASE = `FROM (
          SELECT user_id, total_deposit, last_active_time, COALESCE(assigned_agent, 'Unassigned') as agent,
                 ${CURRENT_LEVEL} as current_level, ${NEXT_LEVEL_MIN} as next_level_min
          FROM users WHERE total_deposit IS NOT NULL AND is_banned = 0 AND (? IS NULL OR assigned_agent = ?)
        )
        WHERE next_level_min IS NOT NULL AND current_level BETWEEN ? AND ?
          AND (next_level_min - total_deposit) BETWEEN 1 AND ?`;

      const countRow = await env.daily_records_db
        .prepare(`SELECT COUNT(*) as c ${BASE}`)
        .bind(agentFilter, agentFilter, minLevel, maxLevel, maxGap)
        .first<{ c: number }>();

      const rows = await env.daily_records_db
        .prepare(
          `SELECT user_id, total_deposit, agent, current_level, current_level + 1 as next_level,
                  (next_level_min - total_deposit) as gap,
                  CAST((julianday('now') - julianday(last_active_time)) AS INTEGER) as inactive_days
           ${BASE}
           ORDER BY gap ASC LIMIT ? OFFSET ?`
        )
        .bind(agentFilter, agentFilter, minLevel, maxLevel, maxGap, pageSize, (page - 1) * pageSize)
        .all();

      const total = countRow?.c ?? 0;
      return Response.json({
        tier,
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        rows: rows.results,
      });
    }

    // Action Center section 2: Inactive Users. Same live VIP-bracket
    // computation as section 1 (see the comment there), no "next level"
    // filter needed here since this list isn't about upgrade proximity.
    // "Wallet Balance" = users.user_balance — users.balance is always NULL
    // in real data (confirmed), user_balance is the populated column used
    // elsewhere on the dashboard (Home KPIs, Master Stats).
    if (url.pathname === "/api/dashboard/action-center/inactive-users" && request.method === "GET") {
      const scope = await requireDashboardOrAgentScope(request, env);
      if (scope instanceof Response) return scope;
      const { agentFilter } = scope;

      const tier = url.searchParams.get("tier") === "high" ? "high" : "low";
      const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
      const pageSize = 10;

      const CURRENT_LEVEL = vipLevelCase("total_deposit");

      const [minLevel, maxLevel, minDays, maxDays] = tier === "low" ? [2, 4, 10, 180] : [5, 14, 15, 240];

      const BASE = `FROM (
          SELECT user_id, total_deposit, user_balance, last_active_time, COALESCE(assigned_agent, 'Unassigned') as agent,
                 ${CURRENT_LEVEL} as current_level,
                 CAST((julianday('now') - julianday(last_active_time)) AS INTEGER) as inactive_days
          FROM users WHERE total_deposit IS NOT NULL AND last_active_time IS NOT NULL AND is_banned = 0
            AND (? IS NULL OR assigned_agent = ?)
        )
        WHERE current_level BETWEEN ? AND ? AND inactive_days BETWEEN ? AND ?`;

      const countRow = await env.daily_records_db
        .prepare(`SELECT COUNT(*) as c ${BASE}`)
        .bind(agentFilter, agentFilter, minLevel, maxLevel, minDays, maxDays)
        .first<{ c: number }>();

      const rows = await env.daily_records_db
        .prepare(
          `SELECT user_id, current_level, total_deposit, user_balance, agent, inactive_days,
                  substr(last_active_time, 1, 10) as last_active_date
           ${BASE}
           ORDER BY inactive_days DESC LIMIT ? OFFSET ?`
        )
        .bind(agentFilter, agentFilter, minLevel, maxLevel, minDays, maxDays, pageSize, (page - 1) * pageSize)
        .all();

      const total = countRow?.c ?? 0;
      return Response.json({
        tier,
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        rows: rows.results,
      });
    }

    // Action Center section 3: New Users & Bonuses — Yesterday First Deposit
    // Users. Flagged by the source system's own first-deposit marker
    // (is_first_deposit, captured on deposits from the export field
    // "是否是首充，0不是首充，1是首充") rather than us inferring "first" from
    // history, since a user's deposit history here only goes back as far as
    // SYNC_WINDOW_DAYS anyway.
    //
    // Phase 2 rewrite: deposits and users now live in the same merged
    // database, so this is a real LEFT JOIN instead of two queries merged
    // in memory. Deliberately still LEFT JOIN (not INNER) against users —
    // master_db-origin fields (city, assigned_agent) only update from
    // periodic manual uploads / the profile-sync fields, so brand-new
    // users (who by definition just made their FIRST deposit) can easily
    // not have a users row yet. An INNER JOIN would silently drop them
    // (confirmed live pre-merge: 7 flagged first-deposit users, 0 matches
    // against an INNER JOIN). total_deposit/total_withdrawal/VIP level
    // here are computed from THIS query's own deposit/withdraw totals
    // within the tracked window, not users.total_deposit (which is a
    // separate, potentially stale lifetime figure) — same reasoning as
    // before the merge, just expressed as CTEs instead of JS objects.
    if (url.pathname === "/api/dashboard/action-center/yesterday-first-deposits" && request.method === "GET") {
      const scope = await requireDashboardOrAgentScope(request, env);
      if (scope instanceof Response) return scope;
      const { agentFilter } = scope;

      const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
      const pageSize = 10;
      const anchorDate = url.searchParams.get("date") || todayIST();
      const yesterday = new Date(anchorDate + "T00:00:00Z");
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);

      const CURRENT_LEVEL = vipLevelCase("total_deposit");

      const CTE = `WITH first_deposit_users AS (
          SELECT user_id, MIN(region) as region
          FROM deposits WHERE is_first_deposit = 1 AND date(create_time) = ? AND user_id IS NOT NULL
            AND user_id NOT IN (SELECT user_id FROM users WHERE is_banned = 1)
            AND (? IS NULL OR user_id IN (SELECT user_id FROM users WHERE assigned_agent = ?))
          GROUP BY user_id
        ),
        deposit_agg AS (
          SELECT user_id, COALESCE(SUM(amount),0) as total_deposit, COUNT(*) as deposit_count
          FROM deposits WHERE status = 'COMPLETE' AND user_id IN (SELECT user_id FROM first_deposit_users)
          GROUP BY user_id
        ),
        withdraw_agg AS (
          SELECT user_id, COALESCE(SUM(amount),0) as total_withdrawal
          FROM withdrawals WHERE CAST(status AS REAL) = 2 AND user_id IN (SELECT user_id FROM first_deposit_users)
          GROUP BY user_id
        )`;

      const countRow = await env.daily_records_db
        .prepare(`${CTE} SELECT COUNT(*) as c FROM first_deposit_users`)
        .bind(yesterdayStr, agentFilter, agentFilter)
        .first<{ c: number }>();

      const rows = await env.daily_records_db
        .prepare(
          `${CTE}
           SELECT f.user_id, COALESCE(u.assigned_agent, 'Unassigned') as agent,
                  COALESCE(u.city, f.region, 'Unknown') as region,
                  COALESCE(d.total_deposit, 0) as total_deposit,
                  ${CURRENT_LEVEL.replace(/total_deposit/g, "COALESCE(d.total_deposit, 0)")} as current_level,
                  COALESCE(d.deposit_count, 0) as deposit_count,
                  COALESCE(w.total_withdrawal, 0) as total_withdrawal,
                  COALESCE(d.total_deposit, 0) - COALESCE(w.total_withdrawal, 0) as profit_loss
           FROM first_deposit_users f
           LEFT JOIN deposit_agg d ON d.user_id = f.user_id
           LEFT JOIN withdraw_agg w ON w.user_id = f.user_id
           LEFT JOIN users u ON u.user_id = f.user_id
           ORDER BY total_deposit DESC LIMIT ? OFFSET ?`
        )
        .bind(yesterdayStr, agentFilter, agentFilter, pageSize, (page - 1) * pageSize)
        .all();

      const total = countRow?.c ?? 0;
      return Response.json({
        date: yesterdayStr,
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        rows: rows.results,
      });
    }

    // FTD panel 2: No-Return First Deposit Users — same is_first_deposit
    // marker as the panel above, but the opposite cohort window (2-5 days
    // ago instead of yesterday, giving a return deposit a real chance to
    // have happened) and the opposite condition: flagged if that user's
    // FIRST deposit is still their ONLY completed deposit in the tracked
    // window — no COMPLETE deposit after it. "Total Deposit" here is
    // therefore just that one first-deposit amount (there's nothing else
    // to sum); "Withdraw" is whatever they've withdrawn since, if
    // anything, which is possible even with zero repeat deposits.
    if (url.pathname === "/api/dashboard/action-center/no-return-first-deposits" && request.method === "GET") {
      const scope = await requireDashboardOrAgentScope(request, env);
      if (scope instanceof Response) return scope;
      const { agentFilter } = scope;

      const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
      const pageSize = 10;
      const anchorDate = url.searchParams.get("date") || todayIST();
      const windowStart = new Date(anchorDate + "T00:00:00Z");
      windowStart.setUTCDate(windowStart.getUTCDate() - 5);
      const windowStartStr = windowStart.toISOString().slice(0, 10);
      const windowEnd = new Date(anchorDate + "T00:00:00Z");
      windowEnd.setUTCDate(windowEnd.getUTCDate() - 2);
      const windowEndStr = windowEnd.toISOString().slice(0, 10);

      const CTE = `WITH first_deposits AS (
          SELECT user_id, MIN(create_time) as fd_time, date(MIN(create_time)) as fd_date, amount as fd_amount
          FROM deposits WHERE is_first_deposit = 1 AND date(create_time) BETWEEN ? AND ? AND user_id IS NOT NULL
            AND user_id NOT IN (SELECT user_id FROM users WHERE is_banned = 1)
            AND (? IS NULL OR user_id IN (SELECT user_id FROM users WHERE assigned_agent = ?))
          GROUP BY user_id
        ),
        later_deposits AS (
          SELECT DISTINCT d.user_id FROM deposits d
          JOIN first_deposits f ON f.user_id = d.user_id
          WHERE d.status = 'COMPLETE' AND d.create_time > f.fd_time
        ),
        no_return AS (
          SELECT f.user_id, f.fd_date, f.fd_amount FROM first_deposits f
          WHERE f.user_id NOT IN (SELECT user_id FROM later_deposits)
        ),
        withdraw_agg AS (
          SELECT user_id, COALESCE(SUM(amount),0) as total_withdrawal
          FROM withdrawals WHERE CAST(status AS REAL) = 2 AND user_id IN (SELECT user_id FROM no_return)
          GROUP BY user_id
        )`;
      const cteArgs = [windowStartStr, windowEndStr, agentFilter, agentFilter];

      const countRow = await env.daily_records_db
        .prepare(`${CTE} SELECT COUNT(*) as c FROM no_return`)
        .bind(...cteArgs)
        .first<{ c: number }>();

      const rows = await env.daily_records_db
        .prepare(
          `${CTE}
           SELECT n.user_id, COALESCE(u.assigned_agent, 'Unassigned') as agent, n.fd_date,
                  n.fd_amount as total_deposit, COALESCE(w.total_withdrawal, 0) as total_withdrawal
           FROM no_return n
           LEFT JOIN users u ON u.user_id = n.user_id
           LEFT JOIN withdraw_agg w ON w.user_id = n.user_id
           ORDER BY n.fd_date DESC LIMIT ? OFFSET ?`
        )
        .bind(...cteArgs, pageSize, (page - 1) * pageSize)
        .all();

      const total = countRow?.c ?? 0;
      return Response.json({
        windowStart: windowStartStr,
        windowEnd: windowEndStr,
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        rows: rows.results,
      });
    }

    // Action Center section 4: Active Users. Mirror of section 2 (Inactive
    // Users) but the opposite window — inactive_days capped low instead of
    // floored high. Same master_db.users dependency as sections 1-2 (total
    // deposit / wallet balance / last_active_time have no equivalent in
    // daily_records_db, unlike section 3's deposit totals) — same staleness
    // caveat flagged there applies here too.
    if (url.pathname === "/api/dashboard/action-center/active-users" && request.method === "GET") {
      const scope = await requireDashboardOrAgentScope(request, env);
      if (scope instanceof Response) return scope;
      const { agentFilter } = scope;

      const tier = url.searchParams.get("tier") === "high" ? "high" : "low";
      const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
      const pageSize = 10;

      const CURRENT_LEVEL = vipLevelCase("total_deposit");

      const [minLevel, maxLevel, maxDays] = tier === "low" ? [2, 4, 10] : [5, 14, 15];

      const BASE = `FROM (
          SELECT user_id, total_deposit, user_balance, last_active_time, COALESCE(assigned_agent, 'Unassigned') as agent,
                 ${CURRENT_LEVEL} as current_level,
                 CAST((julianday('now') - julianday(last_active_time)) AS INTEGER) as inactive_days
          FROM users WHERE total_deposit IS NOT NULL AND last_active_time IS NOT NULL AND is_banned = 0
            AND (? IS NULL OR assigned_agent = ?)
        )
        WHERE current_level BETWEEN ? AND ? AND inactive_days BETWEEN 0 AND ?`;

      const countRow = await env.daily_records_db
        .prepare(`SELECT COUNT(*) as c ${BASE}`)
        .bind(agentFilter, agentFilter, minLevel, maxLevel, maxDays)
        .first<{ c: number }>();

      const rows = await env.daily_records_db
        .prepare(
          `SELECT user_id, current_level, total_deposit, user_balance, agent, inactive_days
           ${BASE}
           ORDER BY inactive_days DESC LIMIT ? OFFSET ?`
        )
        .bind(agentFilter, agentFilter, minLevel, maxLevel, maxDays, pageSize, (page - 1) * pageSize)
        .all();

      const total = countRow?.c ?? 0;
      return Response.json({
        tier,
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        rows: rows.results,
      });
    }

    // Shared "Amount Range" summary card backend, reused as the last
    // section on Home (both deposit + withdrawal), Action Center,
    // Analytics, Performance, and Platform Analysis — one endpoint
    // instead of one per page, since the shape (4 amount buckets, orders
    // + total amount, Today/Yesterday) is identical everywhere; only the
    // source table and optional cohort scope differ.
    //   source=deposit|withdrawal — which table to bucket
    //   scope=all (default) | vip-near-upgrade — "all" is every
    //     COMPLETE/settled row for the date (agent-scoped as usual);
    //     "vip-near-upgrade" additionally restricts to Action Center's
    //     own VIP Near Upgrade cohort (its headline section), reusing
    //     that exact bracket/gap definition rather than inventing a new
    //     one — this is what "derive from the page's own existing data"
    //     means for a non-listing page like Action Center.
    //   tier=low|high — only consulted when scope=vip-near-upgrade.
    if (url.pathname === "/api/dashboard/amount-range" && request.method === "GET") {
      const scope = await requireDashboardOrAgentScope(request, env);
      if (scope instanceof Response) return scope;
      const { agentFilter } = scope;

      const source = url.searchParams.get("source") === "withdrawal" ? "withdrawal" : "deposit";
      const date = url.searchParams.get("date") || todayIST();
      const cohortScope = url.searchParams.get("scope") === "vip-near-upgrade" ? "vip-near-upgrade" : "all";
      const tier = url.searchParams.get("tier") === "high" ? "high" : "low";

      const RANGE_CASE = `CASE
        WHEN amount < 10000 THEN '<10,000'
        WHEN amount < 20000 THEN '10,000-19,999'
        WHEN amount < 50000 THEN '20,000-49,999'
        ELSE '50,000+' END`;
      const RANGE_ORDER = ["<10,000", "10,000-19,999", "20,000-49,999", "50,000+"];

      const table = source === "withdrawal" ? "withdrawals" : "deposits";
      // Matches the same "settled" definitions used everywhere else:
      // deposits=COMPLETE only; withdrawals=in-review+processing+complete
      // (0,1,2), same as the Home page's own "Total Withdraw" KPI.
      const statusClause = source === "withdrawal" ? "CAST(status AS REAL) IN (0,1,2)" : "status = 'COMPLETE'";

      let cohortClause: string;
      let cohortBind: (string | null)[];
      if (cohortScope === "vip-near-upgrade" && source === "deposit") {
        const CURRENT_LEVEL = vipLevelCase("total_deposit");
        const NEXT_LEVEL_MIN = vipNextLevelMinCase("total_deposit");
        const [minLevel, maxLevel, maxGap] = tier === "low" ? [2, 4, 1000] : [5, 13, 50000];
        cohortClause = `AND user_id IN (
          SELECT user_id FROM (
            SELECT user_id, total_deposit, ${CURRENT_LEVEL} as current_level, ${NEXT_LEVEL_MIN} as next_level_min
            FROM users WHERE total_deposit IS NOT NULL AND is_banned = 0 AND (? IS NULL OR assigned_agent = ?)
          ) WHERE next_level_min IS NOT NULL AND current_level BETWEEN ? AND ?
            AND (next_level_min - total_deposit) BETWEEN 1 AND ?
        )`;
        cohortBind = [agentFilter, agentFilter, String(minLevel), String(maxLevel), String(maxGap)];
      } else {
        cohortClause = agentFilter ? `AND user_id IN (SELECT user_id FROM users WHERE assigned_agent = ?)` : "";
        cohortBind = agentFilter ? [agentFilter] : [];
      }

      // Called on every dashboard page (Home x2, Action Center, Analytics,
      // Performance, Platform Analysis) — the single most frequently-hit
      // endpoint site-wide, and cheap to cache correctly: the cache key
      // includes every input that changes the result (source/date/scope/
      // tier/agentFilter), so an agent session can never see another
      // agent's — or the admin's unscoped — numbers. Source data only
      // changes on sync (roughly hourly), so a short TTL trades negligible
      // staleness for a big cut in repeat-load D1 cost.
      const cacheKey = `amount-range:${source}:${date}:${cohortScope}:${tier}:${agentFilter ?? "all"}`;
      const payload = await cachedJson(env, cacheKey, async () => {
        const rows = await env.daily_records_db
          .prepare(
            `SELECT ${RANGE_CASE} as range, COUNT(*) as totalOrders, COALESCE(SUM(amount),0) as totalAmount
             FROM ${table} WHERE date(create_time) = ? AND ${statusClause} ${cohortClause} GROUP BY range`
          )
          .bind(date, ...cohortBind)
          .all<{ range: string; totalOrders: number; totalAmount: number }>();

        const byRange: Record<string, { totalOrders: number; totalAmount: number }> = {};
        rows.results.forEach((r) => { byRange[r.range] = { totalOrders: r.totalOrders, totalAmount: r.totalAmount }; });
        const ranges = RANGE_ORDER.map((range) => ({ range, ...(byRange[range] ?? { totalOrders: 0, totalAmount: 0 }) }));
        const total = ranges.reduce(
          (acc, r) => ({ totalOrders: acc.totalOrders + r.totalOrders, totalAmount: acc.totalAmount + r.totalAmount }),
          { totalOrders: 0, totalAmount: 0 }
        );
        return { date, source, scope: cohortScope, tier, ranges, total };
      });

      return Response.json(payload);
    }

    // Last-sync freshness indicator, shown in the shared dashboard header on
    // every page. Each section's own "Updated HH:MM:SS" text is just the
    // browser's render time, not actual data freshness — it kept reading as
    // current during an ~8hr token-expiry outage where every sync failed,
    // giving false confidence the data was live. This surfaces the real
    // last SUCCESSFUL sync_runs timestamp per source instead.
    if (url.pathname === "/api/dashboard/last-sync" && request.method === "GET") {
      // Non-sensitive (just sync freshness, no user data) and rendered by
      // the shared dashboard shell script — both dashboard and agent
      // sessions need it to load without a 401.
      const scope = await requireDashboardOrAgentScope(request, env);
      if (scope instanceof Response) return scope;

      const rows = await env.daily_records_db
        .prepare(
          `SELECT source, MAX(finished_at) as last_success
           FROM sync_runs WHERE status = 'success' GROUP BY source`
        )
        .all<{ source: string; last_success: string }>();

      const lastFailure = await env.daily_records_db
        .prepare(
          `SELECT source, started_at, error_message FROM sync_runs
           WHERE status = 'failed' ORDER BY started_at DESC LIMIT 1`
        )
        .first<{ source: string; started_at: string; error_message: string }>();

      return Response.json({
        bySource: rows.results,
        recentFailure: lastFailure ?? null,
        serverNow: new Date().toISOString(),
      });
    }

    // Home page (section 1) stats — daily KPI overview for a given date
    // (defaults to today). Deposit "complete" and withdraw "in-review +
    // processing + complete" definitions confirmed against real status
    // values in daily_records_db: deposits use 'COMPLETE'/'PROCESS'/'FAILED'
    // text; withdrawals use '0.0'..'4.0' matching 0=Under review,
    // 1=Payment processing, 2=Completed, 3=Rejected, 4=Failed — so withdraw
    // totals exclude 3 and 4 only.
    if (url.pathname === "/api/dashboard/home-stats" && request.method === "GET") {
      const scope = await requireDashboardOrAgentScope(request, env);
      if (scope instanceof Response) return scope;
      const { agentFilter } = scope;

      const date = url.searchParams.get("date") || todayIST();
      // When scoped to an agent, every count/sum below is restricted to
      // that agent's assigned users via a user_id subquery — deposits/
      // withdrawals/wallet_details have no assigned_agent column of their
      // own, only users does.
      const agentUserIds = `SELECT user_id FROM users WHERE assigned_agent = ?`;
      const scopeClause = agentFilter ? `AND user_id IN (${agentUserIds})` : "";
      const scopeBind = agentFilter ? [agentFilter] : [];

      // Hit on every load of the Home page's top KPI row (the first thing
      // both admin and every agent dashboard render) — 4 queries per
      // request, cached the same way as amount-range above: key includes
      // date + agentFilter so scopes never cross, short TTL since source
      // data only changes on sync.
      const cacheKey = `home-stats:${date}:${agentFilter ?? "all"}`;
      const payload = await cachedJson(env, cacheKey, async () => {
        const depositAgg = await env.daily_records_db
          .prepare(
            `SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as orders, COUNT(DISTINCT user_id) as users
             FROM deposits WHERE date(create_time) = ? AND status = 'COMPLETE' ${scopeClause}`
          )
          .bind(date, ...scopeBind)
          .first<{ total: number; orders: number; users: number }>();

        const withdrawAgg = await env.daily_records_db
          .prepare(
            `SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as orders, COUNT(DISTINCT user_id) as users
             FROM withdrawals WHERE date(create_time) = ? AND CAST(status AS REAL) IN (0,1,2) ${scopeClause}`
          )
          .bind(date, ...scopeBind)
          .first<{ total: number; orders: number; users: number }>();

        const activeUsersRow = await env.daily_records_db
          .prepare(
            `SELECT COUNT(DISTINCT user_id) as c FROM (
               SELECT user_id FROM deposits WHERE date(create_time) = ? ${scopeClause}
               UNION
               SELECT user_id FROM withdrawals WHERE date(create_time) = ? ${scopeClause}
               UNION
               SELECT user_id FROM wallet_details WHERE date(create_time) = ? ${scopeClause}
             )`
          )
          .bind(date, ...scopeBind, date, ...scopeBind, date, ...scopeBind)
          .first<{ c: number }>();

        const totalUsersRow = agentFilter
          ? await env.daily_records_db.prepare(`SELECT COUNT(*) as c FROM users WHERE assigned_agent = ?`).bind(agentFilter).first<{ c: number }>()
          : await env.daily_records_db.prepare(`SELECT COUNT(*) as c FROM users`).first<{ c: number }>();

        return {
          date,
          totalUsers: totalUsersRow?.c ?? 0,
          registeredActive: totalUsersRow?.c ?? 0,
          totalDeposit: depositAgg?.total ?? 0,
          totalWithdraw: withdrawAgg?.total ?? 0,
          depositOrders: depositAgg?.orders ?? 0,
          withdrawOrders: withdrawAgg?.orders ?? 0,
          depositUsers: depositAgg?.users ?? 0,
          withdrawUsers: withdrawAgg?.users ?? 0,
          activeUsers: activeUsersRow?.c ?? 0,
        };
      });

      return Response.json(payload);
    }

    // Deposit Analysis (dashboard section 2): amount-range breakdown,
    // success-rate-by-range, and by-channel tables. All scoped to a single
    // date (defaults to today), same convention as home-stats.
    if (url.pathname === "/api/dashboard/deposit-analysis" && request.method === "GET") {
      const scope = await requireDashboardOrAgentScope(request, env);
      if (scope instanceof Response) return scope;
      const { agentFilter } = scope;

      const date = url.searchParams.get("date") || todayIST();
      const scopeClause = agentFilter ? `AND user_id IN (SELECT user_id FROM users WHERE assigned_agent = ?)` : "";
      const scopeBind = agentFilter ? [agentFilter] : [];

      const RANGE_CASE = `CASE
        WHEN amount >= 200 AND amount <= 299 THEN '200-299'
        WHEN amount >= 300 AND amount <= 499 THEN '300-499'
        WHEN amount >= 500 AND amount <= 999 THEN '500-999'
        WHEN amount >= 1000 AND amount <= 1999 THEN '1000-1999'
        WHEN amount >= 2000 AND amount <= 2499 THEN '2000-2499'
        WHEN amount >= 2500 AND amount <= 4999 THEN '2500-4999'
        WHEN amount >= 5000 AND amount <= 9999 THEN '5000-9999'
        WHEN amount >= 10000 AND amount <= 19999 THEN '10000-19999'
        WHEN amount >= 20000 AND amount <= 50000 THEN '20000-50000'
        ELSE 'Other' END`;
      const AVG_MINUTES = `(julianday(result_time) - julianday(create_time)) * 24 * 60`;

      const amountRange = await env.daily_records_db
        .prepare(
          `SELECT ${RANGE_CASE} as range, COUNT(*) as count, COUNT(DISTINCT user_id) as users, COALESCE(SUM(amount),0) as total
           FROM deposits WHERE date(create_time) = ? AND status = 'COMPLETE' ${scopeClause} GROUP BY range`
        )
        .bind(date, ...scopeBind)
        .all();

      const successByRange = await env.daily_records_db
        .prepare(
          `SELECT ${RANGE_CASE} as range, COUNT(*) as total,
                  SUM(CASE WHEN status = 'COMPLETE' THEN 1 ELSE 0 END) as completed,
                  AVG(CASE WHEN status = 'COMPLETE' AND result_time IS NOT NULL THEN ${AVG_MINUTES} END) as avg_minutes
           FROM deposits WHERE date(create_time) = ? ${scopeClause} GROUP BY range`
        )
        .bind(date, ...scopeBind)
        .all();

      const byChannel = await env.daily_records_db
        .prepare(
          `SELECT COALESCE(channel, 'Unknown') as channel, COUNT(*) as total_orders,
                  SUM(CASE WHEN status = 'COMPLETE' THEN 1 ELSE 0 END) as comp_orders,
                  COUNT(DISTINCT CASE WHEN status = 'COMPLETE' THEN user_id END) as comp_users,
                  COALESCE(SUM(CASE WHEN status = 'COMPLETE' THEN amount ELSE 0 END),0) as comp_amount,
                  AVG(CASE WHEN status = 'COMPLETE' AND result_time IS NOT NULL THEN ${AVG_MINUTES} END) as avg_mins
           FROM deposits WHERE date(create_time) = ? ${scopeClause} GROUP BY channel ORDER BY total_orders DESC`
        )
        .bind(date, ...scopeBind)
        .all();

      return Response.json({
        date,
        amountRange: amountRange.results,
        successByRange: successByRange.results,
        byChannel: byChannel.results,
      });
    }

    // Deposit hourly analysis (dashboard section 3): hourly success-rate
    // tables by amount range and by channel — same layout/format that used
    // to show withdrawals here, now shows deposits instead per request.
    // "Success" = status = 'COMPLETE', same strict definition as Deposit
    // Analysis section 2.
    if (url.pathname === "/api/dashboard/deposit-hourly-analysis" && request.method === "GET") {
      const scope = await requireDashboardOrAgentScope(request, env);
      if (scope instanceof Response) return scope;
      const { agentFilter } = scope;

      const date = url.searchParams.get("date") || todayIST();
      const scopeClause = agentFilter ? `AND user_id IN (SELECT user_id FROM users WHERE assigned_agent = ?)` : "";
      const scopeBind = agentFilter ? [agentFilter] : [];

      const RANGE_CASE = `CASE
        WHEN amount >= 200 AND amount <= 299 THEN '200-299'
        WHEN amount >= 300 AND amount <= 499 THEN '300-499'
        WHEN amount >= 500 AND amount <= 999 THEN '500-999'
        WHEN amount >= 1000 AND amount <= 1999 THEN '1000-1999'
        WHEN amount >= 2000 AND amount <= 2499 THEN '2000-2499'
        WHEN amount >= 2500 AND amount <= 4999 THEN '2500-4999'
        WHEN amount >= 5000 AND amount <= 9999 THEN '5000-9999'
        WHEN amount >= 10000 AND amount <= 19999 THEN '10000-19999'
        WHEN amount >= 20000 AND amount <= 50000 THEN '20000-50000'
        ELSE 'Other' END`;
      const IS_SUCCESS = `status = 'COMPLETE'`;

      const byRangeHour = await env.daily_records_db
        .prepare(
          `SELECT ${RANGE_CASE} as range, CAST(strftime('%H', create_time) AS INTEGER) as hour,
                  COUNT(*) as total, SUM(CASE WHEN ${IS_SUCCESS} THEN 1 ELSE 0 END) as success
           FROM deposits WHERE date(create_time) = ? ${scopeClause} GROUP BY range, hour`
        )
        .bind(date, ...scopeBind)
        .all();

      const rangeTotals = await env.daily_records_db
        .prepare(
          `SELECT ${RANGE_CASE} as range, COUNT(*) as total_orders
           FROM deposits WHERE date(create_time) = ? ${scopeClause} GROUP BY range`
        )
        .bind(date, ...scopeBind)
        .all();

      const byChannelHour = await env.daily_records_db
        .prepare(
          `SELECT COALESCE(channel, 'Unknown') as channel, CAST(strftime('%H', create_time) AS INTEGER) as hour,
                  COUNT(*) as total, SUM(CASE WHEN ${IS_SUCCESS} THEN 1 ELSE 0 END) as success
           FROM deposits WHERE date(create_time) = ? ${scopeClause} GROUP BY channel, hour`
        )
        .bind(date, ...scopeBind)
        .all();

      const channelTotals = await env.daily_records_db
        .prepare(
          `SELECT COALESCE(channel, 'Unknown') as channel, COUNT(*) as total_orders
           FROM deposits WHERE date(create_time) = ? ${scopeClause} GROUP BY channel ORDER BY total_orders DESC`
        )
        .bind(date, ...scopeBind)
        .all();

      return Response.json({
        date,
        byRangeHour: byRangeHour.results,
        rangeTotals: rangeTotals.results,
        byChannelHour: byChannelHour.results,
        channelTotals: channelTotals.results,
      });
    }

    // Withdrawal Analysis (dashboard section 4): channel-wise processing
    // (create->review) and completion (review->complete) time buckets,
    // "aging" charts for currently-open orders, and a 7-day completed
    // <4h vs >4h comparison. Scoped to a single date (create_time's day)
    // except the two "aging" charts, which are live snapshots of whatever
    // is currently open (status 0/1) regardless of date, and the 7-day
    // chart, which always covers the 7 days ending on the selected date.
    // review_time/callback_time only exist for rows synced after that
    // column was added — older rows show as NULL and fall out of these
    // buckets, same caveat as channel on the section 3 tables.
    if (url.pathname === "/api/dashboard/withdrawal-analysis" && request.method === "GET") {
      const scope = await requireDashboardOrAgentScope(request, env);
      if (scope instanceof Response) return scope;
      const { agentFilter } = scope;

      const date = url.searchParams.get("date") || todayIST();
      const scopeClause = agentFilter ? `AND user_id IN (SELECT user_id FROM users WHERE assigned_agent = ?)` : "";
      const scopeBind = agentFilter ? [agentFilter] : [];

      const DURATION_BUCKET = (col: string) => `CASE
        WHEN ${col} IS NULL THEN NULL
        WHEN ${col} < 1 THEN '<1H'
        WHEN ${col} < 3 THEN '1-3H'
        WHEN ${col} < 6 THEN '3-6H'
        WHEN ${col} < 12 THEN '6-12H'
        ELSE '>12H' END`;
      const HOURS_BETWEEN = (a: string, b: string) => `(julianday(${b}) - julianday(${a})) * 24`;

      const channelProcessingTime = await env.daily_records_db
        .prepare(
          `SELECT COALESCE(channel, 'Unknown') as channel,
                  ${DURATION_BUCKET(HOURS_BETWEEN("create_time", "review_time"))} as bucket, COUNT(*) as cnt
           FROM withdrawals WHERE date(create_time) = ? AND review_time IS NOT NULL ${scopeClause}
           GROUP BY channel, bucket`
        )
        .bind(date, ...scopeBind)
        .all();

      const channelCompletionTime = await env.daily_records_db
        .prepare(
          `SELECT COALESCE(channel, 'Unknown') as channel,
                  ${DURATION_BUCKET(HOURS_BETWEEN("review_time", "callback_time"))} as bucket, COUNT(*) as cnt
           FROM withdrawals WHERE date(create_time) = ? AND CAST(status AS REAL) = 2 AND callback_time IS NOT NULL AND review_time IS NOT NULL ${scopeClause}
           GROUP BY channel, bucket`
        )
        .bind(date, ...scopeBind)
        .all();

      // Live snapshot (not date-scoped): every currently-open order,
      // however old, bucketed by how long it's been sitting. Includes
      // SUM(amount) per bucket so the chart can show a rupee figure
      // alongside the count/percentage, matching the reference design.
      const processingAging = await env.daily_records_db
        .prepare(
          `SELECT CASE
             WHEN h < 6 THEN '3-6h' WHEN h < 12 THEN '6-12h' WHEN h < 24 THEN '12-24h' ELSE '>24h' END as bucket,
             COUNT(*) as cnt, COALESCE(SUM(amount),0) as amt
           FROM (SELECT amount, ${HOURS_BETWEEN("COALESCE(review_time, create_time)", "datetime('now')")} as h
                 FROM withdrawals WHERE CAST(status AS REAL) = 1 ${scopeClause})
           WHERE h >= 3 GROUP BY bucket`
        )
        .bind(...scopeBind)
        .all();

      const inReviewAging = await env.daily_records_db
        .prepare(
          `SELECT CASE WHEN h < 3 THEN '1-3h' WHEN h < 6 THEN '3-6h' ELSE '>6h' END as bucket,
                  COUNT(*) as cnt, COALESCE(SUM(amount),0) as amt
           FROM (SELECT amount, ${HOURS_BETWEEN("create_time", "datetime('now')")} as h
                 FROM withdrawals WHERE CAST(status AS REAL) = 0 ${scopeClause})
           WHERE h >= 1 GROUP BY bucket`
        )
        .bind(...scopeBind)
        .all();

      // Withdrawal Processing — Amount Range: currently-processing orders
      // (status=1), cross-tabbed by amount range and how long they've been
      // processing (same aging window as processingAging above, just split
      // per amount bracket instead of aggregated).
      const AMOUNT_RANGE = `CASE
        WHEN amount >= 200 AND amount <= 999 THEN '200-999'
        WHEN amount >= 1000 AND amount <= 4999 THEN '1000-4999'
        WHEN amount >= 5000 AND amount <= 9999 THEN '5000-9999'
        WHEN amount >= 10000 AND amount <= 20000 THEN '10000-20000'
        WHEN amount >= 20001 AND amount <= 50000 THEN '20001-50000'
        ELSE 'Other' END`;
      const processingByAmountRange = await env.daily_records_db
        .prepare(
          `SELECT range, bucket, COUNT(*) as cnt FROM (
             SELECT ${AMOUNT_RANGE} as range,
                    CASE WHEN h < 6 THEN '3-6H' WHEN h < 12 THEN '6-12H' WHEN h < 24 THEN '12-24H' ELSE '>24H' END as bucket
             FROM (SELECT amount, ${HOURS_BETWEEN("COALESCE(review_time, create_time)", "datetime('now')")} as h
                   FROM withdrawals WHERE CAST(status AS REAL) = 1 ${scopeClause})
             WHERE h >= 3
           ) GROUP BY range, bucket`
        )
        .bind(...scopeBind)
        .all();

      const rangeTotalsForProcessing = await env.daily_records_db
        .prepare(
          `SELECT range, COUNT(*) as total_orders, COALESCE(SUM(amount),0) as total_amount FROM (
             SELECT amount, ${AMOUNT_RANGE} as range
             FROM withdrawals WHERE CAST(status AS REAL) = 1
               AND ${HOURS_BETWEEN("COALESCE(review_time, create_time)", "datetime('now')")} >= 3 ${scopeClause}
           ) GROUP BY range`
        )
        .bind(...scopeBind)
        .all();

      const completedLast4Days = await env.daily_records_db
        .prepare(
          `SELECT date(create_time) as d,
                  SUM(CASE WHEN ${HOURS_BETWEEN("create_time", "callback_time")} < 4 THEN 1 ELSE 0 END) as under4h,
                  SUM(CASE WHEN ${HOURS_BETWEEN("create_time", "callback_time")} >= 4 THEN 1 ELSE 0 END) as over4h
           FROM withdrawals
           WHERE CAST(status AS REAL) = 2 AND callback_time IS NOT NULL
             AND date(create_time) BETWEEN date(?, '-6 days') AND date(?) ${scopeClause}
           GROUP BY d ORDER BY d`
        )
        .bind(date, date, ...scopeBind)
        .all<{ d: string; under4h: number; over4h: number }>();

      // Always return all 7 day-slots, zero-filling any day with no rows —
      // otherwise a day with genuinely no data (e.g. before callback_time
      // capture started) silently disappears instead of showing as empty,
      // making the chart look like it only covers 6 days.
      const byDay: Record<string, { under4h: number; over4h: number }> = {};
      completedLast4Days.results.forEach((r) => { byDay[r.d] = { under4h: r.under4h, over4h: r.over4h }; });
      const sevenDays: { d: string; under4h: number; over4h: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(date + "T00:00:00Z");
        d.setUTCDate(d.getUTCDate() - i);
        const iso = d.toISOString().slice(0, 10);
        sevenDays.push({ d: iso, ...(byDay[iso] ?? { under4h: 0, over4h: 0 }) });
      }

      return Response.json({
        date,
        channelProcessingTime: channelProcessingTime.results,
        channelCompletionTime: channelCompletionTime.results,
        processingAging: processingAging.results,
        inReviewAging: inReviewAging.results,
        completedLast4Days: sevenDays,
        processingByAmountRange: processingByAmountRange.results,
        rangeTotalsForProcessing: rangeTotalsForProcessing.results,
      });
    }

    // Withdrawal Analysis Excel exports: transaction-level rows (one per
    // withdrawal — User ID, Agent, VIP, Withdraw Amount, Channel, Order
    // Number, Hours in Processing) backing each of the 6 panels above,
    // instead of just re-serializing the rendered summary table. `subset`
    // picks which panel's exact filter to reuse — same WHERE clauses as
    // the aggregate queries above (same date/status/duration windows),
    // just SELECT-ing raw columns instead of GROUP BY.
    if (url.pathname === "/api/dashboard/withdrawal-transactions" && request.method === "GET") {
      const scope = await requireDashboardOrAgentScope(request, env);
      if (scope instanceof Response) return scope;
      const { agentFilter } = scope;

      const date = url.searchParams.get("date") || todayIST();
      const subset = url.searchParams.get("subset") || "processing-time";
      const scopeClause = agentFilter ? `AND w.user_id IN (SELECT user_id FROM users WHERE assigned_agent = ?)` : "";
      const scopeBind = agentFilter ? [agentFilter] : [];
      const HOURS_BETWEEN = (a: string, b: string) => `(julianday(${b}) - julianday(${a})) * 24`;

      let whereClause: string;
      let hoursExpr: string;
      let binds: (string | null)[];

      if (subset === "completion-time") {
        whereClause = `w.date_create = ? AND CAST(w.status AS REAL) = 2 AND w.callback_time IS NOT NULL AND w.review_time IS NOT NULL`;
        hoursExpr = HOURS_BETWEEN("w.review_time", "w.callback_time");
        binds = [date, ...scopeBind];
      } else if (subset === "processing-aging") {
        whereClause = `CAST(w.status AS REAL) = 1 AND ${HOURS_BETWEEN("COALESCE(w.review_time, w.create_time)", "datetime('now')")} >= 3`;
        hoursExpr = HOURS_BETWEEN("COALESCE(w.review_time, w.create_time)", "datetime('now')");
        binds = [...scopeBind];
      } else if (subset === "review-aging") {
        whereClause = `CAST(w.status AS REAL) = 0 AND ${HOURS_BETWEEN("w.create_time", "datetime('now')")} >= 1`;
        hoursExpr = HOURS_BETWEEN("w.create_time", "datetime('now')");
        binds = [...scopeBind];
      } else if (subset === "amount-range") {
        whereClause = `CAST(w.status AS REAL) = 1 AND ${HOURS_BETWEEN("COALESCE(w.review_time, w.create_time)", "datetime('now')")} >= 3`;
        hoursExpr = HOURS_BETWEEN("COALESCE(w.review_time, w.create_time)", "datetime('now')");
        binds = [...scopeBind];
      } else if (subset === "completed-4day") {
        whereClause = `CAST(w.status AS REAL) = 2 AND w.callback_time IS NOT NULL AND date(w.create_time) BETWEEN date(?, '-6 days') AND date(?)`;
        hoursExpr = HOURS_BETWEEN("w.create_time", "w.callback_time");
        binds = [date, date, ...scopeBind];
      } else {
        // "processing-time" (default): create -> review duration.
        whereClause = `w.date_create = ? AND w.review_time IS NOT NULL`;
        hoursExpr = HOURS_BETWEEN("w.create_time", "w.review_time");
        binds = [date, ...scopeBind];
      }
      // date_create is a computed alias substituted below since
      // date(create_time) can't be reused across the ternary strings
      // above without repeating the wrapping — replaced here in one place.
      const finalWhere = whereClause.replace(/w\.date_create/g, "date(w.create_time)");

      // payment_order_id is the vendor's payment-gateway order reference
      // (e.g. "TW..."); it's only assigned once an order reaches the
      // payment center, so status-0 (still under review) orders never have
      // one — review-aging has no substitute field and returns null.
      const orderNoExpr = subset === "review-aging" ? "NULL" : "w.payment_order_id";

      const rows = await env.daily_records_db
        .prepare(
          `SELECT w.user_id, COALESCE(u.assigned_agent, 'Unassigned') as agent,
                  ${vipLevelCase("u.total_deposit")} as vip_level,
                  w.amount, COALESCE(w.channel, 'Unknown') as channel, ${orderNoExpr} as order_no,
                  ROUND(${hoursExpr}, 2) as hours_in_processing
           FROM withdrawals w LEFT JOIN users u ON u.user_id = w.user_id
           WHERE ${finalWhere} ${scopeClause}
           ORDER BY w.create_time DESC LIMIT 5000`
        )
        .bind(...binds)
        .all();

      return Response.json({ date, subset, rows: rows.results });
    }

    // Analytics page section 1: Region & VIP Deposit Analytics — top 10
    // regions by that day's completed deposit volume, and that same day's
    // deposit volume broken down by each depositing user's (lifetime) VIP
    // level. deposits (daily_records_db) and users (master_db) are separate
    // D1 databases with no cross-DB JOIN, so this fetches the day's
    // per-user deposit totals, then batches a lookup of city + lifetime
    // total_deposit from master_db and merges in memory — same pattern as
    // Action Center section 3. City comes from master_db.users (99.8%
    // populated); deposits.region is a newer, sparser fallback for rows
    // synced after that column existed.
    if (url.pathname === "/api/dashboard/analytics/region-vip-deposit" && request.method === "GET") {
      const scope = await requireDashboardOrAgentScope(request, env);
      if (scope instanceof Response) return scope;
      const { agentFilter } = scope;

      const date = url.searchParams.get("date") || todayIST();

      const CURRENT_LEVEL = vipLevelCase("total_deposit");

      const CTE = `WITH day_dep AS (
          SELECT user_id, SUM(amount) as day_deposit, MIN(region) as region
          FROM deposits WHERE date(create_time) = ? AND status = 'COMPLETE' AND user_id IS NOT NULL
            AND (? IS NULL OR user_id IN (SELECT user_id FROM users WHERE assigned_agent = ?))
          GROUP BY user_id
        ),
        merged AS (
          SELECT d.user_id, d.day_deposit,
                 COALESCE(u.city, d.region, 'Unknown') as region,
                 ${CURRENT_LEVEL.replace(/total_deposit/g, "COALESCE(u.total_deposit, 0)")} as vip_level
          FROM day_dep d LEFT JOIN users u ON u.user_id = d.user_id
        )`;

      const topRegionsRes = await env.daily_records_db
        .prepare(
          `${CTE} SELECT region, SUM(day_deposit) as total, COUNT(*) as users
           FROM merged GROUP BY region ORDER BY total DESC LIMIT 10`
        )
        .bind(date, agentFilter, agentFilter)
        .all<{ region: string; total: number; users: number }>();

      const byVipLevelRes = await env.daily_records_db
        .prepare(
          `${CTE} SELECT vip_level as level, SUM(day_deposit) as total, COUNT(*) as users
           FROM merged GROUP BY vip_level ORDER BY vip_level ASC`
        )
        .bind(date, agentFilter, agentFilter)
        .all<{ level: number; total: number; users: number }>();

      return Response.json({ date, topRegions: topRegionsRes.results, byVipLevel: byVipLevelRes.results });
    }

    // Analytics page section 2: Reactivation. "Reactivated" = a user
    // currently counted inactive (current VIP bracket + inactive_days
    // window, computed from last_active_time) who has ALSO made a
    // completed deposit recently. This works specifically because
    // users.last_active_time only updates from periodic manual uploads /
    // the profile-sync fields — it does NOT get bumped by today's deposit,
    // so a just-reactivated user still shows up as "inactive" here,
    // letting us intersect the two sets meaningfully instead of everyone
    // always looking freshly active. The 3-day conversion rate uses the
    // CURRENT inactive cohort size as its denominator (an approximation —
    // we don't have historical cohort snapshots). 7-day is not computable
    // at all: deposits data only covers a rolling SYNC_WINDOW_DAYS=5-day
    // window, so a 7-day lookback would silently undercount — shown as
    // "not enough history yet" instead of a misleading number.
    //
    // Phase 2 rewrite: cohort + deposit activity now live in the same
    // database, so this is CTEs + JOINs instead of a batched candidate-ID
    // lookup merged in memory.
    if (url.pathname === "/api/dashboard/analytics/reactivation" && request.method === "GET") {
      const scope = await requireDashboardOrAgentScope(request, env);
      if (scope instanceof Response) return scope;
      const { agentFilter } = scope;

      const tier = url.searchParams.get("tier") === "high" ? "high" : "low";
      const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
      const pageSize = 10;
      const anchorDate = url.searchParams.get("date") || todayIST();
      const threeDaysAgo = new Date(anchorDate + "T00:00:00Z");
      threeDaysAgo.setUTCDate(threeDaysAgo.getUTCDate() - 2);
      const threeDaysAgoStr = threeDaysAgo.toISOString().slice(0, 10);

      const [minLevel, maxLevel, minDays, maxDays] = tier === "low" ? [2, 4, 10, 180] : [5, 14, 15, 240];

      const CURRENT_LEVEL = vipLevelCase("total_deposit");

      const CTE = `WITH cohort AS (
          SELECT user_id, assigned_agent as agent, ${CURRENT_LEVEL} as current_level,
                 CAST((julianday('now') - julianday(last_active_time)) AS INTEGER) as inactive_days
          FROM users WHERE total_deposit IS NOT NULL AND last_active_time IS NOT NULL AND is_banned = 0
            AND (? IS NULL OR assigned_agent = ?)
        ),
        cohort_filtered AS (
          SELECT * FROM cohort WHERE current_level BETWEEN ? AND ? AND inactive_days BETWEEN ? AND ?
        ),
        today_dep AS (
          SELECT user_id, SUM(amount) as day_deposit FROM deposits
          WHERE date(create_time) = ? AND status = 'COMPLETE' AND user_id IS NOT NULL GROUP BY user_id
        ),
        three_day_dep AS (
          SELECT DISTINCT user_id FROM deposits
          WHERE date(create_time) BETWEEN ? AND ? AND status = 'COMPLETE' AND user_id IS NOT NULL
        )`;
      const cteArgs = [agentFilter, agentFilter, minLevel, maxLevel, minDays, maxDays, anchorDate, threeDaysAgoStr, anchorDate];

      const cohortCountRow = await env.daily_records_db
        .prepare(`${CTE} SELECT COUNT(*) as c FROM cohort_filtered`)
        .bind(...cteArgs)
        .first<{ c: number }>();
      const cohortSize = cohortCountRow?.c ?? 0;

      const reactivatedCountRow = await env.daily_records_db
        .prepare(`${CTE} SELECT COUNT(*) as c FROM cohort_filtered c JOIN today_dep t ON t.user_id = c.user_id`)
        .bind(...cteArgs)
        .first<{ c: number }>();
      const reactivatedTodayCount = reactivatedCountRow?.c ?? 0;

      const reactivated3DayRow = await env.daily_records_db
        .prepare(`${CTE} SELECT COUNT(*) as c FROM cohort_filtered c JOIN three_day_dep t ON t.user_id = c.user_id`)
        .bind(...cteArgs)
        .first<{ c: number }>();
      const reactivated3DayCount = reactivated3DayRow?.c ?? 0;

      const rows = await env.daily_records_db
        .prepare(
          `${CTE}
           SELECT c.user_id, COALESCE(c.agent, 'Unassigned') as agent, c.current_level, c.inactive_days, t.day_deposit
           FROM cohort_filtered c JOIN today_dep t ON t.user_id = c.user_id
           ORDER BY c.inactive_days DESC LIMIT ? OFFSET ?`
        )
        .bind(...cteArgs, pageSize, (page - 1) * pageSize)
        .all();

      return Response.json({
        date: anchorDate,
        tier,
        page,
        pageSize,
        total: reactivatedTodayCount,
        totalPages: Math.max(1, Math.ceil(reactivatedTodayCount / pageSize)),
        rows: rows.results,
        cohortSize,
        reactivatedTodayCount,
        reactivated3DayCount,
      });
    }

    // Analytics page section 3: VIP Level Upgrade. Same shape as
    // Reactivation (see that endpoint's comment): the cohort is the
    // "near-upgrade" set — same definition as Action Center's VIP Near
    // Upgrade (current VIP bracket + gap-to-next-bracket window, computed
    // from users.total_deposit, which lags behind today's activity).
    // "Upgraded today" = a cohort member whose TODAY's deposit(s), added
    // on top of that lagging total_deposit baseline, push them past the
    // next bracket's floor. total_deposit is treated as the pre-today
    // baseline specifically because it doesn't reflect today's deposits
    // yet — same staleness fact that made Reactivation work.
    //
    // Phase 2 rewrite: CTEs + JOINs instead of a batched candidate-ID
    // lookup merged in memory. vip_after can't be a stored column (it
    // depends on today's deposit total, computed per-request), so the
    // same bracket CASE expression is reused with its input swapped to
    // "total_deposit + today's deposit" via vipLevelCase().
    if (url.pathname === "/api/dashboard/analytics/vip-upgrade" && request.method === "GET") {
      const scope = await requireDashboardOrAgentScope(request, env);
      if (scope instanceof Response) return scope;
      const { agentFilter } = scope;

      const tier = url.searchParams.get("tier") === "high" ? "high" : "low";
      const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
      const pageSize = 10;
      const anchorDate = url.searchParams.get("date") || todayIST();
      const threeDaysAgo = new Date(anchorDate + "T00:00:00Z");
      threeDaysAgo.setUTCDate(threeDaysAgo.getUTCDate() - 2);
      const threeDaysAgoStr = threeDaysAgo.toISOString().slice(0, 10);

      const [minLevel, maxLevel, maxGap] = tier === "low" ? [2, 4, 1000] : [5, 13, 50000];

      const CURRENT_LEVEL = vipLevelCase("total_deposit");
      const NEXT_LEVEL_MIN = vipNextLevelMinCase("total_deposit");

      const CTE = `WITH cohort AS (
          SELECT user_id, assigned_agent as agent, total_deposit,
                 ${CURRENT_LEVEL} as current_level, ${NEXT_LEVEL_MIN} as next_level_min
          FROM users WHERE total_deposit IS NOT NULL AND is_banned = 0
            AND (? IS NULL OR assigned_agent = ?)
        ),
        cohort_filtered AS (
          SELECT * FROM cohort WHERE next_level_min IS NOT NULL AND current_level BETWEEN ? AND ?
            AND (next_level_min - total_deposit) BETWEEN 1 AND ?
        ),
        today_dep AS (
          SELECT user_id, SUM(amount) as day_deposit FROM deposits
          WHERE date(create_time) = ? AND status = 'COMPLETE' AND user_id IS NOT NULL GROUP BY user_id
        ),
        three_day_dep AS (
          SELECT user_id, SUM(amount) as amt FROM deposits
          WHERE date(create_time) BETWEEN ? AND ? AND status = 'COMPLETE' AND user_id IS NOT NULL GROUP BY user_id
        )`;
      const cteArgs = [agentFilter, agentFilter, minLevel, maxLevel, maxGap, anchorDate, threeDaysAgoStr, anchorDate];
      const VIP_AFTER_TODAY = vipLevelCase("(c.total_deposit + t.day_deposit)");
      const VIP_AFTER_3DAY = vipLevelCase("(c.total_deposit + t3.amt)");

      const cohortCountRow = await env.daily_records_db
        .prepare(`${CTE} SELECT COUNT(*) as c FROM cohort_filtered`)
        .bind(...cteArgs)
        .first<{ c: number }>();
      const cohortSize = cohortCountRow?.c ?? 0;

      const upgradedTodayCountRow = await env.daily_records_db
        .prepare(
          `${CTE} SELECT COUNT(*) as c FROM cohort_filtered c JOIN today_dep t ON t.user_id = c.user_id
           WHERE ${VIP_AFTER_TODAY} > c.current_level`
        )
        .bind(...cteArgs)
        .first<{ c: number }>();
      const upgradedTodayCount = upgradedTodayCountRow?.c ?? 0;

      const upgraded3DayRow = await env.daily_records_db
        .prepare(
          `${CTE} SELECT COUNT(*) as c FROM cohort_filtered c JOIN three_day_dep t3 ON t3.user_id = c.user_id
           WHERE ${VIP_AFTER_3DAY} > c.current_level`
        )
        .bind(...cteArgs)
        .first<{ c: number }>();
      const upgraded3DayCount = upgraded3DayRow?.c ?? 0;

      const rows = await env.daily_records_db
        .prepare(
          `${CTE}
           SELECT c.user_id, COALESCE(c.agent, 'Unassigned') as agent, c.current_level as vip_before,
                  ${VIP_AFTER_TODAY} as vip_after, t.day_deposit,
                  (c.total_deposit + t.day_deposit) - c.next_level_min as amount_over_minimum
           FROM cohort_filtered c JOIN today_dep t ON t.user_id = c.user_id
           WHERE ${VIP_AFTER_TODAY} > c.current_level
           ORDER BY t.day_deposit DESC LIMIT ? OFFSET ?`
        )
        .bind(...cteArgs, pageSize, (page - 1) * pageSize)
        .all();

      return Response.json({
        date: anchorDate,
        tier,
        page,
        pageSize,
        total: upgradedTodayCount,
        totalPages: Math.max(1, Math.ceil(upgradedTodayCount / pageSize)),
        rows: rows.results,
        cohortSize,
        upgradedTodayCount,
        upgraded3DayCount,
      });
    }

    // Analytics page section 4 (panel 1): First-Deposit Day-1 Retention.
    // Cohort = yesterday's first-deposit users (same is_first_deposit flag
    // and date-anchoring as Action Center's Yesterday First Deposit Users).
    // "Deposited again" = any COMPLETE deposit from that same cohort today.
    if (url.pathname === "/api/dashboard/analytics/day1-retention" && request.method === "GET") {
      const scope = await requireDashboardOrAgentScope(request, env);
      if (scope instanceof Response) return scope;
      const { agentFilter } = scope;

      const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
      const pageSize = 10;
      const anchorDate = url.searchParams.get("date") || todayIST();
      const yesterday = new Date(anchorDate + "T00:00:00Z");
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);

      const CTE = `WITH cohort AS (
          SELECT user_id, MIN(region) as region FROM deposits
          WHERE is_first_deposit = 1 AND date(create_time) = ? AND user_id IS NOT NULL
            AND user_id NOT IN (SELECT user_id FROM users WHERE is_banned = 1)
            AND (? IS NULL OR user_id IN (SELECT user_id FROM users WHERE assigned_agent = ?))
          GROUP BY user_id
        ),
        today_dep AS (
          SELECT user_id, SUM(amount) as day_deposit, COUNT(*) as deposit_count
          FROM deposits WHERE date(create_time) = ? AND status = 'COMPLETE' AND user_id IS NOT NULL GROUP BY user_id
        )`;
      const cteArgs = [yesterdayStr, agentFilter, agentFilter, anchorDate];

      const cohortCountRow = await env.daily_records_db
        .prepare(`${CTE} SELECT COUNT(*) as c FROM cohort`)
        .bind(...cteArgs)
        .first<{ c: number }>();
      const cohortSize = cohortCountRow?.c ?? 0;

      const retainedAggRow = await env.daily_records_db
        .prepare(
          `${CTE} SELECT COUNT(*) as c, COALESCE(SUM(t.day_deposit), 0) as total_deposit
           FROM cohort c JOIN today_dep t ON t.user_id = c.user_id`
        )
        .bind(...cteArgs)
        .first<{ c: number; total_deposit: number }>();
      const retainedCount = retainedAggRow?.c ?? 0;
      const avgDeposit = retainedCount > 0 ? (retainedAggRow?.total_deposit ?? 0) / retainedCount : 0;

      const rows = await env.daily_records_db
        .prepare(
          `${CTE}
           SELECT c.user_id, COALESCE(u.assigned_agent, 'Unassigned') as agent,
                  t.day_deposit, t.deposit_count,
                  COALESCE(u.city, c.region, 'Unknown') as region
           FROM cohort c JOIN today_dep t ON t.user_id = c.user_id
           LEFT JOIN users u ON u.user_id = c.user_id
           ORDER BY t.day_deposit DESC LIMIT ? OFFSET ?`
        )
        .bind(...cteArgs, pageSize, (page - 1) * pageSize)
        .all();

      return Response.json({
        date: anchorDate,
        page,
        pageSize,
        total: retainedCount,
        totalPages: Math.max(1, Math.ceil(retainedCount / pageSize)),
        rows: rows.results,
        cohortSize,
        retainedCount,
        avgDeposit,
      });
    }

    // Analytics page section 4 (panels 3-4): Premium Active. Cohort = every
    // user currently in the given VIP bracket (via total_deposit),
    // regardless of activity status — NOT the Active Users definition used
    // in Action Center (which additionally requires recent activity).
    // "Deposited today" = any COMPLETE deposit from that cohort today.
    if (url.pathname === "/api/dashboard/analytics/premium-active" && request.method === "GET") {
      const scope = await requireDashboardOrAgentScope(request, env);
      if (scope instanceof Response) return scope;
      const { agentFilter } = scope;

      const tier = url.searchParams.get("tier") === "high" ? "high" : "low";
      const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
      const pageSize = 10;
      const anchorDate = url.searchParams.get("date") || todayIST();
      // Cohort deliberately matches Action Center's Active Users exactly
      // (same VIP bracket + inactive_days<=maxDays window, same [10,15]
      // day caps per tier) — "Premium Active" used to mean "everyone
      // currently in this VIP bracket" with no activity requirement,
      // which diverged from Action Center's cohort of the same name.
      // Analytics is meant to be built from Action Center's own cohorts,
      // so this now reuses that exact definition.
      const [minLevel, maxLevel, maxDays] = tier === "low" ? [2, 4, 10] : [5, 14, 15];

      const CURRENT_LEVEL = vipLevelCase("total_deposit");

      const CTE = `WITH cohort AS (
          SELECT user_id, assigned_agent as agent, ${CURRENT_LEVEL} as current_level,
                 CAST((julianday('now') - julianday(last_active_time)) AS INTEGER) as inactive_days
          FROM users WHERE total_deposit IS NOT NULL AND last_active_time IS NOT NULL AND is_banned = 0
            AND (? IS NULL OR assigned_agent = ?)
        ),
        cohort_filtered AS (
          SELECT * FROM cohort WHERE current_level BETWEEN ? AND ? AND inactive_days BETWEEN 0 AND ?
        ),
        today_dep AS (
          SELECT user_id, SUM(amount) as day_deposit, COUNT(*) as deposit_count
          FROM deposits WHERE date(create_time) = ? AND status = 'COMPLETE' AND user_id IS NOT NULL GROUP BY user_id
        )`;
      const cteArgs = [agentFilter, agentFilter, minLevel, maxLevel, maxDays, anchorDate];

      const cohortCountRow = await env.daily_records_db
        .prepare(`${CTE} SELECT COUNT(*) as c FROM cohort_filtered`)
        .bind(...cteArgs)
        .first<{ c: number }>();
      const cohortSize = cohortCountRow?.c ?? 0;

      const retainedAggRow = await env.daily_records_db
        .prepare(
          `${CTE} SELECT COUNT(*) as c, COALESCE(SUM(t.day_deposit), 0) as total_deposit
           FROM cohort_filtered c JOIN today_dep t ON t.user_id = c.user_id`
        )
        .bind(...cteArgs)
        .first<{ c: number; total_deposit: number }>();
      const retainedCount = retainedAggRow?.c ?? 0;
      const avgDeposit = retainedCount > 0 ? (retainedAggRow?.total_deposit ?? 0) / retainedCount : 0;

      const rows = await env.daily_records_db
        .prepare(
          `${CTE}
           SELECT c.user_id, COALESCE(c.agent, 'Unassigned') as agent, c.current_level,
                  t.day_deposit, t.deposit_count
           FROM cohort_filtered c JOIN today_dep t ON t.user_id = c.user_id
           ORDER BY t.day_deposit DESC LIMIT ? OFFSET ?`
        )
        .bind(...cteArgs, pageSize, (page - 1) * pageSize)
        .all();

      return Response.json({
        date: anchorDate,
        tier,
        page,
        pageSize,
        total: retainedCount,
        totalPages: Math.max(1, Math.ceil(retainedCount / pageSize)),
        rows: rows.results,
        cohortSize,
        retainedCount,
        avgDeposit,
      });
    }

    // Performance page: Monthly Leaderboard & Incentives + Daily/Range
    // Performance table. 7 KPIs per agent (equal weight): reactivation
    // low/high, retention, VIP upgrade low/high, premium active low/high —
    // each is the same metric already built for Action Center/Analytics,
    // just grouped by assigned_agent instead of site-wide. A KPI with a
    // denominator of 0 (agent has no users in that cohort) is excluded
    // from the agent's score average entirely, not counted as 0% — matches
    // the "No users assigned -- excluded, not counted against them" legend.
    // Incentive bracket amounts are NOT computed here, only displayed as
    // static reference text — no payout logic exists yet.
    if (url.pathname === "/api/dashboard/performance" && request.method === "GET") {
      const scope = await requireDashboardOrAgentScope(request, env);
      if (scope instanceof Response) return scope;

      const anchorDate = url.searchParams.get("date") || todayIST();
      const rangeParam = url.searchParams.get("range") || "today";
      // ~8 grouped SQL queries per load (4 KPIs x rangeKPIs/monthKPIs) —
      // cache the whole computed response for a short window. Source data
      // only changes on sync (roughly hourly), so this trades negligible
      // staleness for a big cut in repeat-load cost. See lib/cache.ts.
      //
      // Deliberate exception to per-agent scoping: unlike every other
      // Agent Dashboard page, Performance is shown UNSCOPED to agent
      // sessions too — every agent sees the full leaderboard/daily table
      // for all agents, same as the admin view. Confirmed explicitly by
      // the user (2026-07-12): this is a one-page-only exception, every
      // other agent-facing endpoint keeps its normal per-agent scoping.
      const payload = await cachedJson(env, `performance:${anchorDate}:${rangeParam}`, () => computePerformancePayload(env, anchorDate, rangeParam));
      return Response.json(payload);
    }
    async function computePerformancePayload(env: Env, anchorDate: string, rangeParam: string) {
      const rangeStart = (() => {
        const d = new Date(anchorDate + "T00:00:00Z");
        if (rangeParam === "yesterday") { d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); }
        if (rangeParam === "7d") { d.setUTCDate(d.getUTCDate() - 6); return d.toISOString().slice(0, 10); }
        if (rangeParam === "30d") { d.setUTCDate(d.getUTCDate() - 29); return d.toISOString().slice(0, 10); }
        if (rangeParam === "35d") { d.setUTCDate(d.getUTCDate() - 34); return d.toISOString().slice(0, 10); }
        return anchorDate; // "today" and any custom single-date selection
      })();
      const rangeEnd = rangeParam === "yesterday" ? rangeStart : anchorDate;

      const CURRENT_LEVEL = vipLevelCase("total_deposit");
      const NEXT_LEVEL_MIN = vipNextLevelMinCase("total_deposit");
      const vipLevel = (totalDeposit: number): number => {
        const brackets = [100, 600, 5600, 15600, 95600, 295600, 795600, 1795600, 3795600, 8795600, 16795600, 28795600, 44795600, 69795600];
        for (let i = 0; i < brackets.length; i++) if (totalDeposit < brackets[i]) return i;
        return 14;
      };

      type Ratio = { num: number; den: number };
      type AgentKPIs = {
        reactivationLow: Ratio; reactivationHigh: Ratio; retention: Ratio;
        vipUpgradeLow: Ratio; vipUpgradeHigh: Ratio; premiumActiveLow: Ratio; premiumActiveHigh: Ratio;
      };

      async function computeAgentKPIs(start: string, end: string): Promise<Record<string, AgentKPIs>> {
        const agents: Record<string, AgentKPIs> = {};
        const ensure = (agent: string) => {
          if (!agents[agent]) {
            agents[agent] = {
              reactivationLow: { num: 0, den: 0 }, reactivationHigh: { num: 0, den: 0 }, retention: { num: 0, den: 0 },
              vipUpgradeLow: { num: 0, den: 0 }, vipUpgradeHigh: { num: 0, den: 0 },
              premiumActiveLow: { num: 0, den: 0 }, premiumActiveHigh: { num: 0, den: 0 },
            };
          }
          return agents[agent];
        };

        // Number of calendar days in [start,end] inclusive — used to scale
        // the fixed daily targets below ("30 per day" over a 7-day range
        // means a 210 target, not literally 30).
        const days = Math.round((new Date(end + "T00:00:00Z").getTime() - new Date(start + "T00:00:00Z").getTime()) / 86400000) + 1;

        // The 4 blocks below (reactivation, VIP upgrade, premium active,
        // retention) are fully independent of each other — different KPI
        // keys, no shared intermediate state — so they run concurrently via
        // the outer Promise.all instead of one after another. Same for the
        // low/high pair within each block. This is the fix for the page
        // being slow: it was ~70-80 sequential D1 round-trips per load
        // before (worse on 30/35-day ranges, where retention alone used to
        // loop once per calendar day).
        const reactivationTask = Promise.all(([
          ["reactivationLow", 2, 4, 10, 180, 30], ["reactivationHigh", 5, 14, 15, 240, 10],
        ] as [keyof AgentKPIs, number, number, number, number, number][]).map(async ([key, minLevel, maxLevel, minDays, maxDays, target]) => {
          const denRows = await env.daily_records_db
            .prepare(
              `SELECT COALESCE(assigned_agent,'Unassigned') as agent, COUNT(*) as c FROM (
                 SELECT assigned_agent, ${CURRENT_LEVEL} as current_level,
                        CAST((julianday('now') - julianday(last_active_time)) AS INTEGER) as inactive_days
                 FROM users WHERE total_deposit IS NOT NULL AND last_active_time IS NOT NULL
               ) WHERE current_level BETWEEN ? AND ? AND inactive_days BETWEEN ? AND ? GROUP BY agent`
            )
            .bind(minLevel, maxLevel, minDays, maxDays)
            .all<{ agent: string; c: number }>();
          denRows.results.forEach((r) => { if (r.c > 0) ensure(r.agent)[key].den = target * days; });

          const numRows = await env.daily_records_db
            .prepare(
              `WITH range_depositors AS (
                 SELECT DISTINCT user_id FROM deposits WHERE date(create_time) BETWEEN ? AND ? AND status = 'COMPLETE' AND user_id IS NOT NULL
               )
               SELECT COALESCE(u.assigned_agent,'Unassigned') as agent, COUNT(*) as c
               FROM users u JOIN range_depositors d ON d.user_id = u.user_id
               WHERE u.total_deposit IS NOT NULL AND u.last_active_time IS NOT NULL
                 AND ${CURRENT_LEVEL.replace(/total_deposit/g, "u.total_deposit")} BETWEEN ? AND ?
                 AND CAST((julianday('now') - julianday(u.last_active_time)) AS INTEGER) BETWEEN ? AND ?
               GROUP BY agent`
            )
            .bind(start, end, minLevel, maxLevel, minDays, maxDays)
            .all<{ agent: string; c: number }>();
          numRows.results.forEach((r) => { ensure(r.agent)[key].num = r.c; });
        }));

        // VIP Upgrade (low/high): fixed daily target (10/5), scaled by days
        // in range — NOT a ratio against near-upgrade cohort size. Same
        // "cohort presence decides no-users-assigned, target decides the
        // displayed denominator" split as Reactivation above.
        const vipUpgradeTask = Promise.all(([
          ["vipUpgradeLow", 2, 4, 1000, 10], ["vipUpgradeHigh", 5, 13, 50000, 5],
        ] as [keyof AgentKPIs, number, number, number, number][]).map(async ([key, minLevel, maxLevel, maxGap, target]) => {
          const cohortRows = await env.daily_records_db
            .prepare(
              `SELECT COALESCE(assigned_agent,'Unassigned') as agent, COUNT(*) as c FROM (
                 SELECT assigned_agent, ${CURRENT_LEVEL} as current_level, ${NEXT_LEVEL_MIN} as next_level_min, total_deposit
                 FROM users WHERE total_deposit IS NOT NULL
               ) WHERE next_level_min IS NOT NULL AND current_level BETWEEN ? AND ?
                 AND (next_level_min - total_deposit) BETWEEN 1 AND ? GROUP BY agent`
            )
            .bind(minLevel, maxLevel, maxGap)
            .all<{ agent: string; c: number }>();
          cohortRows.results.forEach((r) => { if (r.c > 0) ensure(r.agent)[key].den = target * days; });

          const numRows = await env.daily_records_db
            .prepare(
              `WITH range_deposits AS (
                 SELECT user_id, SUM(amount) as amt FROM deposits WHERE date(create_time) BETWEEN ? AND ? AND status = 'COMPLETE' AND user_id IS NOT NULL GROUP BY user_id
               )
               SELECT agent, COUNT(*) as c FROM (
                 SELECT COALESCE(u.assigned_agent,'Unassigned') as agent, u.total_deposit,
                        ${CURRENT_LEVEL.replace(/total_deposit/g, "u.total_deposit")} as current_level,
                        ${NEXT_LEVEL_MIN.replace(/total_deposit/g, "u.total_deposit")} as next_level_min,
                        ${CURRENT_LEVEL.replace(/total_deposit/g, "(u.total_deposit + d.amt)")} as vip_after
                 FROM users u JOIN range_deposits d ON d.user_id = u.user_id
                 WHERE u.total_deposit IS NOT NULL
               ) WHERE next_level_min IS NOT NULL AND current_level BETWEEN ? AND ?
                 AND (next_level_min - total_deposit) BETWEEN 1 AND ? AND vip_after > current_level
               GROUP BY agent`
            )
            .bind(start, end, minLevel, maxLevel, maxGap)
            .all<{ agent: string; c: number }>();
          numRows.results.forEach((r) => { ensure(r.agent)[key].num = r.c; });
        }));

        // Premium Active (low/high): denominator = agent's Action Center
        // "Active Users" cohort for that tier — same is_banned=0 and
        // inactive_days BETWEEN 0 AND maxDays (10 low / 15 high) definition
        // as /api/dashboard/action-center/active-users, not just "every
        // user in the VIP bracket" (that included dormant/banned users and
        // made the rate look artificially tiny). Numerator = of that same
        // active cohort, who deposited anywhere in [start,end].
        const premiumActiveTask = Promise.all(([
          ["premiumActiveLow", 2, 4, 10], ["premiumActiveHigh", 5, 14, 15],
        ] as [keyof AgentKPIs, number, number, number][]).map(async ([key, minLevel, maxLevel, maxDays]) => {
          const cohortRows = await env.daily_records_db
            .prepare(
              `SELECT COALESCE(assigned_agent,'Unassigned') as agent, COUNT(*) as c FROM (
                 SELECT assigned_agent, ${CURRENT_LEVEL} as current_level,
                        CAST((julianday('now') - julianday(last_active_time)) AS INTEGER) as inactive_days
                 FROM users WHERE total_deposit IS NOT NULL AND last_active_time IS NOT NULL AND is_banned = 0
               ) WHERE current_level BETWEEN ? AND ? AND inactive_days BETWEEN 0 AND ? GROUP BY agent`
            )
            .bind(minLevel, maxLevel, maxDays)
            .all<{ agent: string; c: number }>();
          cohortRows.results.forEach((r) => { ensure(r.agent)[key].den = r.c; });

          const numRows = await env.daily_records_db
            .prepare(
              `WITH range_depositors AS (
                 SELECT DISTINCT user_id FROM deposits WHERE date(create_time) BETWEEN ? AND ? AND status = 'COMPLETE' AND user_id IS NOT NULL
               )
               SELECT COALESCE(u.assigned_agent,'Unassigned') as agent, COUNT(*) as c
               FROM users u JOIN range_depositors d ON d.user_id = u.user_id
               WHERE u.total_deposit IS NOT NULL AND u.last_active_time IS NOT NULL AND u.is_banned = 0
                 AND ${CURRENT_LEVEL.replace(/total_deposit/g, "u.total_deposit")} BETWEEN ? AND ?
                 AND CAST((julianday('now') - julianday(u.last_active_time)) AS INTEGER) BETWEEN 0 AND ?
               GROUP BY agent`
            )
            .bind(start, end, minLevel, maxLevel, maxDays)
            .all<{ agent: string; c: number }>();
          numRows.results.forEach((r) => { ensure(r.agent)[key].num = r.c; });
        }));

        // Retention: no VIP split. The cohort ("yesterday's first-deposit
        // users") refreshes daily, but instead of looping per day (N days
        // = N x 3 queries — the single biggest cost on 30/35-day ranges),
        // fetch the whole cohort window and the whole deposit window each
        // in ONE query, then match in memory. cohort_day + 1 day is the
        // "did they come back" day for that user.
        const retentionTask = (async () => {
          const cohortWindowStart = (() => {
            const d = new Date(start + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10);
          })();
          const cohortWindowEnd = (() => {
            const d = new Date(end + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10);
          })();
          const retentionRows = await env.daily_records_db
            .prepare(
              `WITH first_deposits AS (
                 SELECT DISTINCT user_id, date(create_time) as cohort_day FROM deposits
                 WHERE is_first_deposit = 1 AND date(create_time) BETWEEN ? AND ? AND user_id IS NOT NULL
               ),
               deposit_days AS (
                 SELECT DISTINCT user_id, date(create_time) as dep_day FROM deposits
                 WHERE date(create_time) BETWEEN ? AND ? AND status = 'COMPLETE' AND user_id IS NOT NULL
               )
               SELECT COALESCE(u.assigned_agent,'Unassigned') as agent,
                      COUNT(*) as den,
                      SUM(CASE WHEN dd.user_id IS NOT NULL THEN 1 ELSE 0 END) as num
               FROM first_deposits fd
               JOIN users u ON u.user_id = fd.user_id
               LEFT JOIN deposit_days dd ON dd.user_id = fd.user_id AND dd.dep_day = date(fd.cohort_day, '+1 day')
               GROUP BY agent`
            )
            .bind(cohortWindowStart, cohortWindowEnd, start, end)
            .all<{ agent: string; den: number; num: number }>();
          retentionRows.results.forEach((r) => {
            ensure(r.agent).retention.den += r.den;
            ensure(r.agent).retention.num += r.num;
          });
        })();

        await Promise.all([reactivationTask, vipUpgradeTask, premiumActiveTask, retentionTask]);
        return agents;
      }

      const monthStart = anchorDate.slice(0, 8) + "01";
      const sameRange = anchorDate === monthStart && rangeStart === monthStart && rangeEnd === anchorDate;
      const [rangeKPIs, monthKPIs] = sameRange
        ? await computeAgentKPIs(rangeStart, rangeEnd).then((r) => [r, r] as const)
        : await Promise.all([computeAgentKPIs(rangeStart, rangeEnd), computeAgentKPIs(monthStart, anchorDate)]);

      const scoreOf = (kpis: AgentKPIs): { pct: number | null; kpiPcts: Record<string, number | null> } => {
        const entries = Object.entries(kpis) as [string, Ratio][];
        const pcts: Record<string, number | null> = {};
        const validPcts: number[] = [];
        entries.forEach(([k, v]) => {
          if (v.den === 0) { pcts[k] = null; return; }
          const pct = (v.num / v.den) * 100;
          pcts[k] = pct;
          validPcts.push(pct);
        });
        const overall = validPcts.length > 0 ? validPcts.reduce((s, v) => s + v, 0) / validPcts.length : null;
        return { pct: overall, kpiPcts: pcts };
      };

      const agentNames = Array.from(new Set([...Object.keys(rangeKPIs), ...Object.keys(monthKPIs)])).filter((a) => a !== "Unassigned");

      const dailyTable = agentNames
        .map((agent) => {
          const kpis = rangeKPIs[agent] ?? {
            reactivationLow: { num: 0, den: 0 }, reactivationHigh: { num: 0, den: 0 }, retention: { num: 0, den: 0 },
            vipUpgradeLow: { num: 0, den: 0 }, vipUpgradeHigh: { num: 0, den: 0 }, premiumActiveLow: { num: 0, den: 0 }, premiumActiveHigh: { num: 0, den: 0 },
          };
          const { pct, kpiPcts } = scoreOf(kpis);
          return { agent, kpis, kpiPcts, score: pct };
        })
        .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

      const monthlyLeaderboard = agentNames
        .map((agent) => {
          const kpis = monthKPIs[agent] ?? {
            reactivationLow: { num: 0, den: 0 }, reactivationHigh: { num: 0, den: 0 }, retention: { num: 0, den: 0 },
            vipUpgradeLow: { num: 0, den: 0 }, vipUpgradeHigh: { num: 0, den: 0 }, premiumActiveLow: { num: 0, den: 0 }, premiumActiveHigh: { num: 0, den: 0 },
          };
          const { pct } = scoreOf(kpis);
          return { agent, score: pct };
        })
        .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
        .slice(0, 3);

      return {
        date: anchorDate,
        range: rangeParam,
        rangeStart,
        rangeEnd,
        monthStart,
        dailyTable,
        monthlyLeaderboard,
      };
    }

    // Platform Analysis section 1, panel 1: Profit Users of the Day. Ranked
    // by CURRENT wallet balance (users.user_balance), not today's activity —
    // "who's sitting on the most money right now", same intent as the
    // reference design. Today's deposit/withdrawal and last-activity dates
    // are joined in per user so the table stays accurate even for users who
    // didn't transact today. newOnly filters to accounts registered in the
    // last 3 days (users.create_time) — the "3 Days New User" toggle.
    if (url.pathname === "/api/dashboard/platform-analysis/profit-users" && request.method === "GET") {
      const authFail = requireAdmin(request, env, "dashboard");
      if (authFail) return authFail;

      const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
      const pageSize = 10;
      const anchorDate = url.searchParams.get("date") || todayIST();
      const newOnly = url.searchParams.get("newOnly") === "1";
      const threeDaysAgo = new Date(anchorDate + "T00:00:00Z");
      threeDaysAgo.setUTCDate(threeDaysAgo.getUTCDate() - 3);
      const threeDaysAgoStr = threeDaysAgo.toISOString().slice(0, 10);

      const newUserFilter = newOnly ? `AND u.create_time >= ?` : "";
      const newUserArgs = newOnly ? [threeDaysAgoStr] : [];

      const CTE = `WITH today_dep AS (
          SELECT user_id, SUM(amount) as dep FROM deposits
          WHERE date(create_time) = ? AND status = 'COMPLETE' AND user_id IS NOT NULL GROUP BY user_id
        ),
        today_wd AS (
          SELECT user_id, SUM(amount) as wd FROM withdrawals
          WHERE date(create_time) = ? AND CAST(status AS REAL) = 2 AND user_id IS NOT NULL GROUP BY user_id
        ),
        last_dep AS (
          SELECT user_id, MAX(create_time) as t FROM deposits WHERE status = 'COMPLETE' AND user_id IS NOT NULL GROUP BY user_id
        ),
        last_wd AS (
          SELECT user_id, MAX(create_time) as t FROM withdrawals WHERE CAST(status AS REAL) = 2 AND user_id IS NOT NULL GROUP BY user_id
        )`;

      const countRow = await env.daily_records_db
        .prepare(`SELECT COUNT(*) as c FROM users u WHERE u.user_balance IS NOT NULL AND u.is_banned = 0 ${newUserFilter}`)
        .bind(...newUserArgs)
        .first<{ c: number }>();
      const total = countRow?.c ?? 0;

      const rows = await env.daily_records_db
        .prepare(
          `${CTE}
           SELECT u.user_id, COALESCE(u.assigned_agent, 'Unassigned') as agent,
                  ${vipLevelCase("u.total_deposit")} as vip,
                  COALESCE(td.dep, 0) as dep_today, u.user_balance as wallet_bal,
                  COALESCE(tw.wd, 0) as wd_today,
                  COALESCE(td.dep, 0) - COALESCE(tw.wd, 0) as net_dep,
                  ld.t as last_dep, lw.t as last_wd
           FROM users u
           LEFT JOIN today_dep td ON td.user_id = u.user_id
           LEFT JOIN today_wd tw ON tw.user_id = u.user_id
           LEFT JOIN last_dep ld ON ld.user_id = u.user_id
           LEFT JOIN last_wd lw ON lw.user_id = u.user_id
           WHERE u.user_balance IS NOT NULL AND u.is_banned = 0 ${newUserFilter}
           ORDER BY u.user_balance DESC LIMIT ? OFFSET ?`
        )
        .bind(anchorDate, anchorDate, ...newUserArgs, pageSize, (page - 1) * pageSize)
        .all();

      return Response.json({
        date: anchorDate,
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        rows: rows.results,
      });
    }

    // Platform Analysis section 1, panel 2: Suspicious Withdraw Users.
    // Matches the reference design's "deposit-and-cash-out without genuine
    // play" definition. There's no dedicated game-session table, but
    // wallet_details (the "detail export" source) turns out to be a
    // per-event transaction log — confirmed live: active users log
    // hundreds to thousands of wallet_details rows/day, while a handful of
    // flagged deposit+withdraw users had as few as 5 in the same window.
    // COUNT(*) of wallet_details rows per user in the window is used as
    // the games-played count. Flags: deposited Rs 1000+ AND requested a
    // withdrawal (status 0=In-Review/1=Processing/2=Complete) AND fewer
    // than 50 wallet_details rows, all within the same trailing 3-day
    // window.
    if (url.pathname === "/api/dashboard/platform-analysis/suspicious-withdrawals" && request.method === "GET") {
      const authFail = requireAdmin(request, env, "dashboard");
      if (authFail) return authFail;

      const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
      const pageSize = 10;
      const anchorDate = url.searchParams.get("date") || todayIST();
      const threeDaysAgo = new Date(anchorDate + "T00:00:00Z");
      threeDaysAgo.setUTCDate(threeDaysAgo.getUTCDate() - 3);
      const threeDaysAgoStr = threeDaysAgo.toISOString().slice(0, 10);

      const CTE = `WITH dep3d AS (
          SELECT user_id, SUM(amount) as dep FROM deposits
          WHERE date(create_time) BETWEEN ? AND ? AND status = 'COMPLETE' AND user_id IS NOT NULL
          GROUP BY user_id HAVING SUM(amount) >= 1000
        ),
        wd3d AS (
          SELECT user_id, SUM(amount) as wd FROM withdrawals
          WHERE date(create_time) BETWEEN ? AND ? AND CAST(status AS REAL) IN (0,1,2) AND user_id IS NOT NULL
          GROUP BY user_id
        ),
        games3d AS (
          SELECT user_id, COUNT(*) as games FROM wallet_details
          WHERE date(create_time) BETWEEN ? AND ? AND user_id IS NOT NULL
          GROUP BY user_id
        ),
        flagged AS (
          SELECT d.user_id, d.dep, w.wd, COALESCE(g.games, 0) as games
          FROM dep3d d JOIN wd3d w ON w.user_id = d.user_id
          LEFT JOIN games3d g ON g.user_id = d.user_id
          WHERE COALESCE(g.games, 0) < 50
            AND d.user_id NOT IN (SELECT user_id FROM users WHERE is_banned = 1)
        )`;
      const cteArgs = [threeDaysAgoStr, anchorDate, threeDaysAgoStr, anchorDate, threeDaysAgoStr, anchorDate];

      const countRow = await env.daily_records_db
        .prepare(`${CTE} SELECT COUNT(*) as c FROM flagged`)
        .bind(...cteArgs)
        .first<{ c: number }>();
      const total = countRow?.c ?? 0;

      const rows = await env.daily_records_db
        .prepare(
          `${CTE}
           SELECT f.user_id, COALESCE(u.assigned_agent, 'Unassigned') as agent,
                  ${vipLevelCase("u.total_deposit")} as vip, f.dep as deposit_3d, f.wd as withdraw_3d, f.games as games_3d
           FROM flagged f LEFT JOIN users u ON u.user_id = f.user_id
           ORDER BY f.wd DESC LIMIT ? OFFSET ?`
        )
        .bind(...cteArgs, pageSize, (page - 1) * pageSize)
        .all();

      return Response.json({
        date: anchorDate,
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        rows: rows.results,
      });
    }

    // Platform Analysis section 2, panel 1: Channel performance — 4-day
    // combined. "Channel" here is deposits.marketing_channel — the raw
    // "channel" export header (values like "B02", "rupiibet"), which is a
    // DIFFERENT field from deposits.channel ("pay channel" — the payment
    // gateway, e.g. "Pay Center-rushPay"; used by Deposit Channel
    // Analysis, don't confuse the two). Went through two wrong fields
    // before landing here: first deposits.channel (payment gateway, not
    // marketing), then users.register_channel (semantically correct but
    // only ever populated by a one-time manual master-file upload — every
    // user who registered after the last upload has it NULL, which was
    // 100% of the panel's very-recent first-deposit cohort). marketing_channel
    // is fresh on every deposit row regardless of upload history.
    // Cohort = every first-deposit user whose first deposit fell in the
    // trailing 4-day window ending yesterday (so D2/D3 checks have a
    // chance to have happened). D2/D3 users = cohort members who made
    // another COMPLETE deposit on exactly their first-deposit day + 2 / +3
    // (same relative-day join pattern as the Analytics page's Day-1
    // Retention panel, extended one/two days further). Quality is a
    // heuristic, not from any documented business rule: a channel whose
    // average first deposit is far above the norm is flagged "High value"
    // regardless of return behavior; otherwise it's graded on D2 return
    // rate (>=25% good, >=15% average, else weak).
    if (url.pathname === "/api/dashboard/platform-analysis/channel-performance" && request.method === "GET") {
      const authFail = requireAdmin(request, env, "dashboard");
      if (authFail) return authFail;

      const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
      const pageSize = 10;
      const anchorDate = url.searchParams.get("date") || todayIST();
      const cohortEnd = new Date(anchorDate + "T00:00:00Z");
      cohortEnd.setUTCDate(cohortEnd.getUTCDate() - 1);
      const cohortEndStr = cohortEnd.toISOString().slice(0, 10);
      const cohortStart = new Date(anchorDate + "T00:00:00Z");
      cohortStart.setUTCDate(cohortStart.getUTCDate() - 4);
      const cohortStartStr = cohortStart.toISOString().slice(0, 10);

      const CTE = `WITH fd AS (
          SELECT user_id, COALESCE(marketing_channel, 'Unknown') as channel, date(create_time) as fd_day, amount
          FROM deposits
          WHERE is_first_deposit = 1 AND date(create_time) BETWEEN ? AND ? AND user_id IS NOT NULL
        ),
        dep_days AS (
          SELECT DISTINCT user_id, date(create_time) as dep_day FROM deposits
          WHERE status = 'COMPLETE' AND user_id IS NOT NULL AND date(create_time) BETWEEN ? AND ?
        ),
        channel_stats AS (
          SELECT fd.channel, COUNT(*) as fd_users, SUM(fd.amount) as fd_amount,
                 SUM(CASE WHEN d2.user_id IS NOT NULL THEN 1 ELSE 0 END) as d2_users,
                 SUM(CASE WHEN d3.user_id IS NOT NULL THEN 1 ELSE 0 END) as d3_users
          FROM fd
          LEFT JOIN dep_days d2 ON d2.user_id = fd.user_id AND d2.dep_day = date(fd.fd_day, '+2 day')
          LEFT JOIN dep_days d3 ON d3.user_id = fd.user_id AND d3.dep_day = date(fd.fd_day, '+3 day')
          GROUP BY fd.channel
        )`;
      const cteArgs = [cohortStartStr, cohortEndStr, cohortStartStr, anchorDate];

      // Heaviest query on this page (3 CTEs incl. a self-join over the
      // deposits table's whole cohort window) and admin-only (no per-agent
      // scoping to worry about in the cache key) — key on date+page since
      // those are the only inputs, short TTL matching sync cadence.
      const payload = await cachedJson(env, `platform-analysis:channel-performance:${anchorDate}:${page}`, async () => {
        const countRow = await env.daily_records_db
          .prepare(`${CTE} SELECT COUNT(*) as c FROM channel_stats`)
          .bind(...cteArgs)
          .first<{ c: number }>();
        const total = countRow?.c ?? 0;

        const rows = await env.daily_records_db
          .prepare(
            `${CTE}
             SELECT channel, fd_users, fd_amount, fd_amount / fd_users as avg_fd,
                    d2_users, (100.0 * d2_users / fd_users) as d2_pct,
                    d3_users, (100.0 * d3_users / fd_users) as d3_pct
             FROM channel_stats
             ORDER BY fd_users DESC LIMIT ? OFFSET ?`
          )
          .bind(...cteArgs, pageSize, (page - 1) * pageSize)
          .all();

        return {
          date: anchorDate,
          cohortStart: cohortStartStr,
          cohortEnd: cohortEndStr,
          page,
          pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
          rows: rows.results,
        };
      });

      return Response.json(payload);
    }

    // Platform Analysis section 2, panel 2: Net Revenue by Region & VIP.
    // Deposit minus withdrawal (not just gross deposit volume) for the
    // most recent synced date — a region/tier can look like a top
    // performer by deposit total while actually net-negative once
    // withdrawals are subtracted (see VIP 1/2 below, both net-negative).
    // "Users" = anyone who deposited OR withdrew that day, not just
    // depositors. by=region groups on the same COALESCE(users.city,
    // deposit's own region, 'Unknown') fallback used elsewhere (state-level
    // vs city-level granularity mismatch); by=vip groups on the live VIP
    // bracket.
    if (url.pathname === "/api/dashboard/platform-analysis/net-revenue" && request.method === "GET") {
      const authFail = requireAdmin(request, env, "dashboard");
      if (authFail) return authFail;

      const by = url.searchParams.get("by") === "vip" ? "vip" : "region";
      const anchorDate = url.searchParams.get("date") || todayIST();

      const groupExpr = by === "vip" ? vipLevelCase("COALESCE(u.total_deposit, 0)") : "COALESCE(u.city, c.region, 'Unknown')";
      const label = by === "vip" ? "vip_level" : "region";

      // No FULL OUTER JOIN (not reliably supported here) — union the two
      // user-id sets instead, since a user might withdraw without
      // depositing that day (or vice versa) and still needs to be counted.
      const rows = await env.daily_records_db
        .prepare(
          `WITH day_dep AS (
             SELECT user_id, SUM(amount) as amt, MIN(region) as region FROM deposits
             WHERE date(create_time) = ? AND status = 'COMPLETE' AND user_id IS NOT NULL GROUP BY user_id
           ),
           day_wd AS (
             SELECT user_id, SUM(amount) as amt FROM withdrawals
             WHERE date(create_time) = ? AND CAST(status AS REAL) = 2 AND user_id IS NOT NULL GROUP BY user_id
           ),
           active_users AS (
             SELECT user_id FROM day_dep
             UNION
             SELECT user_id FROM day_wd
           ),
           combined AS (
             SELECT au.user_id, COALESCE(dd.amt, 0) as dep, COALESCE(dw.amt, 0) as wd, dd.region as region
             FROM active_users au
             LEFT JOIN day_dep dd ON dd.user_id = au.user_id
             LEFT JOIN day_wd dw ON dw.user_id = au.user_id
           )
           SELECT ${groupExpr} as ${label},
                  COALESCE(SUM(c.dep), 0) as total_deposit,
                  COALESCE(SUM(c.wd), 0) as total_withdrawal,
                  COALESCE(SUM(c.dep), 0) - COALESCE(SUM(c.wd), 0) as net_revenue,
                  COUNT(*) as users
           FROM combined c LEFT JOIN users u ON u.user_id = c.user_id
           GROUP BY ${groupExpr} ORDER BY net_revenue DESC LIMIT 20`
        )
        .bind(anchorDate, anchorDate)
        .all();

      return Response.json({ date: anchorDate, by, rows: rows.results });
    }

    // Platform Analysis section 3: Bonus Claim Report. "Bonus Category" =
    // wallet_details.game_name. Real signal (corrected per explicit
    // instruction): Game Name alone doesn't distinguish bonus credits from
    // real gameplay — both can have it populated (e.g. "Aviator" is a real
    // slot game). The actual bonus marker is source_name being blank —
    // every real gameplay row has a game-provider name there (OneApi,
    // InOut, KoolBet, etc.), confirmed only bonus-credit rows leave it
    // blank. A row counts as a bonus claim only when game_name is
    // non-blank AND source_name IS blank; the Game Name value itself is
    // the category. A user "claims" a category once per day if they have
    // any such row that day; claimed users = distinct users, total bonus =
    // sum of those rows' amounts. "Deposited after" = of those claimers,
    // how many made a COMPLETE deposit any time after their first claim of
    // that category in the window (unbounded going forward — deposits
    // data is naturally capped by its own 5-day rolling sync window
    // regardless).
    if (url.pathname === "/api/dashboard/platform-analysis/bonus-claims" && request.method === "GET") {
      const authFail = requireAdmin(request, env, "dashboard");
      if (authFail) return authFail;

      const period = url.searchParams.get("period") === "month" ? "month" : url.searchParams.get("period") === "week" ? "week" : "day";
      const anchorDate = url.searchParams.get("date") || todayIST();
      const rangeStart = (() => {
        const d = new Date(anchorDate + "T00:00:00Z");
        if (period === "week") { d.setUTCDate(d.getUTCDate() - 6); return d.toISOString().slice(0, 10); }
        if (period === "month") { d.setUTCDate(d.getUTCDate() - 29); return d.toISOString().slice(0, 10); }
        return anchorDate;
      })();

      const CTE = `WITH bonus_claims AS (
          SELECT user_id, game_name as category, MIN(create_time) as first_claim_time, COUNT(*) as claim_count, SUM(amount) as claim_amount
          FROM wallet_details
          WHERE game_name IS NOT NULL AND game_name != ''
            AND (source_name IS NULL OR source_name = '')
            AND date(create_time) BETWEEN ? AND ? AND user_id IS NOT NULL
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
        )`;

      const rows = await env.daily_records_db
        .prepare(
          `${CTE}
           SELECT ct.category, ct.claimed_users, ct.total_bonus,
                  COALESCE(dat.deposited_after, 0) as deposited_after,
                  COALESCE(dat.deposit_amount, 0) as deposit_amount,
                  (100.0 * COALESCE(dat.deposited_after, 0) / ct.claimed_users) as pct
           FROM category_totals ct LEFT JOIN dep_after_totals dat ON dat.category = ct.category
           ORDER BY ct.claimed_users DESC LIMIT 50`
        )
        .bind(rangeStart, anchorDate)
        .all();

      return Response.json({ date: anchorDate, period, rangeStart, rangeEnd: anchorDate, rows: rows.results });
    }

    // Platform Analysis section 0: Weekly Performance — This Week vs Last
    // Week. Same New/Old user definition as the New vs Old User Analysis
    // panel below (is_first_deposit=1 day = "new"), just rolled up from
    // daily rows into two week buckets instead of shown per-day. "This
    // week" = the current Monday-Sunday calendar week, however many days
    // have elapsed so far (a pace read, not final until Sunday); "last
    // week" = the most recent FULLY COMPLETE prior Monday-Sunday week.
    // Every count/avg metric is itself a per-day figure averaged across
    // the days in its bucket (elapsed days for this week, always 7 for
    // last week) — matching the "(7d avg)" label in the UI. Zero-filled
    // per day before averaging so a day with genuinely no deposits still
    // counts as 0 in the average instead of silently shrinking the day
    // count (same reasoning as the 7-day zero-fill in
    // /api/dashboard/withdrawal-analysis's completedLast4Days).
    //
    // Target vs Actual: TARGETS below are hardcoded placeholder business
    // targets — no target-setting table/UI exists yet, so these are not
    // derived from anything in the database. Update them here directly
    // until a real target source exists.
    if (url.pathname === "/api/dashboard/platform-analysis/weekly-performance" && request.method === "GET") {
      const authFail = requireAdmin(request, env, "dashboard");
      if (authFail) return authFail;

      const TARGETS = {
        oldUsersCount: 1800,
        avgDepositOldUsers: 1900,
        avgTotalDepositDay: 3900000,
        totalDepositorCountDay: 1900,
      };

      const anchorDate = url.searchParams.get("date") || todayIST();
      const mondayOf = (dateStr: string) => {
        const d = new Date(dateStr + "T00:00:00Z");
        const dow = d.getUTCDay(); // 0=Sun..6=Sat
        d.setUTCDate(d.getUTCDate() - ((dow + 6) % 7));
        return d.toISOString().slice(0, 10);
      };
      const addDays = (dateStr: string, n: number) => {
        const d = new Date(dateStr + "T00:00:00Z");
        d.setUTCDate(d.getUTCDate() + n);
        return d.toISOString().slice(0, 10);
      };

      const curWeekStart = mondayOf(anchorDate);
      const lastWeekStart = addDays(curWeekStart, -7);
      const lastWeekEnd = addDays(curWeekStart, -1);
      const rangeStart = lastWeekStart;
      const rangeEnd = anchorDate;

      // Same per-day dep/wd CTEs as new-vs-old below, just bounded to the
      // 2-week window and returned as one row per day instead of paginated.
      const dailyRows = await env.daily_records_db
        .prepare(
          `WITH dep AS (
             SELECT user_id, date(create_time) as d, amount, COALESCE(is_first_deposit, 0) as is_new
             FROM deposits WHERE status = 'COMPLETE' AND user_id IS NOT NULL AND date(create_time) BETWEEN ? AND ?
           ),
           dep_agg AS (
             SELECT d,
                    COUNT(DISTINCT CASE WHEN is_new = 0 THEN user_id END) as old_users,
                    COALESCE(SUM(CASE WHEN is_new = 0 THEN amount END), 0) as old_total,
                    COUNT(DISTINCT CASE WHEN is_new = 1 THEN user_id END) as new_users,
                    COALESCE(SUM(CASE WHEN is_new = 1 THEN amount END), 0) as new_total,
                    COUNT(DISTINCT user_id) as total_depositors,
                    COALESCE(SUM(amount), 0) as total_deposit
             FROM dep GROUP BY d
           ),
           first_dep AS (
             SELECT user_id, MIN(date(create_time)) as first_dep_date
             FROM deposits WHERE is_first_deposit = 1 AND user_id IS NOT NULL GROUP BY user_id
           ),
           wd AS (
             SELECT w.user_id, date(w.create_time) as d, w.amount,
                    CASE WHEN fd.first_dep_date = date(w.create_time) THEN 1 ELSE 0 END as is_new
             FROM withdrawals w LEFT JOIN first_dep fd ON fd.user_id = w.user_id
             WHERE CAST(w.status AS REAL) = 2 AND w.user_id IS NOT NULL AND date(w.create_time) BETWEEN ? AND ?
           ),
           wd_agg AS (
             SELECT d,
                    COUNT(DISTINCT CASE WHEN is_new = 0 THEN user_id END) as old_wd_users,
                    COALESCE(SUM(CASE WHEN is_new = 0 THEN amount END), 0) as old_wd_total,
                    COUNT(DISTINCT CASE WHEN is_new = 1 THEN user_id END) as new_wd_users,
                    COALESCE(SUM(CASE WHEN is_new = 1 THEN amount END), 0) as new_wd_total
             FROM wd GROUP BY d
           )
           SELECT da.d as date,
                  da.old_users, da.old_total, da.new_users, da.new_total,
                  COALESCE(wa.old_wd_users, 0) as old_wd_users, COALESCE(wa.old_wd_total, 0) as old_wd_total,
                  COALESCE(wa.new_wd_users, 0) as new_wd_users, COALESCE(wa.new_wd_total, 0) as new_wd_total,
                  da.total_deposit, da.total_depositors
           FROM dep_agg da LEFT JOIN wd_agg wa ON wa.d = da.d`
        )
        .bind(rangeStart, rangeEnd, rangeStart, rangeEnd)
        .all<{
          date: string; old_users: number; old_total: number; new_users: number; new_total: number;
          old_wd_users: number; old_wd_total: number; new_wd_users: number; new_wd_total: number;
          total_deposit: number; total_depositors: number;
        }>();

      const byDate = new Map(dailyRows.results.map((r) => [r.date, r]));
      const zeroRow = { old_users: 0, old_total: 0, new_users: 0, new_total: 0, old_wd_users: 0, old_wd_total: 0, new_wd_users: 0, new_wd_total: 0, total_deposit: 0, total_depositors: 0 };
      const daysInclusive = (start: string, end: string) => {
        const out: string[] = [];
        for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
        return out;
      };
      const curWeekDays = daysInclusive(curWeekStart, anchorDate);
      const lastWeekDays = daysInclusive(lastWeekStart, lastWeekEnd);

      const bucketAvg = (days: string[]) => {
        const rows = days.map((d) => byDate.get(d) ?? zeroRow);
        const n = days.length || 1;
        const sum = (f: (r: typeof zeroRow) => number) => rows.reduce((acc, r) => acc + f(r), 0);
        const avgOf = (totalField: (r: typeof zeroRow) => number, countField: (r: typeof zeroRow) => number) => {
          const totalSum = sum(totalField);
          const countSum = sum(countField);
          return countSum > 0 ? totalSum / countSum : 0;
        };
        return {
          oldUsersCount: sum((r) => r.old_users) / n,
          newUsersCount: sum((r) => r.new_users) / n,
          avgDepositOld: avgOf((r) => r.old_total, (r) => r.old_users),
          avgDepositNew: avgOf((r) => r.new_total, (r) => r.new_users),
          oldWithdrawCount: sum((r) => r.old_wd_users) / n,
          avgWithdrawOld: avgOf((r) => r.old_wd_total, (r) => r.old_wd_users),
          newWithdrawCount: sum((r) => r.new_wd_users) / n,
          avgWithdrawNew: avgOf((r) => r.new_wd_total, (r) => r.new_wd_users),
          totalDepositDay: sum((r) => r.total_deposit) / n,
          totalDepositorCountDay: sum((r) => r.total_depositors) / n,
        };
      };

      const metricsCurrent = bucketAvg(curWeekDays);
      const metricsLast = bucketAvg(lastWeekDays);

      // 3-Day Retention, same cohort/withdrew/returned definition as
      // new-user-retention below, bounded to the 2-week window and rolled
      // up per week bucket instead of shown per-day. Only cohort days
      // whose 3-day return window has FULLY elapsed (cohort_day + 3 <=
      // anchorDate) are counted — a cohort from 1-2 days ago hasn't had
      // its full window yet and would understate the true return rate.
      const cohortRows = await env.daily_records_db
        .prepare(
          `WITH cohort AS (
             SELECT user_id, date(create_time) as cohort_day FROM deposits
             WHERE is_first_deposit = 1 AND user_id IS NOT NULL AND date(create_time) BETWEEN ? AND ?
           ),
           withdrew AS (
             SELECT DISTINCT user_id FROM withdrawals WHERE CAST(status AS REAL) = 2 AND user_id IS NOT NULL
           ),
           return_dep AS (
             SELECT DISTINCT user_id, date(create_time) as dep_day FROM deposits
             WHERE status = 'COMPLETE' AND user_id IS NOT NULL
           ),
           returned AS (
             SELECT c.cohort_day, c.user_id
             FROM cohort c
             JOIN return_dep r ON r.user_id = c.user_id
               AND date(r.dep_day) > c.cohort_day AND date(r.dep_day) <= date(c.cohort_day, '+3 day')
             GROUP BY c.cohort_day, c.user_id
           )
           SELECT c.cohort_day as date,
                  COUNT(DISTINCT c.user_id) as new_users,
                  COUNT(DISTINCT CASE WHEN w.user_id IS NOT NULL THEN c.user_id END) as withdrew_count,
                  COUNT(DISTINCT CASE WHEN w.user_id IS NOT NULL AND ret.user_id IS NOT NULL THEN c.user_id END) as withdrew_returned,
                  COUNT(DISTINCT CASE WHEN w.user_id IS NULL THEN c.user_id END) as never_withdrew_count,
                  COUNT(DISTINCT CASE WHEN w.user_id IS NULL AND ret.user_id IS NOT NULL THEN c.user_id END) as never_withdrew_returned
           FROM cohort c
           LEFT JOIN withdrew w ON w.user_id = c.user_id
           LEFT JOIN returned ret ON ret.cohort_day = c.cohort_day AND ret.user_id = c.user_id
           GROUP BY c.cohort_day`
        )
        .bind(rangeStart, rangeEnd)
        .all<{ date: string; new_users: number; withdrew_count: number; withdrew_returned: number; never_withdrew_count: number; never_withdrew_returned: number }>();

      const cohortByDate = new Map(cohortRows.results.map((r) => [r.date, r]));
      const fullyElapsed = (d: string) => addDays(d, 3) <= anchorDate;
      const retentionBucket = (days: string[]) => {
        const included = days.filter(fullyElapsed).map((d) => cohortByDate.get(d)).filter((r): r is NonNullable<typeof r> => !!r);
        const cohortsIncluded = included.length;
        const totalNewUsers = included.reduce((acc, r) => acc + r.new_users, 0);
        const withdrewCount = included.reduce((acc, r) => acc + r.withdrew_count, 0);
        const withdrewReturned = included.reduce((acc, r) => acc + r.withdrew_returned, 0);
        const neverWithdrewCount = included.reduce((acc, r) => acc + r.never_withdrew_count, 0);
        const neverWithdrewReturned = included.reduce((acc, r) => acc + r.never_withdrew_returned, 0);
        return {
          cohortsIncluded,
          avgNewUsersPerCohort: cohortsIncluded > 0 ? totalNewUsers / cohortsIncluded : 0,
          withdrewRedepositedPct: withdrewCount > 0 ? (100 * withdrewReturned) / withdrewCount : 0,
          neverWithdrewRedepositedPct: neverWithdrewCount > 0 ? (100 * neverWithdrewReturned) / neverWithdrewCount : 0,
        };
      };

      return Response.json({
        date: anchorDate,
        currentWeek: { start: curWeekStart, end: anchorDate, daysElapsed: curWeekDays.length },
        lastWeek: { start: lastWeekStart, end: lastWeekEnd },
        metrics: { current: metricsCurrent, last: metricsLast },
        retention: { current: retentionBucket(curWeekDays), last: retentionBucket(lastWeekDays) },
        targets: {
          oldUsersCount: { target: TARGETS.oldUsersCount, actual: metricsCurrent.oldUsersCount },
          avgDepositOldUsers: { target: TARGETS.avgDepositOldUsers, actual: metricsCurrent.avgDepositOld },
          avgTotalDepositDay: { target: TARGETS.avgTotalDepositDay, actual: metricsCurrent.totalDepositDay },
          totalDepositorCountDay: { target: TARGETS.totalDepositorCountDay, actual: metricsCurrent.totalDepositorCountDay },
        },
      });
    }

    // Platform Analysis section 4, tab 1: New vs Old User Analysis — Daily
    // Breakdown. "New" = a user's is_first_deposit=1 day (deposits already
    // carries this flag); "Old" = any other deposit day for a user who has
    // deposited before. Withdrawals don't carry is_first_deposit, so a
    // withdrawal is classified New/Old by whether it falls on that same
    // user's first-deposit date (via a join, not a stored flag). Covers
    // every day daily_records_db actually has — bounded by the 35-day
    // rolling retention, not a fixed "33 days" from any reference design.
    if (url.pathname === "/api/dashboard/platform-analysis/new-vs-old" && request.method === "GET") {
      const authFail = requireAdmin(request, env, "dashboard");
      if (authFail) return authFail;

      const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
      const pageSize = 10;

      const countRow = await env.daily_records_db
        .prepare(`SELECT COUNT(DISTINCT date(create_time)) as c FROM deposits WHERE status = 'COMPLETE' AND user_id IS NOT NULL`)
        .first<{ c: number }>();
      const total = countRow?.c ?? 0;

      const rows = await env.daily_records_db
        .prepare(
          `WITH dep AS (
             SELECT user_id, date(create_time) as d, amount, COALESCE(is_first_deposit, 0) as is_new
             FROM deposits WHERE status = 'COMPLETE' AND user_id IS NOT NULL
           ),
           dep_agg AS (
             SELECT d,
                    COUNT(DISTINCT CASE WHEN is_new = 0 THEN user_id END) as old_users,
                    COALESCE(SUM(CASE WHEN is_new = 0 THEN amount END), 0) as old_total,
                    COUNT(DISTINCT CASE WHEN is_new = 1 THEN user_id END) as new_users,
                    COALESCE(SUM(CASE WHEN is_new = 1 THEN amount END), 0) as new_total,
                    COUNT(DISTINCT user_id) as total_depositors,
                    COALESCE(SUM(amount), 0) as total_deposit
             FROM dep GROUP BY d
           ),
           first_dep AS (
             SELECT user_id, MIN(date(create_time)) as first_dep_date
             FROM deposits WHERE is_first_deposit = 1 AND user_id IS NOT NULL GROUP BY user_id
           ),
           wd AS (
             SELECT w.user_id, date(w.create_time) as d, w.amount,
                    CASE WHEN fd.first_dep_date = date(w.create_time) THEN 1 ELSE 0 END as is_new
             FROM withdrawals w LEFT JOIN first_dep fd ON fd.user_id = w.user_id
             WHERE CAST(w.status AS REAL) = 2 AND w.user_id IS NOT NULL
           ),
           wd_agg AS (
             SELECT d,
                    COUNT(DISTINCT CASE WHEN is_new = 0 THEN user_id END) as old_wd_users,
                    COALESCE(SUM(CASE WHEN is_new = 0 THEN amount END), 0) as old_wd_total,
                    COUNT(DISTINCT CASE WHEN is_new = 1 THEN user_id END) as new_wd_users,
                    COALESCE(SUM(CASE WHEN is_new = 1 THEN amount END), 0) as new_wd_total
             FROM wd GROUP BY d
           )
           SELECT da.d as date,
                  da.old_users, (da.old_total / NULLIF(da.old_users, 0)) as avg_dep_old,
                  da.new_users, (da.new_total / NULLIF(da.new_users, 0)) as avg_dep_new,
                  COALESCE(wa.old_wd_users, 0) as old_wd_users,
                  (COALESCE(wa.old_wd_total, 0) / NULLIF(wa.old_wd_users, 0)) as avg_wd_old,
                  COALESCE(wa.new_wd_users, 0) as new_wd_users,
                  (COALESCE(wa.new_wd_total, 0) / NULLIF(wa.new_wd_users, 0)) as avg_wd_new,
                  da.total_deposit, da.total_depositors
           FROM dep_agg da LEFT JOIN wd_agg wa ON wa.d = da.d
           ORDER BY da.d DESC LIMIT ? OFFSET ?`
        )
        .bind(pageSize, (page - 1) * pageSize)
        .all();

      return Response.json({
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        rows: rows.results,
      });
    }

    // Platform Analysis section 4, tab 2: New User 3-Day Retention. Cohort
    // = users whose first-ever deposit landed on a given day, split into
    // two segments: withdrew at least once (any COMPLETE withdrawal, any
    // time) vs never withdrew. "Returned" = made another COMPLETE deposit
    // within the following 3 calendar days of their first deposit — same
    // 3-day window either segment. The point of the split: does
    // successfully withdrawing kill retention, or build enough trust that
    // withdrawers actually come back MORE than non-withdrawers?
    if (url.pathname === "/api/dashboard/platform-analysis/new-user-retention" && request.method === "GET") {
      const authFail = requireAdmin(request, env, "dashboard");
      if (authFail) return authFail;

      const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
      const pageSize = 10;

      const countRow = await env.daily_records_db
        .prepare(`SELECT COUNT(DISTINCT date(create_time)) as c FROM deposits WHERE is_first_deposit = 1 AND user_id IS NOT NULL`)
        .first<{ c: number }>();
      const total = countRow?.c ?? 0;

      const rows = await env.daily_records_db
        .prepare(
          `WITH cohort AS (
             SELECT user_id, date(create_time) as cohort_day FROM deposits
             WHERE is_first_deposit = 1 AND user_id IS NOT NULL
           ),
           withdrew AS (
             SELECT DISTINCT user_id FROM withdrawals WHERE CAST(status AS REAL) = 2 AND user_id IS NOT NULL
           ),
           return_dep AS (
             SELECT DISTINCT user_id, date(create_time) as dep_day FROM deposits
             WHERE status = 'COMPLETE' AND user_id IS NOT NULL
           ),
           returned AS (
             SELECT c.cohort_day, c.user_id
             FROM cohort c
             JOIN return_dep r ON r.user_id = c.user_id
               AND date(r.dep_day) > c.cohort_day AND date(r.dep_day) <= date(c.cohort_day, '+3 day')
             GROUP BY c.cohort_day, c.user_id
           )
           SELECT c.cohort_day as date,
                  COUNT(DISTINCT c.user_id) as new_users,
                  COUNT(DISTINCT CASE WHEN w.user_id IS NOT NULL THEN c.user_id END) as withdrew_count,
                  COUNT(DISTINCT CASE WHEN w.user_id IS NOT NULL AND ret.user_id IS NOT NULL THEN c.user_id END) as withdrew_returned,
                  COUNT(DISTINCT CASE WHEN w.user_id IS NULL THEN c.user_id END) as never_withdrew_count,
                  COUNT(DISTINCT CASE WHEN w.user_id IS NULL AND ret.user_id IS NOT NULL THEN c.user_id END) as never_withdrew_returned
           FROM cohort c
           LEFT JOIN withdrew w ON w.user_id = c.user_id
           LEFT JOIN returned ret ON ret.cohort_day = c.cohort_day AND ret.user_id = c.user_id
           GROUP BY c.cohort_day
           ORDER BY c.cohort_day DESC LIMIT ? OFFSET ?`
        )
        .bind(pageSize, (page - 1) * pageSize)
        .all();

      return Response.json({
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        rows: rows.results,
      });
    }

    // Search User page. Read (search, agent list) stays here as usual —
    // reassign-agent and ban/unban are narrow single-row writes tied to the
    // dashboard session an admin is already using to search, unlike the
    // bulk/config writes that live on upload-worker (full syncs, master
    // uploads, bearer token). Requiring a separate Config login for a
    // single UPDATE would be worse UX than the "single screen" this page
    // is meant to be, and the blast radius here is one row, not the whole
    // sync pipeline.
    if (url.pathname === "/api/dashboard/search-user" && request.method === "GET") {
      const scope = await requireDashboardOrAgentScope(request, env);
      if (scope instanceof Response) return scope;
      const { agentFilter } = scope;

      const userId = url.searchParams.get("userId");
      if (!userId || !/^\d+$/.test(userId)) {
        return Response.json({ error: "userId is required and must be numeric" }, { status: 400 });
      }
      const anchorDate = todayIST();

      // Always returns the user regardless of is_banned — this page IS the
      // tool admins use to find and unban someone, so hiding a banned
      // user from its own direct-ID lookup would make unbanning impossible.
      // Agent sessions additionally require the user to be assigned to
      // them — an agent searching another agent's user_id must get the
      // same "not found" response as searching a nonexistent one.
      const user = await env.daily_records_db
        .prepare(
          // deposit_count is NOT computed here — u.* already carries
          // users.deposit_count, the true lifetime figure synced from the
          // master sheet. It used to be shadowed by a
          // COUNT(*) FROM deposits subquery (rolling ~35-day window, not
          // lifetime) mislabeled "deposit_txn_count" and shown under the
          // page's "LIFETIME" section — confirmed live: showed 6 for a user
          // whose true lifetime deposit_count was 7, because their oldest
          // deposit had already aged out of the deposits table's retention
          // window. withdrawal_txn_count has no lifetime equivalent column
          // (schema has deposit_count but no withdrawal_count), so it's
          // still a live rolling-window count — that one's expected.
          `SELECT u.*, ${vipLevelCase("u.total_deposit")} as vip_level,
                  (SELECT COALESCE(SUM(amount),0) FROM deposits WHERE user_id = u.user_id AND date(create_time) = ? AND status = 'COMPLETE') as dep_today,
                  (SELECT COALESCE(SUM(amount),0) FROM withdrawals WHERE user_id = u.user_id AND date(create_time) = ? AND CAST(status AS REAL) = 2) as wd_today,
                  (SELECT MAX(create_time) FROM deposits WHERE user_id = u.user_id AND status = 'COMPLETE') as last_deposit_time,
                  (SELECT MAX(create_time) FROM withdrawals WHERE user_id = u.user_id AND CAST(status AS REAL) = 2) as last_withdrawal_time,
                  (SELECT COUNT(*) FROM withdrawals WHERE user_id = u.user_id AND CAST(status AS REAL) = 2) as withdrawal_txn_count
           FROM users u WHERE u.user_id = ? AND (? IS NULL OR u.assigned_agent = ?)`
        )
        .bind(anchorDate, anchorDate, userId, agentFilter, agentFilter)
        .first();

      if (!user) {
        return Response.json({ error: "No user found with that ID" }, { status: 404 });
      }
      return Response.json({ user });
    }

    // Search User detail panel (redesigned per reference layout): financial
    // overview (lifetime + last-7-days), the last 7 days' deposit and
    // withdrawal line items, and wallet_details activity split into real
    // gameplay (source_name populated) vs bonus claims (source_name blank
    // — see the bonus-claim comment on wallet_details' schema). Same
    // agent-scoping rule as /api/dashboard/search-user: an agent can only
    // pull this for their own assigned users.
    if (url.pathname === "/api/dashboard/search-user-details" && request.method === "GET") {
      const scope = await requireDashboardOrAgentScope(request, env);
      if (scope instanceof Response) return scope;
      const { agentFilter } = scope;

      const userId = url.searchParams.get("userId");
      if (!userId || !/^\d+$/.test(userId)) {
        return Response.json({ error: "userId is required and must be numeric" }, { status: 400 });
      }

      const ownerCheck = await env.daily_records_db
        .prepare(`SELECT 1 FROM users WHERE user_id = ? AND (? IS NULL OR assigned_agent = ?)`)
        .bind(userId, agentFilter, agentFilter)
        .first();
      if (!ownerCheck) {
        return Response.json({ error: "No user found with that ID" }, { status: 404 });
      }

      const sevenDaysAgo = (() => {
        const d = new Date(); d.setUTCDate(d.getUTCDate() - 7); return d.toISOString();
      })();
      const twoDaysAgo = (() => {
        const d = new Date(); d.setUTCDate(d.getUTCDate() - 2); return d.toISOString();
      })();

      const [last7Agg, deposits, withdrawals, games, bonuses] = await Promise.all([
        env.daily_records_db
          .prepare(
            `SELECT
               (SELECT COALESCE(SUM(amount),0) FROM deposits WHERE user_id = ? AND create_time >= ? AND status = 'COMPLETE') as dep_total,
               (SELECT COUNT(*) FROM deposits WHERE user_id = ? AND create_time >= ? AND status = 'COMPLETE') as dep_count,
               (SELECT COALESCE(SUM(amount),0) FROM withdrawals WHERE user_id = ? AND create_time >= ? AND CAST(status AS REAL) = 2) as wd_total`
          )
          .bind(userId, sevenDaysAgo, userId, sevenDaysAgo, userId, sevenDaysAgo)
          .first<{ dep_total: number; dep_count: number; wd_total: number }>(),
        env.daily_records_db
          .prepare(
            `SELECT record_key as order_no, amount, status, create_time, channel
             FROM deposits WHERE user_id = ? AND create_time >= ? ORDER BY create_time DESC LIMIT 100`
          )
          .bind(userId, sevenDaysAgo)
          .all(),
        env.daily_records_db
          .prepare(
            `SELECT record_key as order_no, amount, status, create_time, channel
             FROM withdrawals WHERE user_id = ? AND create_time >= ? ORDER BY create_time DESC LIMIT 100`
          )
          .bind(userId, sevenDaysAgo)
          .all(),
        env.daily_records_db
          .prepare(
            `SELECT game_name, amount, create_time
             FROM wallet_details WHERE user_id = ? AND create_time >= ?
               AND game_name IS NOT NULL AND game_name != '' AND source_name IS NOT NULL AND source_name != ''
             ORDER BY create_time DESC LIMIT 100`
          )
          .bind(userId, twoDaysAgo)
          .all(),
        env.daily_records_db
          .prepare(
            `SELECT game_name as bonus_name, amount, create_time
             FROM wallet_details WHERE user_id = ? AND create_time >= ?
               AND game_name IS NOT NULL AND game_name != '' AND (source_name IS NULL OR source_name = '')
             ORDER BY create_time DESC LIMIT 100`
          )
          .bind(userId, sevenDaysAgo)
          .all(),
      ]);

      return Response.json({
        last7Days: {
          deposits: last7Agg?.dep_total ?? 0,
          depositCount: last7Agg?.dep_count ?? 0,
          withdrawals: last7Agg?.wd_total ?? 0,
          net: (last7Agg?.dep_total ?? 0) - (last7Agg?.wd_total ?? 0),
        },
        deposits: deposits.results,
        withdrawals: withdrawals.results,
        games: games.results,
        bonuses: bonuses.results,
      });
    }

    // Distinct agent names already in use, for the Reassign Agent dropdown.
    // No separate "Agent"/"Senior Agent" tier exists anywhere in this
    // system's data (assigned_agent is a flat display-name string, populated
    // via the agent-assignment spreadsheet upload) — the dropdown lists
    // whatever real agent names are already assigned, plus "Unassigned".
    if (url.pathname === "/api/dashboard/agents-list" && request.method === "GET") {
      const authFail = requireAdmin(request, env, "dashboard");
      if (authFail) return authFail;

      const rows = await env.daily_records_db
        .prepare(`SELECT DISTINCT assigned_agent FROM users WHERE assigned_agent IS NOT NULL AND assigned_agent != '' ORDER BY assigned_agent`)
        .all<{ assigned_agent: string }>();
      return Response.json({ agents: rows.results.map((r) => r.assigned_agent) });
    }

    if (url.pathname === "/api/dashboard/reassign-agent" && request.method === "POST") {
      const authFail = requireAdmin(request, env, "dashboard");
      if (authFail) return authFail;

      const body = (await request.json()) as { userId?: string; agent?: string };
      if (!body.userId || !/^\d+$/.test(body.userId)) {
        return Response.json({ error: "userId is required and must be numeric" }, { status: 400 });
      }
      const agent = body.agent && body.agent !== "Unassigned" ? body.agent : null;
      const result = await env.daily_records_db
        .prepare(`UPDATE users SET assigned_agent = ? WHERE user_id = ?`)
        .bind(agent, body.userId)
        .run();
      if (result.meta.changes === 0) {
        return Response.json({ error: "No user found with that ID" }, { status: 404 });
      }
      return Response.json({ saved: true, userId: body.userId, agent: agent ?? "Unassigned" });
    }

    // Bulk Reassign Agent (Search User page): reassigns many users to one
    // agent in a single request — built for pasting a column of user IDs
    // copied straight out of Excel. Each ID becomes its own tiny UPDATE
    // (2 bound params) run via D1's .batch() rather than one big
    // WHERE user_id IN (...) statement, sidestepping D1's ~100-bound-
    // parameter-per-statement ceiling (see etl/sync_engine.py's comment
    // on the same limit) without needing to chunk manually.
    if (url.pathname === "/api/dashboard/bulk-reassign-agent" && request.method === "POST") {
      const authFail = requireAdmin(request, env, "dashboard");
      if (authFail) return authFail;

      const body = (await request.json()) as { userIds?: unknown; agent?: string };
      if (!Array.isArray(body.userIds) || body.userIds.length === 0) {
        return Response.json({ error: "userIds must be a non-empty array" }, { status: 400 });
      }
      const MAX_IDS = 2000;
      if (body.userIds.length > MAX_IDS) {
        return Response.json({ error: `Too many user IDs — max ${MAX_IDS} per bulk reassignment` }, { status: 400 });
      }
      const agent = body.agent && body.agent !== "Unassigned" ? body.agent : null;

      // De-dupe (a pasted column can easily have repeats) and split
      // numeric-looking entries from junk (blank lines, headers, stray
      // text) so the response can tell the admin exactly what it skipped
      // instead of silently ignoring bad rows.
      const seen = new Set<string>();
      const validIds: string[] = [];
      const invalidEntries: string[] = [];
      for (const raw of body.userIds) {
        const trimmed = String(raw).trim();
        if (!trimmed) continue;
        if (!/^\d+$/.test(trimmed)) {
          invalidEntries.push(trimmed);
          continue;
        }
        if (seen.has(trimmed)) continue;
        seen.add(trimmed);
        validIds.push(trimmed);
      }
      if (validIds.length === 0) {
        return Response.json({ error: "No valid numeric user IDs found in the pasted input", invalidEntries }, { status: 400 });
      }

      const statements = validIds.map((id) =>
        env.daily_records_db.prepare(`UPDATE users SET assigned_agent = ? WHERE user_id = ?`).bind(agent, id)
      );
      const results = await env.daily_records_db.batch(statements);
      const notFoundIds = validIds.filter((_, i) => (results[i]?.meta.changes ?? 0) === 0);
      const updatedCount = validIds.length - notFoundIds.length;

      return Response.json({
        saved: true,
        agent: agent ?? "Unassigned",
        requested: body.userIds.length,
        updated: updatedCount,
        notFoundIds,
        invalidEntries,
      });
    }

    // Bulk Ban/Unban Users (Search User page): same paste-from-Excel
    // workflow as Bulk Reassign Agent above, one shared endpoint gated by
    // a `banned` flag (mirrors the existing single-user ban-user/unban-user
    // pair). Unlike bulk-reassign, this reports duplicate IDs explicitly
    // in the response rather than silently dropping them, per the UI's
    // "duplicate user IDs" summary line.
    if (url.pathname === "/api/dashboard/bulk-ban-users" && request.method === "POST") {
      const authFail = requireAdmin(request, env, "dashboard");
      if (authFail) return authFail;

      const body = (await request.json()) as { userIds?: unknown; banned?: boolean };
      if (!Array.isArray(body.userIds) || body.userIds.length === 0) {
        return Response.json({ error: "userIds must be a non-empty array" }, { status: 400 });
      }
      if (typeof body.banned !== "boolean") {
        return Response.json({ error: "banned (true/false) is required" }, { status: 400 });
      }
      const MAX_IDS = 2000;
      if (body.userIds.length > MAX_IDS) {
        return Response.json({ error: `Too many user IDs — max ${MAX_IDS} per bulk operation` }, { status: 400 });
      }

      const seen = new Set<string>();
      const validIds: string[] = [];
      const invalidEntries: string[] = [];
      const duplicateIds: string[] = [];
      for (const raw of body.userIds) {
        const trimmed = String(raw).trim();
        if (!trimmed) continue;
        if (!/^\d+$/.test(trimmed)) {
          invalidEntries.push(trimmed);
          continue;
        }
        if (seen.has(trimmed)) {
          duplicateIds.push(trimmed);
          continue;
        }
        seen.add(trimmed);
        validIds.push(trimmed);
      }
      if (validIds.length === 0) {
        return Response.json({ error: "No valid numeric user IDs found in the pasted input", invalidEntries, duplicateIds }, { status: 400 });
      }

      const statements = validIds.map((id) =>
        env.daily_records_db.prepare(`UPDATE users SET is_banned = ? WHERE user_id = ?`).bind(body.banned ? 1 : 0, id)
      );
      const results = await env.daily_records_db.batch(statements);
      const notFoundIds = validIds.filter((_, i) => (results[i]?.meta.changes ?? 0) === 0);
      const updatedCount = validIds.length - notFoundIds.length;

      return Response.json({
        saved: true,
        banned: body.banned,
        requested: body.userIds.length,
        updated: updatedCount,
        notFoundIds,
        invalidEntries,
        duplicateIds,
      });
    }

    if (url.pathname === "/api/dashboard/ban-user" && request.method === "POST") {
      const authFail = requireAdmin(request, env, "dashboard");
      if (authFail) return authFail;

      const body = (await request.json()) as { userId?: string };
      if (!body.userId || !/^\d+$/.test(body.userId)) {
        return Response.json({ error: "userId is required and must be numeric" }, { status: 400 });
      }
      const result = await env.daily_records_db
        .prepare(`UPDATE users SET is_banned = 1 WHERE user_id = ?`)
        .bind(body.userId)
        .run();
      if (result.meta.changes === 0) {
        return Response.json({ error: "No user found with that ID" }, { status: 404 });
      }
      return Response.json({ saved: true, userId: body.userId, is_banned: true });
    }

    if (url.pathname === "/api/dashboard/unban-user" && request.method === "POST") {
      const authFail = requireAdmin(request, env, "dashboard");
      if (authFail) return authFail;

      const body = (await request.json()) as { userId?: string };
      if (!body.userId || !/^\d+$/.test(body.userId)) {
        return Response.json({ error: "userId is required and must be numeric" }, { status: 400 });
      }
      const result = await env.daily_records_db
        .prepare(`UPDATE users SET is_banned = 0 WHERE user_id = ?`)
        .bind(body.userId)
        .run();
      if (result.meta.changes === 0) {
        return Response.json({ error: "No user found with that ID" }, { status: 404 });
      }
      return Response.json({ saved: true, userId: body.userId, is_banned: false });
    }

    // Master DB analytics — its own URL, dashboard-area auth gate (it's an
    // analytics view, grouped with Dashboard, not Configuration).
    if (url.pathname === "/master-stats" && request.method === "GET") {
      if (!isAuthed(request, env, "dashboard")) {
        return new Response(null, { status: 302, headers: { Location: "/login" } });
      }
      return new Response(MASTER_STATS_PAGE_HTML, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    if (url.pathname === "/api/master/stats" && request.method === "GET") {
      const authFail = requireAdmin(request, env, "dashboard");
      if (authFail) return authFail;

      const totals = await env.daily_records_db
        .prepare(
          `SELECT COUNT(*) as total_users,
                  SUM(user_balance) as total_balance,
                  SUM(total_deposit) as total_deposits,
                  SUM(total_withdrawal) as total_withdrawals,
                  SUM(deposit_count) as total_deposit_count,
                  SUM(CASE WHEN is_test_account = 1 THEN 1 ELSE 0 END) as test_accounts
           FROM users`
        )
        .first();

      const topByBalance = await env.daily_records_db
        .prepare(
          `SELECT user_id, username, phone, city, user_balance, total_deposit, total_withdrawal
           FROM users WHERE user_balance IS NOT NULL AND is_banned = 0 ORDER BY user_balance DESC LIMIT 10`
        )
        .all();

      const topByDeposit = await env.daily_records_db
        .prepare(
          `SELECT user_id, username, phone, city, total_deposit, deposit_count
           FROM users WHERE total_deposit IS NOT NULL AND is_banned = 0 ORDER BY total_deposit DESC LIMIT 10`
        )
        .all();

      const byCity = await env.daily_records_db
        .prepare(
          `SELECT city, COUNT(*) as user_count FROM users
           WHERE city IS NOT NULL AND city != '' GROUP BY city ORDER BY user_count DESC LIMIT 10`
        )
        .all();

      return Response.json({
        totals,
        topByBalance: topByBalance.results,
        topByDeposit: topByDeposit.results,
        byCity: byCity.results,
      });
    }

    // Dashboard's own login — independent from Configuration's.
    if (url.pathname === "/login" && request.method === "GET") {
      return new Response(
        renderLoginPage({ title: "Dashboard Login", postUrl: "/login", redirectUrl: "/dashboard" }),
        { headers: { "content-type": "text/html; charset=utf-8" } }
      );
    }

    if (url.pathname === "/login" && request.method === "POST") {
      const body = (await request.json()) as { key?: string };
      if (!body.key || body.key !== env.DASHBOARD_ADMIN_KEY) {
        return new Response("Unauthorized", { status: 401 });
      }
      return new Response(null, {
        status: 204,
        headers: { "Set-Cookie": sessionCookieHeader("dashboard", body.key) },
      });
    }

    if (url.pathname === "/logout" && request.method === "POST") {
      return new Response(null, { status: 204, headers: { "Set-Cookie": clearCookieHeader("dashboard") } });
    }

    // Agent login — real per-account credentials (agent_accounts table),
    // fully independent of Dashboard/Configuration's shared-key sessions.
    // The scoped Agent Dashboard (Home/Action Center/Performance/Analytics/
    // Search User, each filtered to the logged-in agent's assigned users)
    // is a separate follow-up; /agent is a placeholder landing page for now
    // so login can be verified end-to-end before that's built.
    if (url.pathname === "/agent/login" && request.method === "GET") {
      return new Response(renderAgentLoginPage({}), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    if (url.pathname === "/agent/login" && request.method === "POST") {
      const body = (await request.json()) as { username?: string; password?: string };
      if (!body.username || !body.password) {
        return new Response("Unauthorized", { status: 401 });
      }
      const account = await env.daily_records_db
        .prepare(
          `SELECT agent_id, display_name, password_hash, password_salt, is_active
           FROM agent_accounts WHERE login_username = ?`
        )
        .bind(body.username)
        .first<{ agent_id: number; display_name: string; password_hash: string; password_salt: string; is_active: number }>();
      if (!account || !account.is_active) {
        return new Response("Unauthorized", { status: 401 });
      }
      const valid = await verifyPassword(body.password, account.password_salt, account.password_hash);
      if (!valid) {
        return new Response("Unauthorized", { status: 401 });
      }
      const token = await createAgentSession(env, { agentId: account.agent_id, displayName: account.display_name });
      return new Response(null, {
        status: 204,
        headers: { "Set-Cookie": agentSessionCookieHeader(token) },
      });
    }

    if (url.pathname === "/agent/logout" && request.method === "POST") {
      await destroyAgentSession(request, env);
      return new Response(null, { status: 204, headers: { "Set-Cookie": clearAgentSessionCookieHeader() } });
    }

    // Agent Dashboard pages — same shell/content components as the admin
    // dashboard (see DASHBOARD_ROUTES above), just gated on an agent
    // session instead of the dashboard shared-key session, with a
    // restricted 5-item nav (no Platform Analysis) and its own login
    // redirect. The underlying content HTML fetches the SAME
    // /api/dashboard/* endpoints — those endpoints are what actually do
    // the per-agent data scoping (see requireDashboardOrAgentScope), so
    // no separate agent API surface is needed except for Search User
    // (agentSearchUserContent.ts), which drops the Reassign/Ban cards
    // entirely since agents don't get those actions.
    const AGENT_ROUTES: Record<string, { key: string; title: string }> = {
      "/agent": { key: "home", title: "Home" },
      "/agent/action-center": { key: "action-center", title: "Action Center" },
      "/agent/performance": { key: "performance", title: "Performance" },
      "/agent/analytics": { key: "analytics", title: "Analytics" },
      "/agent/search-user": { key: "search-user", title: "Search User" },
    };
    const agentRoute = AGENT_ROUTES[url.pathname];
    if (agentRoute && request.method === "GET") {
      const session = await getAgentSession(request, env);
      if (!session) {
        return new Response(null, { status: 302, headers: { Location: "/agent/login" } });
      }
      const content =
        agentRoute.key === "home"
          ? HOME_CONTENT_HTML + DEPOSIT_ANALYSIS_CONTENT_HTML + DEPOSIT_HOURLY_ANALYSIS_CONTENT_HTML + WITHDRAWAL_ANALYSIS_CONTENT_HTML + HOME_AMOUNT_RANGE_CARDS
          : agentRoute.key === "action-center"
          ? NEW_USERS_BONUSES_CONTENT_HTML + ACTION_CENTER_CONTENT_HTML + INACTIVE_USERS_CONTENT_HTML + ACTIVE_USERS_CONTENT_HTML
          : agentRoute.key === "analytics"
          ? ANALYTICS_CONTENT_HTML + REACTIVATION_CONTENT_HTML + VIP_UPGRADE_CONTENT_HTML + RETENTION_CONTENT_HTML + ANALYTICS_AMOUNT_RANGE_CARD
          : agentRoute.key === "performance"
          ? PERFORMANCE_CONTENT_HTML
          : agentRoute.key === "search-user"
          ? AGENT_SEARCH_USER_CONTENT_HTML
          : EMPTY_CONTENT_PLACEHOLDER;
      return new Response(
        renderDashboardShell(agentRoute.key, agentRoute.title, content, {
          navItems: AGENT_NAV_ITEMS,
          logoutUrl: "/agent/logout",
          loginUrl: "/agent/login",
          mode: "agent",
        }),
        { headers: { "content-type": "text/html; charset=utf-8" } }
      );
    }

    // Configuration + everything else that writes to daily_records_db
    // (master/agent uploads, manual sync/cleanup triggers) now lives on
    // upload-worker — see worker-upload/src/index.ts. This Worker is
    // read-only: a bug or leaked key here can't reach those routes.

    return new Response("Not Found", { status: 404 });
  },
};
