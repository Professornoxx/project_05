// Dashboard section 3: Withdraw Analysis — Hourly Success Rate by Amount
// Range and by Channel, matching the provided reference design (hour-of-day
// columns 0-23, green/yellow/red thresholds). Data from
// /api/dashboard/withdraw-analysis. "Success" = withdraw status in-review +
// processing + complete (0/1/2), same definition as the Home KPI card.
export const WITHDRAW_ANALYSIS_CONTENT_HTML = `
<style>
  .wa-panel { background: #fff; border-left: 4px solid #f59e0b; border-radius: 10px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  .wa-panel-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .wa-panel-title { font-weight: 700; font-size: 15px; }
  .wa-excel-btn { background: #16a34a; color: #fff; border: none; padding: 7px 14px; border-radius: 16px; font-size: 12px; font-weight: 600; cursor: pointer; }
  .wa-legend { display: flex; gap: 8px; margin-bottom: 12px; }
  .wa-legend span { font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 10px; }
  .wa-legend .l-good { background: #dcfce7; color: #15803d; }
  .wa-legend .l-mid { background: #fef9c3; color: #a16207; }
  .wa-legend .l-bad { background: #fee2e2; color: #b91c1c; }
  .wa-legend .l-none { background: #f1f5f9; color: #64748b; }
  table.wa-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  table.wa-table th { text-align: center; padding: 6px 8px; background: #fafafa; color: #666; font-size: 10px; text-transform: uppercase; white-space: nowrap; }
  table.wa-table th:first-child, table.wa-table td:first-child { text-align: left; white-space: nowrap; }
  table.wa-table td { padding: 6px 8px; text-align: center; border-top: 1px solid #f0f0f0; }
  table.wa-table td.cell-good { background: #dcfce7; color: #15803d; font-weight: 600; }
  table.wa-table td.cell-mid { background: #fef9c3; color: #a16207; font-weight: 600; }
  table.wa-table td.cell-bad { background: #fee2e2; color: #b91c1c; font-weight: 600; }
  table.wa-table td.cell-none { color: #cbd5e1; }
  table.wa-table td.wa-total { font-weight: 700; text-align: right; }
  .wa-scroll { overflow-x: auto; }
  #waStatus { font-size: 13px; color: #888; margin-top: 8px; }
</style>

<div class="wa-panel">
  <div class="wa-panel-head">
    <div class="wa-panel-title">🐿️ Hourly Success Rate — By Amount Range</div>
    <button class="wa-excel-btn" id="exportWaRangeBtn">📥 Excel</button>
  </div>
  <div class="wa-legend"><span class="l-good">&ge;41%</span><span class="l-mid">30-40%</span><span class="l-bad">&lt;30%</span><span class="l-none">—</span></div>
  <div class="wa-scroll">
    <table class="wa-table" id="waRangeTable">
      <thead><tr id="waRangeHead"></tr></thead>
      <tbody><tr><td colspan="26">Loading...</td></tr></tbody>
    </table>
  </div>
</div>

<div class="wa-panel">
  <div class="wa-panel-head">
    <div class="wa-panel-title">🐿️ Hourly Success Rate — By Channel</div>
    <button class="wa-excel-btn" id="exportWaChannelBtn">📥 Excel</button>
  </div>
  <div class="wa-legend"><span class="l-good">&ge;41%</span><span class="l-mid">30-40%</span><span class="l-bad">&lt;30%</span><span class="l-none">—</span></div>
  <div class="wa-scroll">
    <table class="wa-table" id="waChannelTable">
      <thead><tr id="waChannelHead"></tr></thead>
      <tbody><tr><td colspan="26">Loading...</td></tr></tbody>
    </table>
  </div>
</div>

<div id="waStatus"></div>

<script>
const WA_RANGE_ORDER = ['200-299','300-499','500-999','1000-1999','2000-2499','2500-4999','5000-9999','10000-19999','20000-50000','Other'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function waCellClass(pct) {
  if (pct === null) return 'cell-none';
  return pct >= 41 ? 'cell-good' : pct >= 30 ? 'cell-mid' : 'cell-bad';
}
function waCellText(pct) { return pct === null ? '—' : pct.toFixed(1) + '%'; }
function waFmtNum(n) { return Number(n || 0).toLocaleString('en-IN'); }

function waBuildHead(rowEl, firstLabel) {
  rowEl.innerHTML = '<th>' + firstLabel + '</th>' + HOURS.map((h) => '<th>' + h + '</th>').join('') + '<th>TOTAL ORDERS</th>';
}

// Pivots [{key, hour, total, success}] rows into { key: { hourIdx: {total, success} } }
function waPivot(rows, keyField) {
  const map = {};
  for (const r of rows) {
    const key = r[keyField];
    if (!map[key]) map[key] = {};
    map[key][r.hour] = { total: r.total, success: r.success };
  }
  return map;
}

function waRenderTable(tbodySelector, keys, pivoted, totalsByKey) {
  const rows = keys.map((key) => {
    const hourCells = HOURS.map((h) => {
      const cell = (pivoted[key] || {})[h];
      const pct = cell && cell.total > 0 ? (cell.success / cell.total * 100) : null;
      return '<td class="' + waCellClass(pct) + '">' + waCellText(pct) + '</td>';
    }).join('');
    const total = totalsByKey[key] || 0;
    return '<tr><td>' + key + '</td>' + hourCells + '<td class="wa-total">' + waFmtNum(total) + '</td></tr>';
  });
  document.querySelector(tbodySelector).innerHTML = rows.join('') || '<tr><td colspan="26">No data</td></tr>';
}

async function loadWithdrawAnalysis(date) {
  const statusEl = document.getElementById('waStatus');
  statusEl.textContent = 'Loading...';
  try {
    const res = await fetch('/api/dashboard/withdraw-analysis' + (date ? '?date=' + date : ''));
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || res.statusText);

    waBuildHead(document.getElementById('waRangeHead'), 'AMOUNT RANGE');
    waBuildHead(document.getElementById('waChannelHead'), 'CHANNEL');

    const rangeTotals = {};
    (d.rangeTotals || []).forEach((r) => { rangeTotals[r.range] = r.total_orders; });
    const rangePivot = waPivot(d.byRangeHour || [], 'range');
    const presentRanges = WA_RANGE_ORDER.filter((r) => rangeTotals[r] !== undefined);
    waRenderTable('#waRangeTable tbody', presentRanges.length ? presentRanges : WA_RANGE_ORDER, rangePivot, rangeTotals);

    const channelTotals = {};
    (d.channelTotals || []).forEach((r) => { channelTotals[r.channel] = r.total_orders; });
    const channelKeys = (d.channelTotals || []).map((r) => r.channel);
    const channelPivot = waPivot(d.byChannelHour || [], 'channel');
    waRenderTable('#waChannelTable tbody', channelKeys, channelPivot, channelTotals);

    statusEl.textContent = 'Updated ' + new Date().toLocaleTimeString() + ' — showing ' + d.date;
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
  }
}

function waTableToCsv(tableEl) {
  const rows = [...tableEl.querySelectorAll('tr')];
  return rows.map((row) => [...row.children].map((c) => '"' + c.textContent.trim().replace(/"/g,'""') + '"').join(',')).join('\\n');
}
function waDownloadCsv(tableEl, filename) {
  const blob = new Blob([waTableToCsv(tableEl)], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}
document.getElementById('exportWaRangeBtn').onclick = () => waDownloadCsv(document.getElementById('waRangeTable'), 'withdraw-hourly-by-range.csv');
document.getElementById('exportWaChannelBtn').onclick = () => waDownloadCsv(document.getElementById('waChannelTable'), 'withdraw-hourly-by-channel.csv');

// Exposed so the Home page's day picker (loaded after this script) can
// re-trigger this section when the selected date changes.
window.loadWithdrawAnalysis = loadWithdrawAnalysis;
loadWithdrawAnalysis();
</script>
`;
