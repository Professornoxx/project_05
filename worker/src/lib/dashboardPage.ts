// Admin Dashboard — its own URL (/dashboard), separate from the
// Configuration page. Same server-side auth gate as /config (see
// requireSession-equivalent check in index.ts).
export const DASHBOARD_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Admin Dashboard</title>
<meta name="robots" content="noindex" />
<style>
  body { font-family: system-ui, sans-serif; max-width: 960px; margin: 40px auto; color: #222; padding: 0 16px; }
  h1 { font-size: 20px; }
  nav a { margin-right: 16px; font-size: 13px; }
  .logout { float: right; font-size: 13px; }
  section { border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
  .health-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-top: 12px; }
  .health-card { border: 1px solid #eee; border-radius: 6px; padding: 12px; }
  .health-card .source { font-weight: 600; text-transform: capitalize; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 12px; font-weight: 600; }
  .badge.success { background: #e6f4ea; color: #0a7d2f; }
  .badge.failed { background: #fce8e6; color: #b3261e; }
  .badge.none { background: #eee; color: #666; }
  button { padding: 6px 12px; cursor: pointer; margin-right: 8px; margin-top: 10px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
  th { background: #fafafa; }
  .err-text { color: #b3261e; font-family: monospace; font-size: 12px; max-width: 360px; word-break: break-word; }
  .status-line { font-size: 13px; margin-top: 8px; }
</style>
</head>
<body>
<a class="logout" href="#" id="logoutLink">Log out</a>
<h1>Admin Dashboard</h1>
<nav><a href="/dashboard">Dashboard</a><a href="/master-stats">Master DB Analytics</a><a href="/config">Configuration</a></nav>

<section>
  <h2>Pipeline Health</h2>
  <p>Last attempt per source, and whether the hourly cron is expected to still be running.</p>
  <div class="health-grid" id="healthGrid">Loading...</div>
  <div>
    <button data-source="all">Run All Now</button>
    <button data-source="wallet">Run Wallet</button>
    <button data-source="deposit">Run Deposit</button>
    <button data-source="withdraw">Run Withdraw</button>
  </div>
  <div class="status-line" id="triggerStatus"></div>
</section>

<section>
  <h2>Recent Sync Logs</h2>
  <button id="refreshBtn">Refresh</button>
  <table id="logsTable">
    <thead>
      <tr><th>Source</th><th>Started</th><th>Status</th><th>Rows</th><th>Error</th></tr>
    </thead>
    <tbody id="logsBody"><tr><td colspan="5">Loading...</td></tr></tbody>
  </table>
</section>

<script>
document.getElementById('logoutLink').onclick = async (e) => {
  e.preventDefault();
  await fetch('/logout', { method: 'POST' });
  location.href = '/login';
};

async function readJsonSafely(res) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('json')) {
    const text = await res.text();
    throw new Error('Non-JSON response (HTTP ' + res.status + '): ' + text.slice(0, 200));
  }
  return res.json();
}

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function renderHealth(runs) {
  const bySource = {};
  for (const run of runs) {
    if (!bySource[run.source]) bySource[run.source] = run; // first = most recent, since query is DESC
  }
  const sources = ['wallet', 'deposit', 'withdraw', 'manual_upload'];
  const grid = document.getElementById('healthGrid');
  grid.innerHTML = sources.map((s) => {
    const run = bySource[s];
    const badgeClass = !run ? 'none' : run.status;
    const badgeText = !run ? 'never run' : run.status;
    return '<div class="health-card">' +
      '<div class="source">' + s.replace('_', ' ') + '</div>' +
      '<span class="badge ' + badgeClass + '">' + badgeText + '</span>' +
      '<div style="font-size:12px;color:#666;margin-top:6px;">Last: ' + (run ? fmtTime(run.started_at) : 'never') + '</div>' +
      (run && run.status === 'success' ? '<div style="font-size:12px;color:#666;">Rows: ' + run.rows_upserted + '</div>' : '') +
      '</div>';
  }).join('');
}

function renderLogs(runs) {
  const body = document.getElementById('logsBody');
  if (runs.length === 0) {
    body.innerHTML = '<tr><td colspan="5">No sync runs yet.</td></tr>';
    return;
  }
  body.innerHTML = runs.map((r) =>
    '<tr>' +
      '<td>' + r.source + '</td>' +
      '<td>' + fmtTime(r.started_at) + '</td>' +
      '<td><span class="badge ' + r.status + '">' + r.status + '</span></td>' +
      '<td>' + r.rows_upserted + '</td>' +
      '<td class="err-text">' + (r.error_message || '') + '</td>' +
    '</tr>'
  ).join('');
}

async function loadStatus() {
  try {
    const res = await fetch('/api/sync/status');
    const runs = await readJsonSafely(res);
    renderHealth(runs);
    renderLogs(runs);
  } catch (e) {
    document.getElementById('healthGrid').textContent = 'Error loading status: ' + e.message;
  }
}

document.getElementById('refreshBtn').onclick = loadStatus;

document.querySelectorAll('[data-source]').forEach((btn) => {
  btn.onclick = async () => {
    const statusEl = document.getElementById('triggerStatus');
    const source = btn.getAttribute('data-source');
    statusEl.textContent = 'Triggering ' + source + '...';
    try {
      const res = await fetch('/api/sync/trigger?source=' + encodeURIComponent(source), { method: 'POST' });
      const data = await readJsonSafely(res);
      if (!res.ok) throw new Error(data.error || res.statusText);
      statusEl.textContent = 'Done: ' + JSON.stringify(data.results);
      loadStatus();
    } catch (e) {
      statusEl.textContent = 'Error: ' + e.message;
    }
  };
});

loadStatus();
</script>
</body>
</html>`;
