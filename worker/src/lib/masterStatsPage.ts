// Master DB analytics — its own URL (/master-stats), separate from the
// sync/pipeline-health Dashboard. Same server-side auth gate as /config.
export const MASTER_STATS_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Master Database Analytics</title>
<meta name="robots" content="noindex" />
<style>
  body { font-family: system-ui, sans-serif; max-width: 1000px; margin: 40px auto; color: #222; padding: 0 16px; }
  h1 { font-size: 20px; }
  nav a { margin-right: 16px; font-size: 13px; }
  .logout { float: right; font-size: 13px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 20px 0; }
  .kpi-card { border: 1px solid #ddd; border-radius: 8px; padding: 16px; }
  .kpi-card .label { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.03em; }
  .kpi-card .value { font-size: 22px; font-weight: 700; margin-top: 4px; }
  section { border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 10px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #eee; }
  th { background: #fafafa; }
  .status-line { font-size: 13px; margin-top: 8px; color: #666; }
</style>
</head>
<body>
<a class="logout" href="#" id="logoutLink">Log out</a>
<nav><a href="/dashboard">Dashboard</a><a href="/master-stats">Master DB Analytics</a><a href="/config">Configuration</a></nav>
<h1>Master Database Analytics</h1>
<p>Live data from the Master DB (users table). Aggregate columns (balance, deposit/withdrawal totals) are kept current by the hourly sync.</p>

<div class="kpi-grid" id="kpiGrid">Loading...</div>

<section>
  <h2>Top 10 by Balance</h2>
  <table id="balanceTable"><thead><tr><th>User ID</th><th>Username</th><th>City</th><th>Balance</th><th>Total Deposit</th><th>Total Withdrawal</th></tr></thead><tbody><tr><td colspan="6">Loading...</td></tr></tbody></table>
</section>

<section>
  <h2>Top 10 by Total Deposit</h2>
  <table id="depositTable"><thead><tr><th>User ID</th><th>Username</th><th>City</th><th>Total Deposit</th><th>Deposit Count</th></tr></thead><tbody><tr><td colspan="5">Loading...</td></tr></tbody></table>
</section>

<section>
  <h2>Top 10 Cities by User Count</h2>
  <table id="cityTable"><thead><tr><th>City</th><th>Users</th></tr></thead><tbody><tr><td colspan="2">Loading...</td></tr></tbody></table>
</section>

<div class="status-line" id="statusLine"></div>

<script>
document.getElementById('logoutLink').onclick = async (e) => {
  e.preventDefault();
  await fetch('/logout', { method: 'POST' });
  location.href = '/login';
};

function fmtNum(n) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

async function load() {
  const statusLine = document.getElementById('statusLine');
  statusLine.textContent = 'Loading...';
  try {
    const res = await fetch('/api/master/stats');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);

    const t = data.totals;
    document.getElementById('kpiGrid').innerHTML = [
      ['Total Users', fmtNum(t.total_users)],
      ['Total Balance', fmtNum(t.total_balance)],
      ['Total Deposits', fmtNum(t.total_deposits)],
      ['Total Withdrawals', fmtNum(t.total_withdrawals)],
      ['Total Deposit Count', fmtNum(t.total_deposit_count)],
      ['Test Accounts', fmtNum(t.test_accounts)],
    ].map(([label, value]) =>
      '<div class="kpi-card"><div class="label">' + label + '</div><div class="value">' + value + '</div></div>'
    ).join('');

    document.querySelector('#balanceTable tbody').innerHTML = data.topByBalance.map((r) =>
      '<tr><td>' + r.user_id + '</td><td>' + (r.username || '') + '</td><td>' + (r.city || '') + '</td><td>' +
      fmtNum(r.user_balance) + '</td><td>' + fmtNum(r.total_deposit) + '</td><td>' + fmtNum(r.total_withdrawal) + '</td></tr>'
    ).join('') || '<tr><td colspan="6">No data</td></tr>';

    document.querySelector('#depositTable tbody').innerHTML = data.topByDeposit.map((r) =>
      '<tr><td>' + r.user_id + '</td><td>' + (r.username || '') + '</td><td>' + (r.city || '') + '</td><td>' +
      fmtNum(r.total_deposit) + '</td><td>' + fmtNum(r.deposit_count) + '</td></tr>'
    ).join('') || '<tr><td colspan="5">No data</td></tr>';

    document.querySelector('#cityTable tbody').innerHTML = data.byCity.map((r) =>
      '<tr><td>' + r.city + '</td><td>' + fmtNum(r.user_count) + '</td></tr>'
    ).join('') || '<tr><td colspan="2">No data</td></tr>';

    statusLine.textContent = 'Updated ' + new Date().toLocaleString();
  } catch (e) {
    statusLine.textContent = 'Error: ' + e.message;
  }
}

load();
</script>
</body>
</html>`;
