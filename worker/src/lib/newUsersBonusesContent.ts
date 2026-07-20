// Action Center section 3: FTD — two side-by-side panels matching the
// provided reference design (count badge next to each card title, icon in
// a light circle, page-number dropdown alongside Prev/Next). Section
// header renamed from "New Users & Bonuses" to "FTD" per the reference.
//   Panel 1: Yesterday First Deposit Users — data from
//     /api/dashboard/action-center/yesterday-first-deposits.
//   Panel 2: No-Return First Deposit Users — data from
//     /api/dashboard/action-center/no-return-first-deposits (see that
//     endpoint's comment in index.ts for the cohort/no-return definition).
// Agent always shows "Unassigned" — same data gap as sections 1-2.
export const NEW_USERS_BONUSES_CONTENT_HTML = `
<style>
  .nu-header { display: flex; align-items: center; justify-content: space-between; margin: 24px 0 14px; }
  .nu-title { font-weight: 700; font-size: 15px; letter-spacing: 0.03em; text-transform: uppercase; }
  .nu-tag { background: #dcfce7; color: #15803d; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; padding: 4px 10px; border-radius: 6px; }
  .nu-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  @media (max-width: 1000px) { .nu-grid { grid-template-columns: 1fr; } }
  .nu-panel { background: #fff; border-left: 4px solid #6366f1; border-radius: 0 10px 10px 0; padding: 18px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); margin-bottom: 20px; }
  .nu-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
  .nu-panel-title-group { display: flex; align-items: center; gap: 10px; }
  .nu-panel-icon { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 999px; background: #eef2ff; font-size: 15px; flex-shrink: 0; }
  .nu-panel-title { font-weight: 700; font-size: 14px; }
  .nu-count-badge { background: #eef2ff; color: #4338ca; font-size: 12px; font-weight: 700; padding: 2px 10px; border-radius: 999px; }
  .nu-panel-sub { font-size: 12px; color: #888; margin: 6px 0 12px; }
  .nu-excel-btn { background: #16a34a; color: #fff; border: none; padding: 7px 14px; border-radius: 16px; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; }
  .nu-table-wrap { max-height: 420px; overflow-y: auto; }
  table.nu-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  table.nu-table th { text-align: right; padding: 8px 6px; background: #fafafa; color: #666; font-size: 10px; text-transform: uppercase; position: sticky; top: 0; }
  table.nu-table th:first-child, table.nu-table th:nth-child(2), table.nu-table th:last-child,
  table.nu-table td:first-child, table.nu-table td:nth-child(2), table.nu-table td:last-child { text-align: left; }
  table.nu-table td { padding: 8px 6px; text-align: right; border-top: 1px solid #f0f0f0; }
  td.nu-pl-pos { color: #15803d; font-weight: 600; }
  td.nu-pl-neg { color: #b91c1c; font-weight: 600; }
  .nu-pager { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; font-size: 12px; color: #666; }
  .nu-pager-right { display: flex; align-items: center; gap: 8px; }
  .nu-pager button { border: 1px solid #ddd; background: #fff; border-radius: 16px; padding: 5px 14px; font-size: 12px; cursor: pointer; }
  .nu-pager button:disabled { opacity: 0.4; cursor: default; }
  .nu-page-select { border: 1px solid #ddd; background: #fff; border-radius: 16px; padding: 5px 10px; font-size: 12px; cursor: pointer; }
</style>

<div class="nu-header">
  <div class="nu-title">FTD</div>
  <div class="nu-tag">ACTION CENTER</div>
</div>

<div class="nu-grid">
  <div class="nu-panel">
    <div class="nu-panel-head">
      <div class="nu-panel-title-group">
        <div class="nu-panel-icon">🎉</div>
        <div class="nu-panel-title">Yesterday First Deposit Users</div>
        <span class="nu-count-badge" id="nuCountBadge">—</span>
      </div>
      <button class="nu-excel-btn" id="exportNuBtn">📥 Excel</button>
    </div>
    <div class="nu-panel-sub">Flagged by the source system's own first-deposit marker · <span id="nuTotal">—</span> users</div>
    <div class="nu-table-wrap">
      <table class="nu-table" id="nuTable">
        <thead><tr><th>User ID</th><th>Agent</th><th>VIP</th><th>Deposit Count</th><th>Total Deposit Amount</th><th>Total Withdraw</th><th>Profit/Loss</th><th>Region</th></tr></thead>
        <tbody><tr><td colspan="8">Loading...</td></tr></tbody>
      </table>
    </div>
    <div class="nu-pager">
      <span id="nuPageLabel">Page 1 of 1</span>
      <span class="nu-pager-right">
        <button id="nuPrev">← Prev</button> <button id="nuNext">Next →</button>
        <select class="nu-page-select" id="nuPageSelect"></select>
      </span>
    </div>
  </div>

  <div class="nu-panel">
    <div class="nu-panel-head">
      <div class="nu-panel-title-group">
        <div class="nu-panel-icon">🏆</div>
        <div class="nu-panel-title">No-Return First Deposit Users</div>
        <span class="nu-count-badge" id="nrCountBadge">—</span>
      </div>
      <button class="nu-excel-btn" id="exportNrBtn">📥 Excel</button>
    </div>
    <div class="nu-panel-sub">First deposit 2-5 days ago, no deposit since · <span id="nrTotal">—</span> users</div>
    <div class="nu-table-wrap">
      <table class="nu-table" id="nrTable">
        <thead><tr><th>User ID</th><th>Agent</th><th>FD Date</th><th>Total Deposit</th><th>Withdraw</th></tr></thead>
        <tbody><tr><td colspan="5">Loading...</td></tr></tbody>
      </table>
    </div>
    <div class="nu-pager">
      <span id="nrPageLabel">Page 1 of 1</span>
      <span class="nu-pager-right">
        <button id="nrPrev">← Prev</button> <button id="nrNext">Next →</button>
        <select class="nu-page-select" id="nrPageSelect"></select>
      </span>
    </div>
  </div>
</div>

<div id="nuStatus" style="font-size:13px;color:#888;"></div>

<script>
const nuState = { page: 1 };
const nrState = { page: 1 };

function nuFmtInr(n) { return '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }); }
function nuFmtNum(n) { return Number(n || 0).toLocaleString('en-IN'); }
function nuFmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  const monthName = new Date(Date.UTC(y, m - 1, d)).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  return d + '-' + monthName;
}
function nuSyncPageSelect(select, page, totalPages) {
  if (select.dataset.totalPages !== String(totalPages)) {
    select.dataset.totalPages = String(totalPages);
    select.innerHTML = Array.from({ length: totalPages }, (_, i) => i + 1)
      .map((p) => '<option value="' + p + '">Page ' + p + '</option>').join('');
  }
  select.value = String(page);
}

async function nuLoad() {
  const statusEl = document.getElementById('nuStatus');
  try {
    const res = await fetch('/api/dashboard/action-center/yesterday-first-deposits?page=' + nuState.page);
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || res.statusText);

    document.getElementById('nuTotal').textContent = nuFmtNum(d.total);
    document.getElementById('nuCountBadge').textContent = nuFmtNum(d.total);
    document.querySelector('#nuTable tbody').innerHTML = (d.rows || []).map((r) => {
      const plClass = r.profit_loss >= 0 ? 'nu-pl-pos' : 'nu-pl-neg';
      return '<tr><td>' + r.user_id + '</td><td>' + r.agent + '</td><td>' + r.current_level +
        '</td><td>' + nuFmtNum(r.deposit_count) + '</td><td>' + nuFmtInr(r.total_deposit) +
        '</td><td>' + nuFmtInr(r.total_withdrawal) + '</td><td class="' + plClass + '">' + nuFmtInr(r.profit_loss) +
        '</td><td>' + r.region + '</td></tr>';
    }).join('') || '<tr><td colspan="8">No data</td></tr>';

    document.getElementById('nuPageLabel').textContent = 'Page ' + d.page + ' of ' + d.totalPages;
    document.getElementById('nuPrev').disabled = d.page <= 1;
    document.getElementById('nuNext').disabled = d.page >= d.totalPages;
    nuSyncPageSelect(document.getElementById('nuPageSelect'), d.page, d.totalPages);

    statusEl.textContent = 'Updated ' + new Date().toLocaleTimeString() + ' — showing ' + d.date;
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
  }
}

async function nrLoad() {
  const statusEl = document.getElementById('nuStatus');
  try {
    const res = await fetch('/api/dashboard/action-center/no-return-first-deposits?page=' + nrState.page);
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || res.statusText);

    document.getElementById('nrTotal').textContent = nuFmtNum(d.total);
    document.getElementById('nrCountBadge').textContent = nuFmtNum(d.total);
    document.querySelector('#nrTable tbody').innerHTML = (d.rows || []).map((r) =>
      '<tr><td>' + r.user_id + '</td><td>' + r.agent + '</td><td>' + nuFmtDate(r.fd_date) +
      '</td><td>' + nuFmtInr(r.total_deposit) + '</td><td>' + nuFmtInr(r.total_withdrawal) + '</td></tr>'
    ).join('') || '<tr><td colspan="5">No data</td></tr>';

    document.getElementById('nrPageLabel').textContent = 'Page ' + d.page + ' of ' + d.totalPages;
    document.getElementById('nrPrev').disabled = d.page <= 1;
    document.getElementById('nrNext').disabled = d.page >= d.totalPages;
    nuSyncPageSelect(document.getElementById('nrPageSelect'), d.page, d.totalPages);

    statusEl.textContent = 'Updated ' + new Date().toLocaleTimeString();
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
  }
}

document.getElementById('nuPrev').onclick = () => { if (nuState.page > 1) { nuState.page--; nuLoad(); } };
document.getElementById('nuNext').onclick = () => { nuState.page++; nuLoad(); };
document.getElementById('nuPageSelect').onchange = (e) => { nuState.page = Number(e.target.value); nuLoad(); };

document.getElementById('nrPrev').onclick = () => { if (nrState.page > 1) { nrState.page--; nrLoad(); } };
document.getElementById('nrNext').onclick = () => { nrState.page++; nrLoad(); };
document.getElementById('nrPageSelect').onchange = (e) => { nrState.page = Number(e.target.value); nrLoad(); };

// Exporting straight from the rendered <table> only ever captured the
// current page's 10 rows — these fetch every page from the same API the
// table itself uses and build the CSV from that combined JSON instead.
const NU_EXPORT_HEADER = ['User ID', 'Agent', 'Current VIP Level', 'Deposit Count', 'Total Deposit', 'Total Withdrawal', 'Profit/Loss', 'Region'];
function nuCsvField(v) { return '"' + String(v ?? '').replace(/"/g, '""') + '"'; }
async function nuFetchAllRows() {
  const first = await fetch('/api/dashboard/action-center/yesterday-first-deposits?page=1').then((r) => r.json());
  let rows = first.rows || [];
  for (let page = 2; page <= (first.totalPages || 1); page++) {
    const d = await fetch('/api/dashboard/action-center/yesterday-first-deposits?page=' + page).then((r) => r.json());
    rows = rows.concat(d.rows || []);
  }
  return rows;
}
function nuRowsToCsv(rows) {
  const lines = [NU_EXPORT_HEADER.map(nuCsvField).join(',')];
  rows.forEach((r) => {
    lines.push([r.user_id, r.agent, r.current_level, r.deposit_count, r.total_deposit, r.total_withdrawal, r.profit_loss, r.region].map(nuCsvField).join(','));
  });
  return lines.join('\\n');
}
document.getElementById('exportNuBtn').onclick = async (e) => {
  const btn = e.currentTarget;
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Exporting…';
  try {
    const rows = await nuFetchAllRows();
    const blob = new Blob([nuRowsToCsv(rows)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'yesterday-first-deposit-users.csv';
    a.click();
  } catch (err) {
    alert('Export failed: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
};

const NR_EXPORT_HEADER = ['User ID', 'Agent', 'FD Date', 'Total Deposit', 'Withdraw'];
async function nrFetchAllRows() {
  const first = await fetch('/api/dashboard/action-center/no-return-first-deposits?page=1').then((r) => r.json());
  let rows = first.rows || [];
  for (let page = 2; page <= (first.totalPages || 1); page++) {
    const d = await fetch('/api/dashboard/action-center/no-return-first-deposits?page=' + page).then((r) => r.json());
    rows = rows.concat(d.rows || []);
  }
  return rows;
}
function nrRowsToCsv(rows) {
  const lines = [NR_EXPORT_HEADER.map(nuCsvField).join(',')];
  rows.forEach((r) => {
    lines.push([r.user_id, r.agent, r.fd_date, r.total_deposit, r.total_withdrawal].map(nuCsvField).join(','));
  });
  return lines.join('\\n');
}
document.getElementById('exportNrBtn').onclick = async (e) => {
  const btn = e.currentTarget;
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Exporting…';
  try {
    const rows = await nrFetchAllRows();
    const blob = new Blob([nrRowsToCsv(rows)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'no-return-first-deposit-users.csv';
    a.click();
  } catch (err) {
    alert('Export failed: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
};

nuLoad();
nrLoad();
</script>
`;
