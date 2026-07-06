import type { Env } from "./lib/types";
import { runFullSync, syncSource } from "./lib/sync";
import { handleMasterUpload } from "./lib/upload";
import { setBearerToken, setExportUrl, getAllExportUrls } from "./lib/config";
import { CONFIG_PAGE_HTML } from "./lib/configPage";
import { DASHBOARD_PAGE_HTML } from "./lib/dashboardPage";
import { LOGIN_PAGE_HTML } from "./lib/loginPage";
import { isAuthed, sessionCookieHeader, clearCookieHeader } from "./lib/auth";
import { cleanupOldSyncRuns } from "./lib/cleanup";

const DAILY_CLEANUP_CRON = "0 3 * * *";

// Used by JSON API routes: 401 with no redirect, for programmatic/curl callers.
function requireAdmin(request: Request, env: Env): Response | null {
  if (!isAuthed(request, env)) {
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

    if (url.pathname === "/api/sync/trigger" && request.method === "POST") {
      const authFail = requireAdmin(request, env);
      if (authFail) return authFail;
      const source = url.searchParams.get("source");
      const results =
        source && source !== "all"
          ? [await syncSource(source as "wallet" | "deposit" | "withdraw", env)]
          : await runFullSync(env);
      return Response.json({ results });
    }

    if (url.pathname === "/api/cleanup/trigger" && request.method === "POST") {
      const authFail = requireAdmin(request, env);
      if (authFail) return authFail;
      const result = await cleanupOldSyncRuns(env);
      return Response.json(result);
    }

    if (url.pathname === "/api/sync/status" && request.method === "GET") {
      const authFail = requireAdmin(request, env);
      if (authFail) return authFail;
      const runs = await env.master_db
        .prepare("SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT 50")
        .all();
      return Response.json(runs.results);
    }

    // Dedicated Configuration page — its own URL, admin-only. Gated
    // server-side: unauthenticated visitors are redirected to /login and
    // never see the real form or its markup. Stopgap until a custom domain
    // exists and this can sit behind real Cloudflare Access + SSO/email OTP.
    if (url.pathname === "/config" && request.method === "GET") {
      if (!isAuthed(request, env)) {
        return new Response(null, { status: 302, headers: { Location: "/login" } });
      }
      return new Response(CONFIG_PAGE_HTML, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    // Admin Dashboard — its own URL, same server-side auth gate as /config.
    if (url.pathname === "/dashboard" && request.method === "GET") {
      if (!isAuthed(request, env)) {
        return new Response(null, { status: 302, headers: { Location: "/login" } });
      }
      return new Response(DASHBOARD_PAGE_HTML, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    if (url.pathname === "/login" && request.method === "GET") {
      return new Response(LOGIN_PAGE_HTML, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    if (url.pathname === "/login" && request.method === "POST") {
      const body = (await request.json()) as { key?: string };
      if (!body.key || body.key !== env.ADMIN_API_KEY) {
        return new Response("Unauthorized", { status: 401 });
      }
      return new Response(null, {
        status: 204,
        headers: { "Set-Cookie": sessionCookieHeader(body.key) },
      });
    }

    if (url.pathname === "/logout" && request.method === "POST") {
      return new Response(null, { status: 204, headers: { "Set-Cookie": clearCookieHeader() } });
    }

    if (url.pathname === "/api/config/token" && request.method === "POST") {
      const authFail = requireAdmin(request, env);
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
      const authFail = requireAdmin(request, env);
      if (authFail) return authFail;
      return Response.json(await getAllExportUrls(env));
    }

    if (url.pathname === "/api/config/export-urls" && request.method === "POST") {
      const authFail = requireAdmin(request, env);
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
      const authFail = requireAdmin(request, env);
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
