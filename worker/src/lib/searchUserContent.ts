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
<style>
  .su-bulk-textarea { width: 100%; box-sizing: border-box; min-height: 140px; border: 1px solid #ddd; border-radius: 8px; padding: 10px 12px; font-size: 13px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; resize: vertical; margin-bottom: 12px; }
  .su-bulk-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .su-bulk-count { font-size: 12px; color: #888; }
  .su-bulk-result { margin-top: 14px; font-size: 13px; }
  .su-bulk-result-summary { font-weight: 700; margin-bottom: 6px; }
  .su-bulk-result-summary.ok { color: #15803d; }
  .su-bulk-result-summary.err { color: #b91c1c; }
  .su-bulk-detail { font-size: 12px; color: #92400e; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 8px 12px; margin-top: 6px; word-break: break-word; }
</style>

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

<div class="su-card">
  <div class="su-card-head"><span class="su-card-icon">📋</span><span class="su-card-title">Bulk reassign agent</span></div>
  <p style="font-size:13px;color:#666;margin:0 0 12px;">Copy a column of User IDs straight from Excel and paste them below — one ID per line (or comma/tab separated works too).</p>
  <textarea class="su-bulk-textarea" id="suBulkTextarea" placeholder="e.g.&#10;104760&#10;267008&#10;25921&#10;..."></textarea>
  <div class="su-bulk-row">
    <select class="su-select" id="suBulkAgentSelect"><option value="Unassigned">Un-Assigned</option></select>
    <span class="su-bulk-count" id="suBulkCount">0 IDs detected</span>
    <div class="su-row-spacer"></div>
    <button class="su-btn su-btn-save" id="suBulkReassignBtn">💾 Apply to all</button>
  </div>
  <div class="su-bulk-result" id="suBulkResult"></div>
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
    ['suAgentSelect', 'suBulkAgentSelect'].forEach((selectId) => {
      const select = document.getElementById(selectId);
      (d.agents || []).forEach((a) => {
        const opt = document.createElement('option');
        opt.value = a;
        opt.textContent = a;
        select.appendChild(opt);
      });
    });
  } catch (e) {}
}

// Splits on any whitespace or comma so a pasted Excel column (newlines),
// a single row copied across cells (tabs), or a comma-separated list all
// parse the same way. Blank entries are dropped here; non-numeric
// entries are still sent through so the backend can report exactly what
// it skipped instead of silently dropping them client-side.
function suParseBulkIds(text) {
  return text.split(/[\\s,]+/).map((s) => s.trim()).filter((s) => s.length > 0);
}

function suUpdateBulkCount() {
  const ids = suParseBulkIds(document.getElementById('suBulkTextarea').value);
  const numeric = ids.filter((id) => /^\\d+$/.test(id));
  document.getElementById('suBulkCount').textContent =
    numeric.length + ' ID' + (numeric.length === 1 ? '' : 's') + ' detected' +
    (ids.length > numeric.length ? ' (' + (ids.length - numeric.length) + ' non-numeric will be skipped)' : '');
}
document.getElementById('suBulkTextarea').addEventListener('input', suUpdateBulkCount);

document.getElementById('suBulkReassignBtn').onclick = async () => {
  const resultEl = document.getElementById('suBulkResult');
  const ids = suParseBulkIds(document.getElementById('suBulkTextarea').value);
  const agent = document.getElementById('suBulkAgentSelect').value;
  if (ids.length === 0) {
    resultEl.innerHTML = '<div class="su-bulk-result-summary err">Paste at least one User ID first.</div>';
    return;
  }
  if (!confirm('Reassign ' + ids.length + ' user' + (ids.length === 1 ? '' : 's') + ' to "' + agent + '"?')) return;
  resultEl.innerHTML = '<div class="su-bulk-result-summary">Applying...</div>';
  try {
    const res = await fetch('/api/dashboard/bulk-reassign-agent', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userIds: ids, agent }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || res.statusText);
    let html = '<div class="su-bulk-result-summary ok">Reassigned ' + d.updated + ' of ' + d.requested + ' to ' + d.agent + '.</div>';
    if (d.notFoundIds && d.notFoundIds.length > 0) {
      html += '<div class="su-bulk-detail">' + d.notFoundIds.length + ' ID(s) not found: ' + d.notFoundIds.join(', ') + '</div>';
    }
    if (d.invalidEntries && d.invalidEntries.length > 0) {
      html += '<div class="su-bulk-detail">' + d.invalidEntries.length + ' non-numeric entr' + (d.invalidEntries.length === 1 ? 'y' : 'ies') + ' skipped: ' + d.invalidEntries.join(', ') + '</div>';
    }
    resultEl.innerHTML = html;
    if (suCurrentUser && ids.includes(String(suCurrentUser.user_id))) suSearch(String(suCurrentUser.user_id));
  } catch (e) {
    resultEl.innerHTML = '<div class="su-bulk-result-summary err">Error: ' + e.message + '</div>';
  }
};

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
