import type { Env, SourceName } from "./types";
import { parseAllSheets } from "./excelParse";
import { getBearerToken } from "./config";

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

export function syncWindow(env: Env): { beginTime: string; endTime: string } {
  const days = Number(env.SYNC_WINDOW_DAYS);
  const windowDays = Number.isFinite(days) && days > 0 ? days : 5; // fallback if unset/invalid
  const end = new Date();
  const start = new Date(end.getTime() - windowDays * 24 * 60 * 60 * 1000);
  return { beginTime: fmtDate(start), endTime: fmtDate(end) };
}

const SOURCE_URL_ENV: Record<Exclude<SourceName, "manual_upload">, keyof Env> = {
  deposit: "DEPOSIT_EXPORT_URL",
  withdraw: "WITHDRAW_EXPORT_URL",
  wallet: "WALLET_EXPORT_URL",
};

// Fetches the export endpoint for the given source over the last 5 days.
// Confirmed live against the real backend (RuoYi-style admin API): these
// /export routes are POST-only with a JSON body, and return the .xlsx file
// directly (content-disposition: attachment) on success. On failure they
// still answer HTTP 200 with a JSON error envelope {msg, code} — code !== 200
// means the call failed (auth expired, bad params, etc.), and MUST be
// treated as an error, not as "zero rows" — a naive content-type check
// silently swallowed these as empty results in an earlier version of this
// function, which looked like a successful-but-empty sync.
export async function fetchExportRows(source: Exclude<SourceName, "manual_upload">, env: Env) {
  const url = env[SOURCE_URL_ENV[source]] as string;
  const { beginTime, endTime } = syncWindow(env);

  const token = await getBearerToken(env);
  const startedAt = Date.now();

  // Hard timeout: the real backend has been observed hanging indefinitely
  // (45s+, no response at all) for valid, authenticated requests — a
  // server-side issue we can't fix, but we can stop it from tying up this
  // Worker invocation forever. Fail fast instead, log a clear timeout error,
  // and let the next hourly cron retry.
  const REQUEST_TIMEOUT_MS = 25_000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ packageId: Number(env.PACKAGE_ID), beginTime, endTime }),
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
