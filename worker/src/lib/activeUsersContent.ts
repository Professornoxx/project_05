// Action Center section 4: Active Users — two panels (Low: VIP 2-4, active
// within last 10 days; High: VIP 5-14, active within last 15 days),
// matching the provided reference design. Data from
// /api/dashboard/action-center/active-users. Agent shows "Unassigned" —
// same data gap as sections 1-3.
export const ACTIVE_USERS_CONTENT_HTML = `
<style>
  .au-header { display: flex; align-items: center; justify-content: space-between; margin: 24px 0 14px; }
  .au-tag { background: #fee2e2; color: #b91c1c; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; padding: 4px 10px; border-radius: 6px; }
  .au-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
  @media (max-width: 1000px) { .au-grid { grid-template-columns: 1fr; } }
  .au-panel { background: #fff; border-left: 4px solid #15803d; border-radius: 0 10px 10px 0; padding: 18px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  .au-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
  .au-panel-title { font-weight: 700; font-size: 14px; }
  .au-panel-sub { font-size: 12px; color: #888; margin-bottom: 12px; }
  .au-excel-btn { background: #16a34a; color: #fff; border: none; padding: 7px 14px; border-radius: 16px; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; }
  .au-table-wrap { max-height: 380px; overflow-y: auto; }
  table.au-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  table.au-table th { text-align: right; padding: 8px 6px; background: #fafafa; color: #666; font-size: 10px; text-transform: uppercase; position: sticky; top: 0; }
  table.au-table th:first-child, table.au-table th:nth-child(2), table.au-table td:first-child, table.au-table td:nth-child(2) { text-align: left; }
  table.au-table td { padding: 8px 6px; text-align: right; border-top: 1px solid #f0f0f0; }
  .au-pager { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; font-size: 12px; color: #666; }
  .au-pager button { border: 1px solid #ddd; background: #fff; border-radius: 16px; padding: 5px 14px; font-size: 12px; cursor: pointer; }
  .au-pager button:disabled { opacity: 0.4; cursor: default; }
</style>

<div class="au-header">
  <div style="font-weight:700;font-size:15px;letter-spacing:0.03em;text-transform:uppercase;">Active Users</div>
  <div class="au-tag">ACTION CENTER</div>
</div>

<div class="au-grid">
  <div class="au-panel">
    <div class="au-panel-head">
      <div class="au-panel-title">✅ Low - Active Users (V2-V4)</div>
      <button class="au-excel-btn" id="exportAuLowBtn">📥 Excel</button>
    </div>
    <div class="au-panel-sub">VIP 2 to VIP 4, active within last 10 days · showing top <span id="auLowTotal">—</span> matching, most-inactive-first</div>
    <div class="au-table-wrap">
      <table class="au-table" id="auLowTable">
        <thead><tr><th>User ID</th><th>Agent</th><th>VIP Level</th><th>Total Deposit</th><th>Wallet Balance</th><th>Inactive Days</th></tr></thead>
        <tbody><tr><td colspan="6">Loading...</td></tr></tbody>
      </table>
    </div>
    <div class="au-pager">
      <span id="auLowPageLabel">Page 1 of 1</span>
      <span><button id="auLowPrev">← Prev</button> <button id="auLowNext">Next →</button></span>
    </div>
  </div>

  <div class="au-panel">
    <div class="au-panel-head">
      <div class="au-panel-title">✅ High - Active Users (V5-V15)</div>
      <button class="au-excel-btn" id="exportAuHighBtn">📥 Excel</button>
    </div>
    <div class="au-panel-sub">VIP 5 to VIP 15, active within last 15 days · showing top <span id="auHighTotal">—</span> matching, most-inactive-first</div>
    <div class="au-table-wrap">
      <table class="au-table" id="auHighTable">
        <thead><tr><th>User ID</th><th>Agent</th><th>VIP Level</th><th>Total Deposit</th><th>Wallet Balance</th><th>Inactive Days</th></tr></thead>
        <tbody><tr><td colspan="6">Loading...</td></tr></tbody>
      </table>
    </div>
    <div class="au-pager">
      <span id="auHighPageLabel">Page 1 of 1</span>
      <span><button id="auHighPrev">← Prev</button> <button id="auHighNext">Next →</button></span>
    </div>
  </div>
</div>

<div id="auStatus" style="font-size:13px;color:#888;"></div>

<script>
const auState = { low: { page: 1 }, high: { page: 1 } };

function auFmtInr(n) { return '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }); }
// Wallet balance carries real paise (e.g. 0.10) — whole-rupee rounding made
// any sub-₹1 balance render as a flat "₹0", indistinguishable from empty.
function auFmtInrDecimal(n) { return '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function auFmtNum(n) { return Number(n || 0).toLocaleString('en-IN'); }

async function auLoadTier(tier) {
  const statusEl = document.getElementById('auStatus');
  const prefix = tier === 'low' ? 'auLow' : 'auHigh';
  try {
    const page = auState[tier].page;
    const res = await fetch('/api/dashboard/action-center/active-users?tier=' + tier + '&page=' + page);
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || res.statusText);

    document.getElementById(prefix + 'Total').textContent = auFmtNum(d.total);
    document.querySelector('#' + prefix + 'Table tbody').innerHTML = (d.rows || []).map((r) =>
      '<tr><td>' + r.user_id + '</td><td>' + r.agent + '</td><td>' + r.current_level +
      '</td><td>' + auFmtInr(r.total_deposit) + '</td><td>' + auFmtInrDecimal(r.user_balance) +
      '</td><td>' + auFmtNum(r.inactive_days) + '</td></tr>'
    ).join('') || '<tr><td colspan="6">No data</td></tr>';

    document.getElementById(prefix + 'PageLabel').textContent = 'Page ' + d.page + ' of ' + d.totalPages;
    document.getElementById(prefix + 'Prev').disabled = d.page <= 1;
    document.getElementById(prefix + 'Next').disabled = d.page >= d.totalPages;

    statusEl.textContent = 'Updated ' + new Date().toLocaleTimeString();
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
  }
}

document.getElementById('auLowPrev').onclick = () => { if (auState.low.page > 1) { auState.low.page--; auLoadTier('low'); } };
document.getElementById('auLowNext').onclick = () => { auState.low.page++; auLoadTier('low'); };
document.getElementById('auHighPrev').onclick = () => { if (auState.high.page > 1) { auState.high.page--; auLoadTier('high'); } };
document.getElementById('auHighNext').onclick = () => { auState.high.page++; auLoadTier('high'); };

// Exporting straight from the rendered <table> only ever captured the
// current page's 10 rows — this fetches every page from the same API the
// table itself uses and builds the CSV from that combined JSON instead.
const AU_EXPORT_HEADER = ['User ID', 'Agent', 'Current VIP Level', 'Total Deposit', 'Wallet Balance', 'Inactive Days'];
function auCsvField(v) { return '"' + String(v ?? '').replace(/"/g, '""') + '"'; }
async function auFetchAllRows(tier) {
  const first = await fetch('/api/dashboard/action-center/active-users?tier=' + tier + '&page=1').then((r) => r.json());
  let rows = first.rows || [];
  for (let page = 2; page <= (first.totalPages || 1); page++) {
    const d = await fetch('/api/dashboard/action-center/active-users?tier=' + tier + '&page=' + page).then((r) => r.json());
    rows = rows.concat(d.rows || []);
  }
  return rows;
}
function auRowsToCsv(rows) {
  const lines = [AU_EXPORT_HEADER.map(auCsvField).join(',')];
  rows.forEach((r) => {
    lines.push([r.user_id, r.agent, r.current_level, r.total_deposit, r.user_balance, r.inactive_days].map(auCsvField).join(','));
  });
  return lines.join('\\n');
}
async function auExportTier(tier, filename, btn) {
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Exporting…';
  try {
    const rows = await auFetchAllRows(tier);
    const blob = new Blob([auRowsToCsv(rows)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
  } catch (e) {
    alert('Export failed: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}
document.getElementById('exportAuLowBtn').onclick = (e) => auExportTier('low', 'active-users-low.csv', e.currentTarget);
document.getElementById('exportAuHighBtn').onclick = (e) => auExportTier('high', 'active-users-high.csv', e.currentTarget);

auLoadTier('low');
auLoadTier('high');
</script>
`;
