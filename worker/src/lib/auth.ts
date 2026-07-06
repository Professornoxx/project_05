import type { Env } from "./types";

const COOKIE_NAME = "admin_session";
const MAX_AGE_SECONDS = 8 * 60 * 60; // 8 hours

function parseCookies(request: Request): Record<string, string> {
  const header = request.headers.get("cookie") ?? "";
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k) out[k] = decodeURIComponent(v.join("="));
  }
  return out;
}

// Admin session: cookie value is the admin key itself, set HttpOnly so
// client-side JS/XSS can't read it, Secure+SameSite=Strict so it's only
// sent same-origin over HTTPS. This is a stopgap until a custom domain
// exists and Cloudflare Access can front /config with real SSO/email OTP —
// see gotchas.md notes in the cloudflare-one skill on why Access needs a
// zone-owned hostname (workers.dev won't qualify).
export function isAuthed(request: Request, env: Env): boolean {
  const headerKey = request.headers.get("x-admin-key");
  if (headerKey && headerKey === env.ADMIN_API_KEY) return true;
  const cookies = parseCookies(request);
  return cookies[COOKIE_NAME] === env.ADMIN_API_KEY;
}

export function sessionCookieHeader(key: string): string {
  return `${COOKIE_NAME}=${encodeURIComponent(key)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${MAX_AGE_SECONDS}`;
}

export function clearCookieHeader(): string {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}
