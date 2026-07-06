import type { Env } from "./types";

const BEARER_TOKEN_KV_KEY = "config:bearer_token";

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
