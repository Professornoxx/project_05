import * as XLSX from "xlsx";

export interface ParsedRow {
  sheetName: string;
  row: Record<string, unknown>;
}

// Reads every worksheet in the workbook and returns every row from every
// sheet, tagged with its source sheet name. Nothing is filtered out here —
// "every worksheet, every valid record" per the sync requirements.
export function parseAllSheets(buffer: ArrayBuffer): ParsedRow[] {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const rows: ParsedRow[] = [];

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const sheetRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: null,
    });
    for (const row of sheetRows) {
      // Skip fully-empty rows (common at sheet ends) but keep everything else
      const hasData = Object.values(row).some((v) => v !== null && v !== "");
      if (hasData) rows.push({ sheetName, row });
    }
  }

  return rows;
}

const ID_FIELD_CANDIDATES = [
  "id", "orderId", "orderNo", "flowId", "recordId", "withdrawId",
  "depositId", "detailId", "serialNo", "serialNumber", "记录ID", "订单号",
];

// Stable dedup identity for a row: prefer the export's own id/order-no field;
// fall back to a content hash so rows without an explicit id are still
// deduplicated deterministically instead of being re-inserted every sync.
export async function recordKey(row: Record<string, unknown>): Promise<string> {
  for (const field of ID_FIELD_CANDIDATES) {
    const v = row[field];
    if (v !== undefined && v !== null && v !== "") return String(v);
  }
  const sortedKeys = Object.keys(row).sort();
  const canonical = JSON.stringify(sortedKeys.map((k) => [k, row[k]]));
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical)
  );
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Field names below are confirmed from real export files (deposit/"Recharge
// Orders" and withdraw/"walletDetail" sheets, pulled live 2026-07-06):
// deposit uses userId/orderAmount, withdraw uses UserId/WithDrawAmount —
// both are kept since real exports are inconsistent about casing per source.
const USER_ID_FIELD_CANDIDATES = ["userId", "UserId", "user_id", "uid", "用户ID", "用户id"];
const AMOUNT_FIELD_CANDIDATES = [
  "amount", "money", "orderAmount", "WithDrawAmount", "ReceivedAmount", "总额", "金额",
];
const STATUS_FIELD_CANDIDATES = [
  "status", "state", "COMPLETE is done",
  "0 Under review, 1 Payment processing, 2 Completed, 3 Rejected, 4 Failed", "状态",
];
const TIME_FIELD_CANDIDATES = ["createTime", "create_time", "time", "创建时间"];

// D1's bind() only accepts string/number/null/ArrayBuffer — a raw JS Date
// (which is what parseAllSheets produces for date cells, via cellDates:true)
// throws "Type 'object' not supported". Coerce before it ever reaches D1.
function coerceForBind(value: unknown): string | number | null {
  if (value === undefined || value === null || value === "") return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number" || typeof value === "string") return value;
  return String(value);
}

function pick(row: Record<string, unknown>, candidates: string[]): unknown {
  for (const c of candidates) {
    if (row[c] !== undefined && row[c] !== null && row[c] !== "") return row[c];
  }
  return null;
}

export function extractCommonFields(row: Record<string, unknown>) {
  return {
    user_id: coerceForBind(pick(row, USER_ID_FIELD_CANDIDATES)) as number | null,
    amount: coerceForBind(pick(row, AMOUNT_FIELD_CANDIDATES)) as number | null,
    status: coerceForBind(pick(row, STATUS_FIELD_CANDIDATES)) as string | null,
    create_time: coerceForBind(pick(row, TIME_FIELD_CANDIDATES)) as string | null,
  };
}
