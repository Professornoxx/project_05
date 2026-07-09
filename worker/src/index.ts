import type { Env } from "./lib/types";
import { runFullSync, syncSource } from "./lib/sync";
import { handleMasterUpload } from "./lib/upload";
import { setBearerToken, setExportUrl, getAllExportUrls } from "./lib/config";
import { CONFIG_PAGE_HTML } from "./lib/configPage";
import { MASTER_STATS_PAGE_HTML } from "./lib/masterStatsPage";
import { renderDashboardShell, EMPTY_CONTENT_PLACEHOLDER } from "./lib/dashboardShell";
import { HOME_CONTENT_HTML } from "./lib/homeContent";
import { DEPOSIT_ANALYSIS_CONTENT_HTML } from "./lib/depositAnalysisContent";
import { WITHDRAW_ANALYSIS_CONTENT_HTML } from "./lib/withdrawAnalysisContent";
import { WITHDRAWAL_ANALYSIS_CONTENT_HTML } from "./lib/withdrawalAnalysisContent";
import { ACTION_CENTER_CONTENT_HTML } from "./lib/actionCenterContent";
import { INACTIVE_USERS_CONTENT_HTML } from "./lib/inactiveUsersContent";
import { NEW_USERS_BONUSES_CONTENT_HTML } from "./lib/newUsersBonusesContent";
import { ACTIVE_USERS_CONTENT_HTML } from "./lib/activeUsersContent";
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
          ? HOME_CONTENT_HTML + DEPOSIT_ANALYSIS_CONTENT_HTML + WITHDRAW_ANALYSIS_CONTENT_HTML + WITHDRAWAL_ANALYSIS_CONTENT_HTML
          : dashboardRoute.key === "action-center"
          ? ACTION_CENTER_CONTENT_HTML + INACTIVE_USERS_CONTENT_HTML + NEW_USERS_BONUSES_CONTENT_HTML + ACTIVE_USERS_CONTENT_HTML
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
          SELECT user_id, total_deposit, last_active_time,
                 ${CURRENT_LEVEL} as current_level, ${NEXT_LEVEL_MIN} as next_level_min
          FROM users WHERE total_deposit IS NOT NULL
        )
        WHERE next_level_min IS NOT NULL AND current_level BETWEEN ? AND ?
          AND (next_level_min - total_deposit) BETWEEN 1 AND ?`;

      const countRow = await env.master_db
        .prepare(`SELECT COUNT(*) as c ${BASE}`)
        .bind(minLevel, maxLevel, maxGap)
        .first<{ c: number }>();

      const rows = await env.master_db
        .prepare(
          `SELECT user_id, total_deposit, current_level, current_level + 1 as next_level,
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
          SELECT user_id, total_deposit, user_balance, last_active_time,
                 ${CURRENT_LEVEL} as current_level,
                 CAST((julianday('now') - julianday(last_active_time)) AS INTEGER) as inactive_days
          FROM users WHERE total_deposit IS NOT NULL AND last_active_time IS NOT NULL
        )
        WHERE current_level BETWEEN ? AND ? AND inactive_days BETWEEN ? AND ?`;

      const countRow = await env.master_db
        .prepare(`SELECT COUNT(*) as c ${BASE}`)
        .bind(minLevel, maxLevel, minDays, maxDays)
        .first<{ c: number }>();

      const rows = await env.master_db
        .prepare(
          `SELECT user_id, current_level, total_deposit, user_balance, inactive_days,
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
      for (let i = 0; i < userIds.length; i += 90) {
        const chunk = userIds.slice(i, i + 90);
        const placeholders = chunk.map(() => "?").join(",");
        const res = await env.master_db
          .prepare(`SELECT user_id, city FROM users WHERE user_id IN (${placeholders})`)
          .bind(...chunk)
          .all<{ user_id: number; city: string | null }>();
        res.results.forEach((r) => { cityByUser[r.user_id] = r.city; });
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
          SELECT user_id, total_deposit, user_balance, last_active_time,
                 ${CURRENT_LEVEL} as current_level,
                 CAST((julianday('now') - julianday(last_active_time)) AS INTEGER) as inactive_days
          FROM users WHERE total_deposit IS NOT NULL AND last_active_time IS NOT NULL
        )
        WHERE current_level BETWEEN ? AND ? AND inactive_days BETWEEN 0 AND ?`;

      const countRow = await env.master_db
        .prepare(`SELECT COUNT(*) as c ${BASE}`)
        .bind(minLevel, maxLevel, maxDays)
        .first<{ c: number }>();

      const rows = await env.master_db
        .prepare(
          `SELECT user_id, current_level, total_deposit, user_balance, inactive_days
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

      const totalUsersRow = await env.master_db.prepare(`SELECT COUNT(*) as c FROM users`).first<{ c: number }>();

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

    // Withdraw Analysis (dashboard section 3): hourly success-rate tables
    // by amount range and by channel. "Success" = status 2 (Completed) only
    // — same strict definition as Deposit Analysis's status = 'COMPLETE'.
    // NOTE this deliberately differs from the Home KPI card's "Total
    // Withdraw" definition (status 0/1/2, in-review+processing+complete),
    // which measures claimed+pending+completed volume, not completion rate
    // — using that lenient definition here made every cell read ~100%
    // since few withdrawals are ever explicitly rejected/failed.
    if (url.pathname === "/api/dashboard/withdraw-analysis" && request.method === "GET") {
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
      const IS_SUCCESS = `CAST(status AS REAL) = 2`;

      const byRangeHour = await env.daily_records_db
        .prepare(
          `SELECT ${RANGE_CASE} as range, CAST(strftime('%H', create_time) AS INTEGER) as hour,
                  COUNT(*) as total, SUM(CASE WHEN ${IS_SUCCESS} THEN 1 ELSE 0 END) as success
           FROM withdrawals WHERE date(create_time) = ? GROUP BY range, hour`
        )
        .bind(date)
        .all();

      const rangeTotals = await env.daily_records_db
        .prepare(
          `SELECT ${RANGE_CASE} as range, COUNT(*) as total_orders
           FROM withdrawals WHERE date(create_time) = ? GROUP BY range`
        )
        .bind(date)
        .all();

      const byChannelHour = await env.daily_records_db
        .prepare(
          `SELECT COALESCE(channel, 'Unknown') as channel, CAST(strftime('%H', create_time) AS INTEGER) as hour,
                  COUNT(*) as total, SUM(CASE WHEN ${IS_SUCCESS} THEN 1 ELSE 0 END) as success
           FROM withdrawals WHERE date(create_time) = ? GROUP BY channel, hour`
        )
        .bind(date)
        .all();

      const channelTotals = await env.daily_records_db
        .prepare(
          `SELECT COALESCE(channel, 'Unknown') as channel, COUNT(*) as total_orders
           FROM withdrawals WHERE date(create_time) = ? GROUP BY channel ORDER BY total_orders DESC`
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
    // "aging" charts for currently-open orders, and a 4-day completed
    // <4h vs >4h comparison. Scoped to a single date (create_time's day)
    // except the two "aging" charts, which are live snapshots of whatever
    // is currently open (status 0/1) regardless of date, and the 4-day
    // chart, which always covers the 4 days ending on the selected date.
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
      // however old, bucketed by how long it's been sitting.
      const processingAging = await env.daily_records_db
        .prepare(
          `SELECT CASE
             WHEN h < 6 THEN '3-6h' WHEN h < 12 THEN '6-12h' WHEN h < 24 THEN '12-24h' ELSE '>24h' END as bucket,
             COUNT(*) as cnt
           FROM (SELECT ${HOURS_BETWEEN("COALESCE(review_time, create_time)", "datetime('now')")} as h
                 FROM withdrawals WHERE CAST(status AS REAL) = 1)
           WHERE h >= 3 GROUP BY bucket`
        )
        .all();

      const inReviewAging = await env.daily_records_db
        .prepare(
          `SELECT CASE WHEN h < 3 THEN '1-3h' WHEN h < 6 THEN '3-6h' ELSE '>6h' END as bucket, COUNT(*) as cnt
           FROM (SELECT ${HOURS_BETWEEN("create_time", "datetime('now')")} as h
                 FROM withdrawals WHERE CAST(status AS REAL) = 0)
           WHERE h >= 1 GROUP BY bucket`
        )
        .all();

      const completedLast4Days = await env.daily_records_db
        .prepare(
          `SELECT date(create_time) as d,
                  SUM(CASE WHEN ${HOURS_BETWEEN("create_time", "callback_time")} < 4 THEN 1 ELSE 0 END) as under4h,
                  SUM(CASE WHEN ${HOURS_BETWEEN("create_time", "callback_time")} >= 4 THEN 1 ELSE 0 END) as over4h
           FROM withdrawals
           WHERE CAST(status AS REAL) = 2 AND callback_time IS NOT NULL
             AND date(create_time) BETWEEN date(?, '-3 days') AND date(?)
           GROUP BY d ORDER BY d`
        )
        .bind(date, date)
        .all();

      return Response.json({
        date,
        channelProcessingTime: channelProcessingTime.results,
        channelCompletionTime: channelCompletionTime.results,
        processingAging: processingAging.results,
        inReviewAging: inReviewAging.results,
        completedLast4Days: completedLast4Days.results,
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

      const totals = await env.master_db
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

      const topByBalance = await env.master_db
        .prepare(
          `SELECT user_id, username, phone, city, user_balance, total_deposit, total_withdrawal
           FROM users WHERE user_balance IS NOT NULL ORDER BY user_balance DESC LIMIT 10`
        )
        .all();

      const topByDeposit = await env.master_db
        .prepare(
          `SELECT user_id, username, phone, city, total_deposit, deposit_count
           FROM users WHERE total_deposit IS NOT NULL ORDER BY total_deposit DESC LIMIT 10`
        )
        .all();

      const byCity = await env.master_db
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

    return new Response("Not Found", { status: 404 });
  },
};
