// Shared between searchUserContent.ts (admin: full panel + Reassign/Ban)
// and agentSearchUserContent.ts (agent: search-only, same result panel).
// Kept as one file so the two pages render an identical result panel
// instead of two hand-maintained copies drifting apart.

export const SEARCH_USER_SHARED_STYLES = `
<style>
  .su-page { max-width: 1180px; margin: 0 auto; }
  .su-search-wrap { background: #fff; border-radius: 10px; padding: 12px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
  .su-search-icon { color: #999; font-size: 16px; flex-shrink: 0; }
  .su-search-input { flex: 1; border: none; outline: none; font-size: 15px; padding: 8px 0; min-width: 0; }
  .su-search-btn { background: #4f46e5; color: #fff; border: none; padding: 10px 26px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; flex-shrink: 0; }
  .su-card { background: #fff; border-radius: 10px; padding: 20px 22px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); margin-bottom: 20px; }
  .su-card-head { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
  .su-card-icon { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; flex-shrink: 0; background: #eef0f7; }
  .su-card-title { font-weight: 700; font-size: 13px; letter-spacing: 0.03em; text-transform: uppercase; }
  .su-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .su-input, .su-select { border: 1px solid #ddd; border-radius: 8px; padding: 9px 12px; font-size: 14px; box-sizing: border-box; }
  .su-input { width: 280px; max-width: 100%; flex-shrink: 0; }
  .su-select { width: 160px; flex-shrink: 0; }
  .su-row-spacer { flex: 1; min-width: 0; }
  .su-btn { border: none; padding: 9px 18px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; flex-shrink: 0; white-space: nowrap; }
  .su-btn-save { background: #4f46e5; color: #fff; }
  .su-btn-ban { background: #dc2626; color: #fff; }
  .su-btn-unban { background: #16a34a; color: #fff; }
  .su-card.ban { background: #fef2f2; border: 1px solid #fecaca; }
  .su-card.ban .su-card-icon { background: #fee2e2; }
  .su-ban-note { color: #b91c1c; font-size: 13px; line-height: 1.6; margin: 0 0 16px; max-width: 760px; }
  .su-msg { font-size: 13px; margin-top: 10px; }
  .su-msg.ok { color: #15803d; }
  .su-msg.err { color: #b91c1c; }

  /* Result panel */
  .su-header-card { background: #fff; border-radius: 10px; padding: 20px 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap; border-left: 4px solid #4f46e5; }
  .su-header-id { font-size: 20px; font-weight: 800; margin: 0 0 4px; }
  .su-header-meta { font-size: 13px; color: #666; }
  .su-pill { display: inline-block; background: #dcfce7; color: #15803d; font-size: 11px; font-weight: 700; padding: 2px 9px; border-radius: 10px; margin-left: 8px; }
  .su-header-balance-label { font-size: 11px; color: #999; text-transform: uppercase; letter-spacing: 0.04em; text-align: right; }
  .su-header-balance-value { font-size: 22px; font-weight: 800; color: #4f46e5; text-align: right; }
  .su-vip-badge { background: #eef0ff; color: #4f46e5; font-size: 12px; font-weight: 700; padding: 6px 14px; border-radius: 8px; white-space: nowrap; }

  .su-section-title { font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: #555; margin: 24px 0 10px; display: flex; align-items: center; justify-content: space-between; }
  .su-lookup-badge { background: #fee2e2; color: #b91c1c; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 8px; }

  .su-fin-group-label { font-size: 11px; color: #999; text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 10px; }
  .su-fin-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 16px; margin-bottom: 18px; }
  .su-fin-grid:last-child { margin-bottom: 0; }
  .su-fin-label { font-size: 12px; color: #888; margin-bottom: 4px; }
  .su-fin-value { font-size: 17px; font-weight: 700; }
  .su-fin-value.pos { color: #15803d; }
  .su-fin-value.neg { color: #b91c1c; }
  .su-fin-divider { border: none; border-top: 1px solid #eee; margin: 4px 0 18px; }

  .su-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  @media (max-width: 900px) { .su-two-col { grid-template-columns: 1fr; } }
  .su-table-wrap { max-height: 340px; overflow-y: auto; }
  .su-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  .su-table th { position: sticky; top: 0; background: #fff; text-align: left; font-size: 10.5px; color: #999; text-transform: uppercase; letter-spacing: 0.03em; padding: 6px 8px; border-bottom: 1px solid #eee; }
  .su-table td { padding: 8px 8px; border-bottom: 1px solid #f5f5f5; white-space: nowrap; }
  .su-badge { display: inline-block; font-size: 10.5px; font-weight: 700; padding: 2px 8px; border-radius: 6px; text-transform: uppercase; }
  .su-badge-complete { background: #dcfce7; color: #15803d; }
  .su-badge-process { background: #dbeafe; color: #1d4ed8; }
  .su-badge-review { background: #fef3c7; color: #b45309; }
  .su-badge-bad { background: #fee2e2; color: #b91c1c; }
  .su-empty-row td { color: #999; text-align: center; padding: 16px; }
  .su-win { color: #15803d; font-weight: 700; }
</style>
`;

export const SEARCH_USER_RESULT_PANEL_HTML = `
<div class="su-card" id="suDetailsCard" style="display:none; padding:0; background:transparent; box-shadow:none;">
  <div class="su-header-card">
    <div>
      <p class="su-header-id" id="suHeaderId"></p>
      <div class="su-header-meta" id="suHeaderMeta"></div>
    </div>
    <div>
      <div class="su-header-balance-label">Wallet Balance</div>
      <div class="su-header-balance-value" id="suHeaderBalance"></div>
    </div>
    <div class="su-vip-badge" id="suHeaderVip"></div>
  </div>

  <div class="su-section-title">Financial Overview <span class="su-lookup-badge">LOOKUP</span></div>
  <div class="su-card">
    <div class="su-fin-group-label">Lifetime</div>
    <div class="su-fin-grid" id="suFinLifetime"></div>
    <hr class="su-fin-divider" />
    <div class="su-fin-group-label">Last 7 Days (completed only)</div>
    <div class="su-fin-grid" id="suFinLast7"></div>
  </div>

  <div class="su-section-title">Last 7 Days Activity <span class="su-lookup-badge">LOOKUP</span></div>
  <div class="su-two-col">
    <div class="su-card">
      <div class="su-card-head"><span class="su-card-icon">💰</span><span class="su-card-title" id="suDepositsTitle">Deposits</span></div>
      <div class="su-table-wrap"><table class="su-table">
        <thead><tr><th>Date</th><th>Amount</th><th>Status</th><th>Order No</th><th>Channel</th></tr></thead>
        <tbody id="suDepositsBody"></tbody>
      </table></div>
    </div>
    <div class="su-card">
      <div class="su-card-head"><span class="su-card-icon">🏦</span><span class="su-card-title" id="suWithdrawalsTitle">Withdrawals</span></div>
      <div class="su-table-wrap"><table class="su-table">
        <thead><tr><th>Date</th><th>Amount</th><th>Status</th><th>Order No</th><th>Channel</th></tr></thead>
        <tbody id="suWithdrawalsBody"></tbody>
      </table></div>
    </div>
  </div>

  <div class="su-section-title">Recent Games &amp; Bonuses <span class="su-lookup-badge">LOOKUP</span></div>
  <div class="su-two-col">
    <div class="su-card">
      <div class="su-card-head"><span class="su-card-icon">🎮</span><span class="su-card-title" id="suGamesTitle">Recent Games Played</span></div>
      <p style="font-size:11px;color:#999;margin:-8px 0 10px;">Last 2 days · no bet/win type in source data</p>
      <div class="su-table-wrap"><table class="su-table">
        <thead><tr><th>Game</th><th>Amount</th><th>Date</th></tr></thead>
        <tbody id="suGamesBody"></tbody>
      </table></div>
    </div>
    <div class="su-card">
      <div class="su-card-head"><span class="su-card-icon">🎁</span><span class="su-card-title" id="suBonusesTitle">Bonuses Claimed</span></div>
      <p style="font-size:11px;color:#999;margin:-8px 0 10px;">Last 7 days</p>
      <div class="su-table-wrap"><table class="su-table">
        <thead><tr><th>Bonus</th><th>Amount</th><th>Date</th></tr></thead>
        <tbody id="suBonusesBody"></tbody>
      </table></div>
    </div>
  </div>
</div>
`;

export const SEARCH_USER_SHARED_SCRIPT = `
function suFmtInr(n) { return n === null || n === undefined ? '—' : '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 }); }
function suFmt(v) { return v === null || v === undefined || v === '' ? '—' : v; }
function suFmtDateTime(v) { if (!v) return '—'; return String(v).replace('T', ' ').slice(0, 16); }
function suFinItem(label, value, cls) {
  return '<div><div class="su-fin-label">' + label + '</div><div class="su-fin-value' + (cls ? ' ' + cls : '') + '">' + value + '</div></div>';
}
function suDepositBadge(status) {
  const s = (status || '').toUpperCase();
  const cls = s === 'COMPLETE' ? 'su-badge-complete' : s === 'PROCESS' ? 'su-badge-process' : 'su-badge-bad';
  return '<span class="su-badge ' + cls + '">' + (s || '—') + '</span>';
}
function suWithdrawBadge(status) {
  const n = Number(status);
  const map = { 0: ['IN-REVIEW', 'su-badge-review'], 1: ['PROCESSING', 'su-badge-process'], 2: ['COMPLETE', 'su-badge-complete'], 3: ['REJECTED', 'su-badge-bad'], 4: ['FAILED', 'su-badge-bad'] };
  const [label, cls] = map[n] || ['—', 'su-badge-bad'];
  return '<span class="su-badge ' + cls + '">' + label + '</span>';
}

let suCurrentUser = null;

function suRenderHeader(u) {
  document.getElementById('suHeaderId').textContent = 'User #' + u.user_id;
  const activePill = u.is_banned ? '<span class="su-pill" style="background:#fee2e2;color:#b91c1c;">BANNED</span>' : '<span class="su-pill">ACTIVE</span>';
  document.getElementById('suHeaderMeta').innerHTML =
    'Agent ' + suFmt(u.assigned_agent === null || u.assigned_agent === '' ? 'Unassigned' : u.assigned_agent) +
    ' · ' + suFmt(u.city) + ' · Registered ' + suFmtDateTime(u.create_time).slice(0, 10) + activePill;
  document.getElementById('suHeaderBalance').textContent = suFmtInr(u.user_balance);
  document.getElementById('suHeaderVip').textContent = 'VIP ' + u.vip_level;
}

function suRenderFinancials(u, last7) {
  document.getElementById('suFinLifetime').innerHTML = [
    suFinItem('Total Deposit', suFmtInr(u.total_deposit)),
    suFinItem('Deposit Count', suFmt(u.deposit_txn_count)),
    suFinItem('Total Withdraw', suFmtInr(u.total_withdrawal)),
    suFinItem('Wallet Balance', suFmtInr(u.user_balance)),
    suFinItem('Net Lifetime (Deposit − Withdraw)', suFmtInr((u.total_deposit || 0) - (u.total_withdrawal || 0))),
  ].join('');
  document.getElementById('suFinLast7').innerHTML = [
    suFinItem('Deposits', suFmtInr(last7.deposits)),
    suFinItem('Deposit Count', suFmt(last7.depositCount)),
    suFinItem('Withdrawals', suFmtInr(last7.withdrawals)),
    suFinItem('Net', suFmtInr(last7.net), last7.net >= 0 ? 'pos' : 'neg'),
  ].join('');
}

function suRenderDeposits(rows) {
  document.getElementById('suDepositsTitle').textContent = 'Deposits (' + rows.length + ')';
  const body = document.getElementById('suDepositsBody');
  body.innerHTML = rows.length ? rows.map((r) =>
    '<tr><td>' + suFmtDateTime(r.create_time) + '</td><td>' + suFmtInr(r.amount) + '</td><td>' + suDepositBadge(r.status) +
    '</td><td>' + suFmt(r.order_no) + '</td><td>' + suFmt(r.channel) + '</td></tr>'
  ).join('') : '<tr class="su-empty-row"><td colspan="5">No deposits in the last 7 days.</td></tr>';
}

function suRenderWithdrawals(rows) {
  document.getElementById('suWithdrawalsTitle').textContent = 'Withdrawals (' + rows.length + ')';
  const body = document.getElementById('suWithdrawalsBody');
  body.innerHTML = rows.length ? rows.map((r) =>
    '<tr><td>' + suFmtDateTime(r.create_time) + '</td><td>' + suFmtInr(r.amount) + '</td><td>' + suWithdrawBadge(r.status) +
    '</td><td>' + suFmt(r.order_no) + '</td><td>' + suFmt(r.channel) + '</td></tr>'
  ).join('') : '<tr class="su-empty-row"><td colspan="5">No withdrawals in the last 7 days.</td></tr>';
}

function suRenderGames(rows) {
  document.getElementById('suGamesTitle').textContent = 'Recent Games Played (' + rows.length + ')';
  const body = document.getElementById('suGamesBody');
  body.innerHTML = rows.length ? rows.map((r) =>
    '<tr><td>' + suFmt(r.game_name) + '</td><td>' + suFmtInr(r.amount) + '</td><td>' + suFmtDateTime(r.create_time) + '</td></tr>'
  ).join('') : '<tr class="su-empty-row"><td colspan="3">No game activity in the last 2 days.</td></tr>';
}

function suRenderBonuses(rows) {
  document.getElementById('suBonusesTitle').textContent = 'Bonuses Claimed (' + rows.length + ')';
  const body = document.getElementById('suBonusesBody');
  body.innerHTML = rows.length ? rows.map((r) =>
    '<tr><td>' + suFmt(r.bonus_name) + '</td><td class="su-win">' + suFmtInr(r.amount) + '</td><td>' + suFmtDateTime(r.create_time) + '</td></tr>'
  ).join('') : '<tr class="su-empty-row"><td colspan="3">No bonuses claimed in the last 7 days.</td></tr>';
}

async function suSearch(userId) {
  const statusEl = document.getElementById('suStatus');
  if (!userId) return;
  try {
    const [userRes, detailsRes] = await Promise.all([
      fetch('/api/dashboard/search-user?userId=' + encodeURIComponent(userId)),
      fetch('/api/dashboard/search-user-details?userId=' + encodeURIComponent(userId)),
    ]);
    const userData = await userRes.json();
    if (!userRes.ok) throw new Error(userData.error || userRes.statusText);
    const details = await detailsRes.json();
    if (!detailsRes.ok) throw new Error(details.error || detailsRes.statusText);

    suCurrentUser = userData.user;
    suRenderHeader(userData.user);
    suRenderFinancials(userData.user, details.last7Days);
    suRenderDeposits(details.deposits);
    suRenderWithdrawals(details.withdrawals);
    suRenderGames(details.games);
    suRenderBonuses(details.bonuses);

    document.getElementById('suDetailsCard').style.display = '';
    // suActionCards (Reassign/Bulk Reassign/Ban/Bulk Ban) only exists on
    // the admin page — stays hidden entirely until a search succeeds, per
    // "nothing below the search bar until a User ID is found".
    if (document.getElementById('suActionCards')) document.getElementById('suActionCards').style.display = '';
    if (document.getElementById('suAgentSelect')) document.getElementById('suAgentSelect').value = userData.user.assigned_agent || 'Unassigned';
    if (document.getElementById('suReassignUserId')) document.getElementById('suReassignUserId').value = userData.user.user_id;
    if (document.getElementById('suBanUserId')) document.getElementById('suBanUserId').value = userData.user.user_id;

    statusEl.textContent = 'Updated ' + new Date().toLocaleTimeString();
  } catch (e) {
    document.getElementById('suDetailsCard').style.display = 'none';
    if (document.getElementById('suActionCards')) document.getElementById('suActionCards').style.display = 'none';
    statusEl.textContent = 'Error: ' + e.message;
  }
}
`;
