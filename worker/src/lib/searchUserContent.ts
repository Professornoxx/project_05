import { SEARCH_USER_SHARED_STYLES, SEARCH_USER_RESULT_PANEL_HTML, SEARCH_USER_SHARED_SCRIPT } from "./searchUserShared";

// Search User page. Matches the provided reference design: search bar,
// Reassign Agent card, Ban/Unban User card (kept as-is per instruction),
// and a full result panel below — header summary, Financial Overview,
// Last 7 Days Activity (deposit/withdrawal line items), and Recent Games
// & Bonuses. Data from /api/dashboard/search-user (user summary),
// /api/dashboard/search-user-details (7-day activity + games/bonuses),
// /api/dashboard/agents-list, /api/dashboard/reassign-agent,
// /api/dashboard/ban-user, /api/dashboard/unban-user.
//
// NOTE: wallet_details has no BET/WIN "type" column — the source export
// doesn't capture it (confirmed against live data: no field distinguishes
// a stake from a payout, amounts are never negative). "Recent Games
// Played" therefore lists game/amount/time without a type badge, unlike
// the reference mockup's TYPE column.
export const SEARCH_USER_CONTENT_HTML = `
${SEARCH_USER_SHARED_STYLES}

<div class="su-page">

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
    <div class="su-row-spacer"></div>
    <button class="su-btn su-btn-save" id="suReassignBtn">💾 Save</button>
  </div>
  <div class="su-msg" id="suReassignMsg"></div>
</div>

<div class="su-card ban">
  <div class="su-card-head"><span class="su-card-icon">🚫</span><span class="su-card-title">Ban / Unban user</span></div>
  <div class="su-ban-note">Banning hides this user from every report, listing, export, and search on the dashboard -- their records are NOT deleted and keep updating normally in the background. Unban to make them visible again immediately, with full history intact.</div>
  <div class="su-row">
    <input class="su-input" id="suBanUserId" placeholder="User ID" />
    <div class="su-row-spacer"></div>
    <button class="su-btn su-btn-ban" id="suBanBtn">🚫 Ban</button>
    <button class="su-btn su-btn-unban" id="suUnbanBtn">✅ Unban</button>
  </div>
  <div class="su-msg" id="suBanMsg"></div>
</div>

${SEARCH_USER_RESULT_PANEL_HTML}

<div id="suStatus" style="font-size:13px;color:#888;"></div>

</div>

<script>
${SEARCH_USER_SHARED_SCRIPT}

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
