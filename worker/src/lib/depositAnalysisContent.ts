// Dashboard section 2: Deposit Analysis — matches the provided reference
// design (Amount Range table with bars, Deposit Channel Analysis with
// success-rate-by-range + by-channel tables). Data from
// /api/dashboard/deposit-analysis.
export const DEPOSIT_ANALYSIS_CONTENT_HTML = `
<style>
  .da-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
  .da-tag { background: #dcfce7; color: #15803d; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; padding: 4px 10px; border-radius: 6px; }
  .da-panel { background: #f7f8fb; border-left: 4px solid #4f46e5; border-radius: 10px; padding: 20px; margin-bottom: 20px; }
  .da-panel-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
  .da-panel-title { font-weight: 700; font-size: 15px; }
  .da-excel-btn { background: #16a34a; color: #fff; border: none; padding: 7px 14px; border-radius: 16px; font-size: 12px; font-weight: 600; cursor: pointer; }
  table.da-table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; font-size: 13px; }
  table.da-table th { text-align: left; padding: 8px 12px; background: #fafafa; color: #666; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; }
  table.da-table td { padding: 8px 12px; border-top: 1px solid #f0f0f0; }
  table.da-table th.num, table.da-table td.num { text-align: right; }
  .bar-cell { position: relative; }
  .bar-fill { position: absolute; top: 0; bottom: 0; left: 0; background: #dbeafe; z-index: 0; }
  .bar-cell span { position: relative; z-index: 1; }
  .success-good { color: #15803d; font-weight: 700; }
  .success-mid { color: #b45309; font-weight: 700; }
  .success-bad { color: #dc2626; font-weight: 700; }
  .da-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  @media (max-width: 900px) { .da-two-col { grid-template-columns: 1fr; } }
  #daStatus { font-size: 13px; color: #888; margin-top: 8px; }
</style>

<div class="da-header">
  <div></div>
  <div class="da-tag">DEPOSITS</div>
</div>

<div class="da-panel">
  <div class="da-panel-head">
    <div class="da-panel-title">📊 Amount Range</div>
    <button class="da-excel-btn" id="exportAmountRangeBtn">📥 Excel</button>
  </div>
  <table class="da-table" id="amountRangeTable">
    <thead><tr><th>Amount Range</th><th class="num">Count</th><th class="num">Users</th><th class="num">Total Amount</th></tr></thead>
    <tbody><tr><td colspan="4">Loading...</td></tr></tbody>
  </table>
</div>

<div class="da-panel">
  <div class="da-panel-head">
    <div class="da-panel-title">🏦 Deposit Channel Analysis</div>
    <button class="da-excel-btn" id="exportChannelBtn">📥 Download Excel</button>
  </div>
  <div class="da-two-col">
    <div>
      <div style="font-weight:600;font-size:13px;margin-bottom:8px;">Deposit Success Rate by Amount Range</div>
      <table class="da-table" id="successRangeTable">
        <thead><tr><th>Amount Range</th><th class="num">Total</th><th class="num">Completed</th><th class="num">Success %</th><th class="num">Avg Time</th></tr></thead>
        <tbody><tr><td colspan="5">Loading...</td></tr></tbody>
      </table>
    </div>
    <div>
      <div style="font-weight:600;font-size:13px;margin-bottom:8px;">Deposit by Channel</div>
      <table class="da-table" id="channelTable">
        <thead><tr><th>Channel</th><th class="num">Total</th><th class="num">Comp.</th><th class="num">Users</th><th class="num">Amount</th><th class="num">Success %</th><th class="num">Avg Mins</th></tr></thead>
        <tbody><tr><td colspan="7">Loading...</td></tr></tbody>
      </table>
    </div>
  </div>
</div>

<div id="daStatus"></div>

<script>
const RANGE_ORDER = ['200-299','300-499','500-999','1000-1999','2000-2499','2500-4999','5000-9999','10000-19999','20000-50000','Other'];

function fmtInr(n) { return '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }); }
function fmtNum(n) { return Number(n || 0).toLocaleString('en-IN'); }
function fmtMin(n) { return n === null || n === undefined ? '—' : Number(n).toFixed(1) + ' min'; }
function successClass(pct) { return pct >= 45 ? 'success-good' : pct >= 20 ? 'success-mid' : 'success-bad'; }

function byRangeOrder(rows) {
  const map = {};
  rows.forEach((r) => { map[r.range] = r; });
  return RANGE_ORDER.map((r) => map[r] || { range: r, count: 0, users: 0, total: 0, total_amt: 0 });
}

async function loadDepositAnalysis(date) {
  const statusEl = document.getElementById('daStatus');
  statusEl.textContent = 'Loading...';
  try {
    const res = await fetch('/api/dashboard/deposit-analysis' + (date ? '?date=' + date : ''));
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || res.statusText);

    const amountRows = byRangeOrder(d.amountRange);
    const maxTotal = Math.max(...amountRows.map((r) => Number(r.total || 0)), 1);
    document.querySelector('#amountRangeTable tbody').innerHTML = amountRows.map((r) => {
      const pct = (Number(r.total || 0) / maxTotal) * 100;
      return '<tr><td>' + r.range + '</td><td class="num">' + fmtNum(r.count) + '</td><td class="num">' + fmtNum(r.users) +
        '</td><td class="num bar-cell"><span class="bar-fill" style="width:' + pct + '%"></span><span>' + fmtInr(r.total) + '</span></td></tr>';
    }).join('');

    const successRows = byRangeOrder(d.successByRange).map((r) => ({ ...r, total: r.total || 0, completed: r.completed || 0 }));
    const maxSuccessTotal = Math.max(...successRows.map((r) => Number(r.total || 0)), 1);
    document.querySelector('#successRangeTable tbody').innerHTML = successRows.map((r) => {
      const pct = r.total > 0 ? (r.completed / r.total * 100) : 0;
      const barPct = (Number(r.total || 0) / maxSuccessTotal) * 100;
      return '<tr><td>' + r.range + '</td><td class="num bar-cell"><span class="bar-fill" style="width:' + barPct + '%"></span><span>' + fmtNum(r.total) + '</span></td><td class="num">' + fmtNum(r.completed) +
        '</td><td class="num ' + successClass(pct) + '">' + pct.toFixed(1) + '%</td><td class="num">' + fmtMin(r.avg_minutes) + '</td></tr>';
    }).join('') || '<tr><td colspan="5">No data</td></tr>';

    const channelRows = d.byChannel || [];
    const maxChannelAmount = Math.max(...channelRows.map((r) => Number(r.comp_amount || 0)), 1);
    document.querySelector('#channelTable tbody').innerHTML = channelRows.map((r) => {
      const pct = r.total_orders > 0 ? (r.comp_orders / r.total_orders * 100) : 0;
      const barPct = (Number(r.comp_amount || 0) / maxChannelAmount) * 100;
      return '<tr><td>' + r.channel + '</td><td class="num">' + fmtNum(r.total_orders) + '</td><td class="num">' + fmtNum(r.comp_orders) +
        '</td><td class="num">' + fmtNum(r.comp_users) + '</td><td class="num bar-cell"><span class="bar-fill" style="width:' + barPct + '%"></span><span>' + fmtInr(r.comp_amount) + '</span></td>' +
        '<td class="num ' + successClass(pct) + '">' + pct.toFixed(1) + '%</td><td class="num">' + fmtMin(r.avg_mins) + '</td></tr>';
    }).join('') || '<tr><td colspan="7">No data</td></tr>';

    statusEl.textContent = 'Updated ' + new Date().toLocaleTimeString() + ' — showing ' + d.date;
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
  }
}

function tableToCsv(tableEl) {
  const rows = [...tableEl.querySelectorAll('tr')];
  return rows.map((row) => [...row.children].map((c) => '"' + c.textContent.trim().replace(/"/g,'""') + '"').join(',')).join('\\n');
}
function downloadCsv(tableEl, filename) {
  const blob = new Blob([tableToCsv(tableEl)], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}
document.getElementById('exportAmountRangeBtn').onclick = () => downloadCsv(document.getElementById('amountRangeTable'), 'amount-range.csv');
document.getElementById('exportChannelBtn').onclick = () => downloadCsv(document.getElementById('channelTable'), 'deposit-by-channel.csv');

// Exposed so the Home page's day picker (loaded after this script) can
// re-trigger this section when the selected date changes.
window.loadDepositAnalysis = loadDepositAnalysis;
loadDepositAnalysis();
</script>
`;
