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

function renderNav(activeKey: string): string {
  return NAV_ITEMS.map((item) => {
    const isActive = item.key === activeKey;
    return `<a href="${item.href}" class="nav-item${isActive ? " active" : ""}">
      <span class="nav-icon">${item.icon}</span>
      <span class="nav-label">${item.label}</span>
    </a>`;
  }).join("\n");
}

export function renderDashboardShell(activeKey: string, pageTitle: string, contentHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${pageTitle} — Dashboard</title>
<meta name="robots" content="noindex" />
<style>
  * { box-sizing: border-box; }
  body {
    font-family: system-ui, -apple-system, sans-serif;
    margin: 0;
    background: #eef0f7;
    color: #1f2430;
    display: flex;
    min-height: 100vh;
  }
  .sidebar {
    width: 220px;
    flex-shrink: 0;
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
    padding: 32px 40px;
  }
  .main h1 { font-size: 22px; margin-top: 0; }
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
</style>
</head>
<body>
<div class="sidebar">
  ${renderNav(activeKey)}
  <a href="#" class="logout" id="logoutLink">Log out</a>
</div>
<div class="main">
  <h1>${pageTitle}</h1>
  ${contentHtml}
</div>
<script>
document.getElementById('logoutLink').onclick = async (e) => {
  e.preventDefault();
  await fetch('/logout', { method: 'POST' });
  location.href = '/login';
};
</script>
</body>
</html>`;
}

export const EMPTY_CONTENT_PLACEHOLDER = `<div class="placeholder">Content for this page hasn't been designed yet — send it over and it'll go here.</div>`;
