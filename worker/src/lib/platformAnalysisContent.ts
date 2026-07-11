// Platform Analysis page. Section 1: Game & Revenue Economics — two panels
// matching the provided reference design (orange "Profit Users of the Day",
// red "Suspicious Withdraw Users"). Section 2: Acquisition & Bonus
// Economics — two more panels (blue "Channel performance", green
// "Net Revenue by Region & VIP"). Data from
// /api/dashboard/platform-analysis/{profit-users,suspicious-withdrawals,
// channel-performance,net-revenue}. The reference design's "Games Played"
// column initially looked unavailable but turned out to have a real data
// source (wallet_details row counts) — see the endpoint comments in
// index.ts for both that and the Channel-performance "Quality" heuristic.
export const PLATFORM_ANALYSIS_CONTENT_HTML = `
<style>
  .pa-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
  .pa-title { font-weight: 700; font-size: 15px; letter-spacing: 0.03em; text-transform: uppercase; }
  .pa-tag { background: #dcfce7; color: #15803d; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; padding: 4px 10px; border-radius: 6px; }
  .pa-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; align-items: start; }
  @media (max-width: 1000px) { .pa-grid { grid-template-columns: 1fr; } }
  .pa-panel { background: #fff; border-radius: 0 10px 10px 0; padding: 18px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  .pa-panel.orange { border-left: 4px solid #f59e0b; }
  .pa-panel.red { border-left: 4px solid #ef4444; }
  .pa-panel.blue { border-left: 4px solid #3b82f6; }
  .pa-panel.green { border-left: 4px solid #16a34a; }
  .pa-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 6px; flex-wrap: wrap; }
  .pa-panel-title { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 14px; }
  .pa-icon { width: 26px; height: 26px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 13px; flex-shrink: 0; }
  .pa-icon.orange { background: #fef3c7; }
  .pa-icon.red { background: #fee2e2; }
  .pa-icon.blue { background: #dbeafe; }
  .pa-icon.green { background: #dcfce7; }
  .pa-btns { display: flex; align-items: center; gap: 8px; }
  .pa-toggle { background: #f59e0b; color: #fff; border: none; padding: 6px 12px; border-radius: 16px; font-size: 11px; font-weight: 600; cursor: pointer; white-space: nowrap; }
  .pa-toggle.off { background: #f1f5f9; color: #64748b; }
  .pa-excel-btn { background: #16a34a; color: #fff; border: none; padding: 7px 14px; border-radius: 16px; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; }
  .pa-panel-sub { font-size: 12px; color: #888; margin-bottom: 12px; }
  .pa-table-wrap { max-height: 420px; overflow-y: auto; }
  table.pa-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  table.pa-table th { text-align: right; padding: 8px 6px; background: #fafafa; color: #666; font-size: 10px; text-transform: uppercase; position: sticky; top: 0; }
  table.pa-table th:first-child, table.pa-table th:nth-child(2), table.pa-table td:first-child, table.pa-table td:nth-child(2) { text-align: left; }
  table.pa-table td { padding: 8px 6px; text-align: right; border-top: 1px solid #f0f0f0; }
  .pa-pos { color: #15803d; font-weight: 600; }
  .pa-neg { color: #b91c1c; font-weight: 600; }
  .pa-today { background: #dcfce7; color: #15803d; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 10px; }
  .pa-pager { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; font-size: 12px; color: #666; }
  .pa-pager button { border: 1px solid #ddd; background: #fff; border-radius: 16px; padding: 5px 14px; font-size: 12px; cursor: pointer; }
  .pa-pager button:disabled { opacity: 0.4; cursor: default; }
  .pa-pill { font-size: 10px; font-weight: 700; padding: 3px 9px; border-radius: 10px; display: inline-block; }
  .pa-pill.weak { background: #fee2e2; color: #b91c1c; }
  .pa-pill.average { background: #fef3c7; color: #92400e; }
  .pa-pill.good { background: #dcfce7; color: #15803d; }
  .pa-pill.highvalue { background: #ccfbf1; color: #0f766e; }
  .pa-pct.low { background: #fee2e2; color: #b91c1c; padding: 2px 7px; border-radius: 8px; }
  .pa-pct.mid { background: #fef3c7; color: #92400e; padding: 2px 7px; border-radius: 8px; }
  .pa-pct.high { background: #dcfce7; color: #15803d; padding: 2px 7px; border-radius: 8px; }
  .pa-seg { display: flex; gap: 8px; margin-bottom: 14px; }
  .pa-seg button { border: 1px solid #ddd; background: #fff; color: #333; padding: 8px 16px; border-radius: 16px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .pa-seg button.active { background: #4f46e5; color: #fff; border-color: #4f46e5; }
  .pa-section-gap { margin-top: 28px; }
</style>

<div class="pa-header">
  <div class="pa-title">Game &amp; Revenue Economics</div>
  <div class="pa-tag">PLATFORM</div>
</div>

<div class="pa-grid">
  <div class="pa-panel orange">
    <div class="pa-panel-head">
      <div class="pa-panel-title"><span class="pa-icon orange">💰</span>Profit Users of the Day</div>
      <div class="pa-btns">
        <button class="pa-toggle off" id="paNewToggle">3 Days New User</button>
        <button class="pa-excel-btn" id="paExportProfit">📥 Excel</button>
      </div>
    </div>
    <div class="pa-panel-sub">Top users by CURRENT wallet balance — who's sitting on the most money right now. Last Dep/WD show "Today" or how many days ago, tracked permanently so it stays accurate beyond the 35-day window.</div>
    <div class="pa-table-wrap">
      <table class="pa-table" id="paProfitTable">
        <thead><tr><th>User ID</th><th>Agent</th><th>VIP</th><th>Dep today</th><th>Wallet bal</th><th>WD today</th><th>Net dep</th><th>Last dep</th><th>Last WD</th></tr></thead>
        <tbody><tr><td colspan="9">Loading...</td></tr></tbody>
      </table>
    </div>
    <div class="pa-pager">
      <span id="paProfitPageLabel">Page 1 of 1</span>
      <span><button id="paProfitPrev">← Prev</button> <button id="paProfitNext">Next →</button></span>
    </div>
  </div>

  <div class="pa-panel red">
    <div class="pa-panel-head">
      <div class="pa-panel-title"><span class="pa-icon red">⚠️</span>Suspicious Withdraw Users</div>
      <button class="pa-excel-btn" id="paExportSuspicious">📥 Excel</button>
    </div>
    <div class="pa-panel-sub">Deposited ₹1,000+ AND requested a withdrawal (In-Review/Processing/Complete) within the last 3 days, while playing fewer than 50 games in that same window — deposit-and-cash-out without genuine play.</div>
    <div class="pa-table-wrap">
      <table class="pa-table" id="paSuspiciousTable">
        <thead><tr><th>User ID</th><th>Agent</th><th>VIP</th><th>Deposit (3D)</th><th>Withdraw (3D)</th><th>Games played (3D)</th></tr></thead>
        <tbody><tr><td colspan="6">Loading...</td></tr></tbody>
      </table>
    </div>
    <div class="pa-pager">
      <span id="paSuspiciousPageLabel">Page 1 of 1</span>
      <span><button id="paSuspiciousPrev">← Prev</button> <button id="paSuspiciousNext">Next →</button></span>
    </div>
  </div>
</div>

<div class="pa-header pa-section-gap">
  <div class="pa-title">Acquisition &amp; Bonus Economics</div>
  <div class="pa-tag">PLATFORM</div>
</div>

<div class="pa-grid">
  <div class="pa-panel blue">
    <div class="pa-panel-head">
      <div class="pa-panel-title"><span class="pa-icon blue">📊</span>Channel performance — 4-day combined</div>
      <button class="pa-excel-btn" id="paExportChannel">📥 Excel</button>
    </div>
    <div class="pa-table-wrap">
      <table class="pa-table" id="paChannelTable">
        <thead><tr><th>Channel</th><th>FD users</th><th>FD amount</th><th>Avg FD</th><th>D2 users</th><th>D2 %</th><th>D3 users</th><th>D3 %</th><th>Quality</th></tr></thead>
        <tbody><tr><td colspan="9">Loading...</td></tr></tbody>
      </table>
    </div>
    <div class="pa-pager">
      <span id="paChannelPageLabel">Page 1 of 1</span>
      <span><button id="paChannelPrev">← Prev</button> <button id="paChannelNext">Next →</button></span>
    </div>
  </div>

  <div class="pa-panel green">
    <div class="pa-panel-head">
      <div class="pa-panel-title"><span class="pa-icon green">💰</span>Net Revenue by Region &amp; VIP</div>
      <button class="pa-excel-btn" id="paExportRevenue">📥 Excel</button>
    </div>
    <div class="pa-panel-sub">Deposit minus withdrawal, not just gross deposit volume — a region/tier can look like a top performer by deposit total while actually net-negative once withdrawals are subtracted. Most recent date in the report.</div>
    <div class="pa-seg">
      <button class="active" id="paRevByRegion">By Region</button>
      <button id="paRevByVip">By VIP Level</button>
    </div>
    <div class="pa-table-wrap">
      <table class="pa-table" id="paRevenueTable">
        <thead><tr id="paRevenueHead"><th>Region</th><th>Total deposit</th><th>Total withdrawal</th><th>Net revenue</th><th>Users</th></tr></thead>
        <tbody><tr><td colspan="5">Loading...</td></tr></tbody>
      </table>
    </div>
  </div>
</div>

<div id="paStatus" style="font-size:13px;color:#888;"></div>

<script>
const paState = { profit: { page: 1, newOnly: false }, suspicious: { page: 1 } };

function paFmtInr(n) { return '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }); }
function paFmtSigned(n) {
  const v = Number(n || 0);
  const cls = v > 0 ? 'pa-pos' : v < 0 ? 'pa-neg' : '';
  return '<span class="' + cls + '">' + (v > 0 ? '+' : '') + paFmtInr(v) + '</span>';
}
function paFmtLastActivity(iso) {
  if (!iso) return '—';
  const then = new Date(iso.replace(' ', 'T') + (iso.includes('Z') ? '' : 'Z'));
  const days = Math.floor((Date.now() - then.getTime()) / 86400000);
  if (days <= 0) return '<span class="pa-today">Today</span>';
  return days + 'd ago';
}

async function paLoadProfit() {
  const statusEl = document.getElementById('paStatus');
  try {
    const s = paState.profit;
    const res = await fetch('/api/dashboard/platform-analysis/profit-users?page=' + s.page + (s.newOnly ? '&newOnly=1' : ''));
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || res.statusText);

    document.querySelector('#paProfitTable tbody').innerHTML = (d.rows || []).map((r) =>
      '<tr><td>' + r.user_id + '</td><td>' + r.agent + '</td><td>' + r.vip +
      '</td><td>' + paFmtInr(r.dep_today) + '</td><td>' + paFmtInr(r.wallet_bal) +
      '</td><td>' + paFmtInr(r.wd_today) + '</td><td>' + paFmtSigned(r.net_dep) +
      '</td><td>' + paFmtLastActivity(r.last_dep) + '</td><td>' + paFmtLastActivity(r.last_wd) + '</td></tr>'
    ).join('') || '<tr><td colspan="9">No data</td></tr>';

    document.getElementById('paProfitPageLabel').textContent = 'Page ' + d.page + ' of ' + d.totalPages;
    document.getElementById('paProfitPrev').disabled = d.page <= 1;
    document.getElementById('paProfitNext').disabled = d.page >= d.totalPages;
    statusEl.textContent = 'Updated ' + new Date().toLocaleTimeString();
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
  }
}

async function paLoadSuspicious() {
  const statusEl = document.getElementById('paStatus');
  try {
    const s = paState.suspicious;
    const res = await fetch('/api/dashboard/platform-analysis/suspicious-withdrawals?page=' + s.page);
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || res.statusText);

    document.querySelector('#paSuspiciousTable tbody').innerHTML = (d.rows || []).map((r) =>
      '<tr><td>' + r.user_id + '</td><td>' + r.agent + '</td><td>' + r.vip +
      '</td><td>' + paFmtInr(r.deposit_3d) + '</td><td>' + paFmtInr(r.withdraw_3d) +
      '</td><td>' + Number(r.games_3d || 0).toLocaleString('en-IN') + '</td></tr>'
    ).join('') || '<tr><td colspan="6">No data</td></tr>';

    document.getElementById('paSuspiciousPageLabel').textContent = 'Page ' + d.page + ' of ' + d.totalPages;
    document.getElementById('paSuspiciousPrev').disabled = d.page <= 1;
    document.getElementById('paSuspiciousNext').disabled = d.page >= d.totalPages;
    statusEl.textContent = 'Updated ' + new Date().toLocaleTimeString();
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
  }
}

function paQualityPill(fdUsers, avgFd, d2Pct) {
  let cls, label;
  if (fdUsers > 0 && avgFd >= 1000) { cls = 'highvalue'; label = 'High value'; }
  else if (d2Pct >= 25) { cls = 'good'; label = 'Good'; }
  else if (d2Pct >= 15) { cls = 'average'; label = 'Average'; }
  else { cls = 'weak'; label = 'Weak'; }
  return '<span class="pa-pill ' + cls + '">' + label + '</span>';
}
function paPctBadge(pct) {
  const cls = pct >= 25 ? 'high' : pct >= 10 ? 'mid' : 'low';
  return '<span class="pa-pct ' + cls + '">' + Number(pct || 0).toFixed(1) + '%</span>';
}

const paChannelState = { page: 1 };
async function paLoadChannel() {
  const statusEl = document.getElementById('paStatus');
  try {
    const res = await fetch('/api/dashboard/platform-analysis/channel-performance?page=' + paChannelState.page);
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || res.statusText);

    document.querySelector('#paChannelTable tbody').innerHTML = (d.rows || []).map((r) =>
      '<tr><td>' + r.channel + '</td><td>' + Number(r.fd_users).toLocaleString('en-IN') + '</td><td>' + paFmtInr(r.fd_amount) +
      '</td><td>' + paFmtInr(r.avg_fd) + '</td><td>' + Number(r.d2_users).toLocaleString('en-IN') + '</td><td>' + paPctBadge(r.d2_pct) +
      '</td><td>' + Number(r.d3_users).toLocaleString('en-IN') + '</td><td>' + paPctBadge(r.d3_pct) +
      '</td><td>' + paQualityPill(r.fd_users, r.avg_fd, r.d2_pct) + '</td></tr>'
    ).join('') || '<tr><td colspan="9">No data</td></tr>';

    document.getElementById('paChannelPageLabel').textContent = 'Page ' + d.page + ' of ' + d.totalPages;
    document.getElementById('paChannelPrev').disabled = d.page <= 1;
    document.getElementById('paChannelNext').disabled = d.page >= d.totalPages;
    statusEl.textContent = 'Updated ' + new Date().toLocaleTimeString();
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
  }
}

const paRevenueState = { by: 'region' };
async function paLoadRevenue() {
  const statusEl = document.getElementById('paStatus');
  try {
    const res = await fetch('/api/dashboard/platform-analysis/net-revenue?by=' + paRevenueState.by);
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || res.statusText);

    document.getElementById('paRevenueHead').innerHTML = paRevenueState.by === 'vip'
      ? '<th>VIP level</th><th>Total deposit</th><th>Total withdrawal</th><th>Net revenue</th><th>Users</th>'
      : '<th>Region</th><th>Total deposit</th><th>Total withdrawal</th><th>Net revenue</th><th>Users</th>';

    document.querySelector('#paRevenueTable tbody').innerHTML = (d.rows || []).map((r) =>
      '<tr><td>' + (paRevenueState.by === 'vip' ? 'VIP ' + r.vip_level : r.region) + '</td><td>' + paFmtInr(r.total_deposit) +
      '</td><td>' + paFmtInr(r.total_withdrawal) + '</td><td>' + paFmtSigned(r.net_revenue) +
      '</td><td>' + Number(r.users).toLocaleString('en-IN') + '</td></tr>'
    ).join('') || '<tr><td colspan="5">No data</td></tr>';

    statusEl.textContent = 'Updated ' + new Date().toLocaleTimeString();
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
  }
}
document.getElementById('paRevByRegion').onclick = () => {
  paRevenueState.by = 'region';
  document.getElementById('paRevByRegion').classList.add('active');
  document.getElementById('paRevByVip').classList.remove('active');
  paLoadRevenue();
};
document.getElementById('paRevByVip').onclick = () => {
  paRevenueState.by = 'vip';
  document.getElementById('paRevByVip').classList.add('active');
  document.getElementById('paRevByRegion').classList.remove('active');
  paLoadRevenue();
};
document.getElementById('paChannelPrev').onclick = () => { if (paChannelState.page > 1) { paChannelState.page--; paLoadChannel(); } };
document.getElementById('paChannelNext').onclick = () => { paChannelState.page++; paLoadChannel(); };

document.getElementById('paNewToggle').onclick = () => {
  paState.profit.newOnly = !paState.profit.newOnly;
  paState.profit.page = 1;
  document.getElementById('paNewToggle').classList.toggle('off', !paState.profit.newOnly);
  paLoadProfit();
};
document.getElementById('paProfitPrev').onclick = () => { if (paState.profit.page > 1) { paState.profit.page--; paLoadProfit(); } };
document.getElementById('paProfitNext').onclick = () => { paState.profit.page++; paLoadProfit(); };
document.getElementById('paSuspiciousPrev').onclick = () => { if (paState.suspicious.page > 1) { paState.suspicious.page--; paLoadSuspicious(); } };
document.getElementById('paSuspiciousNext').onclick = () => { paState.suspicious.page++; paLoadSuspicious(); };

function paTableToCsv(tableEl) {
  const rows = [...tableEl.querySelectorAll('tr')];
  return rows.map((row) => [...row.children].map((c) => '"' + c.textContent.trim().replace(/"/g,'""') + '"').join(',')).join('\\n');
}
function paDownloadCsv(tableEl, filename) {
  const blob = new Blob([paTableToCsv(tableEl)], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}
document.getElementById('paExportProfit').onclick = () => paDownloadCsv(document.getElementById('paProfitTable'), 'profit-users-of-the-day.csv');
document.getElementById('paExportSuspicious').onclick = () => paDownloadCsv(document.getElementById('paSuspiciousTable'), 'suspicious-withdraw-users.csv');
document.getElementById('paExportChannel').onclick = () => paDownloadCsv(document.getElementById('paChannelTable'), 'channel-performance.csv');
document.getElementById('paExportRevenue').onclick = () => paDownloadCsv(document.getElementById('paRevenueTable'), 'net-revenue-by-' + paRevenueState.by + '.csv');

paLoadProfit();
paLoadSuspicious();
paLoadChannel();
paLoadRevenue();
</script>
`;
