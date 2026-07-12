// Shared sidebar shell for the new dashboard design. Each nav item is its
// own real URL/route (not a client-side tab), matching the "separate URL"
// requirement already established for Dashboard/Configuration/Analytics.
// Content areas are intentionally empty placeholders — filled in page by
// page once the user supplies each page's design.

export interface NavItem {
  key: string;
  label: string;
  icon: string;
  href: string;
}

export const NAV_ITEMS: NavItem[] = [
  { key: "home", label: "Home", icon: "🏠", href: "/dashboard" },
  { key: "action-center", label: "Action Center", icon: "⚡", href: "/dashboard/action-center" },
  { key: "performance", label: "Performance", icon: "🏆", href: "/dashboard/performance" },
  { key: "analytics", label: "Analytics", icon: "📊", href: "/dashboard/analytics" },
  { key: "platform-analysis", label: "Platform Analysis", icon: "🎮", href: "/dashboard/platform-analysis" },
  { key: "search-user", label: "Search User", icon: "🔍", href: "/dashboard/search-user" },
];

// Agent Dashboard's restricted nav — the 5 pages the Agent role is scoped
// to (no Platform Analysis, no Configuration). Same shell/styles as the
// admin dashboard, just a different link set and logout target.
export const AGENT_NAV_ITEMS: NavItem[] = [
  { key: "home", label: "Home", icon: "🏠", href: "/agent" },
  { key: "action-center", label: "Action Center", icon: "⚡", href: "/agent/action-center" },
  { key: "performance", label: "Performance", icon: "🏆", href: "/agent/performance" },
  { key: "analytics", label: "Analytics", icon: "📊", href: "/agent/analytics" },
  { key: "search-user", label: "Search User", icon: "🔍", href: "/agent/search-user" },
];

function renderNav(activeKey: string, navItems: NavItem[]): string {
  return navItems.map((item) => {
    const isActive = item.key === activeKey;
    return `<a href="${item.href}" class="nav-item${isActive ? " active" : ""}">
      <span class="nav-icon">${item.icon}</span>
      <span class="nav-label">${item.label}</span>
    </a>`;
  }).join("\n");
}

export function renderDashboardShell(
  activeKey: string,
  pageTitle: string,
  contentHtml: string,
  opts?: { navItems?: NavItem[]; logoutUrl?: string; loginUrl?: string; mode?: "admin" | "agent" }
): string {
  const navItems = opts?.navItems ?? NAV_ITEMS;
  const logoutUrl = opts?.logoutUrl ?? "/logout";
  const loginUrl = opts?.loginUrl ?? "/login";
  const mode = opts?.mode ?? "admin";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${pageTitle} — Dashboard</title>
<meta name="robots" content="noindex" />
<script>
// Every fetch from this page (shell script + all content-file fetches,
// none of which know or care about this) gets an x-dashboard-mode header
// so the server always checks the RIGHT session type for this page,
// instead of guessing from whichever cookies happen to be in the
// browser. Without this, a browser that's ever logged into both
// /dashboard and /agent sends both session cookies on every request, and
// one page's data silently gets scoped/unscoped by the other page's
// leftover session — see requireDashboardOrAgentScope's comment in
// index.ts for the two bugs this caused before this fix.
//
// MUST run before any content-file <script> executes — those call
// fetch() immediately as the browser parses the page to load their data
// on load. Putting this override at the bottom of <body> (where it lived
// before) let every page's first data load race ahead of the override
// and go out with no mode header at all, hitting the unscoped-cookie
// fallback (confirmed live: this is why admin pages briefly/persistently
// showed an agent's scoped data). <head> guarantees this runs first.
(function () {
  var mode = '${mode}';
  var origFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    init = init || {};
    var headers = new Headers(init.headers || {});
    headers.set('x-dashboard-mode', mode);
    init.headers = headers;
    return origFetch(input, init);
  };
})();
</script>
<style>
  * { box-sizing: border-box; }
  html, body {
    height: 100%;
    overflow: hidden; /* the page itself never scrolls — .main does */
  }
  body {
    font-family: system-ui, -apple-system, sans-serif;
    margin: 0;
    background: #eef0f7;
    color: #1f2430;
    display: flex;
  }
  .sidebar {
    width: 220px;
    flex-shrink: 0;
    height: 100vh;
    overflow-y: auto;
    background: #eef0f7;
    padding: 20px 14px;
  }
  .nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    margin-bottom: 6px;
    border-radius: 10px;
    text-decoration: none;
    color: #333;
    font-size: 14px;
    font-weight: 500;
  }
  .nav-item:hover { background: rgba(0,0,0,0.04); }
  .nav-item.active {
    background: #4f46e5;
    color: #fff;
  }
  .nav-icon { font-size: 15px; width: 18px; text-align: center; }
  .main {
    flex: 1;
    height: 100vh;
    overflow-y: auto; /* the page's actual scroll container — sidebar and header-row stay put */
    padding: 0 40px 32px;
  }
  .main h1 { font-size: 22px; margin-top: 0; }
  .header-row {
    position: sticky;
    top: 0;
    z-index: 10;
    background: #eef0f7;
    padding: 32px 0 16px;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }
  .placeholder {
    border: 1px dashed #c7cbe0;
    border-radius: 10px;
    padding: 40px;
    text-align: center;
    color: #888;
    font-size: 14px;
    margin-top: 20px;
  }
  .logout {
    display: block;
    margin-top: 20px;
    font-size: 12px;
    color: #666;
    text-decoration: none;
  }
  .last-sync { font-size: 12px; padding: 6px 12px; border-radius: 16px; display: inline-flex; align-items: center; gap: 6px; }
  .last-sync.fresh { background: #dcfce7; color: #15803d; }
  .last-sync.stale { background: #fee2e2; color: #b91c1c; }
  .last-sync.loading { background: #f1f5f9; color: #64748b; }
</style>
</head>
<body>
<div class="sidebar">
  ${renderNav(activeKey, navItems)}
  <a href="#" class="logout" id="logoutLink">Log out</a>
</div>
<div class="main">
  <div class="header-row">
    <h1>${pageTitle}</h1>
    <span class="last-sync loading" id="lastSyncBadge">Checking data freshness…</span>
  </div>
  ${contentHtml}
</div>
<script>
document.getElementById('logoutLink').onclick = async (e) => {
  e.preventDefault();
  await fetch('${logoutUrl}', { method: 'POST' });
  location.href = '${loginUrl}';
};

// Real last-successful-sync time per source, not the browser's render
// time — see /api/dashboard/last-sync for why this exists (an 8hr token
// outage previously went unnoticed because per-section "Updated HH:MM:SS"
// text only ever showed the current time, regardless of data freshness).
(async () => {
  const badge = document.getElementById('lastSyncBadge');
  try {
    const res = await fetch('/api/dashboard/last-sync');
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || res.statusText);

    const bySource = {};
    (d.bySource || []).forEach((r) => { bySource[r.source] = r.last_success; });
    const timestamps = Object.values(bySource).filter(Boolean).map((t) => new Date(t).getTime());
    if (timestamps.length === 0) {
      badge.textContent = 'No successful sync yet';
      badge.className = 'last-sync stale';
      return;
    }
    const oldestSuccess = Math.min(...timestamps);
    const ageMinutes = (Date.now() - oldestSuccess) / 60000;

    const failureIsNewer = d.recentFailure && bySource[d.recentFailure.source] &&
      new Date(d.recentFailure.started_at).getTime() > new Date(bySource[d.recentFailure.source]).getTime();

    const fmtAge = (m) => m < 60 ? Math.round(m) + 'm ago' : (m / 60).toFixed(1) + 'h ago';
    const isStale = ageMinutes > 90 || failureIsNewer;
    badge.textContent = 'Data last synced: ' + fmtAge(ageMinutes) + (failureIsNewer ? ' (' + d.recentFailure.source + ' sync currently failing)' : '');
    badge.className = 'last-sync ' + (isStale ? 'stale' : 'fresh');
  } catch (e) {
    badge.textContent = 'Sync status unavailable';
    badge.className = 'last-sync stale';
  }
})();
</script>
</body>
</html>`;
}

export const EMPTY_CONTENT_PLACEHOLDER = `<div class="placeholder">Content for this page hasn't been designed yet — send it over and it'll go here.</div>`;
