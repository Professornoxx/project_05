import type { Env, SourceName } from "./types";

const BEARER_TOKEN_KV_KEY = "config:bearer_token";

const EXPORT_URL_KV_KEY: Record<Exclude<SourceName, "manual_upload">, string> = {
  deposit: "config:export_url:deposit",
  withdraw: "config:export_url:withdraw",
  wallet: "config:export_url:wallet",
};

const EXPORT_URL_ENV_FALLBACK: Record<Exclude<SourceName, "manual_upload">, keyof Env> = {
  deposit: "DEPOSIT_EXPORT_URL",
  withdraw: "WITHDRAW_EXPORT_URL",
  wallet: "WALLET_EXPORT_URL",
};

// Bearer token lives in KV, not a Worker secret, specifically so the
// Configuration page can replace it at runtime with no redeploy. Falls back
// to the env secret only if nothing has been saved via the UI yet.
export async function getBearerToken(env: Env): Promise<string> {
  const stored = await env.SYNC_KV.get(BEARER_TOKEN_KV_KEY);
  return stored ?? env.BEARER_TOKEN;
}

export async function setBearerToken(env: Env, token: string): Promise<void> {
  await env.SYNC_KV.put(BEARER_TOKEN_KV_KEY, token);
}

// Export URLs follow the same KV-first, env-fallback pattern as the Bearer
// token — required so the Settings page can "Add or update the Wallet,
// Withdrawal, and Deposit Export Links" without a code change/redeploy.
export async function getExportUrl(env: Env, source: Exclude<SourceName, "manual_upload">): Promise<string> {
  const stored = await env.SYNC_KV.get(EXPORT_URL_KV_KEY[source]);
  return stored ?? (env[EXPORT_URL_ENV_FALLBACK[source]] as string);
}

export async function setExportUrl(
  env: Env,
  source: Exclude<SourceName, "manual_upload">,
  url: string
): Promise<void> {
  await env.SYNC_KV.put(EXPORT_URL_KV_KEY[source], url);
}

export async function getAllExportUrls(env: Env): Promise<Record<Exclude<SourceName, "manual_upload">, string>> {
  const [deposit, withdraw, wallet] = await Promise.all([
    getExportUrl(env, "deposit"),
    getExportUrl(env, "withdraw"),
    getExportUrl(env, "wallet"),
  ]);
  return { deposit, withdraw, wallet };
}
