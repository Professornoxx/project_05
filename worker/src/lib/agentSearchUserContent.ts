// Agent Dashboard's Search User page — search functionality only, per the
// Agent role spec (no Reassign Agent / Ban / Unban cards, unlike the admin
// version in searchUserContent.ts). Backed by the same /api/dashboard/search-user
// endpoint, which is agent-session-aware and only returns users assigned to
// the logged-in agent.
export const AGENT_SEARCH_USER_CONTENT_HTML = `
<style>
  .su-search-wrap { background: #fff; border-radius: 10px; padding: 10px 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
  .su-search-icon { color: #999; font-size: 16px; }
  .su-search-input { flex: 1; border: none; outline: none; font-size: 15px; padding: 8px 0; }
  .su-search-btn { background: #4f46e5; color: #fff; border: none; padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
  .su-card { background: #fff; border-radius: 10px; padding: 18px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); margin-bottom: 20px; }
  .su-card-head { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
  .su-card-icon { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; flex-shrink: 0; background: #eef0f7; }
  .su-card-title { font-weight: 700; font-size: 13px; letter-spacing: 0.03em; text-transform: uppercase; }
  .su-details-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }
  .su-field { border-bottom: 1px solid #f0f0f0; padding-bottom: 10px; }
  .su-field-label { font-size: 11px; text-transform: uppercase; color: #888; letter-spacing: 0.03em; margin-bottom: 4px; }
  .su-field-value { font-size: 15px; font-weight: 600; }
  .su-status-active { color: #15803d; }
  .su-status-banned { color: #b91c1c; }
</style>

<div class="su-search-wrap">
  <span class="su-search-icon">🔍</span>
  <input class="su-search-input" id="suSearchInput" placeholder="Enter or paste a User ID..." />
  <button class="su-search-btn" id="suSearchBtn">Search</button>
</div>

<div class="su-card" id="suDetailsCard" style="display:none;">
  <div class="su-card-head"><span class="su-card-icon">📋</span><span class="su-card-title">User details</span></div>
  <div class="su-details-grid" id="suDetailsGrid"></div>
</div>

<div id="suStatus" style="font-size:13px;color:#888;"></div>

<script>
function suFmtInr(n) { return n === null || n === undefined ? '—' : '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 }); }
function suFmt(v) { return v === null || v === undefined || v === '' ? '—' : v; }
function suField(label, value, cls) {
  return '<div class="su-field"><div class="su-field-label">' + label + '</div><div class="su-field-value' + (cls ? ' ' + cls : '') + '">' + value + '</div></div>';
}

function suRenderDetails(u) {
  const grid = document.getElementById('suDetailsGrid');
  const statusLabel = u.is_banned ? 'Banned' : 'Active';
  const statusCls = u.is_banned ? 'su-status-banned' : 'su-status-active';
  grid.innerHTML = [
    suField('User ID', u.user_id),
    suField('Username', suFmt(u.username)),
    suField('Phone number', suFmt(u.phone)),
    suField('Registration date', suFmt(u.create_time)),
    suField('Current status', statusLabel, statusCls),
    suField('VIP level', 'VIP ' + u.vip_level),
    suField('Wallet balance', suFmtInr(u.user_balance)),
    suField('Total deposit', suFmtInr(u.total_deposit)),
    suField('Total withdrawal', suFmtInr(u.total_withdrawal)),
    suField('Deposit count', suFmt(u.deposit_txn_count)),
    suField('Withdrawal count', suFmt(u.withdrawal_txn_count)),
    suField("Today's deposit", suFmtInr(u.dep_today)),
    suField("Today's withdrawal", suFmtInr(u.wd_today)),
    suField('Last deposit', suFmt(u.last_deposit_time)),
    suField('Last withdrawal', suFmt(u.last_withdrawal_time)),
    suField('Last active', suFmt(u.last_active_time)),
    suField('City', suFmt(u.city)),
  ].join('');
  document.getElementById('suDetailsCard').style.display = '';
}

async function suSearch(userId) {
  const statusEl = document.getElementById('suStatus');
  if (!userId) return;
  try {
    const res = await fetch('/api/dashboard/search-user?userId=' + encodeURIComponent(userId));
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || res.statusText);
    suRenderDetails(d.user);
    statusEl.textContent = 'Updated ' + new Date().toLocaleTimeString();
  } catch (e) {
    document.getElementById('suDetailsCard').style.display = 'none';
    statusEl.textContent = 'Error: ' + e.message;
  }
}

document.getElementById('suSearchBtn').onclick = () => suSearch(document.getElementById('suSearchInput').value.trim());
document.getElementById('suSearchInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') suSearch(document.getElementById('suSearchInput').value.trim());
});
</script>
`;
