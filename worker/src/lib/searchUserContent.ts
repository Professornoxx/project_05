// Search User page. Matches the provided reference design: search bar,
// Reassign Agent card, Ban/Unban User card (kept as-is per instruction),
// and a full user-details panel below that appears once a search returns
// a result. Data from /api/dashboard/search-user, /api/dashboard/agents-list,
// /api/dashboard/reassign-agent, /api/dashboard/ban-user, /api/dashboard/unban-user.
export const SEARCH_USER_CONTENT_HTML = `
<style>
  .su-search-wrap { background: #fff; border-radius: 10px; padding: 10px 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
  .su-search-icon { color: #999; font-size: 16px; }
  .su-search-input { flex: 1; border: none; outline: none; font-size: 15px; padding: 8px 0; }
  .su-search-btn { background: #4f46e5; color: #fff; border: none; padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
  .su-card { background: #fff; border-radius: 10px; padding: 18px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); margin-bottom: 20px; }
  .su-card-head { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
  .su-card-icon { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; flex-shrink: 0; background: #eef0f7; }
  .su-card-title { font-weight: 700; font-size: 13px; letter-spacing: 0.03em; text-transform: uppercase; }
  .su-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .su-input, .su-select { border: 1px solid #ddd; border-radius: 8px; padding: 9px 12px; font-size: 14px; }
  .su-input { flex: 1; min-width: 140px; }
  .su-btn { border: none; padding: 9px 18px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
  .su-btn-save { background: #4f46e5; color: #fff; }
  .su-btn-ban { background: #dc2626; color: #fff; }
  .su-btn-unban { background: #16a34a; color: #fff; }
  .su-card.ban { background: #fef2f2; border: 1px solid #fecaca; }
  .su-card.ban .su-card-icon { background: #fee2e2; }
  .su-ban-note { color: #b91c1c; font-size: 13px; line-height: 1.5; margin-bottom: 14px; }
  .su-details-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }
  .su-field { border-bottom: 1px solid #f0f0f0; padding-bottom: 10px; }
  .su-field-label { font-size: 11px; text-transform: uppercase; color: #888; letter-spacing: 0.03em; margin-bottom: 4px; }
  .su-field-value { font-size: 15px; font-weight: 600; }
  .su-status-active { color: #15803d; }
  .su-status-banned { color: #b91c1c; }
  .su-msg { font-size: 13px; margin-top: 10px; }
  .su-msg.ok { color: #15803d; }
  .su-msg.err { color: #b91c1c; }
</style>

<div class="su-search-wrap">
  <span class="su-search-icon">🔍</span>
  <input class="su-search-input" id="suSearchInput" placeholder="Enter or paste a User ID..." />
  <button class="su-search-btn" id="suSearchBtn">Search</button>
</div>

<div class="su-card">
  <div class="su-card-head"><span class="su-card-icon">👤</span><span class="su-card-title">Reassign agent</span></div>
  <div class="su-row">
    <input class="su-input" id="suReassignUserId" placeholder="User ID" />
    <select class="su-select" id="suAgentSelect"><option value="Unassigned">Un-Assigned</option></select>
    <button class="su-btn su-btn-save" id="suReassignBtn">💾 Save</button>
  </div>
  <div class="su-msg" id="suReassignMsg"></div>
</div>

<div class="su-card ban">
  <div class="su-card-head"><span class="su-card-icon">🚫</span><span class="su-card-title">Ban / Unban user</span></div>
  <div class="su-ban-note">Banning hides this user from every report, listing, export, and search on the dashboard -- their records are NOT deleted and keep updating normally in the background. Unban to make them visible again immediately, with full history intact.</div>
  <div class="su-row">
    <input class="su-input" id="suBanUserId" placeholder="User ID" />
    <button class="su-btn su-btn-ban" id="suBanBtn">🚫 Ban</button>
    <button class="su-btn su-btn-unban" id="suUnbanBtn">✅ Unban</button>
  </div>
  <div class="su-msg" id="suBanMsg"></div>
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

let suCurrentUser = null;

async function suLoadAgents() {
  try {
    const res = await fetch('/api/dashboard/agents-list');
    const d = await res.json();
    if (!res.ok) return;
    const select = document.getElementById('suAgentSelect');
    (d.agents || []).forEach((a) => {
      const opt = document.createElement('option');
      opt.value = a;
      opt.textContent = a;
      select.appendChild(opt);
    });
  } catch (e) {}
}

function suRenderDetails(u) {
  suCurrentUser = u;
  const grid = document.getElementById('suDetailsGrid');
  const statusLabel = u.is_banned ? 'Banned' : 'Active';
  const statusCls = u.is_banned ? 'su-status-banned' : 'su-status-active';
  grid.innerHTML = [
    suField('User ID', u.user_id),
    suField('Username', suFmt(u.username)),
    suField('Full name', suFmt(u.username)),
    suField('Phone number', suFmt(u.phone)),
    suField('Registration date', suFmt(u.create_time)),
    suField('Current status', statusLabel, statusCls),
    suField('Assigned agent', suFmt(u.assigned_agent) === '—' ? 'Unassigned' : u.assigned_agent),
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
    suField('Email', suFmt(u.email)),
    suField('Gender', suFmt(u.gender)),
    suField('Register device', suFmt(u.register_device)),
    suField('Register channel', suFmt(u.register_channel)),
    suField('Member level (raw)', suFmt(u.member_level)),
    suField('Test account', u.is_test_account ? 'Yes' : 'No'),
  ].join('');
  document.getElementById('suDetailsCard').style.display = '';
  document.getElementById('suAgentSelect').value = u.assigned_agent || 'Unassigned';
  document.getElementById('suReassignUserId').value = u.user_id;
  document.getElementById('suBanUserId').value = u.user_id;
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

document.getElementById('suReassignBtn').onclick = async () => {
  const msgEl = document.getElementById('suReassignMsg');
  const userId = document.getElementById('suReassignUserId').value.trim();
  const agent = document.getElementById('suAgentSelect').value;
  if (!userId) { msgEl.textContent = 'Enter a User ID first.'; msgEl.className = 'su-msg err'; return; }
  try {
    const res = await fetch('/api/dashboard/reassign-agent', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId, agent }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || res.statusText);
    msgEl.textContent = 'Saved — assigned to ' + d.agent + '.';
    msgEl.className = 'su-msg ok';
    if (suCurrentUser && String(suCurrentUser.user_id) === userId) suSearch(userId);
  } catch (e) {
    msgEl.textContent = 'Error: ' + e.message;
    msgEl.className = 'su-msg err';
  }
};

async function suSetBan(banned) {
  const msgEl = document.getElementById('suBanMsg');
  const userId = document.getElementById('suBanUserId').value.trim();
  if (!userId) { msgEl.textContent = 'Enter a User ID first.'; msgEl.className = 'su-msg err'; return; }
  try {
    const res = await fetch('/api/dashboard/' + (banned ? 'ban-user' : 'unban-user'), {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || res.statusText);
    msgEl.textContent = banned ? 'User banned.' : 'User unbanned.';
    msgEl.className = 'su-msg ok';
    if (suCurrentUser && String(suCurrentUser.user_id) === userId) suSearch(userId);
  } catch (e) {
    msgEl.textContent = 'Error: ' + e.message;
    msgEl.className = 'su-msg err';
  }
}
document.getElementById('suBanBtn').onclick = () => suSetBan(true);
document.getElementById('suUnbanBtn').onclick = () => suSetBan(false);

suLoadAgents();
</script>
`;
