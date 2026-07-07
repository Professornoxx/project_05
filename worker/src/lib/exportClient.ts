import type { Env, SourceName } from "./types";
import { parseAllSheets } from "./excelParse";
import { getBearerToken, getExportUrl } from "./config";

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function todayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// "Today" as an IST calendar date (UTC+5:30) — the wallet day boundary is
// explicitly IST, not UTC, per instruction. Shifting the current instant by
// the IST offset before reading UTC date fields gives IST's calendar date
// without needing a timezone library (Workers' V8 runtime has no reliable
// local Intl timezone database to lean on for this).
function todayIST(): Date {
  const shifted = new Date(Date.now() + IST_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
}

function daysAgo(base: Date, days: number): Date {
  return new Date(base.getTime() - days * 24 * 60 * 60 * 1000);
}

// Deposit/withdraw: exactly N calendar days including today (N=5 by default
// via SYNC_WINDOW_DAYS). Deliberately computed from a midnight-UTC anchor,
// not "now minus N*24h" — the latter spans N+1 calendar dates whenever the
// current time of day isn't exactly midnight (e.g. 5*24h back from 14:00
// today lands on a date 6 calendar days ago once truncated), which quietly
// over-fetched an extra day every time.
export function syncWindow(env: Env): { beginTime: string; endTime: string } {
  const days = Number(env.SYNC_WINDOW_DAYS);
  const windowDays = Number.isFinite(days) && days > 0 ? days : 5;
  const today = todayUTC();
  const start = daysAgo(today, windowDays - 1);
  return { beginTime: fmtDate(start), endTime: fmtDate(today) };
}

// Wallet's real daily volume (~100,000 rows/day, confirmed live) makes a
// multi-day window unworkable — see walletWindow below for the day-based
// logic that replaces it. Day boundary is IST (per instruction): the first
// sync after IST midnight pulls the previous IST day; every later run that
// same IST day pulls the current IST day.
export function walletWindow(isFirstRunOfDay: boolean): { beginTime: string; endTime: string } {
  const today = todayIST();
  const day = isFirstRunOfDay ? daysAgo(today, 1) : today;
  const dateStr = fmtDate(day);
  return { beginTime: dateStr, endTime: dateStr };
}

const WALLET_LAST_RUN_DATE_KEY = "wallet:last_run_date";

// True exactly once per IST calendar day: the first scheduled/manual sync
// after IST midnight. Every later run that same IST day gets
// isFirstRunOfDay=false. The marker is written unconditionally as soon as
// the IST day changes — tied to calendar time, not to whether that first
// attempt succeeds.
export async function isFirstWalletRunOfDay(env: Env): Promise<boolean> {
  const todayStr = fmtDate(todayIST());
  const lastRunDate = await env.SYNC_KV.get(WALLET_LAST_RUN_DATE_KEY);
  if (lastRunDate === todayStr) return false;
  await env.SYNC_KV.put(WALLET_LAST_RUN_DATE_KEY, todayStr);
  return true;
}

// Fetches the export endpoint for the given source over the last N days.
// Request format confirmed directly from the real frontend's own query
// string (captured live from their admin panel network tab):
//   packageId=10&pageNum=1&pageSize=10&useUpiQuery=true&queryDate[0]=...&queryDate[1]=...
// Date range is queryDate[0]/queryDate[1] (array-bracket params), NOT
// beginTime/endTime — that mismatch is the likely reason every earlier
// attempt failed or hung. pageSize is set high here since export should
// return every matching row, not one UI page of results.
export async function fetchExportRows(source: Exclude<SourceName, "manual_upload">, env: Env) {
  const baseUrl = await getExportUrl(env, source);
  const { beginTime, endTime } =
    source === "wallet" ? walletWindow(await isFirstWalletRunOfDay(env)) : syncWindow(env);

  const params = new URLSearchParams();
  params.set("packageId", env.PACKAGE_ID);
  params.set("pageNum", "1");
  params.set("pageSize", "100000");
  params.set("useUpiQuery", "true");
  params.set("queryDate[0]", beginTime);
  params.set("queryDate[1]", endTime);
  const url = `${baseUrl}?${params.toString()}`;

  const token = await getBearerToken(env);
  const startedAt = Date.now();

  // Hard timeout: the real backend has been observed hanging indefinitely
  // (45s+, no response at all) for valid, authenticated requests — a
  // server-side issue we can't fix, but we can stop it from tying up this
  // Worker invocation forever. Fail fast instead, log a clear timeout error,
  // and let the next hourly cron retry. Wallet gets a longer allowance since
  // its files are much larger (confirmed ~5-15MB for a single day) and take
  // longer to transfer even when the backend is responding normally.
  const REQUEST_TIMEOUT_MS = source === "wallet" ? 60_000 : 25_000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });
  } catch (err) {
    const elapsed = Date.now() - startedAt;
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`${source} export timed out after ${elapsed}ms (no response from backend)`);
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${source} export fetch failed after ${elapsed}ms: ${message}`);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    throw new Error(`${source} export failed: ${res.status} ${res.statusText}`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  const contentLength = res.headers.get("content-length") ?? "unknown";
  const contentDisposition = res.headers.get("content-disposition") ?? "";

  if (contentType.includes("json")) {
    const body = (await res.json()) as { msg?: string; code?: number; rows?: Record<string, unknown>[] };
    if (body.code !== undefined && body.code !== 200) {
      throw new Error(`${source} export error (code ${body.code}): ${body.msg ?? "no message"}`);
    }
    const rows = Array.isArray((body as unknown as Record<string, unknown>[]))
      ? (body as unknown as Record<string, unknown>[])
      : body.rows ?? [];
    return rows.map((row) => ({ sheetName: "json", row }));
  }

  const buffer = await res.arrayBuffer();

  // Sanity-check the byte signature before handing off to the xlsx parser.
  // A real .xlsx is a zip file and must start with "PK" (0x50 0x4B). If it
  // doesn't, the response is something else entirely (HTML error page,
  // truncated body, wrong encoding) and the parser's failure won't explain
  // why — so surface the actual bytes/headers instead of a cryptic
  // "Invalid typed array length" from deep inside the xlsx library.
  const magic = new Uint8Array(buffer.slice(0, 4));
  const isZip = magic[0] === 0x50 && magic[1] === 0x4b;
  if (!isZip) {
    const preview = new TextDecoder().decode(buffer.slice(0, 200));
    throw new Error(
      `${source} export: response is not a valid .xlsx (magic bytes ${[...magic].map((b) => b.toString(16)).join(" ")}). ` +
        `content-type=${contentType} content-length=${contentLength} content-disposition=${contentDisposition} ` +
        `actual-size=${buffer.byteLength} preview="${preview}"`
    );
  }

  return parseAllSheets(buffer);
}
