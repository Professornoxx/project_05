// Analytics page section 3: VIP Level Upgrade — two panels (Low: VIP 2-4,
// High: VIP 5-15), matching the provided reference design. "Upgraded" = a
// user in the near-upgrade cohort (same definition as Action Center's VIP
// Near Upgrade) whose today's deposit(s), added on top of master_db's
// lagging total_deposit baseline, push them past the next bracket's
// floor — see the backend endpoint's comment for the full reasoning.
// 7-day conversion is intentionally not shown as a number (deposits data
// only covers a rolling 5-day sync window). Data from
// /api/dashboard/analytics/vip-upgrade. Agent shows "Unassigned" — same
// data gap as the other sections.
export const VIP_UPGRADE_CONTENT_HTML = `
<style>
  .vu-header { display: flex; align-items: center; justify-content: space-between; margin: 28px 0 16px; }
  .vu-title { font-weight: 700; font-size: 15px; letter-spacing: 0.03em; text-transform: uppercase; color: #1f2430; }
  .vu-tags { display: flex; gap: 10px; }
  .vu-today-tag { background: #e0e7ff; color: #3730a3; font-size: 11px; font-weight: 700; letter-spacing: 0.03em; padding: 5px 12px; border-radius: 20px; }
  .vu-tag { background: #dcfce7; color: #15803d; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; padding: 5px 12px; border-radius: 20px; }

  .vu-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; margin-bottom: 22px; }
  @media (max-width: 1000px) { .vu-grid { grid-template-columns: 1fr; } }
  .vu-panel { background: #fff; border-left: 4px solid #b45309; border-radius: 0 14px 14px 0; padding: 20px 22px; box-shadow: 0 1px 2px rgba(16,24,40,0.04), 0 2px 8px rgba(16,24,40,0.06); }
  .vu-panel.accent-purple { border-left-color: #7c3aed; }
  .vu-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
  .vu-panel-title { font-weight: 700; font-size: 13.5px; color: #1f2430; display: flex; align-items: center; gap: 10px; }
  .vu-icon-badge { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 50%; font-size: 15px; background: #fef3c7; flex-shrink: 0; }
  .vu-panel.accent-purple .vu-icon-badge { background: #ede9fe; }
  .vu-excel-btn { background: #16a34a; color: #fff; border: none; padding: 8px 16px; border-radius: 20px; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; }
  .vu-excel-btn:hover { background: #15803d; }

  .vu-stat-band { background: #ecfeff; border-radius: 10px; padding: 14px 18px; margin-bottom: 12px; display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .vu-stat-big { font-size: 26px; font-weight: 700; color: #0e7490; }
  .vu-stat-label { font-size: 11px; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; color: #6b7280; }
  .vu-stat-pct { font-size: 18px; font-weight: 700; color: #0e7490; }

  .vu-sub { font-size: 12px; color: #6b7280; margin-bottom: 4px; font-style: italic; }
  .vu-funnel { font-size: 12px; color: #6b7280; margin-bottom: 14px; }
  .vu-funnel b { color: #374151; }

  table.vu-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  table.vu-table th { text-align: center; padding: 9px 8px; background: #f8f9fb; color: #6b7280; font-size: 10px; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; }
  table.vu-table th:first-child, table.vu-table td:first-child { text-align: left; }
  table.vu-table th:first-child { border-radius: 8px 0 0 8px; }
  table.vu-table th:last-child { border-radius: 0 8px 8px 0; }
  table.vu-table td { padding: 9px 8px; text-align: center; border-top: 1px solid #f1f2f5; color: #374151; }
  table.vu-table tr:hover td { background: #fafbfc; }

  .vu-pager { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; font-size: 12px; color: #6b7280; }
  .vu-pager button { border: 1px solid #ddd; background: #fff; border-radius: 20px; padding: 6px 16px; font-size: 12px; cursor: pointer; }
  .vu-pager button:disabled { opacity: 0.4; cursor: default; }

  #vuStatus { font-size: 12.5px; color: #9ca3af; margin-top: 4px; }
</style>

<div class="vu-header">
  <div class="vu-title">VIP Level Upgrade</div>
  <div class="vu-tags"><span class="vu-today-tag" id="vuTodayTag">TODAY</span><span class="vu-tag">ANALYTICS</span></div>
</div>

<div class="vu-grid">
  <div class="vu-panel">
    <div class="vu-panel-head">
      <div class="vu-panel-title"><span class="vu-icon-badge">🏆</span>Low - VIP Upgrade (V2-V4)</div>
      <button class="vu-excel-btn" id="exportVuLowBtn">📥 Excel</button>
    </div>
    <div class="vu-stat-band">
      <span class="vu-stat-big" id="vuLowToday">—</span><span class="vu-stat-label">upgraded today</span>
      <span class="vu-stat-pct" id="vuLowPct">—</span><span class="vu-stat-label">of near-upgrade cohort</span>
    </div>
    <div class="vu-sub">VIP 2 to VIP 4, upgraded today from the near-upgrade cohort</div>
    <div class="vu-funnel" id="vuLowFunnel">Conversion funnel · loading…</div>
    <table class="vu-table" id="vuLowTable">
      <thead><tr><th>User ID</th><th>Agent</th><th>VIP Before</th><th>VIP After</th><th>Total Deposit Today</th><th>Amount Over Minimum</th></tr></thead>
      <tbody><tr><td colspan="6">Loading...</td></tr></tbody>
    </table>
    <div class="vu-pager">
      <span id="vuLowPageLabel">Page 1 of 1</span>
      <span><button id="vuLowPrev">← Prev</button> <button id="vuLowNext">Next →</button></span>
    </div>
  </div>

  <div class="vu-panel accent-purple">
    <div class="vu-panel-head">
      <div class="vu-panel-title"><span class="vu-icon-badge">🏆</span>High - VIP Upgrade (V5-V15)</div>
      <button class="vu-excel-btn" id="exportVuHighBtn">📥 Excel</button>
    </div>
    <div class="vu-stat-band">
      <span class="vu-stat-big" id="vuHighToday">—</span><span class="vu-stat-label">upgraded today</span>
      <span class="vu-stat-pct" id="vuHighPct">—</span><span class="vu-stat-label">of near-upgrade cohort</span>
    </div>
    <div class="vu-sub">VIP 5 to VIP 15, upgraded today from the near-upgrade cohort</div>
    <div class="vu-funnel" id="vuHighFunnel">Conversion funnel · loading…</div>
    <table class="vu-table" id="vuHighTable">
      <thead><tr><th>User ID</th><th>Agent</th><th>VIP Before</th><th>VIP After</th><th>Total Deposit Today</th><th>Amount Over Minimum</th></tr></thead>
      <tbody><tr><td colspan="6">Loading...</td></tr></tbody>
    </table>
    <div class="vu-pager">
      <span id="vuHighPageLabel">Page 1 of 1</span>
      <span><button id="vuHighPrev">← Prev</button> <button id="vuHighNext">Next →</button></span>
    </div>
  </div>
</div>

<div id="vuStatus"></div>

<script>
const vuState = { low: { page: 1 }, high: { page: 1 } };

function vuFmtInr(n) { return '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }); }
function vuFmtNum(n) { return Number(n || 0).toLocaleString('en-IN'); }

async function vuLoadTier(tier, date) {
  const statusEl = document.getElementById('vuStatus');
  const prefix = tier === 'low' ? 'vuLow' : 'vuHigh';
  try {
    const page = vuState[tier].page;
    const res = await fetch('/api/dashboard/analytics/vip-upgrade?tier=' + tier + '&page=' + page + (date ? '&date=' + date : ''));
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || res.statusText);

    document.getElementById(prefix + 'Today').textContent = vuFmtNum(d.upgradedTodayCount);
    const pct = d.cohortSize > 0 ? (d.upgradedTodayCount / d.cohortSize * 100) : 0;
    document.getElementById(prefix + 'Pct').textContent = pct.toFixed(2) + '%';

    const pct3 = d.cohortSize > 0 ? (d.upgraded3DayCount / d.cohortSize * 100) : 0;
    document.getElementById(prefix + 'Funnel').innerHTML =
      'Conversion funnel · 3-day: <b>' + pct3.toFixed(2) + '%</b> (' + vuFmtNum(d.upgraded3DayCount) + ' of ' + vuFmtNum(d.cohortSize) + ') · 7-day: not enough history yet';

    document.querySelector('#' + prefix + 'Table tbody').innerHTML = (d.rows || []).map((r) =>
      '<tr><td>' + r.user_id + '</td><td>Unassigned</td><td>' + r.vip_before + '</td><td>' + r.vip_after +
      '</td><td>' + vuFmtInr(r.day_deposit) + '</td><td>' + vuFmtInr(r.amount_over_minimum) + '</td></tr>'
    ).join('') || '<tr><td colspan="6">No data</td></tr>';

    document.getElementById(prefix + 'PageLabel').textContent = 'Page ' + d.page + ' of ' + d.totalPages;
    document.getElementById(prefix + 'Prev').disabled = d.page <= 1;
    document.getElementById(prefix + 'Next').disabled = d.page >= d.totalPages;

    if (d.date) {
      const [y, m, day] = d.date.split('-').map(Number);
      const monthName = new Date(Date.UTC(y, m - 1, day)).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
      document.getElementById('vuTodayTag').textContent = 'TODAY: ' + day + '-' + monthName;
    }
    statusEl.textContent = 'Updated ' + new Date().toLocaleTimeString();
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
  }
}

async function loadVipUpgrade(date) {
  await Promise.all([vuLoadTier('low', date), vuLoadTier('high', date)]);
}

document.getElementById('vuLowPrev').onclick = () => { if (vuState.low.page > 1) { vuState.low.page--; vuLoadTier('low'); } };
document.getElementById('vuLowNext').onclick = () => { vuState.low.page++; vuLoadTier('low'); };
document.getElementById('vuHighPrev').onclick = () => { if (vuState.high.page > 1) { vuState.high.page--; vuLoadTier('high'); } };
document.getElementById('vuHighNext').onclick = () => { vuState.high.page++; vuLoadTier('high'); };

function vuTableToCsv(tableEl) {
  const rows = [...tableEl.querySelectorAll('tr')];
  return rows.map((row) => [...row.children].map((c) => '"' + c.textContent.trim().replace(/"/g,'""') + '"').join(',')).join('\\n');
}
function vuDownloadCsv(tableEl, filename) {
  const blob = new Blob([vuTableToCsv(tableEl)], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}
document.getElementById('exportVuLowBtn').onclick = () => vuDownloadCsv(document.getElementById('vuLowTable'), 'vip-upgrade-low.csv');
document.getElementById('exportVuHighBtn').onclick = () => vuDownloadCsv(document.getElementById('vuHighTable'), 'vip-upgrade-high.csv');

// Exposed so the Analytics page's 7-day tab picker (loaded before this
// script) can re-trigger this section when the selected date changes.
window.loadVipUpgrade = loadVipUpgrade;
loadVipUpgrade();
</script>
`;
