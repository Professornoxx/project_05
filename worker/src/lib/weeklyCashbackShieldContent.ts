// Action Center section, last on the page: Weekly Cashback Shield. Live
// data from /api/dashboard/action-center/weekly-cashback-shield — see that
// endpoint's comment in index.ts for the eligibility/payout formula
// (reverse-engineered from the reference design's own numbers, confirmed
// against its caption text). Layout/styling matches the reference design.
export const WEEKLY_CASHBACK_SHIELD_CONTENT_HTML = `
<style>
  .cb-header { display: flex; align-items: center; justify-content: space-between; margin: 24px 0 14px; flex-wrap: wrap; gap: 10px; }
  .cb-title { font-weight: 700; font-size: 15px; letter-spacing: 0.03em; text-transform: uppercase; }
  .cb-badges { display: flex; align-items: center; gap: 8px; }
  .cb-badge { background: #eef2ff; color: #4338ca; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 999px; white-space: nowrap; }
  .cb-tag { background: #fee2e2; color: #b91c1c; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; padding: 4px 10px; border-radius: 6px; }
  .cb-panel { background: #fff; border-left: 4px solid #f59e0b; border-radius: 0 10px 10px 0; padding: 18px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); margin-bottom: 20px; }
  .cb-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
  .cb-panel-title-group { display: flex; align-items: center; gap: 10px; }
  .cb-panel-icon { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 999px; background: #fef3c7; font-size: 15px; flex-shrink: 0; }
  .cb-panel-title { font-weight: 700; font-size: 14px; }
  .cb-count-badge { background: #eef2ff; color: #4338ca; font-size: 12px; font-weight: 700; padding: 2px 10px; border-radius: 999px; }
  .cb-excel-btn { background: #16a34a; color: #fff; border: none; padding: 7px 14px; border-radius: 16px; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; }

  .cb-highlight { background: #ecfeff; border-radius: 10px; padding: 16px 18px; margin: 12px 0; }
  .cb-highlight-num { font-size: 26px; font-weight: 700; color: #0e7490; }
  .cb-highlight-label { font-size: 12px; font-weight: 700; color: #0e7490; text-transform: uppercase; letter-spacing: 0.03em; margin-left: 6px; }
  .cb-highlight-sep { margin: 0 14px; color: #0e7490; }

  .cb-panel-sub { font-size: 11px; color: #888; margin: 8px 0 16px; line-height: 1.5; }

  .cb-table-wrap { max-height: 460px; overflow: auto; border: 1px solid #f0f0f0; border-radius: 8px; }
  table.cb-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  table.cb-table th { text-align: right; padding: 8px 12px; background: #fafafa; color: #666; font-size: 10px; text-transform: uppercase; position: sticky; top: 0; z-index: 1; white-space: nowrap; }
  table.cb-table th:first-child, table.cb-table th:nth-child(2) { text-align: left; }
  table.cb-table td { padding: 8px 12px; text-align: right; border-top: 1px solid #f0f0f0; white-space: nowrap; }
  table.cb-table td:first-child, table.cb-table td:nth-child(2) { text-align: left; }
  table.cb-table tbody tr:nth-child(even) td { background: #fafafa; }

  .cb-pager { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; font-size: 12px; color: #666; }
  .cb-pager-right { display: flex; align-items: center; gap: 8px; }
  .cb-pager button { border: 1px solid #ddd; background: #fff; border-radius: 16px; padding: 5px 14px; font-size: 12px; cursor: pointer; }
  .cb-pager button:disabled { opacity: 0.4; cursor: default; }
  .cb-page-select { border: 1px solid #ddd; background: #fff; border-radius: 16px; padding: 5px 10px; font-size: 12px; cursor: pointer; }
</style>

<div class="cb-header">
  <div class="cb-title">Weekly Cashback Shield</div>
  <div class="cb-badges">
    <span class="cb-badge" id="cbRangeBadge">Loading…</span>
    <span class="cb-tag">ACTION CENTER</span>
  </div>
</div>

<div class="cb-panel">
  <div class="cb-panel-head">
    <div class="cb-panel-title-group">
      <div class="cb-panel-icon">🛡️</div>
      <div class="cb-panel-title">Eligible Users This Week</div>
      <span class="cb-count-badge" id="cbCountBadge">—</span>
    </div>
    <button class="cb-excel-btn" id="cbExportBtn">📥 Excel</button>
  </div>

  <div class="cb-highlight">
    <span class="cb-highlight-num" id="cbEligibleUsers">—</span><span class="cb-highlight-label">Eligible Users</span>
    <span class="cb-highlight-sep">·</span>
    <span class="cb-highlight-num" id="cbTotalBonus" style="font-size:20px;">—</span><span class="cb-highlight-label">Total Bonus Payable</span>
  </div>

  <div class="cb-panel-sub">
    VIP 2+ only · Loss Rs 500-4,999 (80%+ of week's deposit lost): flat 1.5% · Loss Rs 5,000-2,500,000: 50%-100%+ loss scales cashback -- VIP 2-4: 2.00%-4.00%, VIP 5-15: 1.51%-5.00% · credited Sunday morning, no wagering requirement
  </div>

  <div class="cb-table-wrap">
    <table class="cb-table" id="cbTable">
      <thead>
        <tr>
          <th>User ID</th><th>Agent</th><th>VIP</th><th>Total Deposit</th><th>Total Withdraw</th>
          <th>User Balance</th><th>Verified Loss</th><th>Loss %</th><th>Eligible %</th><th>Bonus Amount</th>
        </tr>
      </thead>
      <tbody id="cbTableBody"><tr><td colspan="10">Loading...</td></tr></tbody>
    </table>
  </div>

  <div class="cb-pager">
    <span id="cbPageLabel">Page 1 of 1</span>
    <span class="cb-pager-right">
      <button id="cbPrev">← Prev</button> <button id="cbNext">Next →</button>
      <select class="cb-page-select" id="cbPageSelect"></select>
    </span>
  </div>
</div>

<div id="cbStatus" style="font-size:13px;color:#888;"></div>

<script>
const cbState = { page: 1 };

function cbFmtInr(n) { return '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }); }
function cbFmtNum(n) { return Number(n || 0).toLocaleString('en-IN'); }
function cbFmtPct(n) { return Number(n || 0).toFixed(2) + '%'; }
function cbFmtDateLabel(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const monthName = new Date(Date.UTC(y, m - 1, d)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  return d + '-' + monthName;
}

async function cbLoad() {
  const statusEl = document.getElementById('cbStatus');
  try {
    const res = await fetch('/api/dashboard/action-center/weekly-cashback-shield?page=' + cbState.page);
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || res.statusText);

    document.getElementById('cbRangeBadge').textContent = cbFmtDateLabel(d.weekStart) + ' - ' + cbFmtDateLabel(d.weekEnd);
    document.getElementById('cbCountBadge').textContent = cbFmtNum(d.total);
    document.getElementById('cbEligibleUsers').textContent = cbFmtNum(d.total);
    document.getElementById('cbTotalBonus').textContent = cbFmtInr(d.totalBonusPayable);

    document.getElementById('cbTableBody').innerHTML = (d.rows || []).map((r) =>
      '<tr><td>' + r.user_id + '</td><td>' + r.agent + '</td><td>' + r.vip_level +
      '</td><td>' + cbFmtInr(r.total_deposit) + '</td><td>' + cbFmtInr(r.total_withdrawal) +
      '</td><td>' + cbFmtInr(r.user_balance) + '</td><td>' + cbFmtInr(r.verified_loss) +
      '</td><td>' + cbFmtPct(r.loss_pct) + '</td><td>' + cbFmtPct(r.eligible_pct) + '</td><td>' + cbFmtInr(r.bonus_amount) + '</td></tr>'
    ).join('') || '<tr><td colspan="10">No data</td></tr>';

    document.getElementById('cbPageLabel').textContent = 'Page ' + d.page + ' of ' + d.totalPages;
    document.getElementById('cbPrev').disabled = d.page <= 1;
    document.getElementById('cbNext').disabled = d.page >= d.totalPages;

    const select = document.getElementById('cbPageSelect');
    if (select.dataset.totalPages !== String(d.totalPages)) {
      select.dataset.totalPages = String(d.totalPages);
      select.innerHTML = Array.from({ length: d.totalPages }, (_, i) => i + 1)
        .map((p) => '<option value="' + p + '">Page ' + p + '</option>').join('');
    }
    select.value = String(d.page);

    statusEl.textContent = 'Updated ' + new Date().toLocaleTimeString();
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
  }
}

document.getElementById('cbPrev').onclick = () => { if (cbState.page > 1) { cbState.page--; cbLoad(); } };
document.getElementById('cbNext').onclick = () => { cbState.page++; cbLoad(); };
document.getElementById('cbPageSelect').onchange = (e) => { cbState.page = Number(e.target.value); cbLoad(); };

// Exporting straight from the rendered <table> only ever captures the
// current page's 10 rows — this fetches every page from the same API the
// table itself uses and builds the CSV from that combined JSON instead.
const CB_EXPORT_HEADER = ['User ID', 'Agent', 'VIP', 'Total Deposit', 'Total Withdraw', 'User Balance', 'Verified Loss', 'Loss %', 'Eligible %', 'Bonus Amount'];
function cbCsvField(v) { return '"' + String(v ?? '').replace(/"/g, '""') + '"'; }
async function cbFetchAllRows() {
  const first = await fetch('/api/dashboard/action-center/weekly-cashback-shield?page=1').then((r) => r.json());
  let rows = first.rows || [];
  for (let page = 2; page <= (first.totalPages || 1); page++) {
    const d = await fetch('/api/dashboard/action-center/weekly-cashback-shield?page=' + page).then((r) => r.json());
    rows = rows.concat(d.rows || []);
  }
  return rows;
}
function cbRowsToCsv(rows) {
  const lines = [CB_EXPORT_HEADER.map(cbCsvField).join(',')];
  rows.forEach((r) => {
    lines.push([r.user_id, r.agent, r.vip_level, r.total_deposit, r.total_withdrawal, r.user_balance, r.verified_loss, r.loss_pct.toFixed(2), r.eligible_pct.toFixed(2), r.bonus_amount.toFixed(2)].map(cbCsvField).join(','));
  });
  return lines.join('\\n');
}
document.getElementById('cbExportBtn').onclick = async (e) => {
  const btn = e.currentTarget;
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Exporting…';
  try {
    const rows = await cbFetchAllRows();
    const blob = new Blob([cbRowsToCsv(rows)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'weekly-cashback-shield.csv';
    a.click();
  } catch (err) {
    alert('Export failed: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
};

cbLoad();
</script>
`;
