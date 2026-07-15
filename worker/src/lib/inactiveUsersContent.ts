// Action Center section 2: Inactive Users — two panels (High: VIP 5-14,
// inactive 15-240 days; Low: VIP 2-4, inactive 10-180 days), matching the
// provided reference design. Data from
// /api/dashboard/action-center/inactive-users. Agent always shows
// "Unassigned" — same data gap as section 1 (VIP Near Upgrade).
export const INACTIVE_USERS_CONTENT_HTML = `
<style>
  .iu-header { display: flex; align-items: center; justify-content: space-between; margin: 24px 0 14px; }
  .iu-tag { background: #fee2e2; color: #b91c1c; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; padding: 4px 10px; border-radius: 6px; }
  .iu-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
  @media (max-width: 1000px) { .iu-grid { grid-template-columns: 1fr; } }
  .iu-panel { background: #fff; border-left: 4px solid #e24b4a; border-radius: 0 10px 10px 0; padding: 18px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  .iu-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
  .iu-panel-title { font-weight: 700; font-size: 14px; }
  .iu-panel-sub { font-size: 12px; color: #888; margin-bottom: 12px; }
  .iu-excel-btn { background: #16a34a; color: #fff; border: none; padding: 7px 14px; border-radius: 16px; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; }
  .iu-table-wrap { max-height: 380px; overflow-y: auto; }
  table.iu-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  table.iu-table th { text-align: right; padding: 8px 6px; background: #fafafa; color: #666; font-size: 10px; text-transform: uppercase; position: sticky; top: 0; }
  table.iu-table th:first-child, table.iu-table th:nth-child(2), table.iu-table td:first-child, table.iu-table td:nth-child(2) { text-align: left; }
  table.iu-table td { padding: 8px 6px; text-align: right; border-top: 1px solid #f0f0f0; }
  .iu-pager { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; font-size: 12px; color: #666; }
  .iu-pager button { border: 1px solid #ddd; background: #fff; border-radius: 16px; padding: 5px 14px; font-size: 12px; cursor: pointer; }
  .iu-pager button:disabled { opacity: 0.4; cursor: default; }
</style>

<div class="iu-header">
  <div style="font-weight:700;font-size:15px;letter-spacing:0.03em;text-transform:uppercase;">Inactive Users</div>
  <div class="iu-tag">ACTION CENTER</div>
</div>

<div class="iu-grid">
  <div class="iu-panel">
    <div class="iu-panel-head">
      <div class="iu-panel-title">😴 Inactive Users - High</div>
      <button class="iu-excel-btn" id="exportIuHighBtn">📥 Excel</button>
    </div>
    <div class="iu-panel-sub">VIP 5 to VIP 15, inactive 15-240 days · showing top <span id="iuHighTotal">—</span> matching, most-inactive-first</div>
    <div class="iu-table-wrap">
      <table class="iu-table" id="iuHighTable">
        <thead><tr><th>User ID</th><th>Agent</th><th>VIP Level</th><th>Total Deposit</th><th>Wallet Balance</th><th>Inactive Days</th><th>Last Active Date</th></tr></thead>
        <tbody><tr><td colspan="7">Loading...</td></tr></tbody>
      </table>
    </div>
    <div class="iu-pager">
      <span id="iuHighPageLabel">Page 1 of 1</span>
      <span><button id="iuHighPrev">← Prev</button> <button id="iuHighNext">Next →</button></span>
    </div>
  </div>

  <div class="iu-panel">
    <div class="iu-panel-head">
      <div class="iu-panel-title">😴 Inactive Users - Low</div>
      <button class="iu-excel-btn" id="exportIuLowBtn">📥 Excel</button>
    </div>
    <div class="iu-panel-sub">VIP 2 to VIP 4, inactive 10-180 days · showing top <span id="iuLowTotal">—</span> matching, most-inactive-first</div>
    <div class="iu-table-wrap">
      <table class="iu-table" id="iuLowTable">
        <thead><tr><th>User ID</th><th>Agent</th><th>VIP Level</th><th>Total Deposit</th><th>Wallet Balance</th><th>Inactive Days</th><th>Last Active Date</th></tr></thead>
        <tbody><tr><td colspan="7">Loading...</td></tr></tbody>
      </table>
    </div>
    <div class="iu-pager">
      <span id="iuLowPageLabel">Page 1 of 1</span>
      <span><button id="iuLowPrev">← Prev</button> <button id="iuLowNext">Next →</button></span>
    </div>
  </div>
</div>

<div id="iuStatus" style="font-size:13px;color:#888;"></div>

<script>
const iuState = { low: { page: 1 }, high: { page: 1 } };

function iuFmtInr(n) { return '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }); }
// Wallet balance carries real paise (e.g. 0.10) — whole-rupee rounding made
// any sub-₹1 balance render as a flat "₹0", indistinguishable from empty.
function iuFmtInrDecimal(n) { return '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function iuFmtNum(n) { return Number(n || 0).toLocaleString('en-IN'); }

async function iuLoadTier(tier) {
  const statusEl = document.getElementById('iuStatus');
  const prefix = tier === 'low' ? 'iuLow' : 'iuHigh';
  try {
    const page = iuState[tier].page;
    const res = await fetch('/api/dashboard/action-center/inactive-users?tier=' + tier + '&page=' + page);
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || res.statusText);

    document.getElementById(prefix + 'Total').textContent = iuFmtNum(d.total);
    document.querySelector('#' + prefix + 'Table tbody').innerHTML = (d.rows || []).map((r) =>
      '<tr><td>' + r.user_id + '</td><td>' + r.agent + '</td><td>' + r.current_level +
      '</td><td>' + iuFmtInr(r.total_deposit) + '</td><td>' + iuFmtInrDecimal(r.user_balance) +
      '</td><td>' + iuFmtNum(r.inactive_days) + '</td><td>' + r.last_active_date + '</td></tr>'
    ).join('') || '<tr><td colspan="7">No data</td></tr>';

    document.getElementById(prefix + 'PageLabel').textContent = 'Page ' + d.page + ' of ' + d.totalPages;
    document.getElementById(prefix + 'Prev').disabled = d.page <= 1;
    document.getElementById(prefix + 'Next').disabled = d.page >= d.totalPages;

    statusEl.textContent = 'Updated ' + new Date().toLocaleTimeString();
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
  }
}

document.getElementById('iuLowPrev').onclick = () => { if (iuState.low.page > 1) { iuState.low.page--; iuLoadTier('low'); } };
document.getElementById('iuLowNext').onclick = () => { iuState.low.page++; iuLoadTier('low'); };
document.getElementById('iuHighPrev').onclick = () => { if (iuState.high.page > 1) { iuState.high.page--; iuLoadTier('high'); } };
document.getElementById('iuHighNext').onclick = () => { iuState.high.page++; iuLoadTier('high'); };

// Exporting straight from the rendered <table> only ever captured the
// current page's 10 rows — this fetches every page from the same API the
// table itself uses and builds the CSV from that combined JSON instead.
const IU_EXPORT_HEADER = ['User ID', 'Agent', 'Current VIP Level', 'Total Deposit', 'Wallet Balance', 'Inactive Days', 'Last Active Date'];
function iuCsvField(v) { return '"' + String(v ?? '').replace(/"/g, '""') + '"'; }
async function iuFetchAllRows(tier) {
  const first = await fetch('/api/dashboard/action-center/inactive-users?tier=' + tier + '&page=1').then((r) => r.json());
  let rows = first.rows || [];
  for (let page = 2; page <= (first.totalPages || 1); page++) {
    const d = await fetch('/api/dashboard/action-center/inactive-users?tier=' + tier + '&page=' + page).then((r) => r.json());
    rows = rows.concat(d.rows || []);
  }
  return rows;
}
function iuRowsToCsv(rows) {
  const lines = [IU_EXPORT_HEADER.map(iuCsvField).join(',')];
  rows.forEach((r) => {
    lines.push([r.user_id, r.agent, r.current_level, r.total_deposit, r.user_balance, r.inactive_days, r.last_active_date].map(iuCsvField).join(','));
  });
  return lines.join('\\n');
}
async function iuExportTier(tier, filename, btn) {
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Exporting…';
  try {
    const rows = await iuFetchAllRows(tier);
    const blob = new Blob([iuRowsToCsv(rows)], { type: 'text/csv' });
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
document.getElementById('exportIuHighBtn').onclick = (e) => iuExportTier('high', 'inactive-users-high.csv', e.currentTarget);
document.getElementById('exportIuLowBtn').onclick = (e) => iuExportTier('low', 'inactive-users-low.csv', e.currentTarget);

iuLoadTier('low');
iuLoadTier('high');
</script>
`;
