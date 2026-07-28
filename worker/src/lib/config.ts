import type { Env, SourceName } from "./types";

const BEARER_TOKEN_CONFIG_KEY = "bearer_token";

const EXPORT_URL_CONFIG_KEY: Record<Exclude<SourceName, "manual_upload">, string> = {
  deposit: "export_url:deposit",
  withdraw: "export_url:withdraw",
  wallet: "export_url:wallet",
};

const EXPORT_URL_ENV_FALLBACK: Record<Exclude<SourceName, "manual_upload">, keyof Env> = {
  deposit: "DEPOSIT_EXPORT_URL",
  withdraw: "WITHDRAW_EXPORT_URL",
  wallet: "WALLET_EXPORT_URL",
};

async function getConfigValue(env: Env, key: string): Promise<string | null> {
  const row = await env.daily_records_db.prepare(`SELECT value FROM app_config WHERE key = ?`).bind(key).first<{ value: string }>();
  return row?.value ?? null;
}

async function setConfigValue(env: Env, key: string, value: string): Promise<void> {
  await env.daily_records_db
    .prepare(`INSERT INTO app_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .bind(key, value)
    .run();
}

// Bearer token lives in D1 (app_config table), not a Worker secret,
// specifically so the Configuration page can replace it at runtime with no
// redeploy. Falls back to the env secret only if nothing has been saved via
// the UI yet.
//
// Was KV-backed until 2026-07-28: KV's 1,000-writes/day cap is account-wide,
// not per-namespace, so once cachedJson's read-through cache (see
// worker/src/lib/cache.ts) started writing to KV on every cache miss, the
// shared quota got exhausted by cache traffic alone and setBearerToken's
// put() started failing with "KV put() limit exceeded for the day" even
// though nothing was wrong with the save itself — confirmed live, and even
// giving config its own separate KV namespace didn't help since the cap is
// per-account. D1 has no comparable daily write cap (100k rows/day free
// tier, and this app already writes far more than that during syncs), so
// moving this one low-volume table here removes the failure mode entirely.
export async function getBearerToken(env: Env): Promise<string> {
  const stored = await getConfigValue(env, BEARER_TOKEN_CONFIG_KEY);
  return stored ?? env.BEARER_TOKEN;
}

export async function setBearerToken(env: Env, token: string): Promise<void> {
  await setConfigValue(env, BEARER_TOKEN_CONFIG_KEY, token);
}

// Export URLs follow the same D1-first, env-fallback pattern as the Bearer
// token — required so the Settings page can "Add or update the Wallet,
// Withdrawal, and Deposit Export Links" without a code change/redeploy.
export async function getExportUrl(env: Env, source: Exclude<SourceName, "manual_upload">): Promise<string> {
  const stored = await getConfigValue(env, EXPORT_URL_CONFIG_KEY[source]);
  return stored ?? (env[EXPORT_URL_ENV_FALLBACK[source]] as string);
}

export async function setExportUrl(
  env: Env,
  source: Exclude<SourceName, "manual_upload">,
  url: string
): Promise<void> {
  await setConfigValue(env, EXPORT_URL_CONFIG_KEY[source], url);
}

export async function getAllExportUrls(env: Env): Promise<Record<Exclude<SourceName, "manual_upload">, string>> {
  const [deposit, withdraw, wallet] = await Promise.all([
    getExportUrl(env, "deposit"),
    getExportUrl(env, "withdraw"),
    getExportUrl(env, "wallet"),
  ]);
  return { deposit, withdraw, wallet };
}
