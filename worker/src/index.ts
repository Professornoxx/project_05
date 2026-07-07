import type { Env } from "./lib/types";
import { runFullSync, syncSource } from "./lib/sync";
import { handleMasterUpload } from "./lib/upload";
import { setBearerToken, setExportUrl, getAllExportUrls } from "./lib/config";
import { CONFIG_PAGE_HTML } from "./lib/configPage";
import { MASTER_STATS_PAGE_HTML } from "./lib/masterStatsPage";
import { renderDashboardShell, EMPTY_CONTENT_PLACEHOLDER } from "./lib/dashboardShell";
import { renderLoginPage } from "./lib/loginPage";
import { isAuthed, sessionCookieHeader, clearCookieHeader, type AuthArea } from "./lib/auth";
import { cleanupOldSyncRuns } from "./lib/cleanup";
import type { ChunkRow } from "./lib/chunkedUpsert";

const DAILY_CLEANUP_CRON = "0 3 * * *";
const CHUNK_WRITE_TABLES = new Set(["deposits", "withdrawals", "wallet_details"]);

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
      return new Response(
        renderDashboardShell(dashboardRoute.key, dashboardRoute.title, EMPTY_CONTENT_PLACEHOLDER),
        { headers: { "content-type": "text/html; charset=utf-8" } }
      );
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
