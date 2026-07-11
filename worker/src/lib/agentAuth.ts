import type { Env } from "./types";

// Agent logins are real per-person accounts, unlike the shared-password
// dashboard/config logins in auth.ts — each agent's session must resolve to
// their own assigned_agent display_name, not a single shared secret. Session
// tokens live in SYNC_KV (same namespace upload-worker already uses for
// config/cache), keyed "agent_session:<token>" -> {agentId, displayName},
// with an expiry instead of a stored-forever mapping.
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
  await env.SYNC_KV.put(`agent_session:${token}`, JSON.stringify(session), { expirationTtl: SESSION_TTL_SECONDS });
  return token;
}

export async function getAgentSession(request: Request, env: Env): Promise<AgentSession | null> {
  const token = parseCookies(request)["agent_session"];
  if (!token) return null;
  const raw = await env.SYNC_KV.get(`agent_session:${token}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AgentSession;
  } catch {
    return null;
  }
}

export async function destroyAgentSession(request: Request, env: Env): Promise<void> {
  const token = parseCookies(request)["agent_session"];
  if (token) await env.SYNC_KV.delete(`agent_session:${token}`);
}

export function agentSessionCookieHeader(token: string): string {
  return `agent_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearAgentSessionCookieHeader(): string {
  return `agent_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}
