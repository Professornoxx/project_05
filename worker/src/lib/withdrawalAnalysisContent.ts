// Dashboard section 4: Withdrawal Analysis — channel-wise processing
// (create->review) and completion (review->complete) time buckets, live
// aging charts for currently-open orders, and a 4-day completed <4h vs >4h
// comparison, matching the provided reference design. Data from
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
  .wl-panel-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
  .wl-panel-title { font-weight: 700; font-size: 14px; }
  .wl-excel-btn { background: #16a34a; color: #fff; border: none; padding: 7px 14px; border-radius: 16px; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; }
  table.wl-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  table.wl-table th { text-align: center; padding: 6px 8px; background: #fafafa; color: #666; font-size: 10px; text-transform: uppercase; }
  table.wl-table th:first-child, table.wl-table td:first-child { text-align: left; }
  table.wl-table td { padding: 6px 8px; text-align: center; border-top: 1px solid #f0f0f0; }
  table.wl-table td.wl-total { font-weight: 700; text-align: right; }
  .wl-bars { display: flex; align-items: flex-end; gap: 16px; height: 220px; padding: 10px 4px 0; }
  .wl-bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; }
  .wl-bar { width: 60%; min-height: 2px; border-radius: 3px 3px 0 0; position: relative; }
  .wl-bar-value { font-size: 12px; font-weight: 600; margin-bottom: 4px; }
  .wl-bar-label { font-size: 11px; color: #888; margin-top: 8px; }
  .wl-4day-legend { display: flex; gap: 16px; margin-bottom: 4px; font-size: 12px; }
  .wl-4day-legend span { display: inline-flex; align-items: center; gap: 6px; }
  .wl-4day-legend i { width: 12px; height: 12px; border-radius: 2px; display: inline-block; }
  .wl-4day-groups { display: flex; align-items: flex-end; gap: 40px; height: 260px; padding: 10px 10px 0; overflow-x: auto; }
  .wl-4day-group { display: flex; flex-direction: column; align-items: center; }
  .wl-4day-bars { display: flex; align-items: flex-end; gap: 6px; height: 220px; }
  .wl-4day-bar { width: 34px; min-height: 2px; border-radius: 3px 3px 0 0; position: relative; }
  .wl-4day-date { font-size: 11px; color: #888; margin-top: 8px; }
  #wlStatus, #wl4dSummary { font-size: 13px; color: #888; margin-top: 4px; }
</style>

<div class="wl-header">
  <div class="wl-title">Withdrawal Analysis</div>
  <div class="wl-tag">WITHDRAWALS</div>
</div>

<div class="wl-grid">
  <div class="wl-panel">
    <div class="wl-panel-head">
      <div class="wl-panel-title">⏱️ Channel-wise Processing Time (create → review) — status 1</div>
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
    <div class="wl-bars" id="wlProcAgingBars"></div>
  </div>

  <div class="wl-panel accent-blue">
    <div class="wl-panel-head">
      <div class="wl-panel-title">🔍 In-Review Orders — Aging</div>
      <button class="wl-excel-btn" id="exportWlReviewAgingBtn">📥 Excel</button>
    </div>
    <div class="wl-bars" id="wlReviewAgingBars"></div>
  </div>
</div>

<div class="wl-panel accent-green" style="margin-bottom:20px;">
  <div class="wl-panel-head">
    <div class="wl-panel-title">✅ Completed Orders — &lt;4h vs &gt;4h (Last 4 Days)</div>
    <button class="wl-excel-btn" id="exportWl4dBtn">📥 Excel</button>
  </div>
  <div id="wl4dSummary"></div>
  <div class="wl-4day-legend"><span><i style="background:#1D9E75"></i>&lt;4h</span><span><i style="background:#E24B4A"></i>&gt;4h</span></div>
  <div class="wl-4day-groups" id="wl4dayGroups"></div>
</div>

<div id="wlStatus"></div>

<script>
function wlFmtNum(n) { return Number(n || 0).toLocaleString('en-IN'); }
const WL_BUCKETS = ['<1H','1-3H','3-6H','6-12H','>12H'];

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

function wlRenderAgingBars(containerSelector, rows, order, color) {
  const map = {};
  (rows || []).forEach((r) => { map[r.bucket] = r.cnt; });
  const maxVal = Math.max(...order.map((b) => map[b] || 0), 1);
  const html = order.map((b) => {
    const val = map[b] || 0;
    const heightPct = (val / maxVal) * 100;
    return '<div class="wl-bar-col">' +
      '<div class="wl-bar-value">' + (val || '') + '</div>' +
      '<div class="wl-bar" style="height:' + heightPct + '%;background:' + color + '"></div>' +
      '<div class="wl-bar-label">' + b + '</div>' +
      '</div>';
  }).join('');
  document.querySelector(containerSelector).innerHTML = html;
}

function wlRender4Day(rows) {
  const maxVal = Math.max(...(rows || []).flatMap((r) => [r.under4h || 0, r.over4h || 0]), 1);
  const html = (rows || []).map((r) => {
    const h1 = ((r.under4h || 0) / maxVal) * 100;
    const h2 = ((r.over4h || 0) / maxVal) * 100;
    return '<div class="wl-4day-group">' +
      '<div class="wl-4day-bars">' +
        '<div class="wl-4day-bar" style="height:' + h1 + '%;background:#1D9E75" title="' + (r.under4h||0) + ' under 4h"></div>' +
        '<div class="wl-4day-bar" style="height:' + h2 + '%;background:#E24B4A" title="' + (r.over4h||0) + ' over 4h"></div>' +
      '</div>' +
      '<div class="wl-4day-date">' + r.d + '</div>' +
      '</div>';
  }).join('');
  document.getElementById('wl4dayGroups').innerHTML = html || '<div style="color:#888;">No data</div>';

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

async function loadWithdrawalAnalysis(date) {
  const statusEl = document.getElementById('wlStatus');
  statusEl.textContent = 'Loading...';
  try {
    const res = await fetch('/api/dashboard/withdrawal-analysis' + (date ? '?date=' + date : ''));
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || res.statusText);

    wlRenderTimeTable('#wlProcTimeTable tbody', d.channelProcessingTime);
    wlRenderTimeTable('#wlCompTimeTable tbody', d.channelCompletionTime);
    wlRenderAgingBars('#wlProcAgingBars', d.processingAging, ['3-6h','6-12h','12-24h','>24h'], '#E24B4A');
    wlRenderAgingBars('#wlReviewAgingBars', d.inReviewAging, ['1-3h','3-6h','>6h'], '#1D9E75');
    wlRender4Day(d.completedLast4Days);

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
function wlDownloadBarsCsv(containerSelector, filename) {
  const cols = [...document.querySelectorAll(containerSelector + ' .wl-bar-col')];
  const lines = ['"bucket","count"', ...cols.map((c) =>
    '"' + c.querySelector('.wl-bar-label').textContent + '","' + c.querySelector('.wl-bar-value').textContent + '"'
  )];
  const blob = new Blob([lines.join('\\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}
document.getElementById('exportWlProcAgingBtn').onclick = () => wlDownloadBarsCsv('#wlProcAgingBars', 'processing-orders-aging.csv');
document.getElementById('exportWlReviewAgingBtn').onclick = () => wlDownloadBarsCsv('#wlReviewAgingBars', 'in-review-orders-aging.csv');
document.getElementById('exportWl4dBtn').onclick = () => {
  const lines = ['"date","under_4h","over_4h"', ...[...document.querySelectorAll('.wl-4day-group')].map((g) => {
    const bars = g.querySelectorAll('.wl-4day-bar');
    const date = g.querySelector('.wl-4day-date').textContent;
    return '"' + date + '","' + (bars[0] ? bars[0].title.split(' ')[0] : '0') + '","' + (bars[1] ? bars[1].title.split(' ')[0] : '0') + '"';
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
