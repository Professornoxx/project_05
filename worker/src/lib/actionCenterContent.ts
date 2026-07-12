// Action Center section 1: VIP Near Upgrade — two panels (Low: VIP 2-4,
// gap Rs 1-1,000; High: VIP 5-13, gap Rs 1-50,000), matching the provided
// reference design. Data from /api/dashboard/action-center/vip-near-upgrade.
export const ACTION_CENTER_CONTENT_HTML = `
<style>
  .ac-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
  .ac-tag { background: #dcfce7; color: #15803d; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; padding: 4px 10px; border-radius: 6px; }
  .ac-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
  @media (max-width: 1000px) { .ac-grid { grid-template-columns: 1fr; } }
  .ac-panel { background: #fff; border-left: 4px solid #6366f1; border-radius: 0 10px 10px 0; padding: 18px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  .ac-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
  .ac-panel-title { font-weight: 700; font-size: 14px; }
  .ac-panel-sub { font-size: 12px; color: #888; margin-bottom: 12px; }
  .ac-excel-btn { background: #16a34a; color: #fff; border: none; padding: 7px 14px; border-radius: 16px; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; }
  .ac-table-wrap { max-height: 380px; overflow-y: auto; }
  table.ac-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  table.ac-table th { text-align: right; padding: 8px 6px; background: #fafafa; color: #666; font-size: 10px; text-transform: uppercase; position: sticky; top: 0; }
  table.ac-table th:first-child, table.ac-table th:nth-child(2), table.ac-table td:first-child, table.ac-table td:nth-child(2) { text-align: left; }
  table.ac-table td { padding: 8px 6px; text-align: right; border-top: 1px solid #f0f0f0; }
  .ac-pager { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; font-size: 12px; color: #666; }
  .ac-pager button { border: 1px solid #ddd; background: #fff; border-radius: 16px; padding: 5px 14px; font-size: 12px; cursor: pointer; }
  .ac-pager button:disabled { opacity: 0.4; cursor: default; }
</style>

<div class="ac-header">
  <div style="font-weight:700;font-size:15px;letter-spacing:0.03em;text-transform:uppercase;">VIP Near Upgrade</div>
  <div class="ac-tag">ACTION CENTER</div>
</div>

<div class="ac-grid">
  <div class="ac-panel">
    <div class="ac-panel-head">
      <div class="ac-panel-title">⬆️ Low - VIP Near Upgrade</div>
      <button class="ac-excel-btn" id="exportAcLowBtn">📥 Excel</button>
    </div>
    <div class="ac-panel-sub">VIP 2 to VIP 4, gap to next level Rs 1-1000 · showing top <span id="acLowTotal">—</span> matching, sorted closest-first</div>
    <div class="ac-table-wrap">
      <table class="ac-table" id="acLowTable">
        <thead><tr><th>User ID</th><th>Agent</th><th>Current VIP Level</th><th>Next VIP Level</th><th>Total Deposit</th><th>Amount to Reach Next Level</th><th>Inactive Days</th></tr></thead>
        <tbody><tr><td colspan="7">Loading...</td></tr></tbody>
      </table>
    </div>
    <div class="ac-pager">
      <span id="acLowPageLabel">Page 1 of 1</span>
      <span><button id="acLowPrev">← Prev</button> <button id="acLowNext">Next →</button></span>
    </div>
  </div>

  <div class="ac-panel">
    <div class="ac-panel-head">
      <div class="ac-panel-title">⬆️ High - VIP Near Upgrade</div>
      <button class="ac-excel-btn" id="exportAcHighBtn">📥 Excel</button>
    </div>
    <div class="ac-panel-sub">VIP 5 to VIP 15, gap to next level Rs 1-50000 · showing top <span id="acHighTotal">—</span> matching, sorted closest-first</div>
    <div class="ac-table-wrap">
      <table class="ac-table" id="acHighTable">
        <thead><tr><th>User ID</th><th>Agent</th><th>Current VIP Level</th><th>Next VIP Level</th><th>Total Deposit</th><th>Amount to Reach Next Level</th><th>Inactive Days</th></tr></thead>
        <tbody><tr><td colspan="7">Loading...</td></tr></tbody>
      </table>
    </div>
    <div class="ac-pager">
      <span id="acHighPageLabel">Page 1 of 1</span>
      <span><button id="acHighPrev">← Prev</button> <button id="acHighNext">Next →</button></span>
    </div>
  </div>
</div>

<div id="acStatus" style="font-size:13px;color:#888;"></div>

<script>
const acState = { low: { page: 1 }, high: { page: 1 } };

function acFmtInr(n) { return '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }); }
function acFmtNum(n) { return Number(n || 0).toLocaleString('en-IN'); }

async function acLoadTier(tier) {
  const statusEl = document.getElementById('acStatus');
  const prefix = tier === 'low' ? 'acLow' : 'acHigh';
  try {
    const page = acState[tier].page;
    const res = await fetch('/api/dashboard/action-center/vip-near-upgrade?tier=' + tier + '&page=' + page);
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || res.statusText);

    document.getElementById(prefix + 'Total').textContent = acFmtNum(d.total);
    document.querySelector('#' + prefix + 'Table tbody').innerHTML = (d.rows || []).map((r) =>
      '<tr><td>' + r.user_id + '</td><td>' + r.agent + '</td><td>' + r.current_level + '</td><td>' + r.next_level +
      '</td><td>' + acFmtInr(r.total_deposit) + '</td><td>' + acFmtInr(r.gap) + '</td><td>' + acFmtNum(r.inactive_days) + '</td></tr>'
    ).join('') || '<tr><td colspan="7">No data</td></tr>';

    document.getElementById(prefix + 'PageLabel').textContent = 'Page ' + d.page + ' of ' + d.totalPages;
    document.getElementById(prefix + 'Prev').disabled = d.page <= 1;
    document.getElementById(prefix + 'Next').disabled = d.page >= d.totalPages;

    statusEl.textContent = 'Updated ' + new Date().toLocaleTimeString();
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
  }
}

document.getElementById('acLowPrev').onclick = () => { if (acState.low.page > 1) { acState.low.page--; acLoadTier('low'); } };
document.getElementById('acLowNext').onclick = () => { acState.low.page++; acLoadTier('low'); };
document.getElementById('acHighPrev').onclick = () => { if (acState.high.page > 1) { acState.high.page--; acLoadTier('high'); } };
document.getElementById('acHighNext').onclick = () => { acState.high.page++; acLoadTier('high'); };

function acTableToCsv(tableEl) {
  const rows = [...tableEl.querySelectorAll('tr')];
  return rows.map((row) => [...row.children].map((c) => '"' + c.textContent.trim().replace(/"/g,'""') + '"').join(',')).join('\\n');
}
function acDownloadCsv(tableEl, filename) {
  const blob = new Blob([acTableToCsv(tableEl)], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}
document.getElementById('exportAcLowBtn').onclick = () => acDownloadCsv(document.getElementById('acLowTable'), 'vip-near-upgrade-low.csv');
document.getElementById('exportAcHighBtn').onclick = () => acDownloadCsv(document.getElementById('acHighTable'), 'vip-near-upgrade-high.csv');

acLoadTier('low');
acLoadTier('high');
</script>
`;
