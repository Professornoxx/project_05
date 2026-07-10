// Analytics page section 2: Reactivation — two panels (Low: VIP 2-4, High:
// VIP 5-14), matching the provided reference design. "Reactivated" = a
// user counted inactive per master_db (same definition as Action Center's
// Inactive Users) who has also made a completed deposit recently — see
// the backend endpoint's comment for why this works despite master_db's
// upload lag. 7-day conversion is intentionally not shown as a number
// (deposits data only covers a rolling 5-day sync window). Data from
// /api/dashboard/analytics/reactivation. Agent shows "Unassigned" — same
// data gap as the Action Center sections.
export const REACTIVATION_CONTENT_HTML = `
<style>
  .rx-header { display: flex; align-items: center; justify-content: space-between; margin: 28px 0 16px; }
  .rx-title { font-weight: 700; font-size: 15px; letter-spacing: 0.03em; text-transform: uppercase; color: #1f2430; }
  .rx-tags { display: flex; gap: 10px; }
  .rx-today-tag { background: #e0e7ff; color: #3730a3; font-size: 11px; font-weight: 700; letter-spacing: 0.03em; padding: 5px 12px; border-radius: 20px; }
  .rx-tag { background: #fee2e2; color: #b91c1c; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; padding: 5px 12px; border-radius: 20px; }

  .rx-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; margin-bottom: 22px; }
  @media (max-width: 1000px) { .rx-grid { grid-template-columns: 1fr; } }
  .rx-panel { background: #fff; border-left: 4px solid #0891b2; border-radius: 0 14px 14px 0; padding: 20px 22px; box-shadow: 0 1px 2px rgba(16,24,40,0.04), 0 2px 8px rgba(16,24,40,0.06); }
  .rx-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
  .rx-panel-title { font-weight: 700; font-size: 13.5px; color: #1f2430; display: flex; align-items: center; gap: 10px; }
  .rx-icon-badge { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 50%; font-size: 15px; background: #cffafe; flex-shrink: 0; }
  .rx-excel-btn { background: #16a34a; color: #fff; border: none; padding: 8px 16px; border-radius: 20px; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; }
  .rx-excel-btn:hover { background: #15803d; }

  .rx-stat-band { background: #ecfeff; border-radius: 10px; padding: 14px 18px; margin-bottom: 12px; display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .rx-stat-big { font-size: 26px; font-weight: 700; color: #0e7490; }
  .rx-stat-label { font-size: 11px; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; color: #6b7280; }
  .rx-stat-pct { font-size: 18px; font-weight: 700; color: #0e7490; }

  .rx-sub { font-size: 12px; color: #6b7280; margin-bottom: 4px; font-style: italic; }
  .rx-funnel { font-size: 12px; color: #6b7280; margin-bottom: 14px; }
  .rx-funnel b { color: #374151; }

  table.rx-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  table.rx-table th { text-align: center; padding: 9px 8px; background: #f8f9fb; color: #6b7280; font-size: 10px; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; }
  table.rx-table th:first-child, table.rx-table td:first-child { text-align: left; }
  table.rx-table th:first-child { border-radius: 8px 0 0 8px; }
  table.rx-table th:last-child { border-radius: 0 8px 8px 0; }
  table.rx-table td { padding: 9px 8px; text-align: center; border-top: 1px solid #f1f2f5; color: #374151; }
  table.rx-table tr:hover td { background: #fafbfc; }

  .rx-pager { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; font-size: 12px; color: #6b7280; }
  .rx-pager button { border: 1px solid #ddd; background: #fff; border-radius: 20px; padding: 6px 16px; font-size: 12px; cursor: pointer; }
  .rx-pager button:disabled { opacity: 0.4; cursor: default; }

  #rxStatus { font-size: 12.5px; color: #9ca3af; margin-top: 4px; }
</style>

<div class="rx-header">
  <div class="rx-title">Reactivation</div>
  <div class="rx-tags"><span class="rx-today-tag" id="rxTodayTag">TODAY</span><span class="rx-tag">ANALYTICS</span></div>
</div>

<div class="rx-grid">
  <div class="rx-panel">
    <div class="rx-panel-head">
      <div class="rx-panel-title"><span class="rx-icon-badge">🔄</span>Low V - Reactivation (V2-V4)</div>
      <button class="rx-excel-btn" id="exportRxLowBtn">📥 Excel</button>
    </div>
    <div class="rx-stat-band">
      <span class="rx-stat-big" id="rxLowToday">—</span><span class="rx-stat-label">reactivated today</span>
      <span class="rx-stat-pct" id="rxLowPct">—</span><span class="rx-stat-label">of inactive-low cohort</span>
    </div>
    <div class="rx-sub">VIP 2 to VIP 4, reactivated today (was inactive 10-180 days)</div>
    <div class="rx-funnel" id="rxLowFunnel">Conversion funnel · loading…</div>
    <table class="rx-table" id="rxLowTable">
      <thead><tr><th>User ID</th><th>Agent</th><th>VIP Level</th><th>Inactive Days</th><th>Total Deposit Today</th></tr></thead>
      <tbody><tr><td colspan="5">Loading...</td></tr></tbody>
    </table>
    <div class="rx-pager">
      <span id="rxLowPageLabel">Page 1 of 1</span>
      <span><button id="rxLowPrev">← Prev</button> <button id="rxLowNext">Next →</button></span>
    </div>
  </div>

  <div class="rx-panel">
    <div class="rx-panel-head">
      <div class="rx-panel-title"><span class="rx-icon-badge">🔄</span>High V - Reactivation (V5-V15)</div>
      <button class="rx-excel-btn" id="exportRxHighBtn">📥 Excel</button>
    </div>
    <div class="rx-stat-band">
      <span class="rx-stat-big" id="rxHighToday">—</span><span class="rx-stat-label">reactivated today</span>
      <span class="rx-stat-pct" id="rxHighPct">—</span><span class="rx-stat-label">of inactive-high cohort</span>
    </div>
    <div class="rx-sub">VIP 5 to VIP 15, reactivated today (was inactive 15-240 days)</div>
    <div class="rx-funnel" id="rxHighFunnel">Conversion funnel · loading…</div>
    <table class="rx-table" id="rxHighTable">
      <thead><tr><th>User ID</th><th>Agent</th><th>VIP Level</th><th>Inactive Days</th><th>Total Deposit Today</th></tr></thead>
      <tbody><tr><td colspan="5">Loading...</td></tr></tbody>
    </table>
    <div class="rx-pager">
      <span id="rxHighPageLabel">Page 1 of 1</span>
      <span><button id="rxHighPrev">← Prev</button> <button id="rxHighNext">Next →</button></span>
    </div>
  </div>
</div>

<div id="rxStatus"></div>

<script>
const rxState = { low: { page: 1 }, high: { page: 1 } };

function rxFmtInr(n) { return '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }); }
function rxFmtNum(n) { return Number(n || 0).toLocaleString('en-IN'); }

async function rxLoadTier(tier, date) {
  const statusEl = document.getElementById('rxStatus');
  const prefix = tier === 'low' ? 'rxLow' : 'rxHigh';
  try {
    const page = rxState[tier].page;
    const res = await fetch('/api/dashboard/analytics/reactivation?tier=' + tier + '&page=' + page + (date ? '&date=' + date : ''));
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || res.statusText);

    document.getElementById(prefix + 'Today').textContent = rxFmtNum(d.reactivatedTodayCount);
    const pct = d.cohortSize > 0 ? (d.reactivatedTodayCount / d.cohortSize * 100) : 0;
    document.getElementById(prefix + 'Pct').textContent = pct.toFixed(2) + '%';

    const pct3 = d.cohortSize > 0 ? (d.reactivated3DayCount / d.cohortSize * 100) : 0;
    document.getElementById(prefix + 'Funnel').innerHTML =
      'Conversion funnel · 3-day: <b>' + pct3.toFixed(2) + '%</b> (' + rxFmtNum(d.reactivated3DayCount) + ' of ' + rxFmtNum(d.cohortSize) + ') · 7-day: not enough history yet';

    document.querySelector('#' + prefix + 'Table tbody').innerHTML = (d.rows || []).map((r) =>
      '<tr><td>' + r.user_id + '</td><td>' + r.agent + '</td><td>' + r.current_level +
      '</td><td>' + rxFmtNum(r.inactive_days) + '</td><td>' + rxFmtInr(r.day_deposit) + '</td></tr>'
    ).join('') || '<tr><td colspan="5">No data</td></tr>';

    document.getElementById(prefix + 'PageLabel').textContent = 'Page ' + d.page + ' of ' + d.totalPages;
    document.getElementById(prefix + 'Prev').disabled = d.page <= 1;
    document.getElementById(prefix + 'Next').disabled = d.page >= d.totalPages;

    if (d.date) {
      const [y, m, day] = d.date.split('-').map(Number);
      const monthName = new Date(Date.UTC(y, m - 1, day)).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
      document.getElementById('rxTodayTag').textContent = 'TODAY: ' + day + '-' + monthName;
    }
    statusEl.textContent = 'Updated ' + new Date().toLocaleTimeString();
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
  }
}

async function loadReactivation(date) {
  await Promise.all([rxLoadTier('low', date), rxLoadTier('high', date)]);
}

document.getElementById('rxLowPrev').onclick = () => { if (rxState.low.page > 1) { rxState.low.page--; rxLoadTier('low'); } };
document.getElementById('rxLowNext').onclick = () => { rxState.low.page++; rxLoadTier('low'); };
document.getElementById('rxHighPrev').onclick = () => { if (rxState.high.page > 1) { rxState.high.page--; rxLoadTier('high'); } };
document.getElementById('rxHighNext').onclick = () => { rxState.high.page++; rxLoadTier('high'); };

function rxTableToCsv(tableEl) {
  const rows = [...tableEl.querySelectorAll('tr')];
  return rows.map((row) => [...row.children].map((c) => '"' + c.textContent.trim().replace(/"/g,'""') + '"').join(',')).join('\\n');
}
function rxDownloadCsv(tableEl, filename) {
  const blob = new Blob([rxTableToCsv(tableEl)], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}
document.getElementById('exportRxLowBtn').onclick = () => rxDownloadCsv(document.getElementById('rxLowTable'), 'reactivation-low.csv');
document.getElementById('exportRxHighBtn').onclick = () => rxDownloadCsv(document.getElementById('rxHighTable'), 'reactivation-high.csv');

// Exposed so the Analytics page's 7-day tab picker (loaded before this
// script) can re-trigger this section when the selected date changes.
window.loadReactivation = loadReactivation;
loadReactivation();
</script>
`;
