import type { Env } from "./types";

const MAX_AGE_SECONDS = 8 * 60 * 60; // 8 hours

// Two fully independent logins: different session cookies AND different
// passwords. Logging into Dashboard does not grant access to Configuration,
// and vice versa — neither the session nor the password is shared.
export type AuthArea = "dashboard" | "config";

function cookieName(area: AuthArea): string {
  return area === "dashboard" ? "dashboard_session" : "config_session";
}

function expectedKey(env: Env, area: AuthArea): string {
  return area === "dashboard" ? env.DASHBOARD_ADMIN_KEY : env.ADMIN_API_KEY;
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

// Cookie value is the admin key itself, set HttpOnly so client-side JS/XSS
// can't read it, Secure+SameSite=Strict so it's only sent same-origin over
// HTTPS. This is a stopgap until a custom domain exists and Cloudflare
// Access can front these routes with real SSO/email OTP — see gotchas.md
// notes in the cloudflare-one skill on why Access needs a zone-owned
// hostname (workers.dev won't qualify).
export function isAuthed(request: Request, env: Env, area: AuthArea): boolean {
  const key = expectedKey(env, area);
  const headerKey = request.headers.get("x-admin-key");
  if (headerKey && headerKey === key) return true;
  const cookies = parseCookies(request);
  return cookies[cookieName(area)] === key;
}

export function sessionCookieHeader(area: AuthArea, key: string): string {
  return `${cookieName(area)}=${encodeURIComponent(key)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${MAX_AGE_SECONDS}`;
}

export function clearCookieHeader(area: AuthArea): string {
  return `${cookieName(area)}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}
