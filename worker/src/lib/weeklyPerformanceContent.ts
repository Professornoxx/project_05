// Platform Analysis section 0: Weekly Performance — This Week vs Last Week.
// Live data from /api/dashboard/platform-analysis/weekly-performance (same
// New/Old user definition as the New vs Old User Analysis panel below —
// see that endpoint's comment in index.ts). Layout/styling matches the
// provided reference design exactly; only the data source changed from
// the original static mock to a real fetch. Placed first on the Platform
// Analysis page; every other section moves below it (see index.ts
// composition). Day-wise view has no backend yet — still a placeholder.
export const WEEKLY_PERFORMANCE_CONTENT_HTML = `
<style>
  .wp-header { display: flex; align-items: center; justify-content: space-between; margin: 0 0 14px; flex-wrap: wrap; gap: 10px; }
  .wp-title { font-weight: 700; font-size: 15px; letter-spacing: 0.03em; text-transform: uppercase; }
  .wp-badges { display: flex; align-items: center; gap: 8px; }
  .wp-badge { background: #eef2ff; color: #4338ca; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 999px; white-space: nowrap; }
  .wp-tag { background: #fee2e2; color: #b91c1c; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; padding: 4px 10px; border-radius: 6px; }
  .wp-panel { background: #fff; border-left: 4px solid #6366f1; border-radius: 0 10px 10px 0; padding: 18px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); margin-bottom: 20px; }
  .wp-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
  .wp-panel-title-group { display: flex; align-items: center; gap: 10px; }
  .wp-panel-icon { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 999px; background: #eef2ff; font-size: 15px; flex-shrink: 0; }
  .wp-panel-title { font-weight: 700; font-size: 14px; }
  .wp-excel-btn { background: #16a34a; color: #fff; border: none; padding: 7px 14px; border-radius: 16px; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; }
  .wp-panel-sub { font-size: 12px; color: #888; font-style: italic; margin: 6px 0 16px; line-height: 1.5; }

  .wp-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 18px; }
  @media (max-width: 900px) { .wp-stats { grid-template-columns: 1fr 1fr; } }
  .wp-stat-card { background: #fafafa; border-radius: 10px; padding: 14px 16px; }
  .wp-stat-label { font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: #888; margin-bottom: 6px; }
  .wp-stat-value { font-size: 22px; font-weight: 700; color: #1a1a1a; margin-bottom: 4px; }
  .wp-stat-delta { font-size: 12px; font-weight: 600; }
  .wp-stat-delta.up { color: #15803d; }
  .wp-stat-delta.down { color: #b91c1c; }

  .wp-tabs { display: flex; gap: 8px; margin-bottom: 16px; }
  .wp-tab { border: 1px solid #ddd; background: #fff; color: #333; border-radius: 999px; padding: 8px 18px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .wp-tab.active { background: #4338ca; border-color: #4338ca; color: #fff; }

  table.wp-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 22px; }
  table.wp-table th { text-align: right; padding: 8px 10px; background: #fafafa; color: #666; font-size: 10px; text-transform: uppercase; }
  table.wp-table th:first-child, table.wp-table td:first-child { text-align: left; }
  table.wp-table td { padding: 8px 10px; text-align: right; border-top: 1px solid #f0f0f0; }
  table.wp-table tbody tr:nth-child(even) { background: #fafafa; }
  .wp-change-pos { color: #15803d; }
  .wp-change-neg { color: #b91c1c; }
  .wp-status-pill { font-size: 10px; font-weight: 700; padding: 3px 10px; border-radius: 999px; white-space: nowrap; }
  .wp-status-met { background: #dcfce7; color: #15803d; }
  .wp-status-behind { background: #fef3c7; color: #92400e; }

  .wp-section-title { font-weight: 700; font-size: 13px; margin: 4px 0 4px; }
  .wp-section-sub { font-size: 12px; color: #888; font-style: italic; margin-bottom: 12px; }
</style>

<div class="wp-header">
  <div class="wp-title">Weekly Performance</div>
  <div class="wp-badges">
    <span class="wp-badge" id="wpRangeBadge">Loading…</span>
    <span class="wp-tag">PLATFORM</span>
  </div>
</div>

<div class="wp-panel">
  <div class="wp-panel-head">
    <div class="wp-panel-title-group">
      <div class="wp-panel-icon">📈</div>
      <div class="wp-panel-title">This Week vs Last Week</div>
    </div>
    <button class="wp-excel-btn" id="wpExportBtn">📥 Excel</button>
  </div>
  <div class="wp-panel-sub">
    Current calendar week (Monday-Sunday, however many days have elapsed) vs the most recent FULLY COMPLETE prior week — same daily data as New vs Old User Analysis below, just compared week-on-week. Read the current week as
    "pace so far," not a final result until Sunday.
  </div>

  <div class="wp-stats" id="wpStatCards">
    <div class="wp-stat-card"><div class="wp-stat-label">Old Users Count</div><div class="wp-stat-value">—</div></div>
    <div class="wp-stat-card"><div class="wp-stat-label">New Users Count</div><div class="wp-stat-value">—</div></div>
    <div class="wp-stat-card"><div class="wp-stat-label">Total Deposit (Day)</div><div class="wp-stat-value">—</div></div>
    <div class="wp-stat-card"><div class="wp-stat-label">Total Depositor Count (Day)</div><div class="wp-stat-value">—</div></div>
  </div>

  <div class="wp-tabs">
    <button class="wp-tab active" id="wpTabWoW">Week-on-Week</button>
    <button class="wp-tab" id="wpTabDaywise">Day-wise</button>
  </div>

  <div id="wpWoWView">
    <table class="wp-table">
      <thead><tr><th>Metric</th><th>Last Week (7d avg)</th><th>This Week (7d avg)</th><th>Change</th><th>% Change</th></tr></thead>
      <tbody id="wpMetricsBody"><tr><td colspan="5">Loading...</td></tr></tbody>
    </table>

    <div class="wp-section-title">New User 3-Day Retention</div>
    <div class="wp-section-sub">Only cohorts with a fully-elapsed 3-day window are included — the current week may show fewer cohorts than days elapsed.</div>
    <table class="wp-table">
      <thead><tr><th>Metric</th><th>Last Week</th><th>This Week</th></tr></thead>
      <tbody id="wpRetentionBody"><tr><td colspan="3">Loading...</td></tr></tbody>
    </table>

    <div class="wp-section-title" id="wpTargetTitle">Target vs Actual</div>
    <div class="wp-section-sub">Actual is the 7-day average so far — a pace read, not a final score until the week ends.</div>
    <table class="wp-table">
      <thead><tr><th>Metric</th><th>Target</th><th>Actual</th><th>Variance</th><th>% of Target</th><th>Status</th></tr></thead>
      <tbody id="wpTargetsBody"><tr><td colspan="6">Loading...</td></tr></tbody>
    </table>
  </div>

  <div id="wpDaywiseView" style="display:none; font-size:13px; color:#888; padding: 30px 0; text-align:center;">
    Day-wise view — coming soon.
  </div>
</div>

<div id="wpStatus" style="font-size:13px;color:#888;"></div>

<script>
function wpFmtInr(n) { return '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN'); }
function wpFmtNum(n) { return Math.round(Number(n || 0)).toLocaleString('en-IN'); }
function wpFmtNum2(n) { return Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }); }
function wpFmtDateLabel(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const monthName = new Date(Date.UTC(y, m - 1, d)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  return d + '-' + monthName;
}
function wpAddDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function wpDeltaCell(last, current, isCurrency) {
  const change = current - last;
  const pct = last !== 0 ? (change / last) * 100 : (current !== 0 ? 100 : 0);
  const cls = change >= 0 ? 'wp-change-pos' : 'wp-change-neg';
  const fmt = isCurrency ? wpFmtInr : wpFmtNum;
  const changeStr = change >= 0 ? '+' + fmt(change) : fmt(change);
  const arrow = change >= 0 ? '▲' : '▼';
  return '<td class="' + cls + '">' + changeStr + '</td><td class="' + cls + '">' + arrow + ' ' + Math.abs(pct).toFixed(2) + '%</td>';
}
function wpMetricRow(label, last, current, isCurrency) {
  const fmt = isCurrency ? wpFmtInr : wpFmtNum;
  return '<tr><td>' + label + '</td><td>' + fmt(last) + '</td><td>' + fmt(current) + '</td>' + wpDeltaCell(last, current, isCurrency) + '</tr>';
}

async function wpLoad() {
  const statusEl = document.getElementById('wpStatus');
  try {
    const res = await fetch('/api/dashboard/platform-analysis/weekly-performance');
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || res.statusText);

    const curWeekNominalEnd = wpAddDays(d.currentWeek.start, 6);
    document.getElementById('wpRangeBadge').textContent =
      wpFmtDateLabel(d.lastWeek.start) + '-' + wpFmtDateLabel(d.lastWeek.end) + ' vs ' +
      wpFmtDateLabel(d.currentWeek.start) + '-' + wpFmtDateLabel(curWeekNominalEnd) + ' (7d so far)';

    const m = d.metrics;
    const statCards = [
      ['Old Users Count', m.last.oldUsersCount, m.current.oldUsersCount, false],
      ['New Users Count', m.last.newUsersCount, m.current.newUsersCount, false],
      ['Total Deposit (Day)', m.last.totalDepositDay, m.current.totalDepositDay, true],
      ['Total Depositor Count (Day)', m.last.totalDepositorCountDay, m.current.totalDepositorCountDay, false],
    ];
    document.getElementById('wpStatCards').innerHTML = statCards.map(([label, last, current, isCurrency]) => {
      const change = current - last;
      const pct = last !== 0 ? (change / last) * 100 : (current !== 0 ? 100 : 0);
      const cls = change >= 0 ? 'up' : 'down';
      const arrow = change >= 0 ? '▲' : '▼';
      const fmt = isCurrency ? wpFmtInr : wpFmtNum;
      return '<div class="wp-stat-card"><div class="wp-stat-label">' + label + '</div><div class="wp-stat-value">' + fmt(current) +
        '</div><div class="wp-stat-delta ' + cls + '">' + arrow + ' ' + Math.abs(pct).toFixed(2) + '%</div></div>';
    }).join('');

    document.getElementById('wpMetricsBody').innerHTML = [
      wpMetricRow('Old Users Count', m.last.oldUsersCount, m.current.oldUsersCount, false),
      wpMetricRow('New Users Count', m.last.newUsersCount, m.current.newUsersCount, false),
      wpMetricRow('Avg Deposit — Old Users', m.last.avgDepositOld, m.current.avgDepositOld, true),
      wpMetricRow('Avg Deposit — New Users', m.last.avgDepositNew, m.current.avgDepositNew, true),
      wpMetricRow('Old Users Withdraw Count', m.last.oldWithdrawCount, m.current.oldWithdrawCount, false),
      wpMetricRow('Avg Withdraw — Old Users', m.last.avgWithdrawOld, m.current.avgWithdrawOld, true),
      wpMetricRow('New Users Withdraw Count', m.last.newWithdrawCount, m.current.newWithdrawCount, false),
      wpMetricRow('Avg Withdraw — New Users', m.last.avgWithdrawNew, m.current.avgWithdrawNew, true),
      wpMetricRow('Total Deposit (Day)', m.last.totalDepositDay, m.current.totalDepositDay, true),
      wpMetricRow('Total Depositor Count (Day)', m.last.totalDepositorCountDay, m.current.totalDepositorCountDay, false),
    ].join('');

    const r = d.retention;
    document.getElementById('wpRetentionBody').innerHTML = [
      '<tr><td>Cohorts Included</td><td>' + wpFmtNum(r.last.cohortsIncluded) + '</td><td>' + wpFmtNum(r.current.cohortsIncluded) + '</td></tr>',
      '<tr><td>Avg New Users / Cohort</td><td>' + wpFmtNum2(r.last.avgNewUsersPerCohort) + '</td><td>' + wpFmtNum2(r.current.avgNewUsersPerCohort) + '</td></tr>',
      '<tr><td>Withdrew, then Redeposited %</td><td>' + r.last.withdrewRedepositedPct.toFixed(2) + '%</td><td>' + r.current.withdrewRedepositedPct.toFixed(2) + '%</td></tr>',
      '<tr><td>Never Withdrew, then Redeposited %</td><td>' + r.last.neverWithdrewRedepositedPct.toFixed(2) + '%</td><td>' + r.current.neverWithdrewRedepositedPct.toFixed(2) + '%</td></tr>',
    ].join('');

    document.getElementById('wpTargetTitle').textContent = 'Target vs Actual — Week of ' + wpFmtDateLabel(d.currentWeek.start) + '-' + wpFmtDateLabel(curWeekNominalEnd);
    const t = d.targets;
    const targetRows = [
      ['Old Users Count', t.oldUsersCount, false],
      ['Avg Deposit of Old Users', t.avgDepositOldUsers, true],
      ['Avg Total Deposit (Day)', t.avgTotalDepositDay, true],
      ['Total Depositor Count (Day)', t.totalDepositorCountDay, false],
    ];
    document.getElementById('wpTargetsBody').innerHTML = targetRows.map(([label, tv, isCurrency]) => {
      const variance = tv.actual - tv.target;
      const pctOfTarget = tv.target !== 0 ? (tv.actual / tv.target) * 100 : 0;
      const met = pctOfTarget >= 100;
      const fmt = isCurrency ? wpFmtInr : wpFmtNum;
      const varClass = variance >= 0 ? 'wp-change-pos' : 'wp-change-neg';
      const varStr = variance >= 0 ? '+' + fmt(variance) : fmt(variance);
      return '<tr><td>' + label + '</td><td>' + fmt(tv.target) + '</td><td>' + fmt(tv.actual) + '</td>' +
        '<td class="' + varClass + '">' + varStr + '</td><td>' + pctOfTarget.toFixed(2) + '%</td>' +
        '<td><span class="wp-status-pill ' + (met ? 'wp-status-met' : 'wp-status-behind') + '">' + (met ? 'MET' : 'BEHIND') + '</span></td></tr>';
    }).join('');

    statusEl.textContent = 'Updated ' + new Date().toLocaleTimeString();
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
  }
}

document.getElementById('wpTabWoW').onclick = () => {
  document.getElementById('wpTabWoW').classList.add('active');
  document.getElementById('wpTabDaywise').classList.remove('active');
  document.getElementById('wpWoWView').style.display = '';
  document.getElementById('wpDaywiseView').style.display = 'none';
};
document.getElementById('wpTabDaywise').onclick = () => {
  document.getElementById('wpTabDaywise').classList.add('active');
  document.getElementById('wpTabWoW').classList.remove('active');
  document.getElementById('wpWoWView').style.display = 'none';
  document.getElementById('wpDaywiseView').style.display = '';
};

function wpTableToCsv(tableEl) {
  const rows = [...tableEl.querySelectorAll('tr')];
  return rows.map((row) => [...row.children].map((c) => '"' + c.textContent.trim().replace(/"/g,'""') + '"').join(',')).join('\\n');
}
document.getElementById('wpExportBtn').onclick = () => {
  const tables = document.querySelectorAll('#wpWoWView table.wp-table');
  const csv = [...tables].map((t) => wpTableToCsv(t)).join('\\n\\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'weekly-performance.csv';
  a.click();
};

wpLoad();
</script>
`;
