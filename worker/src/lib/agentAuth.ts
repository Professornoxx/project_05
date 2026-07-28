import type { Env } from "./types";

// Agent logins are real per-person accounts, unlike the shared-password
// dashboard/config logins in auth.ts — each agent's session must resolve to
// their own assigned_agent display_name, not a single shared secret. Session
// tokens live in D1's agent_sessions table, keyed by token -> {agentId,
// displayName, expires_at}, with expired rows filtered at lookup time
// instead of a TTL-based store.
//
// Used to live in SYNC_KV (same namespace as the cachedJson cache and
// config storage). Moved off KV 2026-07-28 alongside those — KV's
// account-wide 1,000-writes/day quota was exhausted by unrelated cache
// traffic that day, and createAgentSession's put() started failing with
// "KV put() limit exceeded for the day", making agent login intermittently
// fail depending on which colo handled the request (confirmed live: login
// POSTs alternated between succeeding and throwing that exact error).
const SESSION_TTL_SECONDS = 8 * 60 * 60; // 8 hours, matches dashboard/config sessions
const PBKDF2_ITERATIONS = 100_000;

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

export function generateSalt(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(16)).buffer);
}

// PBKDF2-SHA256 via Web Crypto — no external dependency needed, and
// available in the Workers runtime unlike bcrypt. 100k iterations is a
// reasonable cost for a small internal team, not a public-facing signup.
export async function hashPassword(password: string, saltHex: string): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: fromHex(saltHex), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return toHex(bits);
}

export async function verifyPassword(password: string, saltHex: string, expectedHashHex: string): Promise<boolean> {
  const actual = await hashPassword(password, saltHex);
  // Constant-time-ish comparison — not perfectly timing-safe in JS, but this
  // is an internal admin tool with 100k-iteration PBKDF2 already dominating
  // any timing signal, not a public auth endpoint under active attack.
  if (actual.length !== expectedHashHex.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expectedHashHex.charCodeAt(i);
  return diff === 0;
}

export interface AgentSession {
  agentId: number;
  displayName: string;
}

function parseCookies(request: Request): Record<string, string> {
  const header = request.headers.get("cookie") ?? "";
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k) out[k] = decodeURIComponent(v.join("="));
  }
  return out;
}

export async function createAgentSession(env: Env, session: AgentSession): Promise<string> {
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)).buffer);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  await env.daily_records_db
    .prepare(`INSERT INTO agent_sessions (token, agent_id, display_name, expires_at) VALUES (?, ?, ?, ?)`)
    .bind(token, session.agentId, session.displayName, expiresAt)
    .run();
  return token;
}

export async function getAgentSession(request: Request, env: Env): Promise<AgentSession | null> {
  const token = parseCookies(request)["agent_session"];
  if (!token) return null;
  const row = await env.daily_records_db
    .prepare(`SELECT agent_id, display_name FROM agent_sessions WHERE token = ? AND expires_at > ?`)
    .bind(token, new Date().toISOString())
    .first<{ agent_id: number; display_name: string }>();
  if (!row) return null;
  return { agentId: row.agent_id, displayName: row.display_name };
}

export async function destroyAgentSession(request: Request, env: Env): Promise<void> {
  const token = parseCookies(request)["agent_session"];
  if (token) await env.daily_records_db.prepare(`DELETE FROM agent_sessions WHERE token = ?`).bind(token).run();
}

export function agentSessionCookieHeader(token: string): string {
  return `agent_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearAgentSessionCookieHeader(): string {
  return `agent_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}
