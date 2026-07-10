import type { Env } from "./lib/types";
import { runFullSync, syncSource } from "./lib/sync";
import { handleMasterUpload, handleAgentUpload } from "./lib/upload";
import { setBearerToken, setExportUrl, getAllExportUrls } from "./lib/config";
import { CONFIG_PAGE_HTML } from "./lib/configPage";
import { MASTER_STATS_PAGE_HTML } from "./lib/masterStatsPage";
import { renderDashboardShell, EMPTY_CONTENT_PLACEHOLDER } from "./lib/dashboardShell";
import { HOME_CONTENT_HTML } from "./lib/homeContent";
import { DEPOSIT_ANALYSIS_CONTENT_HTML } from "./lib/depositAnalysisContent";
import { DEPOSIT_HOURLY_ANALYSIS_CONTENT_HTML } from "./lib/depositHourlyAnalysisContent";
import { WITHDRAWAL_ANALYSIS_CONTENT_HTML } from "./lib/withdrawalAnalysisContent";
import { ACTION_CENTER_CONTENT_HTML } from "./lib/actionCenterContent";
import { INACTIVE_USERS_CONTENT_HTML } from "./lib/inactiveUsersContent";
import { NEW_USERS_BONUSES_CONTENT_HTML } from "./lib/newUsersBonusesContent";
import { ACTIVE_USERS_CONTENT_HTML } from "./lib/activeUsersContent";
import { ANALYTICS_CONTENT_HTML } from "./lib/analyticsContent";
import { REACTIVATION_CONTENT_HTML } from "./lib/reactivationContent";
import { VIP_UPGRADE_CONTENT_HTML } from "./lib/vipUpgradeContent";
import { RETENTION_CONTENT_HTML } from "./lib/retentionContent";
import { PERFORMANCE_CONTENT_HTML } from "./lib/performanceContent";
import { renderLoginPage } from "./lib/loginPage";
import { isAuthed, sessionCookieHeader, clearCookieHeader, type AuthArea } from "./lib/auth";
import { cleanupOldSyncRuns } from "./lib/cleanup";
import type { ChunkRow } from "./lib/chunkedUpsert";

const DAILY_CLEANUP_CRON = "0 3 * * *";
const CHUNK_WRITE_TABLES = new Set(["deposits", "withdrawals", "wallet_details"]);

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

export default {
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const executionId = `${controller.cron}-${controller.scheduledTime}`;
    const already = await env.SYNC_KV.get(executionId);
    if (already) {
      controller.noRetry();
      return;
    }
    await env.SYNC_KV.put(executionId, "1", { expirationTtl: 86400 });

    if (controller.cron === DAILY_CLEANUP_CRON) {
      ctx.waitUntil(
        cleanupOldSyncRuns(env)
          .then((result) => console.log("cleanupOldSyncRuns:", JSON.stringify(result)))
          .catch((err) => console.error("cleanupOldSyncRuns failed:", err))
      );
      return;
    }

    ctx.waitUntil(
      runFullSync(env).catch((err) => console.error("runFullSync failed:", err))
    );
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Block the local test endpoint in production (see cron-triggers gotchas).
    if (url.pathname === "/__scheduled") {
      return new Response("Not Found", { status: 404 });
    }

    // Internal-only: writes one chunk of rows into daily_records_db.
    // Called by this same Worker via self-fetch (see chunkedUpsert.ts) so
    // each chunk gets its own fresh CPU-time budget — deliberately gated by
    // a separate secret from the admin login, since this is server-to-
    // server, not something the browser/admin session should be able to hit.
    if (url.pathname === "/internal/write-chunk" && request.method === "POST") {
      if (request.headers.get("x-internal-secret") !== env.INTERNAL_SECRET) {
        return new Response("Unauthorized", { status: 401 });
      }
      const body = (await request.json()) as { table?: string; rows?: ChunkRow[]; synced_at?: string };
      if (!body.table || !CHUNK_WRITE_TABLES.has(body.table) || !Array.isArray(body.rows) || !body.synced_at) {
        return Response.json({ error: "invalid chunk payload" }, { status: 400 });
      }
      const statements = body.rows.map((r) =>
        env.daily_records_db
          .prepare(
            `INSERT INTO ${body.table} (record_key, user_id, amount, status, create_time, synced_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(record_key) DO UPDATE SET
               user_id = excluded.user_id,
               amount = excluded.amount,
               status = excluded.status,
               create_time = excluded.create_time,
               synced_at = excluded.synced_at`
          )
          .bind(r.record_key, r.user_id, r.amount, r.status, r.create_time, body.synced_at)
      );
      await env.daily_records_db.batch(statements);
      return Response.json({ written: statements.length });
    }

    if (url.pathname === "/api/sync/trigger" && request.method === "POST") {
      const authFail = requireAdmin(request, env, "dashboard");
      if (authFail) return authFail;
      const source = url.searchParams.get("source");
      const results =
        source && source !== "all"
          ? [await syncSource(source as "wallet" | "deposit" | "withdraw", env)]
          : await runFullSync(env);
      return Response.json({ results });
    }

    if (url.pathname === "/api/cleanup/trigger" && request.method === "POST") {
      const authFail = requireAdmin(request, env, "dashboard");
      if (authFail) return authFail;
      const result = await cleanupOldSyncRuns(env);
      return Response.json(result);
    }

    if (url.pathname === "/api/sync/status" && request.method === "GET") {
      const authFail = requireAdmin(request, env, "dashboard");
      if (authFail) return authFail;
      const runs = await env.daily_records_db
        .prepare("SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT 50")
        .all();
      return Response.json(runs.results);
    }

    // Dedicated Configuration page — its own URL, its own independent login
    // session (config_session), completely separate from Dashboard's
    // session. Gated server-side: unauthenticated visitors are redirected
    // to /config/login and never see the real form or its markup. Stopgap
    // until a custom domain exists and this can sit behind real Cloudflare
    // Access + SSO/email OTP.
    if (url.pathname === "/config" && request.method === "GET") {
      if (!isAuthed(request, env, "config")) {
        return new Response(null, { status: 302, headers: { Location: "/config/login" } });
      }
      return new Response(CONFIG_PAGE_HTML, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    if (url.pathname === "/config/login" && request.method === "GET") {
      return new Response(
        renderLoginPage({ title: "Configuration Login", postUrl: "/config/login", redirectUrl: "/config" }),
        { headers: { "content-type": "text/html; charset=utf-8" } }
      );
    }

    if (url.pathname === "/config/login" && request.method === "POST") {
      const body = (await request.json()) as { key?: string };
      if (!body.key || body.key !== env.ADMIN_API_KEY) {
        return new Response("Unauthorized", { status: 401 });
      }
      return new Response(null, {
        status: 204,
        headers: { "Set-Cookie": sessionCookieHeader("config", body.key) },
      });
    }

    if (url.pathname === "/config/logout" && request.method === "POST") {
      return new Response(null, { status: 204, headers: { "Set-Cookie": clearCookieHeader("config") } });
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
          ? HOME_CONTENT_HTML + DEPOSIT_ANALYSIS_CONTENT_HTML + DEPOSIT_HOURLY_ANALYSIS_CONTENT_HTML + WITHDRAWAL_ANALYSIS_CONTENT_HTML
          : dashboardRoute.key === "action-center"
          ? ACTION_CENTER_CONTENT_HTML + INACTIVE_USERS_CONTENT_HTML + NEW_USERS_BONUSES_CONTENT_HTML + ACTIVE_USERS_CONTENT_HTML
          : dashboardRoute.key === "analytics"
          ? ANALYTICS_CONTENT_HTML + REACTIVATION_CONTENT_HTML + VIP_UPGRADE_CONTENT_HTML + RETENTION_CONTENT_HTML
          : dashboardRoute.key === "performance"
          ? PERFORMANCE_CONTENT_HTML
          : EMPTY_CONTENT_PLACEHOLDER;
      return new Response(
        renderDashboardShell(dashboardRoute.key, dashboardRoute.title, content),
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
      const authFail = requireAdmin(request, env, "dashboard");
      if (authFail) return authFail;

      const tier = url.searchParams.get("tier") === "high" ? "high" : "low";
      const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
      const pageSize = 10;

      // WHEN d < X THEN Y pairs are the upper bound of each VIP bracket —
      // shared by both the "current level" and "next level's floor" CASE
      // expressions below, just returning a different value per branch.
      const CURRENT_LEVEL = `CASE
        WHEN total_deposit < 100 THEN 0 WHEN total_deposit < 600 THEN 1 WHEN total_deposit < 5600 THEN 2
        WHEN total_deposit < 15600 THEN 3 WHEN total_deposit < 95600 THEN 4 WHEN total_deposit < 295600 THEN 5
        WHEN total_deposit < 795600 THEN 6 WHEN total_deposit < 1795600 THEN 7 WHEN total_deposit < 3795600 THEN 8
        WHEN total_deposit < 8795600 THEN 9 WHEN total_deposit < 16795600 THEN 10 WHEN total_deposit < 28795600 THEN 11
        WHEN total_deposit < 44795600 THEN 12 WHEN total_deposit < 69795600 THEN 13 ELSE 14 END`;
      const NEXT_LEVEL_MIN = `CASE
        WHEN total_deposit < 100 THEN 100 WHEN total_deposit < 600 THEN 600 WHEN total_deposit < 5600 THEN 5600
        WHEN total_deposit < 15600 THEN 15600 WHEN total_deposit < 95600 THEN 95600 WHEN total_deposit < 295600 THEN 295600
        WHEN total_deposit < 795600 THEN 795600 WHEN total_deposit < 1795600 THEN 1795600 WHEN total_deposit < 3795600 THEN 3795600
        WHEN total_deposit < 8795600 THEN 8795600 WHEN total_deposit < 16795600 THEN 16795600 WHEN total_deposit < 28795600 THEN 28795600
        WHEN total_deposit < 44795600 THEN 44795600 WHEN total_deposit < 69795600 THEN 69795600 ELSE NULL END`;

      const [minLevel, maxLevel, maxGap] = tier === "low" ? [2, 4, 1000] : [5, 13, 50000];

      const BASE = `FROM (
          SELECT user_id, total_deposit, last_active_time, COALESCE(assigned_agent, 'Unassigned') as agent,
                 ${CURRENT_LEVEL} as current_level, ${NEXT_LEVEL_MIN} as next_level_min
          FROM users WHERE total_deposit IS NOT NULL
        )
        WHERE next_level_min IS NOT NULL AND current_level BETWEEN ? AND ?
          AND (next_level_min - total_deposit) BETWEEN 1 AND ?`;

      const countRow = await env.daily_records_db
        .prepare(`SELECT COUNT(*) as c ${BASE}`)
        .bind(minLevel, maxLevel, maxGap)
        .first<{ c: number }>();

      const rows = await env.daily_records_db
        .prepare(
          `SELECT user_id, total_deposit, agent, current_level, current_level + 1 as next_level,
                  (next_level_min - total_deposit) as gap,
                  CAST((julianday('now') - julianday(last_active_time)) AS INTEGER) as inactive_days
           ${BASE}
           ORDER BY gap ASC LIMIT ? OFFSET ?`
        )
        .bind(minLevel, maxLevel, maxGap, pageSize, (page - 1) * pageSize)
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
      const authFail = requireAdmin(request, env, "dashboard");
      if (authFail) return authFail;

      const tier = url.searchParams.get("tier") === "high" ? "high" : "low";
      const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
      const pageSize = 10;

      const CURRENT_LEVEL = `CASE
        WHEN total_deposit < 100 THEN 0 WHEN total_deposit < 600 THEN 1 WHEN total_deposit < 5600 THEN 2
        WHEN total_deposit < 15600 THEN 3 WHEN total_deposit < 95600 THEN 4 WHEN total_deposit < 295600 THEN 5
        WHEN total_deposit < 795600 THEN 6 WHEN total_deposit < 1795600 THEN 7 WHEN total_deposit < 3795600 THEN 8
        WHEN total_deposit < 8795600 THEN 9 WHEN total_deposit < 16795600 THEN 10 WHEN total_deposit < 28795600 THEN 11
        WHEN total_deposit < 44795600 THEN 12 WHEN total_deposit < 69795600 THEN 13 ELSE 14 END`;

      const [minLevel, maxLevel, minDays, maxDays] = tier === "low" ? [2, 4, 10, 180] : [5, 14, 15, 240];

      const BASE = `FROM (
          SELECT user_id, total_deposit, user_balance, last_active_time, COALESCE(assigned_agent, 'Unassigned') as agent,
                 ${CURRENT_LEVEL} as current_level,
                 CAST((julianday('now') - julianday(last_active_time)) AS INTEGER) as inactive_days
          FROM users WHERE total_deposit IS NOT NULL AND last_active_time IS NOT NULL
        )
        WHERE current_level BETWEEN ? AND ? AND inactive_days BETWEEN ? AND ?`;

      const countRow = await env.daily_records_db
        .prepare(`SELECT COUNT(*) as c ${BASE}`)
        .bind(minLevel, maxLevel, minDays, maxDays)
        .first<{ c: number }>();

      const rows = await env.daily_records_db
        .prepare(
          `SELECT user_id, current_level, total_deposit, user_balance, agent, inactive_days,
                  substr(last_active_time, 1, 10) as last_active_date
           ${BASE}
           ORDER BY inactive_days DESC LIMIT ? OFFSET ?`
        )
        .bind(minLevel, maxLevel, minDays, maxDays, pageSize, (page - 1) * pageSize)
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
    // SYNC_WINDOW_DAYS anyway. deposits (daily_records_db) and users
    // (master_db) are separate D1 databases with no cross-DB JOIN, so this
    // does two queries and merges in memory — the result set here is small
    // (bounded by however many first-time depositors happened in one day),
    // so paginating in memory after merging is simpler and safer than
    // trying to paginate correctly across two independently-sorted sources.
    if (url.pathname === "/api/dashboard/action-center/yesterday-first-deposits" && request.method === "GET") {
      const authFail = requireAdmin(request, env, "dashboard");
      if (authFail) return authFail;

      const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
      const pageSize = 10;
      const anchorDate = url.searchParams.get("date") || todayIST();
      const yesterday = new Date(anchorDate + "T00:00:00Z");
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);

      const firstDeposits = await env.daily_records_db
        .prepare(
          `SELECT user_id, MIN(region) as region
           FROM deposits WHERE is_first_deposit = 1 AND date(create_time) = ? AND user_id IS NOT NULL
           GROUP BY user_id`
        )
        .bind(yesterdayStr)
        .all<{ user_id: number; region: string | null }>();

      const userIds = firstDeposits.results.map((r) => r.user_id);
      const regionByUser: Record<number, string | null> = {};
      firstDeposits.results.forEach((r) => { regionByUser[r.user_id] = r.region; });

      // Deposit/withdraw totals come from daily_records_db (the same source
      // the first-deposit flag itself came from), NOT master_db.users —
      // master_db only updates from periodic manual uploads, so brand-new
      // users (who by definition just made their FIRST deposit) are very
      // likely to be missing from it entirely. An inner join against
      // master_db silently dropped every one of them (confirmed live: 7
      // flagged first-deposit users, 0 matches in master_db.users).
      type DepositAgg = { user_id: number; total_deposit: number; deposit_count: number };
      type WithdrawAgg = { user_id: number; total_withdrawal: number };
      let depositAggs: DepositAgg[] = [];
      let withdrawAggs: WithdrawAgg[] = [];
      for (let i = 0; i < userIds.length; i += 90) {
        const chunk = userIds.slice(i, i + 90);
        const placeholders = chunk.map(() => "?").join(",");
        const dep = await env.daily_records_db
          .prepare(
            `SELECT user_id, COALESCE(SUM(amount),0) as total_deposit, COUNT(*) as deposit_count
             FROM deposits WHERE status = 'COMPLETE' AND user_id IN (${placeholders}) GROUP BY user_id`
          )
          .bind(...chunk)
          .all<DepositAgg>();
        depositAggs = depositAggs.concat(dep.results);

        const wd = await env.daily_records_db
          .prepare(
            `SELECT user_id, COALESCE(SUM(amount),0) as total_withdrawal
             FROM withdrawals WHERE CAST(status AS REAL) = 2 AND user_id IN (${placeholders}) GROUP BY user_id`
          )
          .bind(...chunk)
          .all<WithdrawAgg>();
        withdrawAggs = withdrawAggs.concat(wd.results);
      }

      // Optional: master_db.city, when the user does happen to already be
      // there — falls back to the deposit export's own RegisterCity field.
      const cityByUser: Record<number, string | null> = {};
      const agentByUser: Record<number, string | null> = {};
      for (let i = 0; i < userIds.length; i += 90) {
        const chunk = userIds.slice(i, i + 90);
        const placeholders = chunk.map(() => "?").join(",");
        const res = await env.daily_records_db
          .prepare(`SELECT user_id, city, assigned_agent FROM users WHERE user_id IN (${placeholders})`)
          .bind(...chunk)
          .all<{ user_id: number; city: string | null; assigned_agent: string | null }>();
        res.results.forEach((r) => { cityByUser[r.user_id] = r.city; agentByUser[r.user_id] = r.assigned_agent; });
      }

      const depositByUser: Record<number, DepositAgg> = {};
      depositAggs.forEach((r) => { depositByUser[r.user_id] = r; });
      const withdrawByUser: Record<number, number> = {};
      withdrawAggs.forEach((r) => { withdrawByUser[r.user_id] = r.total_withdrawal; });

      const vipLevel = (totalDeposit: number): number => {
        const brackets = [100, 600, 5600, 15600, 95600, 295600, 795600, 1795600, 3795600, 8795600, 16795600, 28795600, 44795600, 69795600];
        for (let i = 0; i < brackets.length; i++) if (totalDeposit < brackets[i]) return i;
        return 14;
      };

      const merged = userIds.map((uid) => {
        const dep = depositByUser[uid];
        const totalDeposit = dep?.total_deposit ?? 0;
        const totalWithdrawal = withdrawByUser[uid] ?? 0;
        return {
          user_id: uid,
          agent: agentByUser[uid] || "Unassigned",
          current_level: vipLevel(totalDeposit),
          deposit_count: dep?.deposit_count ?? 0,
          total_deposit: totalDeposit,
          total_withdrawal: totalWithdrawal,
          profit_loss: totalDeposit - totalWithdrawal,
          region: cityByUser[uid] || regionByUser[uid] || "Unknown",
        };
      }).sort((a, b) => b.total_deposit - a.total_deposit);

      const total = merged.length;
      const start = (page - 1) * pageSize;
      return Response.json({
        date: yesterdayStr,
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        rows: merged.slice(start, start + pageSize),
      });
    }

    // Action Center section 4: Active Users. Mirror of section 2 (Inactive
    // Users) but the opposite window — inactive_days capped low instead of
    // floored high. Same master_db.users dependency as sections 1-2 (total
    // deposit / wallet balance / last_active_time have no equivalent in
    // daily_records_db, unlike section 3's deposit totals) — same staleness
    // caveat flagged there applies here too.
    if (url.pathname === "/api/dashboard/action-center/active-users" && request.method === "GET") {
      const authFail = requireAdmin(request, env, "dashboard");
      if (authFail) return authFail;

      const tier = url.searchParams.get("tier") === "high" ? "high" : "low";
      const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
      const pageSize = 10;

      const CURRENT_LEVEL = `CASE
        WHEN total_deposit < 100 THEN 0 WHEN total_deposit < 600 THEN 1 WHEN total_deposit < 5600 THEN 2
        WHEN total_deposit < 15600 THEN 3 WHEN total_deposit < 95600 THEN 4 WHEN total_deposit < 295600 THEN 5
        WHEN total_deposit < 795600 THEN 6 WHEN total_deposit < 1795600 THEN 7 WHEN total_deposit < 3795600 THEN 8
        WHEN total_deposit < 8795600 THEN 9 WHEN total_deposit < 16795600 THEN 10 WHEN total_deposit < 28795600 THEN 11
        WHEN total_deposit < 44795600 THEN 12 WHEN total_deposit < 69795600 THEN 13 ELSE 14 END`;

      const [minLevel, maxLevel, maxDays] = tier === "low" ? [2, 4, 10] : [5, 14, 15];

      const BASE = `FROM (
          SELECT user_id, total_deposit, user_balance, last_active_time, COALESCE(assigned_agent, 'Unassigned') as agent,
                 ${CURRENT_LEVEL} as current_level,
                 CAST((julianday('now') - julianday(last_active_time)) AS INTEGER) as inactive_days
          FROM users WHERE total_deposit IS NOT NULL AND last_active_time IS NOT NULL
        )
        WHERE current_level BETWEEN ? AND ? AND inactive_days BETWEEN 0 AND ?`;

      const countRow = await env.daily_records_db
        .prepare(`SELECT COUNT(*) as c ${BASE}`)
        .bind(minLevel, maxLevel, maxDays)
        .first<{ c: number }>();

      const rows = await env.daily_records_db
        .prepare(
          `SELECT user_id, current_level, total_deposit, user_balance, agent, inactive_days
           ${BASE}
           ORDER BY inactive_days DESC LIMIT ? OFFSET ?`
        )
        .bind(minLevel, maxLevel, maxDays, pageSize, (page - 1) * pageSize)
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

    // Last-sync freshness indicator, shown in the shared dashboard header on
    // every page. Each section's own "Updated HH:MM:SS" text is just the
    // browser's render time, not actual data freshness — it kept reading as
    // current during an ~8hr token-expiry outage where every sync failed,
    // giving false confidence the data was live. This surfaces the real
    // last SUCCESSFUL sync_runs timestamp per source instead.
    if (url.pathname === "/api/dashboard/last-sync" && request.method === "GET") {
      const authFail = requireAdmin(request, env, "dashboard");
      if (authFail) return authFail;

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
    // 1=Processing, 2=Completed, 3=Rejected, 4=Failed — so withdraw totals
    // exclude 3 and 4 only.
    if (url.pathname === "/api/dashboard/home-stats" && request.method === "GET") {
      const authFail = requireAdmin(request, env, "dashboard");
      if (authFail) return authFail;

      const date = url.searchParams.get("date") || todayIST();

      const depositAgg = await env.daily_records_db
        .prepare(
          `SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as orders, COUNT(DISTINCT user_id) as users
           FROM deposits WHERE date(create_time) = ? AND status = 'COMPLETE'`
        )
        .bind(date)
        .first<{ total: number; orders: number; users: number }>();

      const withdrawAgg = await env.daily_records_db
        .prepare(
          `SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as orders, COUNT(DISTINCT user_id) as users
           FROM withdrawals WHERE date(create_time) = ? AND CAST(status AS REAL) IN (0,1,2)`
        )
        .bind(date)
        .first<{ total: number; orders: number; users: number }>();

      const activeUsersRow = await env.daily_records_db
        .prepare(
          `SELECT COUNT(DISTINCT user_id) as c FROM (
             SELECT user_id FROM deposits WHERE date(create_time) = ?
             UNION
             SELECT user_id FROM withdrawals WHERE date(create_time) = ?
             UNION
             SELECT user_id FROM wallet_details WHERE date(create_time) = ?
           )`
        )
        .bind(date, date, date)
        .first<{ c: number }>();

      const totalUsersRow = await env.daily_records_db.prepare(`SELECT COUNT(*) as c FROM users`).first<{ c: number }>();

      return Response.json({
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
      });
    }

    // Deposit Analysis (dashboard section 2): amount-range breakdown,
    // success-rate-by-range, and by-channel tables. All scoped to a single
    // date (defaults to today), same convention as home-stats.
    if (url.pathname === "/api/dashboard/deposit-analysis" && request.method === "GET") {
      const authFail = requireAdmin(request, env, "dashboard");
      if (authFail) return authFail;

      const date = url.searchParams.get("date") || todayIST();

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
           FROM deposits WHERE date(create_time) = ? AND status = 'COMPLETE' GROUP BY range`
        )
        .bind(date)
        .all();

      const successByRange = await env.daily_records_db
        .prepare(
          `SELECT ${RANGE_CASE} as range, COUNT(*) as total,
                  SUM(CASE WHEN status = 'COMPLETE' THEN 1 ELSE 0 END) as completed,
                  AVG(CASE WHEN status = 'COMPLETE' AND result_time IS NOT NULL THEN ${AVG_MINUTES} END) as avg_minutes
           FROM deposits WHERE date(create_time) = ? GROUP BY range`
        )
        .bind(date)
        .all();

      const byChannel = await env.daily_records_db
        .prepare(
          `SELECT COALESCE(channel, 'Unknown') as channel, COUNT(*) as total_orders,
                  SUM(CASE WHEN status = 'COMPLETE' THEN 1 ELSE 0 END) as comp_orders,
                  COUNT(DISTINCT CASE WHEN status = 'COMPLETE' THEN user_id END) as comp_users,
                  COALESCE(SUM(CASE WHEN status = 'COMPLETE' THEN amount ELSE 0 END),0) as comp_amount,
                  AVG(CASE WHEN status = 'COMPLETE' AND result_time IS NOT NULL THEN ${AVG_MINUTES} END) as avg_mins
           FROM deposits WHERE date(create_time) = ? GROUP BY channel ORDER BY total_orders DESC`
        )
        .bind(date)
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
      const authFail = requireAdmin(request, env, "dashboard");
      if (authFail) return authFail;

      const date = url.searchParams.get("date") || todayIST();

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
           FROM deposits WHERE date(create_time) = ? GROUP BY range, hour`
        )
        .bind(date)
        .all();

      const rangeTotals = await env.daily_records_db
        .prepare(
          `SELECT ${RANGE_CASE} as range, COUNT(*) as total_orders
           FROM deposits WHERE date(create_time) = ? GROUP BY range`
        )
        .bind(date)
        .all();

      const byChannelHour = await env.daily_records_db
        .prepare(
          `SELECT COALESCE(channel, 'Unknown') as channel, CAST(strftime('%H', create_time) AS INTEGER) as hour,
                  COUNT(*) as total, SUM(CASE WHEN ${IS_SUCCESS} THEN 1 ELSE 0 END) as success
           FROM deposits WHERE date(create_time) = ? GROUP BY channel, hour`
        )
        .bind(date)
        .all();

      const channelTotals = await env.daily_records_db
        .prepare(
          `SELECT COALESCE(channel, 'Unknown') as channel, COUNT(*) as total_orders
           FROM deposits WHERE date(create_time) = ? GROUP BY channel ORDER BY total_orders DESC`
        )
        .bind(date)
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
      const authFail = requireAdmin(request, env, "dashboard");
      if (authFail) return authFail;

      const date = url.searchParams.get("date") || todayIST();

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
           FROM withdrawals WHERE date(create_time) = ? AND review_time IS NOT NULL
           GROUP BY channel, bucket`
        )
        .bind(date)
        .all();

      const channelCompletionTime = await env.daily_records_db
        .prepare(
          `SELECT COALESCE(channel, 'Unknown') as channel,
                  ${DURATION_BUCKET(HOURS_BETWEEN("review_time", "callback_time"))} as bucket, COUNT(*) as cnt
           FROM withdrawals WHERE date(create_time) = ? AND CAST(status AS REAL) = 2 AND callback_time IS NOT NULL AND review_time IS NOT NULL
           GROUP BY channel, bucket`
        )
        .bind(date)
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
                 FROM withdrawals WHERE CAST(status AS REAL) = 1)
           WHERE h >= 3 GROUP BY bucket`
        )
        .all();

      const inReviewAging = await env.daily_records_db
        .prepare(
          `SELECT CASE WHEN h < 3 THEN '1-3h' WHEN h < 6 THEN '3-6h' ELSE '>6h' END as bucket,
                  COUNT(*) as cnt, COALESCE(SUM(amount),0) as amt
           FROM (SELECT amount, ${HOURS_BETWEEN("create_time", "datetime('now')")} as h
                 FROM withdrawals WHERE CAST(status AS REAL) = 0)
           WHERE h >= 1 GROUP BY bucket`
        )
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
                   FROM withdrawals WHERE CAST(status AS REAL) = 1)
             WHERE h >= 3
           ) GROUP BY range, bucket`
        )
        .all();

      const rangeTotalsForProcessing = await env.daily_records_db
        .prepare(
          `SELECT range, COUNT(*) as total_orders, COALESCE(SUM(amount),0) as total_amount FROM (
             SELECT amount, ${AMOUNT_RANGE} as range
             FROM withdrawals WHERE CAST(status AS REAL) = 1
               AND ${HOURS_BETWEEN("COALESCE(review_time, create_time)", "datetime('now')")} >= 3
           ) GROUP BY range`
        )
        .all();

      const completedLast4Days = await env.daily_records_db
        .prepare(
          `SELECT date(create_time) as d,
                  SUM(CASE WHEN ${HOURS_BETWEEN("create_time", "callback_time")} < 4 THEN 1 ELSE 0 END) as under4h,
                  SUM(CASE WHEN ${HOURS_BETWEEN("create_time", "callback_time")} >= 4 THEN 1 ELSE 0 END) as over4h
           FROM withdrawals
           WHERE CAST(status AS REAL) = 2 AND callback_time IS NOT NULL
             AND date(create_time) BETWEEN date(?, '-6 days') AND date(?)
           GROUP BY d ORDER BY d`
        )
        .bind(date, date)
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
      const authFail = requireAdmin(request, env, "dashboard");
      if (authFail) return authFail;

      const date = url.searchParams.get("date") || todayIST();

      const dayDeposits = await env.daily_records_db
        .prepare(
          `SELECT user_id, SUM(amount) as day_deposit, MIN(region) as region
           FROM deposits WHERE date(create_time) = ? AND status = 'COMPLETE' AND user_id IS NOT NULL
           GROUP BY user_id`
        )
        .bind(date)
        .all<{ user_id: number; day_deposit: number; region: string | null }>();

      const userIds = dayDeposits.results.map((r) => r.user_id);
      const dayDepositByUser: Record<number, number> = {};
      const fallbackRegionByUser: Record<number, string | null> = {};
      dayDeposits.results.forEach((r) => {
        dayDepositByUser[r.user_id] = r.day_deposit;
        fallbackRegionByUser[r.user_id] = r.region;
      });

      type MasterRow = { user_id: number; city: string | null; total_deposit: number | null };
      const chunks: number[][] = [];
      for (let i = 0; i < userIds.length; i += 90) chunks.push(userIds.slice(i, i + 90));
      const chunkResults = await Promise.all(
        chunks.map((chunk) => {
          const placeholders = chunk.map(() => "?").join(",");
          return env.daily_records_db
            .prepare(`SELECT user_id, city, total_deposit FROM users WHERE user_id IN (${placeholders})`)
            .bind(...chunk)
            .all<MasterRow>();
        })
      );
      const masterByUser: Record<number, MasterRow> = {};
      chunkResults.forEach((res) => res.results.forEach((r) => { masterByUser[r.user_id] = r; }));

      const vipLevel = (totalDeposit: number): number => {
        const brackets = [100, 600, 5600, 15600, 95600, 295600, 795600, 1795600, 3795600, 8795600, 16795600, 28795600, 44795600, 69795600];
        for (let i = 0; i < brackets.length; i++) if (totalDeposit < brackets[i]) return i;
        return 14;
      };

      const byRegion: Record<string, { total: number; users: Set<number> }> = {};
      const byVip: Record<number, { total: number; users: Set<number> }> = {};

      userIds.forEach((uid) => {
        const dayAmt = dayDepositByUser[uid] ?? 0;
        const master = masterByUser[uid];
        const region = (master && master.city) || fallbackRegionByUser[uid] || "Unknown";
        const level = vipLevel(master?.total_deposit ?? 0);

        if (!byRegion[region]) byRegion[region] = { total: 0, users: new Set() };
        byRegion[region].total += dayAmt;
        byRegion[region].users.add(uid);

        if (!byVip[level]) byVip[level] = { total: 0, users: new Set() };
        byVip[level].total += dayAmt;
        byVip[level].users.add(uid);
      });

      const topRegions = Object.entries(byRegion)
        .map(([region, v]) => ({ region, total: v.total, users: v.users.size }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

      const byVipLevel = Object.entries(byVip)
        .map(([level, v]) => ({ level: Number(level), total: v.total, users: v.users.size }))
        .sort((a, b) => a.level - b.level);

      return Response.json({ date, topRegions, byVipLevel });
    }

    // Analytics page section 2: Reactivation. "Reactivated" = a user
    // currently counted inactive per master_db (same definition as Action
    // Center's Inactive Users: current VIP bracket + inactive_days window,
    // computed from last_active_time) who has ALSO made a completed
    // deposit recently. This works specifically because master_db.users
    // only updates from periodic manual uploads (established earlier,
    // section 3 of Action Center) — last_active_time does NOT get bumped
    // by today's deposit, so a just-reactivated user still shows up as
    // "inactive" here, letting us intersect the two sets meaningfully
    // instead of everyone always looking freshly active. The 3-day
    // conversion rate uses the CURRENT inactive cohort size as its
    // denominator (an approximation — we don't have historical cohort
    // snapshots). 7-day is not computable at all: deposits data only
    // covers a rolling SYNC_WINDOW_DAYS=5-day window, so a 7-day lookback
    // would silently undercount — shown as "not enough history yet"
    // instead of a misleading number.
    if (url.pathname === "/api/dashboard/analytics/reactivation" && request.method === "GET") {
      const authFail = requireAdmin(request, env, "dashboard");
      if (authFail) return authFail;

      const tier = url.searchParams.get("tier") === "high" ? "high" : "low";
      const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
      const pageSize = 10;
      const anchorDate = url.searchParams.get("date") || todayIST();
      const threeDaysAgo = new Date(anchorDate + "T00:00:00Z");
      threeDaysAgo.setUTCDate(threeDaysAgo.getUTCDate() - 2);
      const threeDaysAgoStr = threeDaysAgo.toISOString().slice(0, 10);

      const [minLevel, maxLevel, minDays, maxDays] = tier === "low" ? [2, 4, 10, 180] : [5, 14, 15, 240];

      const CURRENT_LEVEL = `CASE
        WHEN total_deposit < 100 THEN 0 WHEN total_deposit < 600 THEN 1 WHEN total_deposit < 5600 THEN 2
        WHEN total_deposit < 15600 THEN 3 WHEN total_deposit < 95600 THEN 4 WHEN total_deposit < 295600 THEN 5
        WHEN total_deposit < 795600 THEN 6 WHEN total_deposit < 1795600 THEN 7 WHEN total_deposit < 3795600 THEN 8
        WHEN total_deposit < 8795600 THEN 9 WHEN total_deposit < 16795600 THEN 10 WHEN total_deposit < 28795600 THEN 11
        WHEN total_deposit < 44795600 THEN 12 WHEN total_deposit < 69795600 THEN 13 ELSE 14 END`;

      const cohortCountRow = await env.daily_records_db
        .prepare(
          `SELECT COUNT(*) as c FROM (
             SELECT ${CURRENT_LEVEL} as current_level,
                    CAST((julianday('now') - julianday(last_active_time)) AS INTEGER) as inactive_days
             FROM users WHERE total_deposit IS NOT NULL AND last_active_time IS NOT NULL
           ) WHERE current_level BETWEEN ? AND ? AND inactive_days BETWEEN ? AND ?`
        )
        .bind(minLevel, maxLevel, minDays, maxDays)
        .first<{ c: number }>();
      const cohortSize = cohortCountRow?.c ?? 0;

      // Small sets (today's / last-3-days' depositors), not the whole
      // multi-thousand inactive cohort — cheap to look up individually.
      const todayDeposits = await env.daily_records_db
        .prepare(`SELECT user_id, SUM(amount) as day_deposit FROM deposits WHERE date(create_time) = ? AND status = 'COMPLETE' AND user_id IS NOT NULL GROUP BY user_id`)
        .bind(anchorDate)
        .all<{ user_id: number; day_deposit: number }>();
      const threeDayDeposits = await env.daily_records_db
        .prepare(`SELECT DISTINCT user_id FROM deposits WHERE date(create_time) BETWEEN ? AND ? AND status = 'COMPLETE' AND user_id IS NOT NULL`)
        .bind(threeDaysAgoStr, anchorDate)
        .all<{ user_id: number }>();

      const todayDepositByUser: Record<number, number> = {};
      todayDeposits.results.forEach((r) => { todayDepositByUser[r.user_id] = r.day_deposit; });
      const threeDaySet = new Set(threeDayDeposits.results.map((r) => r.user_id));
      const candidateIds = Array.from(new Set([...Object.keys(todayDepositByUser).map(Number), ...threeDaySet]));

      type MasterRow = { user_id: number; current_level: number; inactive_days: number; agent: string | null };
      let masterRows: MasterRow[] = [];
      for (let i = 0; i < candidateIds.length; i += 90) {
        const chunk = candidateIds.slice(i, i + 90);
        const placeholders = chunk.map(() => "?").join(",");
        const res = await env.daily_records_db
          .prepare(
            `SELECT user_id, ${CURRENT_LEVEL} as current_level, assigned_agent as agent,
                    CAST((julianday('now') - julianday(last_active_time)) AS INTEGER) as inactive_days
             FROM users WHERE user_id IN (${placeholders}) AND total_deposit IS NOT NULL AND last_active_time IS NOT NULL`
          )
          .bind(...chunk)
          .all<MasterRow>();
        masterRows = masterRows.concat(res.results);
      }

      const cohortMembers = masterRows.filter(
        (r) => r.current_level >= minLevel && r.current_level <= maxLevel && r.inactive_days >= minDays && r.inactive_days <= maxDays
      );
      const reactivatedTodayRows = cohortMembers
        .filter((r) => todayDepositByUser[r.user_id] !== undefined)
        .map((r) => ({ user_id: r.user_id, agent: r.agent || "Unassigned", current_level: r.current_level, inactive_days: r.inactive_days, day_deposit: todayDepositByUser[r.user_id] }))
        .sort((a, b) => b.inactive_days - a.inactive_days);
      const reactivated3DayCount = cohortMembers.filter((r) => threeDaySet.has(r.user_id)).length;

      const total = reactivatedTodayRows.length;
      const start = (page - 1) * pageSize;
      return Response.json({
        date: anchorDate,
        tier,
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        rows: reactivatedTodayRows.slice(start, start + pageSize),
        cohortSize,
        reactivatedTodayCount: total,
        reactivated3DayCount,
      });
    }

    // Analytics page section 3: VIP Level Upgrade. Same shape as
    // Reactivation (see that endpoint's comment): the cohort is the
    // "near-upgrade" set — same definition as Action Center's VIP Near
    // Upgrade (current VIP bracket + gap-to-next-bracket window, computed
    // from master_db.total_deposit, which lags behind today's activity).
    // "Upgraded today" = a cohort member whose TODAY's deposit(s), added
    // on top of that lagging total_deposit baseline, push them past the
    // next bracket's floor. total_deposit in master_db is treated as the
    // pre-today baseline specifically because it doesn't reflect today's
    // deposits yet — same staleness fact that made Reactivation work.
    if (url.pathname === "/api/dashboard/analytics/vip-upgrade" && request.method === "GET") {
      const authFail = requireAdmin(request, env, "dashboard");
      if (authFail) return authFail;

      const tier = url.searchParams.get("tier") === "high" ? "high" : "low";
      const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
      const pageSize = 10;
      const anchorDate = url.searchParams.get("date") || todayIST();
      const threeDaysAgo = new Date(anchorDate + "T00:00:00Z");
      threeDaysAgo.setUTCDate(threeDaysAgo.getUTCDate() - 2);
      const threeDaysAgoStr = threeDaysAgo.toISOString().slice(0, 10);

      const [minLevel, maxLevel, maxGap] = tier === "low" ? [2, 4, 1000] : [5, 13, 50000];

      const CURRENT_LEVEL = `CASE
        WHEN total_deposit < 100 THEN 0 WHEN total_deposit < 600 THEN 1 WHEN total_deposit < 5600 THEN 2
        WHEN total_deposit < 15600 THEN 3 WHEN total_deposit < 95600 THEN 4 WHEN total_deposit < 295600 THEN 5
        WHEN total_deposit < 795600 THEN 6 WHEN total_deposit < 1795600 THEN 7 WHEN total_deposit < 3795600 THEN 8
        WHEN total_deposit < 8795600 THEN 9 WHEN total_deposit < 16795600 THEN 10 WHEN total_deposit < 28795600 THEN 11
        WHEN total_deposit < 44795600 THEN 12 WHEN total_deposit < 69795600 THEN 13 ELSE 14 END`;
      const NEXT_LEVEL_MIN = `CASE
        WHEN total_deposit < 100 THEN 100 WHEN total_deposit < 600 THEN 600 WHEN total_deposit < 5600 THEN 5600
        WHEN total_deposit < 15600 THEN 15600 WHEN total_deposit < 95600 THEN 95600 WHEN total_deposit < 295600 THEN 295600
        WHEN total_deposit < 795600 THEN 795600 WHEN total_deposit < 1795600 THEN 1795600 WHEN total_deposit < 3795600 THEN 3795600
        WHEN total_deposit < 8795600 THEN 8795600 WHEN total_deposit < 16795600 THEN 16795600 WHEN total_deposit < 28795600 THEN 28795600
        WHEN total_deposit < 44795600 THEN 44795600 WHEN total_deposit < 69795600 THEN 69795600 ELSE NULL END`;

      const cohortCountRow = await env.daily_records_db
        .prepare(
          `SELECT COUNT(*) as c FROM (
             SELECT total_deposit, ${CURRENT_LEVEL} as current_level, ${NEXT_LEVEL_MIN} as next_level_min
             FROM users WHERE total_deposit IS NOT NULL
           ) WHERE next_level_min IS NOT NULL AND current_level BETWEEN ? AND ?
             AND (next_level_min - total_deposit) BETWEEN 1 AND ?`
        )
        .bind(minLevel, maxLevel, maxGap)
        .first<{ c: number }>();
      const cohortSize = cohortCountRow?.c ?? 0;

      const todayDeposits = await env.daily_records_db
        .prepare(`SELECT user_id, SUM(amount) as day_deposit FROM deposits WHERE date(create_time) = ? AND status = 'COMPLETE' AND user_id IS NOT NULL GROUP BY user_id`)
        .bind(anchorDate)
        .all<{ user_id: number; day_deposit: number }>();
      const threeDayDeposits = await env.daily_records_db
        .prepare(`SELECT user_id, SUM(amount) as amt FROM deposits WHERE date(create_time) BETWEEN ? AND ? AND status = 'COMPLETE' AND user_id IS NOT NULL GROUP BY user_id`)
        .bind(threeDaysAgoStr, anchorDate)
        .all<{ user_id: number; amt: number }>();

      const todayDepositByUser: Record<number, number> = {};
      todayDeposits.results.forEach((r) => { todayDepositByUser[r.user_id] = r.day_deposit; });
      const threeDayDepositByUser: Record<number, number> = {};
      threeDayDeposits.results.forEach((r) => { threeDayDepositByUser[r.user_id] = r.amt; });
      const candidateIds = Array.from(new Set([...Object.keys(todayDepositByUser).map(Number), ...Object.keys(threeDayDepositByUser).map(Number)]));

      type MasterRow = { user_id: number; total_deposit: number; current_level: number; next_level_min: number | null; agent: string | null };
      let masterRows: MasterRow[] = [];
      for (let i = 0; i < candidateIds.length; i += 90) {
        const chunk = candidateIds.slice(i, i + 90);
        const placeholders = chunk.map(() => "?").join(",");
        const res = await env.daily_records_db
          .prepare(
            `SELECT user_id, total_deposit, assigned_agent as agent, ${CURRENT_LEVEL} as current_level, ${NEXT_LEVEL_MIN} as next_level_min
             FROM users WHERE user_id IN (${placeholders}) AND total_deposit IS NOT NULL`
          )
          .bind(...chunk)
          .all<MasterRow>();
        masterRows = masterRows.concat(res.results);
      }

      const vipLevel = (totalDeposit: number): number => {
        const brackets = [100, 600, 5600, 15600, 95600, 295600, 795600, 1795600, 3795600, 8795600, 16795600, 28795600, 44795600, 69795600];
        for (let i = 0; i < brackets.length; i++) if (totalDeposit < brackets[i]) return i;
        return 14;
      };

      const cohortMembers = masterRows.filter(
        (r) => r.next_level_min !== null && r.current_level >= minLevel && r.current_level <= maxLevel &&
          (r.next_level_min - r.total_deposit) >= 1 && (r.next_level_min - r.total_deposit) <= maxGap
      );

      const upgradedTodayRows = cohortMembers
        .filter((r) => todayDepositByUser[r.user_id] !== undefined)
        .map((r) => {
          const dayDeposit = todayDepositByUser[r.user_id];
          const totalAfter = r.total_deposit + dayDeposit;
          const vipAfter = vipLevel(totalAfter);
          return { r, dayDeposit, totalAfter, vipAfter };
        })
        .filter(({ vipAfter, r }) => vipAfter > r.current_level)
        .map(({ r, dayDeposit, totalAfter, vipAfter }) => ({
          user_id: r.user_id,
          agent: r.agent || "Unassigned",
          vip_before: r.current_level,
          vip_after: vipAfter,
          day_deposit: dayDeposit,
          amount_over_minimum: totalAfter - (r.next_level_min as number),
        }))
        .sort((a, b) => b.day_deposit - a.day_deposit);

      const upgraded3DayCount = cohortMembers.filter((r) => {
        const amt = threeDayDepositByUser[r.user_id];
        if (amt === undefined) return false;
        return vipLevel(r.total_deposit + amt) > r.current_level;
      }).length;

      const total = upgradedTodayRows.length;
      const start = (page - 1) * pageSize;
      return Response.json({
        date: anchorDate,
        tier,
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        rows: upgradedTodayRows.slice(start, start + pageSize),
        cohortSize,
        upgradedTodayCount: total,
        upgraded3DayCount,
      });
    }

    // Analytics page section 4 (panel 1): First-Deposit Day-1 Retention.
    // Cohort = yesterday's first-deposit users (same is_first_deposit flag
    // and date-anchoring as Action Center's Yesterday First Deposit Users).
    // "Deposited again" = any COMPLETE deposit from that same cohort today.
    if (url.pathname === "/api/dashboard/analytics/day1-retention" && request.method === "GET") {
      const authFail = requireAdmin(request, env, "dashboard");
      if (authFail) return authFail;

      const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
      const pageSize = 10;
      const anchorDate = url.searchParams.get("date") || todayIST();
      const yesterday = new Date(anchorDate + "T00:00:00Z");
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);

      const firstDeposits = await env.daily_records_db
        .prepare(
          `SELECT user_id, MIN(region) as region FROM deposits
           WHERE is_first_deposit = 1 AND date(create_time) = ? AND user_id IS NOT NULL GROUP BY user_id`
        )
        .bind(yesterdayStr)
        .all<{ user_id: number; region: string | null }>();
      const cohortIds = firstDeposits.results.map((r) => r.user_id);
      const regionByUser: Record<number, string | null> = {};
      firstDeposits.results.forEach((r) => { regionByUser[r.user_id] = r.region; });

      const todayAgg = await env.daily_records_db
        .prepare(
          `SELECT user_id, SUM(amount) as day_deposit, COUNT(*) as deposit_count
           FROM deposits WHERE date(create_time) = ? AND status = 'COMPLETE' AND user_id IS NOT NULL GROUP BY user_id`
        )
        .bind(anchorDate)
        .all<{ user_id: number; day_deposit: number; deposit_count: number }>();
      const todayByUser: Record<number, { day_deposit: number; deposit_count: number }> = {};
      todayAgg.results.forEach((r) => { todayByUser[r.user_id] = r; });

      const cityByUser: Record<number, string | null> = {};
      const agentByUser: Record<number, string | null> = {};
      for (let i = 0; i < cohortIds.length; i += 90) {
        const chunk = cohortIds.slice(i, i + 90);
        const placeholders = chunk.map(() => "?").join(",");
        const res = await env.daily_records_db
          .prepare(`SELECT user_id, city, assigned_agent FROM users WHERE user_id IN (${placeholders})`)
          .bind(...chunk)
          .all<{ user_id: number; city: string | null; assigned_agent: string | null }>();
        res.results.forEach((r) => { cityByUser[r.user_id] = r.city; agentByUser[r.user_id] = r.assigned_agent; });
      }

      const retainedRows = cohortIds
        .filter((uid) => todayByUser[uid] !== undefined)
        .map((uid) => ({
          user_id: uid,
          agent: agentByUser[uid] || "Unassigned",
          day_deposit: todayByUser[uid].day_deposit,
          deposit_count: todayByUser[uid].deposit_count,
          region: cityByUser[uid] || regionByUser[uid] || "Unknown",
        }))
        .sort((a, b) => b.day_deposit - a.day_deposit);

      const cohortSize = cohortIds.length;
      const retainedCount = retainedRows.length;
      const avgDeposit = retainedCount > 0 ? retainedRows.reduce((s, r) => s + r.day_deposit, 0) / retainedCount : 0;

      const total = retainedRows.length;
      const start = (page - 1) * pageSize;
      return Response.json({
        date: anchorDate,
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        rows: retainedRows.slice(start, start + pageSize),
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
      const authFail = requireAdmin(request, env, "dashboard");
      if (authFail) return authFail;

      const tier = url.searchParams.get("tier") === "high" ? "high" : "low";
      const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
      const pageSize = 10;
      const anchorDate = url.searchParams.get("date") || todayIST();
      const [minLevel, maxLevel] = tier === "low" ? [2, 4] : [5, 14];

      const CURRENT_LEVEL = `CASE
        WHEN total_deposit < 100 THEN 0 WHEN total_deposit < 600 THEN 1 WHEN total_deposit < 5600 THEN 2
        WHEN total_deposit < 15600 THEN 3 WHEN total_deposit < 95600 THEN 4 WHEN total_deposit < 295600 THEN 5
        WHEN total_deposit < 795600 THEN 6 WHEN total_deposit < 1795600 THEN 7 WHEN total_deposit < 3795600 THEN 8
        WHEN total_deposit < 8795600 THEN 9 WHEN total_deposit < 16795600 THEN 10 WHEN total_deposit < 28795600 THEN 11
        WHEN total_deposit < 44795600 THEN 12 WHEN total_deposit < 69795600 THEN 13 ELSE 14 END`;

      const cohortCountRow = await env.daily_records_db
        .prepare(
          `SELECT COUNT(*) as c FROM (SELECT ${CURRENT_LEVEL} as current_level FROM users WHERE total_deposit IS NOT NULL)
           WHERE current_level BETWEEN ? AND ?`
        )
        .bind(minLevel, maxLevel)
        .first<{ c: number }>();
      const cohortSize = cohortCountRow?.c ?? 0;

      const todayAgg = await env.daily_records_db
        .prepare(
          `SELECT user_id, SUM(amount) as day_deposit, COUNT(*) as deposit_count
           FROM deposits WHERE date(create_time) = ? AND status = 'COMPLETE' AND user_id IS NOT NULL GROUP BY user_id`
        )
        .bind(anchorDate)
        .all<{ user_id: number; day_deposit: number; deposit_count: number }>();
      const todayIds = todayAgg.results.map((r) => r.user_id);
      const todayByUser: Record<number, { day_deposit: number; deposit_count: number }> = {};
      todayAgg.results.forEach((r) => { todayByUser[r.user_id] = r; });

      type MasterRow = { user_id: number; current_level: number; agent: string | null };
      let masterRows: MasterRow[] = [];
      for (let i = 0; i < todayIds.length; i += 90) {
        const chunk = todayIds.slice(i, i + 90);
        const placeholders = chunk.map(() => "?").join(",");
        const res = await env.daily_records_db
          .prepare(`SELECT user_id, assigned_agent as agent, ${CURRENT_LEVEL} as current_level FROM users WHERE user_id IN (${placeholders}) AND total_deposit IS NOT NULL`)
          .bind(...chunk)
          .all<MasterRow>();
        masterRows = masterRows.concat(res.results);
      }

      const matchedRows = masterRows
        .filter((r) => r.current_level >= minLevel && r.current_level <= maxLevel)
        .map((r) => ({
          user_id: r.user_id,
          agent: r.agent || "Unassigned",
          current_level: r.current_level,
          day_deposit: todayByUser[r.user_id].day_deposit,
          deposit_count: todayByUser[r.user_id].deposit_count,
        }))
        .sort((a, b) => b.day_deposit - a.day_deposit);

      const retainedCount = matchedRows.length;
      const avgDeposit = retainedCount > 0 ? matchedRows.reduce((s, r) => s + r.day_deposit, 0) / retainedCount : 0;

      const total = matchedRows.length;
      const start = (page - 1) * pageSize;
      return Response.json({
        date: anchorDate,
        tier,
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        rows: matchedRows.slice(start, start + pageSize),
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
      const authFail = requireAdmin(request, env, "dashboard");
      if (authFail) return authFail;

      const anchorDate = url.searchParams.get("date") || todayIST();
      const rangeParam = url.searchParams.get("range") || "today";
      const rangeStart = (() => {
        const d = new Date(anchorDate + "T00:00:00Z");
        if (rangeParam === "yesterday") { d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); }
        if (rangeParam === "7d") { d.setUTCDate(d.getUTCDate() - 6); return d.toISOString().slice(0, 10); }
        if (rangeParam === "30d") { d.setUTCDate(d.getUTCDate() - 29); return d.toISOString().slice(0, 10); }
        if (rangeParam === "35d") { d.setUTCDate(d.getUTCDate() - 34); return d.toISOString().slice(0, 10); }
        return anchorDate; // "today" and any custom single-date selection
      })();
      const rangeEnd = rangeParam === "yesterday" ? rangeStart : anchorDate;

      const CURRENT_LEVEL = `CASE
        WHEN total_deposit < 100 THEN 0 WHEN total_deposit < 600 THEN 1 WHEN total_deposit < 5600 THEN 2
        WHEN total_deposit < 15600 THEN 3 WHEN total_deposit < 95600 THEN 4 WHEN total_deposit < 295600 THEN 5
        WHEN total_deposit < 795600 THEN 6 WHEN total_deposit < 1795600 THEN 7 WHEN total_deposit < 3795600 THEN 8
        WHEN total_deposit < 8795600 THEN 9 WHEN total_deposit < 16795600 THEN 10 WHEN total_deposit < 28795600 THEN 11
        WHEN total_deposit < 44795600 THEN 12 WHEN total_deposit < 69795600 THEN 13 ELSE 14 END`;
      const NEXT_LEVEL_MIN = `CASE
        WHEN total_deposit < 100 THEN 100 WHEN total_deposit < 600 THEN 600 WHEN total_deposit < 5600 THEN 5600
        WHEN total_deposit < 15600 THEN 15600 WHEN total_deposit < 95600 THEN 95600 WHEN total_deposit < 295600 THEN 295600
        WHEN total_deposit < 795600 THEN 795600 WHEN total_deposit < 1795600 THEN 1795600 WHEN total_deposit < 3795600 THEN 3795600
        WHEN total_deposit < 8795600 THEN 8795600 WHEN total_deposit < 16795600 THEN 16795600 WHEN total_deposit < 28795600 THEN 28795600
        WHEN total_deposit < 44795600 THEN 44795600 WHEN total_deposit < 69795600 THEN 69795600 ELSE NULL END`;
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

          const rangeDepositors = await env.daily_records_db
            .prepare(`SELECT DISTINCT user_id FROM deposits WHERE date(create_time) BETWEEN ? AND ? AND status = 'COMPLETE' AND user_id IS NOT NULL`)
            .bind(start, end)
            .all<{ user_id: number }>();
          const ids = rangeDepositors.results.map((r) => r.user_id);
          for (let i = 0; i < ids.length; i += 90) {
            const chunk = ids.slice(i, i + 90);
            const placeholders = chunk.map(() => "?").join(",");
            const res = await env.daily_records_db
              .prepare(
                `SELECT COALESCE(assigned_agent,'Unassigned') as agent, ${CURRENT_LEVEL} as current_level,
                        CAST((julianday('now') - julianday(last_active_time)) AS INTEGER) as inactive_days
                 FROM users WHERE user_id IN (${placeholders}) AND total_deposit IS NOT NULL AND last_active_time IS NOT NULL`
              )
              .bind(...chunk)
              .all<{ agent: string; current_level: number; inactive_days: number }>();
            res.results.forEach((r) => {
              if (r.current_level >= minLevel && r.current_level <= maxLevel && r.inactive_days >= minDays && r.inactive_days <= maxDays) {
                ensure(r.agent)[key].num++;
              }
            });
          }
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

          const rangeDeposits = await env.daily_records_db
            .prepare(`SELECT user_id, SUM(amount) as amt FROM deposits WHERE date(create_time) BETWEEN ? AND ? AND status = 'COMPLETE' AND user_id IS NOT NULL GROUP BY user_id`)
            .bind(start, end)
            .all<{ user_id: number; amt: number }>();
          const depositByUser: Record<number, number> = {};
          rangeDeposits.results.forEach((r) => { depositByUser[r.user_id] = r.amt; });
          const ids = rangeDeposits.results.map((r) => r.user_id);
          for (let i = 0; i < ids.length; i += 90) {
            const chunk = ids.slice(i, i + 90);
            const placeholders = chunk.map(() => "?").join(",");
            const res = await env.daily_records_db
              .prepare(
                `SELECT COALESCE(assigned_agent,'Unassigned') as agent, user_id, total_deposit,
                        ${CURRENT_LEVEL} as current_level, ${NEXT_LEVEL_MIN} as next_level_min
                 FROM users WHERE user_id IN (${placeholders}) AND total_deposit IS NOT NULL`
              )
              .bind(...chunk)
              .all<{ agent: string; user_id: number; total_deposit: number; current_level: number; next_level_min: number | null }>();
            res.results.forEach((r) => {
              if (r.next_level_min === null) return;
              const gap = r.next_level_min - r.total_deposit;
              if (r.current_level < minLevel || r.current_level > maxLevel || gap < 1 || gap > maxGap) return;
              const totalAfter = r.total_deposit + (depositByUser[r.user_id] ?? 0);
              if (vipLevel(totalAfter) > r.current_level) ensure(r.agent)[key].num++;
            });
          }
        }));

        // Premium Active (low/high): denominator = agent's total population
        // in that VIP bracket (current state, no activity filter);
        // numerator = of those, who deposited anywhere in [start,end].
        const premiumActiveTask = Promise.all(([
          ["premiumActiveLow", 2, 4], ["premiumActiveHigh", 5, 14],
        ] as [keyof AgentKPIs, number, number][]).map(async ([key, minLevel, maxLevel]) => {
          const cohortRows = await env.daily_records_db
            .prepare(
              `SELECT COALESCE(assigned_agent,'Unassigned') as agent, COUNT(*) as c FROM (
                 SELECT assigned_agent, ${CURRENT_LEVEL} as current_level FROM users WHERE total_deposit IS NOT NULL
               ) WHERE current_level BETWEEN ? AND ? GROUP BY agent`
            )
            .bind(minLevel, maxLevel)
            .all<{ agent: string; c: number }>();
          cohortRows.results.forEach((r) => { ensure(r.agent)[key].den = r.c; });

          const rangeDepositors = await env.daily_records_db
            .prepare(`SELECT DISTINCT user_id FROM deposits WHERE date(create_time) BETWEEN ? AND ? AND status = 'COMPLETE' AND user_id IS NOT NULL`)
            .bind(start, end)
            .all<{ user_id: number }>();
          const ids = rangeDepositors.results.map((r) => r.user_id);
          for (let i = 0; i < ids.length; i += 90) {
            const chunk = ids.slice(i, i + 90);
            const placeholders = chunk.map(() => "?").join(",");
            const res = await env.daily_records_db
              .prepare(`SELECT COALESCE(assigned_agent,'Unassigned') as agent, ${CURRENT_LEVEL} as current_level FROM users WHERE user_id IN (${placeholders}) AND total_deposit IS NOT NULL`)
              .bind(...chunk)
              .all<{ agent: string; current_level: number }>();
            res.results.forEach((r) => {
              if (r.current_level >= minLevel && r.current_level <= maxLevel) ensure(r.agent)[key].num++;
            });
          }
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
          const [firstDepositRows, depositDayRows] = await Promise.all([
            env.daily_records_db
              .prepare(`SELECT DISTINCT user_id, date(create_time) as cohort_day FROM deposits WHERE is_first_deposit = 1 AND date(create_time) BETWEEN ? AND ? AND user_id IS NOT NULL`)
              .bind(cohortWindowStart, cohortWindowEnd)
              .all<{ user_id: number; cohort_day: string }>(),
            env.daily_records_db
              .prepare(`SELECT DISTINCT user_id, date(create_time) as dep_day FROM deposits WHERE date(create_time) BETWEEN ? AND ? AND status = 'COMPLETE' AND user_id IS NOT NULL`)
              .bind(start, end)
              .all<{ user_id: number; dep_day: string }>(),
          ]);
          const depositedOnDay = new Set(depositDayRows.results.map((r) => r.user_id + "|" + r.dep_day));
          const cohortUserIds = Array.from(new Set(firstDepositRows.results.map((r) => r.user_id)));
          const retentionAgentByUser: Record<number, string> = {};
          for (let i = 0; i < cohortUserIds.length; i += 90) {
            const chunk = cohortUserIds.slice(i, i + 90);
            const placeholders = chunk.map(() => "?").join(",");
            const res = await env.daily_records_db
              .prepare(`SELECT user_id, COALESCE(assigned_agent,'Unassigned') as agent FROM users WHERE user_id IN (${placeholders})`)
              .bind(...chunk)
              .all<{ user_id: number; agent: string }>();
            res.results.forEach((r) => { retentionAgentByUser[r.user_id] = r.agent; });
          }
          firstDepositRows.results.forEach((r) => {
            const agent = retentionAgentByUser[r.user_id];
            if (!agent) return;
            const nextDay = new Date(r.cohort_day + "T00:00:00Z");
            nextDay.setUTCDate(nextDay.getUTCDate() + 1);
            const nextDayStr = nextDay.toISOString().slice(0, 10);
            ensure(agent).retention.den++;
            if (depositedOnDay.has(r.user_id + "|" + nextDayStr)) ensure(agent).retention.num++;
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

      return Response.json({
        date: anchorDate,
        range: rangeParam,
        rangeStart,
        rangeEnd,
        monthStart,
        dailyTable,
        monthlyLeaderboard,
      });
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
           FROM users WHERE user_balance IS NOT NULL ORDER BY user_balance DESC LIMIT 10`
        )
        .all();

      const topByDeposit = await env.daily_records_db
        .prepare(
          `SELECT user_id, username, phone, city, total_deposit, deposit_count
           FROM users WHERE total_deposit IS NOT NULL ORDER BY total_deposit DESC LIMIT 10`
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

    if (url.pathname === "/api/config/token" && request.method === "POST") {
      const authFail = requireAdmin(request, env, "config");
      if (authFail) return authFail;
      const body = (await request.json()) as { token?: string };
      if (!body.token) {
        return Response.json({ error: "token is required" }, { status: 400 });
      }
      await setBearerToken(env, body.token);
      // Sync runs in the background (ctx.waitUntil), not awaited inline.
      // The export APIs can be slow or hang (observed 2+ minute calls) —
      // awaiting them here made the whole HTTP request run past Cloudflare's
      // edge timeout, which killed the connection and returned a Cloudflare
      // error page instead of our JSON, breaking the client's res.json().
      // The token save itself is fast and already durable by the time this
      // responds; check /api/sync/status for the sync's actual outcome.
      ctx.waitUntil(runFullSync(env).catch((err) => console.error("runFullSync failed:", err)));
      return Response.json({ saved: true, syncTriggered: "started — check /api/sync/status for results" });
    }

    if (url.pathname === "/api/config/export-urls" && request.method === "GET") {
      const authFail = requireAdmin(request, env, "config");
      if (authFail) return authFail;
      return Response.json(await getAllExportUrls(env));
    }

    if (url.pathname === "/api/config/export-urls" && request.method === "POST") {
      const authFail = requireAdmin(request, env, "config");
      if (authFail) return authFail;
      const body = (await request.json()) as Partial<Record<"deposit" | "withdraw" | "wallet", string>>;
      const sources = ["deposit", "withdraw", "wallet"] as const;
      for (const source of sources) {
        const value = body[source];
        if (typeof value === "string" && value.trim() !== "") {
          await setExportUrl(env, source, value.trim());
        }
      }
      return Response.json({ saved: true, urls: await getAllExportUrls(env) });
    }

    if (url.pathname === "/api/config/upload" && request.method === "POST") {
      const authFail = requireAdmin(request, env, "config");
      if (authFail) return authFail;
      const form = await request.formData();
      const file = form.get("file") as File | null;
      if (file === null || typeof file.arrayBuffer !== "function") {
        return Response.json({ error: "missing file field" }, { status: 400 });
      }
      const buffer = await file.arrayBuffer();
      const uploadResult = await handleMasterUpload(buffer, env, file.name);
      // Same reasoning as /api/config/token above: don't await the
      // follow-on export sync inline, it can outlive Cloudflare's edge
      // timeout for the client's HTTP request.
      ctx.waitUntil(runFullSync(env).catch((err) => console.error("runFullSync failed:", err)));
      return Response.json({ upload: uploadResult, syncTriggered: "started — check /api/sync/status for results" });
    }

    // Agent-assignment upload: a wide matrix (one column per agent, cells
    // are user_ids) rather than the master upload's row-per-user shape —
    // see handleAgentUpload's comment. No sync trigger needed afterward,
    // this only touches users.assigned_agent, nothing export-related.
    if (url.pathname === "/api/config/upload-agents" && request.method === "POST") {
      const authFail = requireAdmin(request, env, "config");
      if (authFail) return authFail;
      const form = await request.formData();
      const file = form.get("file") as File | null;
      if (file === null || typeof file.arrayBuffer !== "function") {
        return Response.json({ error: "missing file field" }, { status: 400 });
      }
      const buffer = await file.arrayBuffer();
      const uploadResult = await handleAgentUpload(buffer, env, file.name);
      return Response.json({ upload: uploadResult });
    }

    return new Response("Not Found", { status: 404 });
  },
};
