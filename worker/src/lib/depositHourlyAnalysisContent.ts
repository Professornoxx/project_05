// Dashboard section 3: Deposit hourly analysis — Hourly Success Rate by
// Amount Range and by Channel, matching the provided reference design
// (hour-of-day columns 0-23, green/yellow/red thresholds). This used to
// show withdrawals here; now shows deposits per request. Data from
// /api/dashboard/deposit-hourly-analysis. "Success" = status = 'COMPLETE',
// same definition as the Deposit Analysis section.
export const DEPOSIT_HOURLY_ANALYSIS_CONTENT_HTML = `
<style>
  .dha-panel { background: #fff; border-left: 4px solid #f59e0b; border-radius: 10px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  .dha-panel-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .dha-panel-title { font-weight: 700; font-size: 15px; }
  .dha-excel-btn { background: #16a34a; color: #fff; border: none; padding: 7px 14px; border-radius: 16px; font-size: 12px; font-weight: 600; cursor: pointer; }
  .dha-legend { display: flex; gap: 8px; margin-bottom: 12px; }
  .dha-legend span { font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 10px; }
  .dha-legend .l-good { background: #dcfce7; color: #15803d; }
  .dha-legend .l-mid { background: #fef9c3; color: #a16207; }
  .dha-legend .l-bad { background: #fee2e2; color: #b91c1c; }
  .dha-legend .l-none { background: #f1f5f9; color: #64748b; }
  table.dha-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  table.dha-table th { text-align: center; padding: 6px 8px; background: #fafafa; color: #666; font-size: 10px; text-transform: uppercase; white-space: nowrap; }
  table.dha-table th:first-child, table.dha-table td:first-child { text-align: left; white-space: nowrap; }
  table.dha-table td { padding: 6px 8px; text-align: center; border-top: 1px solid #f0f0f0; }
  table.dha-table td.cell-good { background: #dcfce7; color: #15803d; font-weight: 600; }
  table.dha-table td.cell-mid { background: #fef9c3; color: #a16207; font-weight: 600; }
  table.dha-table td.cell-bad { background: #fee2e2; color: #b91c1c; font-weight: 600; }
  table.dha-table td.cell-none { color: #cbd5e1; }
  table.dha-table td.dha-total { font-weight: 700; text-align: right; }
  .dha-scroll { overflow-x: auto; }
  #dhaStatus { font-size: 13px; color: #888; margin-top: 8px; }
</style>

<div class="dha-panel">
  <div class="dha-panel-head">
    <div class="dha-panel-title">💰 Hourly Success Rate — By Amount Range</div>
    <button class="dha-excel-btn" id="exportDhaRangeBtn">📥 Excel</button>
  </div>
  <div class="dha-legend"><span class="l-good">&ge;41%</span><span class="l-mid">30-40%</span><span class="l-bad">&lt;30%</span><span class="l-none">—</span></div>
  <div class="dha-scroll">
    <table class="dha-table" id="dhaRangeTable">
      <thead><tr id="dhaRangeHead"></tr></thead>
      <tbody><tr><td colspan="26">Loading...</td></tr></tbody>
    </table>
  </div>
</div>

<div class="dha-panel">
  <div class="dha-panel-head">
    <div class="dha-panel-title">💰 Hourly Success Rate — By Channel</div>
    <button class="dha-excel-btn" id="exportDhaChannelBtn">📥 Excel</button>
  </div>
  <div class="dha-legend"><span class="l-good">&ge;41%</span><span class="l-mid">30-40%</span><span class="l-bad">&lt;30%</span><span class="l-none">—</span></div>
  <div class="dha-scroll">
    <table class="dha-table" id="dhaChannelTable">
      <thead><tr id="dhaChannelHead"></tr></thead>
      <tbody><tr><td colspan="26">Loading...</td></tr></tbody>
    </table>
  </div>
</div>

<div id="dhaStatus"></div>

<script>
const DHA_RANGE_ORDER = ['200-299','300-499','500-999','1000-1999','2000-2499','2500-4999','5000-9999','10000-19999','20000-50000','Other'];
const DHA_HOURS = Array.from({ length: 24 }, (_, i) => i);

function dhaCellClass(pct) {
  if (pct === null) return 'cell-none';
  return pct >= 41 ? 'cell-good' : pct >= 30 ? 'cell-mid' : 'cell-bad';
}
function dhaCellText(pct) { return pct === null ? '—' : pct.toFixed(1) + '%'; }
function dhaFmtNum(n) { return Number(n || 0).toLocaleString('en-IN'); }

function dhaBuildHead(rowEl, firstLabel) {
  rowEl.innerHTML = '<th>' + firstLabel + '</th>' + DHA_HOURS.map((h) => '<th>' + h + '</th>').join('') + '<th>TOTAL ORDERS</th>';
}

// Pivots [{key, hour, total, success}] rows into { key: { hourIdx: {total, success} } }
function dhaPivot(rows, keyField) {
  const map = {};
  for (const r of rows) {
    const key = r[keyField];
    if (!map[key]) map[key] = {};
    map[key][r.hour] = { total: r.total, success: r.success };
  }
  return map;
}

function dhaRenderTable(tbodySelector, keys, pivoted, totalsByKey) {
  const rows = keys.map((key) => {
    const hourCells = DHA_HOURS.map((h) => {
      const cell = (pivoted[key] || {})[h];
      const pct = cell && cell.total > 0 ? (cell.success / cell.total * 100) : null;
      return '<td class="' + dhaCellClass(pct) + '">' + dhaCellText(pct) + '</td>';
    }).join('');
    const total = totalsByKey[key] || 0;
    return '<tr><td>' + key + '</td>' + hourCells + '<td class="dha-total">' + dhaFmtNum(total) + '</td></tr>';
  });
  document.querySelector(tbodySelector).innerHTML = rows.join('') || '<tr><td colspan="26">No data</td></tr>';
}

async function loadDepositHourlyAnalysis(date) {
  const statusEl = document.getElementById('dhaStatus');
  statusEl.textContent = 'Loading...';
  try {
    const res = await fetch('/api/dashboard/deposit-hourly-analysis' + (date ? '?date=' + date : ''));
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || res.statusText);

    dhaBuildHead(document.getElementById('dhaRangeHead'), 'AMOUNT RANGE');
    dhaBuildHead(document.getElementById('dhaChannelHead'), 'CHANNEL');

    const rangeTotals = {};
    (d.rangeTotals || []).forEach((r) => { rangeTotals[r.range] = r.total_orders; });
    const rangePivot = dhaPivot(d.byRangeHour || [], 'range');
    const presentRanges = DHA_RANGE_ORDER.filter((r) => rangeTotals[r] !== undefined);
    dhaRenderTable('#dhaRangeTable tbody', presentRanges.length ? presentRanges : DHA_RANGE_ORDER, rangePivot, rangeTotals);

    const channelTotals = {};
    (d.channelTotals || []).forEach((r) => { channelTotals[r.channel] = r.total_orders; });
    const channelKeys = (d.channelTotals || []).map((r) => r.channel);
    const channelPivot = dhaPivot(d.byChannelHour || [], 'channel');
    dhaRenderTable('#dhaChannelTable tbody', channelKeys, channelPivot, channelTotals);

    statusEl.textContent = 'Updated ' + new Date().toLocaleTimeString() + ' — showing ' + d.date;
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
  }
}

function dhaTableToCsv(tableEl) {
  const rows = [...tableEl.querySelectorAll('tr')];
  return rows.map((row) => [...row.children].map((c) => '"' + c.textContent.trim().replace(/"/g,'""') + '"').join(',')).join('\\n');
}
function dhaDownloadCsv(tableEl, filename) {
  const blob = new Blob([dhaTableToCsv(tableEl)], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}
document.getElementById('exportDhaRangeBtn').onclick = () => dhaDownloadCsv(document.getElementById('dhaRangeTable'), 'deposit-hourly-by-range.csv');
document.getElementById('exportDhaChannelBtn').onclick = () => dhaDownloadCsv(document.getElementById('dhaChannelTable'), 'deposit-hourly-by-channel.csv');

// Exposed so the Home page's day picker (loaded after this script) can
// re-trigger this section when the selected date changes.
window.loadDepositHourlyAnalysis = loadDepositHourlyAnalysis;
loadDepositHourlyAnalysis();
</script>
`;
