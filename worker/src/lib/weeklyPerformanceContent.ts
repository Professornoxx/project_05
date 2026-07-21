// Platform Analysis section 0: Weekly Performance — This Week vs Last Week.
// UI-only per explicit instruction: static/mock data matching the provided
// reference design exactly (numbers, layout, spacing, colors, typography).
// No backend endpoint yet — wiring to real data is a deliberate follow-up,
// not done here. Placed first on the Platform Analysis page; every other
// section moves below it (see index.ts composition).
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
    <span class="wp-badge">6-July-12-July vs 13-July-19-July (7d so far)</span>
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

  <div class="wp-stats">
    <div class="wp-stat-card">
      <div class="wp-stat-label">Old Users Count</div>
      <div class="wp-stat-value">1,753</div>
      <div class="wp-stat-delta up">▲ 7.84%</div>
    </div>
    <div class="wp-stat-card">
      <div class="wp-stat-label">New Users Count</div>
      <div class="wp-stat-value">146</div>
      <div class="wp-stat-delta down">▼ 5.89%</div>
    </div>
    <div class="wp-stat-card">
      <div class="wp-stat-label">Total Deposit (Day)</div>
      <div class="wp-stat-value">₹38,27,034</div>
      <div class="wp-stat-delta up">▲ 8.60%</div>
    </div>
    <div class="wp-stat-card">
      <div class="wp-stat-label">Total Depositor Count (Day)</div>
      <div class="wp-stat-value">1,899</div>
      <div class="wp-stat-delta up">▲ 6.64%</div>
    </div>
  </div>

  <div class="wp-tabs">
    <button class="wp-tab active" id="wpTabWoW">Week-on-Week</button>
    <button class="wp-tab" id="wpTabDaywise">Day-wise</button>
  </div>

  <div id="wpWoWView">
    <table class="wp-table">
      <thead><tr><th>Metric</th><th>Last Week (7d avg)</th><th>This Week (7d avg)</th><th>Change</th><th>% Change</th></tr></thead>
      <tbody>
        <tr><td>Old Users Count</td><td>1,626</td><td>1,753</td><td class="wp-change-pos">+127</td><td class="wp-change-pos">▲ 7.84%</td></tr>
        <tr><td>New Users Count</td><td>155</td><td>146</td><td class="wp-change-neg">-9</td><td class="wp-change-neg">▼ 5.89%</td></tr>
        <tr><td>Avg Deposit — Old Users</td><td>₹2,126</td><td>₹2,150</td><td class="wp-change-pos">+₹24</td><td class="wp-change-pos">▲ 1.15%</td></tr>
        <tr><td>Avg Deposit — New Users</td><td>₹418</td><td>₹395</td><td class="wp-change-neg">₹-23</td><td class="wp-change-neg">▼ 5.51%</td></tr>
        <tr><td>Old Users Withdraw Count</td><td>602</td><td>665</td><td class="wp-change-pos">+64</td><td class="wp-change-pos">▲ 10.62%</td></tr>
        <tr><td>Avg Withdraw — Old Users</td><td>₹3,963</td><td>₹3,986</td><td class="wp-change-pos">+₹24</td><td class="wp-change-pos">▲ 0.60%</td></tr>
        <tr><td>New Users Withdraw Count</td><td>39</td><td>35</td><td class="wp-change-neg">-4</td><td class="wp-change-neg">▼ 10.88%</td></tr>
        <tr><td>Avg Withdraw — New Users</td><td>₹848</td><td>₹746</td><td class="wp-change-neg">₹-102</td><td class="wp-change-neg">▼ 11.98%</td></tr>
        <tr><td>Total Deposit (Day)</td><td>₹35,23,980</td><td>₹38,27,034</td><td class="wp-change-pos">+₹3,03,054</td><td class="wp-change-pos">▲ 8.60%</td></tr>
        <tr><td>Total Depositor Count (Day)</td><td>1,781</td><td>1,899</td><td class="wp-change-pos">+118</td><td class="wp-change-pos">▲ 6.64%</td></tr>
      </tbody>
    </table>

    <div class="wp-section-title">New User 3-Day Retention</div>
    <div class="wp-section-sub">Only cohorts with a fully-elapsed 3-day window are included — the current week may show fewer cohorts than days elapsed.</div>
    <table class="wp-table">
      <thead><tr><th>Metric</th><th>Last Week</th><th>This Week</th></tr></thead>
      <tbody>
        <tr><td>Cohorts Included</td><td>7</td><td>6</td></tr>
        <tr><td>Avg New Users / Cohort</td><td>155.29</td><td>150.5</td></tr>
        <tr><td>Withdrew, then Redeposited %</td><td>49.22%</td><td>47.42%</td></tr>
        <tr><td>Never Withdrew, then Redeposited %</td><td>13.93%</td><td>12.74%</td></tr>
      </tbody>
    </table>

    <div class="wp-section-title">Target vs Actual — Week of 13-July-19-July</div>
    <div class="wp-section-sub">Actual is the 7-day average so far — a pace read, not a final score until the week ends.</div>
    <table class="wp-table">
      <thead><tr><th>Metric</th><th>Target</th><th>Actual</th><th>Variance</th><th>% of Target</th><th>Status</th></tr></thead>
      <tbody>
        <tr><td>Old Users Count</td><td>1,800</td><td>1,753</td><td class="wp-change-neg">-47</td><td>97.41%</td><td><span class="wp-status-pill wp-status-behind">BEHIND</span></td></tr>
        <tr><td>Avg Deposit of Old Users</td><td>₹1,900</td><td>₹2,150</td><td class="wp-change-pos">+₹250</td><td>113.18%</td><td><span class="wp-status-pill wp-status-met">MET</span></td></tr>
        <tr><td>Avg Total Deposit (Day)</td><td>₹39,00,000</td><td>₹38,27,034</td><td class="wp-change-neg">₹-72,966</td><td>98.13%</td><td><span class="wp-status-pill wp-status-behind">BEHIND</span></td></tr>
        <tr><td>Total Depositor Count (Day)</td><td>1,900</td><td>1,899</td><td class="wp-change-neg">-1</td><td>99.97%</td><td><span class="wp-status-pill wp-status-behind">BEHIND</span></td></tr>
      </tbody>
    </table>
  </div>

  <div id="wpDaywiseView" style="display:none; font-size:13px; color:#888; padding: 30px 0; text-align:center;">
    Day-wise view — coming soon (this is a UI-only mock; real data wiring is a follow-up).
  </div>
</div>

<script>
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
</script>
`;
