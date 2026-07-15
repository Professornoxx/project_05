import type { Env } from "../../worker/src/lib/types";
import { runFullSync, syncSource } from "../../worker/src/lib/sync";
import { handleMasterUpload, handleAgentUpload } from "../../worker/src/lib/upload";
import { setBearerToken, setExportUrl, getAllExportUrls } from "../../worker/src/lib/config";
import { CONFIG_PAGE_HTML } from "../../worker/src/lib/configPage";
import { renderLoginPage } from "../../worker/src/lib/loginPage";
import { isAuthed, sessionCookieHeader, clearCookieHeader } from "../../worker/src/lib/auth";
import { cleanupOldSyncRuns } from "../../worker/src/lib/cleanup";
import type { ChunkRow } from "../../worker/src/lib/chunkedUpsert";
import { generateSalt, hashPassword } from "../../worker/src/lib/agentAuth";

const DAILY_CLEANUP_CRON = "0 3 * * *";
const HOURLY_SYNC_BACKUP_CRON = "0 * * * *";
const CHUNK_WRITE_TABLES = new Set(["deposits", "withdrawals", "wallet_details"]);

// Used by JSON API routes: 401 with no redirect, for programmatic/curl
// callers. Every route in this Worker is admin/write surface, so unlike
// sync-worker (which checks both "dashboard" and "config" areas) this
// always checks "config" — including the sync/cleanup triggers and status
// endpoint, which used to accept the dashboard-viewer password when they
// lived on sync-worker. Now that they're isolated here with the rest of
// the write surface, requiring the config password for them is correct,
// not just simpler.
function requireAdmin(request: Request, env: Env): Response | null {
  if (!isAuthed(request, env, "config")) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}

// Config-page "Save & Sync" used to run the sync inline via
// ctx.waitUntil(runFullSync(env)) — same CPU-time budget as the request
// that triggered it, so a real sync (especially the ~100k-row wallet
// source) reliably got killed mid-run with "Worker exceeded CPU time
// limit" before writing a single sync_runs row. That's the exact same
// CPU-limit problem the whole ETL pipeline was moved off Workers for in
// the first place (see etl/sync_engine.py's docstring) — it just
// resurfaced here because this one convenience trigger still used the
// old Worker-based path. Dispatching the GitHub Actions workflow instead
// is a single fast outbound request with no CPU ceiling of its own; the
// actual sync work runs on GitHub's infrastructure, same as the hourly
// cron and every manual `gh workflow run` used to unblock this by hand.
// One retry on failure (transient network blips / GitHub API hiccups are
// the common case) before giving up — confirmed live: this dispatch was
// firing correctly every hour for 8 hours straight (00:00-05:00, each
// producing a real workflow_dispatch run) then started failing silently
// for several hours (06:00-11:00) with zero visible signal anywhere except
// Cloudflare's ephemeral console.log, which nobody was watching. A single
// retry won't fix a persistently-bad token, but it does cover the more
// common transient case, and either way the caller now persists the
// outcome to sync_runs (see scheduled() below) so a failure — retried or
// not — is finally visible on the dashboard instead of disappearing.
async function triggerGithubSyncOnce(env: Env): Promise<{ dispatched: boolean; error?: string }> {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
    return { dispatched: false, error: "GITHUB_TOKEN/GITHUB_REPO secret not configured" };
  }
  try {
    const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/etl-hourly.yml/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "upload-worker",
        "content-type": "application/json",
      },
      body: JSON.stringify({ ref: "main" }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { dispatched: false, error: `GitHub API ${res.status}: ${text.slice(0, 200)}` };
    }
    return { dispatched: true };
  } catch (err) {
    return { dispatched: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function triggerGithubSync(env: Env): Promise<{ dispatched: boolean; error?: string }> {
  const first = await triggerGithubSyncOnce(env);
  if (first.dispatched) return first;
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return triggerGithubSyncOnce(env);
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
    }

    if (controller.cron === HOURLY_SYNC_BACKUP_CRON) {
      ctx.waitUntil(
        (async () => {
          const startedAt = new Date().toISOString();
          const result = await triggerGithubSync(env).catch(
            (err) => ({ dispatched: false, error: err instanceof Error ? err.message : String(err) })
          );
          console.log("hourly sync backup dispatch:", JSON.stringify(result));
          // Persisted so a dispatch failure is visible on the dashboard's
          // last-sync banner (as a recentFailure) and queryable in
          // sync_runs, instead of only existing in Cloudflare's ephemeral
          // console log — the gap this closes: this cron fired reliably
          // every hour (confirmed via SYNC_KV markers) while the dispatch
          // itself silently failed for hours with no visible trace.
          await env.daily_records_db
            .prepare(
              `INSERT INTO sync_runs (source, started_at, finished_at, status, rows_upserted, error_message) VALUES (?, ?, ?, ?, 0, ?)`
            )
            .bind("cron_backup", startedAt, new Date().toISOString(), result.dispatched ? "success" : "failed", result.error ?? null)
            .run()
            .catch((err) => console.error("failed to log cron_backup sync_runs row:", err));
        })()
      );
    }
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
      // env.INTERNAL_SECRET being unset (undefined) must never authenticate
      // — without this check, a request with the header simply omitted
      // would satisfy `undefined !== undefined` as false and pass. This is
      // exactly what happened to isAuthed() in auth.ts after a Worker
      // rename left secrets unprovisioned on the new script name; see that
      // fix's comment for the full incident.
      if (!env.INTERNAL_SECRET || request.headers.get("x-internal-secret") !== env.INTERNAL_SECRET) {
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
      const runs = await env.daily_records_db
        .prepare("SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT 50")
        .all();
      return Response.json(runs.results);
    }

    // Dedicated Configuration page — its own URL, its own independent login
    // session (config_session). Gated server-side: unauthenticated visitors
    // are redirected to /config/login and never see the real form or its
    // markup. Stopgap until a custom domain exists and this can sit behind
    // real Cloudflare Access + SSO/email OTP.
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

    if (url.pathname === "/api/config/token" && request.method === "POST") {
      const authFail = requireAdmin(request, env);
      if (authFail) return authFail;
      const body = (await request.json()) as { token?: string };
      if (!body.token) {
        return Response.json({ error: "token is required" }, { status: 400 });
      }
      await setBearerToken(env, body.token);
      const sync = await triggerGithubSync(env);
      return Response.json({
        saved: true,
        syncTriggered: sync.dispatched
          ? "GitHub Actions workflow dispatched — check /api/sync/status shortly for results"
          : `token saved, but failed to dispatch sync: ${sync.error}`,
      });
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
      const sync = await triggerGithubSync(env);
      return Response.json({
        upload: uploadResult,
        syncTriggered: sync.dispatched
          ? "GitHub Actions workflow dispatched — check /api/sync/status shortly for results"
          : `upload saved, but failed to dispatch sync: ${sync.error}`,
      });
    }

    // Agent-assignment upload: a wide matrix (one column per agent, cells
    // are user_ids) rather than the master upload's row-per-user shape —
    // see handleAgentUpload's comment. No sync trigger needed afterward,
    // this only touches users.assigned_agent, nothing export-related.
    if (url.pathname === "/api/config/upload-agents" && request.method === "POST") {
      const authFail = requireAdmin(request, env);
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

    // Agent login account management (Config page's "Agent Accounts"
    // section) — the admin-side setup step before any agent can actually
    // log in. display_name must exactly match a real users.assigned_agent
    // value (the dropdown below is populated from that same column) since
    // it's the join key every agent-scoped query will filter on.
    if (url.pathname === "/api/config/agent-names" && request.method === "GET") {
      const authFail = requireAdmin(request, env);
      if (authFail) return authFail;
      const rows = await env.daily_records_db
        .prepare(`SELECT DISTINCT assigned_agent FROM users WHERE assigned_agent IS NOT NULL AND assigned_agent != '' ORDER BY assigned_agent`)
        .all<{ assigned_agent: string }>();
      return Response.json({ agentNames: rows.results.map((r) => r.assigned_agent) });
    }

    if (url.pathname === "/api/config/agent-accounts" && request.method === "GET") {
      const authFail = requireAdmin(request, env);
      if (authFail) return authFail;
      const rows = await env.daily_records_db
        .prepare(`SELECT agent_id, display_name, login_username, is_active, created_at FROM agent_accounts ORDER BY created_at DESC`)
        .all();
      return Response.json({ accounts: rows.results });
    }

    if (url.pathname === "/api/config/agent-accounts" && request.method === "POST") {
      const authFail = requireAdmin(request, env);
      if (authFail) return authFail;
      const body = (await request.json()) as { displayName?: string; username?: string; password?: string };
      if (!body.displayName || !body.username || !body.password) {
        return Response.json({ error: "displayName, username, and password are all required" }, { status: 400 });
      }
      if (body.password.length < 8) {
        return Response.json({ error: "password must be at least 8 characters" }, { status: 400 });
      }
      // Guard against a typo'd display_name that doesn't match any real
      // assigned_agent value — such an account would log in fine but every
      // scoped query would return zero rows, a confusing silent failure.
      const matchingAgent = await env.daily_records_db
        .prepare(`SELECT 1 FROM users WHERE assigned_agent = ? LIMIT 1`)
        .bind(body.displayName)
        .first();
      if (!matchingAgent) {
        return Response.json({ error: `No users currently have "${body.displayName}" as their assigned agent — check for typos` }, { status: 400 });
      }
      const salt = generateSalt();
      const hash = await hashPassword(body.password, salt);
      try {
        await env.daily_records_db
          .prepare(
            `INSERT INTO agent_accounts (display_name, login_username, password_hash, password_salt, is_active, created_at)
             VALUES (?, ?, ?, ?, 1, ?)`
          )
          .bind(body.displayName, body.username, hash, salt, new Date().toISOString())
          .run();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("UNIQUE")) {
          return Response.json({ error: `Username "${body.username}" is already taken` }, { status: 409 });
        }
        throw err;
      }
      return Response.json({ saved: true });
    }

    if (url.pathname === "/api/config/agent-accounts/toggle" && request.method === "POST") {
      const authFail = requireAdmin(request, env);
      if (authFail) return authFail;
      const body = (await request.json()) as { agentId?: number; isActive?: boolean };
      if (body.agentId === undefined || body.isActive === undefined) {
        return Response.json({ error: "agentId and isActive are required" }, { status: 400 });
      }
      const result = await env.daily_records_db
        .prepare(`UPDATE agent_accounts SET is_active = ? WHERE agent_id = ?`)
        .bind(body.isActive ? 1 : 0, body.agentId)
        .run();
      if (result.meta.changes === 0) {
        return Response.json({ error: "No account found with that ID" }, { status: 404 });
      }
      return Response.json({ saved: true });
    }

    if (url.pathname === "/api/config/agent-accounts/reset-password" && request.method === "POST") {
      const authFail = requireAdmin(request, env);
      if (authFail) return authFail;
      const body = (await request.json()) as { agentId?: number; password?: string };
      if (!body.agentId || !body.password) {
        return Response.json({ error: "agentId and password are required" }, { status: 400 });
      }
      if (body.password.length < 8) {
        return Response.json({ error: "password must be at least 8 characters" }, { status: 400 });
      }
      const salt = generateSalt();
      const hash = await hashPassword(body.password, salt);
      const result = await env.daily_records_db
        .prepare(`UPDATE agent_accounts SET password_hash = ?, password_salt = ? WHERE agent_id = ?`)
        .bind(hash, salt, body.agentId)
        .run();
      if (result.meta.changes === 0) {
        return Response.json({ error: "No account found with that ID" }, { status: 404 });
      }
      return Response.json({ saved: true });
    }

    if (url.pathname === "/api/config/agent-accounts/delete" && request.method === "POST") {
      const authFail = requireAdmin(request, env);
      if (authFail) return authFail;
      const body = (await request.json()) as { agentId?: number };
      if (!body.agentId) {
        return Response.json({ error: "agentId is required" }, { status: 400 });
      }
      const result = await env.daily_records_db
        .prepare(`DELETE FROM agent_accounts WHERE agent_id = ?`)
        .bind(body.agentId)
        .run();
      if (result.meta.changes === 0) {
        return Response.json({ error: "No account found with that ID" }, { status: 404 });
      }
      return Response.json({ deleted: true });
    }

    return new Response("Not Found", { status: 404 });
  },
};
