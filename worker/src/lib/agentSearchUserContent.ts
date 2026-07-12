import { SEARCH_USER_SHARED_STYLES, SEARCH_USER_RESULT_PANEL_HTML, SEARCH_USER_SHARED_SCRIPT } from "./searchUserShared";

// Agent Dashboard's Search User page — search functionality only, per the
// Agent role spec (no Reassign Agent / Ban / Unban cards, unlike the admin
// version in searchUserContent.ts). Shares the same result panel as the
// admin page (searchUserShared.ts) so agents and admins see identical
// layouts — /api/dashboard/search-user and /api/dashboard/search-user-details
// are agent-session-aware and only return users assigned to the logged-in
// agent.
export const AGENT_SEARCH_USER_CONTENT_HTML = `
${SEARCH_USER_SHARED_STYLES}

<div class="su-search-wrap">
  <span class="su-search-icon">🔍</span>
  <input class="su-search-input" id="suSearchInput" placeholder="Enter or paste a User ID..." />
  <button class="su-search-btn" id="suSearchBtn">Search</button>
</div>

${SEARCH_USER_RESULT_PANEL_HTML}

<div id="suStatus" style="font-size:13px;color:#888;"></div>

<script>
${SEARCH_USER_SHARED_SCRIPT}

document.getElementById('suSearchBtn').onclick = () => suSearch(document.getElementById('suSearchInput').value.trim());
document.getElementById('suSearchInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') suSearch(document.getElementById('suSearchInput').value.trim());
});
</script>
`;
