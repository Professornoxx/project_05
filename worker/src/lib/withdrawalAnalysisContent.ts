// Dashboard section 4: Withdrawal Analysis — channel-wise processing
// (create->review) and completion (review->complete) time buckets, live
// aging charts for currently-open orders (with count/%/amount labels and
// axis gridlines), a 4-day completed <4h vs >4h comparison, and a
// Withdrawal Processing amount-range breakdown, matching the provided
// reference design pixel-for-pixel. Data from
// /api/dashboard/withdrawal-analysis. review_time/callback_time only exist
// for withdrawals synced after those columns were added, so older rows
// silently fall out of the processing/completion tables.
export const WITHDRAWAL_ANALYSIS_CONTENT_HTML = `
<style>
  .wl-header { display: flex; align-items: center; justify-content: space-between; margin: 24px 0 14px; }
  .wl-title { font-weight: 700; font-size: 15px; letter-spacing: 0.03em; text-transform: uppercase; }
  .wl-tag { background: #fee2e2; color: #b91c1c; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; padding: 4px 10px; border-radius: 6px; }
  .wl-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
  @media (max-width: 900px) { .wl-grid { grid-template-columns: 1fr; } }
  .wl-panel { background: #fff; border-left: 4px solid #e24b4a; border-radius: 0 10px 10px 0; padding: 18px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  .wl-panel.accent-green { border-left-color: #15803d; }
  .wl-panel.accent-blue { border-left-color: #0c447c; }
  .wl-panel.accent-amber { border-left-color: #b45309; }
  .wl-panel-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
  .wl-panel-title { font-weight: 700; font-size: 14px; }
  .wl-excel-btn { background: #16a34a; color: #fff; border: none; padding: 7px 14px; border-radius: 16px; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; }
  table.wl-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  table.wl-table th { text-align: center; padding: 6px 8px; background: #fafafa; color: #666; font-size: 10px; text-transform: uppercase; }
  table.wl-table th:first-child, table.wl-table td:first-child { text-align: left; }
  table.wl-table td { padding: 6px 8px; text-align: center; border-top: 1px solid #f0f0f0; }
  table.wl-table td.wl-total { font-weight: 700; text-align: right; }

  .wl-chart { position: relative; height: 260px; margin-top: 6px; padding-left: 34px; }
  .wl-gridline { position: absolute; left: 34px; right: 0; border-top: 1px solid #eee; font-size: 10px; color: #999; }
  .wl-gridline span { position: absolute; left: -34px; top: -6px; width: 28px; text-align: right; }
  .wl-bars { position: absolute; left: 34px; right: 0; bottom: 0; top: 0; display: flex; align-items: flex-end; gap: 16px; }
  .wl-bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; }
  .wl-bar { width: 60%; min-height: 2px; border-radius: 3px 3px 0 0; position: relative; }
  .wl-bar-value { font-size: 12px; font-weight: 700; margin-bottom: 2px; text-align: center; }
  .wl-bar-sub { font-size: 10px; color: #555; margin-bottom: 4px; text-align: center; line-height: 1.3; }
  .wl-bar-label { font-size: 11px; color: #888; margin-top: 8px; position: absolute; bottom: -20px; }

  .wl-4day-legend { display: flex; gap: 16px; margin-bottom: 4px; font-size: 12px; }
  .wl-4day-legend span { display: inline-flex; align-items: center; gap: 6px; }
  .wl-4day-legend i { width: 12px; height: 12px; border-radius: 2px; display: inline-block; }
  .wl-4day-chart { position: relative; height: 280px; margin-top: 6px; padding-left: 44px; }
  .wl-4day-gridline { position: absolute; left: 44px; right: 0; border-top: 1px solid #eee; font-size: 10px; color: #999; }
  .wl-4day-gridline span { position: absolute; left: -44px; top: -6px; width: 38px; text-align: right; }
  .wl-4day-groups { position: absolute; left: 44px; right: 0; bottom: 0; top: 0; display: flex; align-items: flex-end; gap: 24px; overflow-x: auto; }
  .wl-4day-group { display: flex; flex-direction: column; align-items: center; height: 100%; justify-content: flex-end; min-width: 60px; }
  .wl-4day-bars { display: flex; align-items: flex-end; gap: 6px; height: 100%; }
  .wl-4day-bar-col { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; }
  .wl-4day-bar { width: 34px; min-height: 2px; border-radius: 3px 3px 0 0; }
  .wl-4day-bar-value { font-size: 11px; font-weight: 700; text-align: center; }
  .wl-4day-bar-pct { font-size: 9px; color: #555; text-align: center; }
  .wl-4day-date { font-size: 11px; color: #888; margin-top: 8px; }

  .wl-half-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
  @media (max-width: 900px) { .wl-half-grid { grid-template-columns: 1fr; } }

  #wlStatus, #wl4dSummary { font-size: 13px; color: #888; margin-top: 4px; }
</style>

<div class="wl-header">
  <div class="wl-title">Withdrawal Analysis</div>
  <div class="wl-tag">WITHDRAWALS</div>
</div>

<div class="wl-grid">
  <div class="wl-panel">
    <div class="wl-panel-head">
      <div class="wl-panel-title">⏳ Channel-wise Processing Time (create → review) — status 1</div>
      <button class="wl-excel-btn" id="exportWlProcTimeBtn">📥 Download Orders (Excel)</button>
    </div>
    <table class="wl-table" id="wlProcTimeTable">
      <thead><tr><th>Channel</th><th>&lt;1H</th><th>1-3H</th><th>3-6H</th><th>6-12H</th><th>&gt;12H</th><th>Total</th></tr></thead>
      <tbody><tr><td colspan="7">Loading...</td></tr></tbody>
    </table>
  </div>

  <div class="wl-panel accent-green">
    <div class="wl-panel-head">
      <div class="wl-panel-title">✅ Channel-wise Completion Time (review → complete) — status 2</div>
      <button class="wl-excel-btn" id="exportWlCompTimeBtn">📥 Excel</button>
    </div>
    <table class="wl-table" id="wlCompTimeTable">
      <thead><tr><th>Channel</th><th>&lt;1H</th><th>1-3H</th><th>3-6H</th><th>6-12H</th><th>&gt;12H</th><th>Total</th></tr></thead>
      <tbody><tr><td colspan="7">Loading...</td></tr></tbody>
    </table>
  </div>

  <div class="wl-panel">
    <div class="wl-panel-head">
      <div class="wl-panel-title">⏳ Processing Orders — Aging</div>
      <button class="wl-excel-btn" id="exportWlProcAgingBtn">📥 Excel</button>
    </div>
    <div class="wl-chart" id="wlProcAgingChart"></div>
  </div>

  <div class="wl-panel accent-blue">
    <div class="wl-panel-head">
      <div class="wl-panel-title">🔍 In-Review Orders — Aging</div>
      <button class="wl-excel-btn" id="exportWlReviewAgingBtn">📥 Excel</button>
    </div>
    <div class="wl-chart" id="wlReviewAgingChart"></div>
  </div>
</div>

<div class="wl-half-grid">
  <div class="wl-panel accent-green">
    <div class="wl-panel-head">
      <div class="wl-panel-title">✅ Completed Orders — &lt;4h vs &gt;4h (Last 4 Days)</div>
      <button class="wl-excel-btn" id="exportWl4dBtn">📥 Excel</button>
    </div>
    <div id="wl4dSummary"></div>
    <div class="wl-4day-legend"><span><i style="background:#1D9E75"></i>&lt;4h</span><span><i style="background:#E24B4A"></i>&gt;4h</span></div>
    <div class="wl-4day-chart" id="wl4dayChart"></div>
  </div>

  <div class="wl-panel accent-amber">
    <div class="wl-panel-head">
      <div class="wl-panel-title">💰 Withdrawal Processing — Amount Range</div>
      <button class="wl-excel-btn" id="exportWlRangeBtn">📥 Excel</button>
    </div>
    <table class="wl-table" id="wlRangeTable">
      <thead><tr><th>Amount Range</th><th>3-6H</th><th>6-12H</th><th>12-24H</th><th>&gt;24H</th><th>Total Orders</th><th>Total Amount</th></tr></thead>
      <tbody><tr><td colspan="7">Loading...</td></tr></tbody>
    </table>
  </div>
</div>

<div id="wlStatus"></div>

<script>
function wlFmtNum(n) { return Number(n || 0).toLocaleString('en-IN'); }
function wlFmtInr(n) { return '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }); }
const WL_BUCKETS = ['<1H','1-3H','3-6H','6-12H','>12H'];
const WL_RANGE_BUCKETS = ['3-6H','6-12H','12-24H','>24H'];
const WL_RANGE_ORDER = ['200-999','1000-4999','5000-9999','10000-20000','20001-50000'];

function wlPivotByChannel(rows) {
  const map = {};
  (rows || []).forEach((r) => {
    if (!r.bucket) return;
    if (!map[r.channel]) map[r.channel] = {};
    map[r.channel][r.bucket] = r.cnt;
  });
  return map;
}

function wlRenderTimeTable(tbodySelector, rows) {
  const pivot = wlPivotByChannel(rows);
  const channels = Object.keys(pivot);
  const body = channels.map((ch) => {
    const cells = WL_BUCKETS.map((b) => '<td>' + (pivot[ch][b] || (pivot[ch][b] === 0 ? '0' : '')) + '</td>').join('');
    const total = WL_BUCKETS.reduce((sum, b) => sum + (pivot[ch][b] || 0), 0);
    return '<tr><td>' + ch + '</td>' + cells + '<td class="wl-total">' + wlFmtNum(total) + '</td></tr>';
  }).join('');
  document.querySelector(tbodySelector).innerHTML = body || '<tr><td colspan="7">No data</td></tr>';
}

function wlNiceMax(v) {
  if (v <= 0) return 10;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const niceN = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return niceN * pow;
}

function wlRenderGridlines(container, maxVal, steps) {
  const niceMax = wlNiceMax(maxVal);
  let html = '';
  for (let i = 0; i <= steps; i++) {
    const val = Math.round((niceMax / steps) * i);
    const bottomPct = (i / steps) * 100;
    html += '<div class="' + container + '" style="bottom:' + bottomPct + '%"><span>' + wlFmtNum(val) + '</span></div>';
  }
  return { html, niceMax };
}

function wlRenderAgingChart(containerSelector, rows, order, color) {
  const map = {};
  (rows || []).forEach((r) => { map[r.bucket] = { cnt: r.cnt, amt: r.amt }; });
  const total = order.reduce((sum, b) => sum + ((map[b] || {}).cnt || 0), 0);
  const maxVal = Math.max(...order.map((b) => (map[b] || {}).cnt || 0), 1);
  const { html: gridHtml, niceMax } = wlRenderGridlines('wl-gridline', maxVal, 6);

  const barsHtml = order.map((b) => {
    const cell = map[b] || { cnt: 0, amt: 0 };
    const heightPct = (cell.cnt / niceMax) * 100;
    const pct = total > 0 ? (cell.cnt / total * 100) : 0;
    return '<div class="wl-bar-col">' +
      (cell.cnt > 0 ? '<div class="wl-bar-value">' + wlFmtNum(cell.cnt) + '</div><div class="wl-bar-sub">' + pct.toFixed(1) + '%<br>' + wlFmtInr(cell.amt) + '</div>' : '') +
      '<div class="wl-bar" style="height:' + heightPct + '%;background:' + color + '"></div>' +
      '<div class="wl-bar-label">' + b + '</div>' +
      '</div>';
  }).join('');

  document.querySelector(containerSelector).innerHTML = gridHtml + '<div class="wl-bars">' + barsHtml + '</div>';
}

function wlRender4Day(rows) {
  const maxVal = Math.max(...(rows || []).flatMap((r) => [r.under4h || 0, r.over4h || 0]), 1);
  const { html: gridHtml, niceMax } = wlRenderGridlines('wl-4day-gridline', maxVal, 7);

  const groupsHtml = (rows || []).map((r) => {
    const total = (r.under4h || 0) + (r.over4h || 0);
    const pct1 = total > 0 ? (r.under4h / total * 100) : 0;
    const pct2 = total > 0 ? (r.over4h / total * 100) : 0;
    const h1 = ((r.under4h || 0) / niceMax) * 100;
    const h2 = ((r.over4h || 0) / niceMax) * 100;
    return '<div class="wl-4day-group">' +
      '<div class="wl-4day-bars">' +
        '<div class="wl-4day-bar-col">' +
          (r.under4h > 0 ? '<div class="wl-4day-bar-value">' + wlFmtNum(r.under4h) + '</div><div class="wl-4day-bar-pct">' + pct1.toFixed(1) + '%</div>' : '') +
          '<div class="wl-4day-bar" style="height:' + h1 + '%;background:#1D9E75"></div>' +
        '</div>' +
        '<div class="wl-4day-bar-col">' +
          (r.over4h > 0 ? '<div class="wl-4day-bar-value">' + wlFmtNum(r.over4h) + '</div><div class="wl-4day-bar-pct">' + pct2.toFixed(1) + '%</div>' : '') +
          '<div class="wl-4day-bar" style="height:' + h2 + '%;background:#E24B4A"></div>' +
        '</div>' +
      '</div>' +
      '<div class="wl-4day-date">' + r.d + '</div>' +
      '</div>';
  }).join('');

  document.getElementById('wl4dayChart').innerHTML = gridHtml + '<div class="wl-4day-groups">' + (groupsHtml || '<div style="color:#888;">No data</div>') + '</div>';

  const last = (rows || [])[rows.length - 1];
  const summaryEl = document.getElementById('wl4dSummary');
  if (last) {
    const total = (last.under4h || 0) + (last.over4h || 0);
    const pctUnder = total > 0 ? (last.under4h / total * 100) : 0;
    const pctOver = total > 0 ? (last.over4h / total * 100) : 0;
    summaryEl.textContent = last.d + ': ' + pctUnder.toFixed(1) + '% <4h vs ' + pctOver.toFixed(1) + '% >4h (' + (pctUnder - pctOver).toFixed(1) + ' point gap)';
  } else {
    summaryEl.textContent = '';
  }
}

function wlRenderRangeTable(byRangeBucket, rangeTotals) {
  const pivot = {};
  (byRangeBucket || []).forEach((r) => {
    if (!pivot[r.range]) pivot[r.range] = {};
    pivot[r.range][r.bucket] = r.cnt;
  });
  const totalsByRange = {};
  (rangeTotals || []).forEach((r) => { totalsByRange[r.range] = r; });

  const ranges = WL_RANGE_ORDER.filter((r) => totalsByRange[r]);
  const body = ranges.map((r) => {
    const cells = WL_RANGE_BUCKETS.map((b) => '<td>' + ((pivot[r] || {})[b] || '') + '</td>').join('');
    const t = totalsByRange[r] || { total_orders: 0, total_amount: 0 };
    return '<tr><td>' + r + '</td>' + cells + '<td class="wl-total">' + wlFmtNum(t.total_orders) + '</td><td class="wl-total">' + wlFmtInr(t.total_amount) + '</td></tr>';
  }).join('');
  document.querySelector('#wlRangeTable tbody').innerHTML = body || '<tr><td colspan="7">No data</td></tr>';
}

async function loadWithdrawalAnalysis(date) {
  const statusEl = document.getElementById('wlStatus');
  statusEl.textContent = 'Loading...';
  try {
    const res = await fetch('/api/dashboard/withdrawal-analysis' + (date ? '?date=' + date : ''));
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || res.statusText);

    wlRenderTimeTable('#wlProcTimeTable tbody', d.channelProcessingTime);
    wlRenderTimeTable('#wlCompTimeTable tbody', d.channelCompletionTime);
    wlRenderAgingChart('#wlProcAgingChart', d.processingAging, ['3-6h','6-12h','12-24h','>24h'], '#E24B4A');
    wlRenderAgingChart('#wlReviewAgingChart', d.inReviewAging, ['1-3h','3-6h','>6h'], '#1D9E75');
    wlRender4Day(d.completedLast4Days);
    wlRenderRangeTable(d.processingByAmountRange, d.rangeTotalsForProcessing);

    statusEl.textContent = 'Updated ' + new Date().toLocaleTimeString() + ' — showing ' + d.date;
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
  }
}

function wlTableToCsv(tableEl) {
  const rows = [...tableEl.querySelectorAll('tr')];
  return rows.map((row) => [...row.children].map((c) => '"' + c.textContent.trim().replace(/"/g,'""') + '"').join(',')).join('\\n');
}
function wlDownloadCsv(tableEl, filename) {
  const blob = new Blob([wlTableToCsv(tableEl)], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}
document.getElementById('exportWlProcTimeBtn').onclick = () => wlDownloadCsv(document.getElementById('wlProcTimeTable'), 'withdraw-processing-time.csv');
document.getElementById('exportWlCompTimeBtn').onclick = () => wlDownloadCsv(document.getElementById('wlCompTimeTable'), 'withdraw-completion-time.csv');
document.getElementById('exportWlRangeBtn').onclick = () => wlDownloadCsv(document.getElementById('wlRangeTable'), 'withdrawal-processing-amount-range.csv');

function wlDownloadBarsCsv(containerSelector, filename) {
  const cols = [...document.querySelectorAll(containerSelector + ' .wl-bar-col')];
  const lines = ['"bucket","count"', ...cols.map((c) => {
    const label = c.querySelector('.wl-bar-label').textContent;
    const valueEl = c.querySelector('.wl-bar-value');
    return '"' + label + '","' + (valueEl ? valueEl.textContent : '0') + '"';
  })];
  const blob = new Blob([lines.join('\\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}
document.getElementById('exportWlProcAgingBtn').onclick = () => wlDownloadBarsCsv('#wlProcAgingChart', 'processing-orders-aging.csv');
document.getElementById('exportWlReviewAgingBtn').onclick = () => wlDownloadBarsCsv('#wlReviewAgingChart', 'in-review-orders-aging.csv');
document.getElementById('exportWl4dBtn').onclick = () => {
  const lines = ['"date","under_4h","over_4h"', ...[...document.querySelectorAll('.wl-4day-group')].map((g) => {
    const cols = g.querySelectorAll('.wl-4day-bar-col');
    const date = g.querySelector('.wl-4day-date').textContent;
    const v1 = cols[0] && cols[0].querySelector('.wl-4day-bar-value') ? cols[0].querySelector('.wl-4day-bar-value').textContent : '0';
    const v2 = cols[1] && cols[1].querySelector('.wl-4day-bar-value') ? cols[1].querySelector('.wl-4day-bar-value').textContent : '0';
    return '"' + date + '","' + v1 + '","' + v2 + '"';
  })];
  const blob = new Blob([lines.join('\\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'completed-4h-comparison.csv';
  a.click();
};

window.loadWithdrawalAnalysis = loadWithdrawalAnalysis;
loadWithdrawalAnalysis();
</script>
`;
