// Action Center section 3: New Users & Bonuses — Yesterday First Deposit
// Users, matching the provided reference design. Data from
// /api/dashboard/action-center/yesterday-first-deposits. Agent always
// shows "Unassigned" — same data gap as sections 1-2.
export const NEW_USERS_BONUSES_CONTENT_HTML = `
<style>
  .nu-header { display: flex; align-items: center; justify-content: space-between; margin: 24px 0 14px; }
  .nu-title { font-weight: 700; font-size: 15px; letter-spacing: 0.03em; text-transform: uppercase; }
  .nu-panel { background: #fff; border-left: 4px solid #6366f1; border-radius: 0 10px 10px 0; padding: 18px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); margin-bottom: 20px; }
  .nu-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
  .nu-panel-title { font-weight: 700; font-size: 14px; }
  .nu-panel-sub { font-size: 12px; color: #888; margin-bottom: 12px; }
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
  .nu-pager button { border: 1px solid #ddd; background: #fff; border-radius: 16px; padding: 5px 14px; font-size: 12px; cursor: pointer; }
  .nu-pager button:disabled { opacity: 0.4; cursor: default; }
</style>

<div class="nu-header">
  <div class="nu-title">New Users & Bonuses</div>
</div>

<div class="nu-panel">
  <div class="nu-panel-head">
    <div class="nu-panel-title">🎉 Yesterday First Deposit Users</div>
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
    <span><button id="nuPrev">← Prev</button> <button id="nuNext">Next →</button></span>
  </div>
</div>

<div id="nuStatus" style="font-size:13px;color:#888;"></div>

<script>
const nuState = { page: 1 };

function nuFmtInr(n) { return '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }); }
function nuFmtNum(n) { return Number(n || 0).toLocaleString('en-IN'); }

async function nuLoad() {
  const statusEl = document.getElementById('nuStatus');
  try {
    const res = await fetch('/api/dashboard/action-center/yesterday-first-deposits?page=' + nuState.page);
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || res.statusText);

    document.getElementById('nuTotal').textContent = nuFmtNum(d.total);
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

    statusEl.textContent = 'Updated ' + new Date().toLocaleTimeString() + ' — showing ' + d.date;
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
  }
}

document.getElementById('nuPrev').onclick = () => { if (nuState.page > 1) { nuState.page--; nuLoad(); } };
document.getElementById('nuNext').onclick = () => { nuState.page++; nuLoad(); };

function nuTableToCsv(tableEl) {
  const rows = [...tableEl.querySelectorAll('tr')];
  return rows.map((row) => [...row.children].map((c) => '"' + c.textContent.trim().replace(/"/g,'""') + '"').join(',')).join('\\n');
}
document.getElementById('exportNuBtn').onclick = () => {
  const blob = new Blob([nuTableToCsv(document.getElementById('nuTable'))], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'yesterday-first-deposit-users.csv';
  a.click();
};

nuLoad();
</script>
`;
