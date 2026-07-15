// Analytics page section 4: Retention — First-Deposit Day-1 Retention,
// Low Premium Active, and High Premium Active, matching the provided
// reference design. "Bonus Claimer Retention" is intentionally omitted —
// no bonus/cashback claim tracking exists yet (pending the Cashback
// Shield rules). "Premium Active" cohort = every user currently in that
// VIP bracket (via total_deposit), regardless of activity status — NOT
// the Action Center "Active Users" definition, which additionally
// requires recent activity. Data from /api/dashboard/analytics/
// day1-retention and /api/dashboard/analytics/premium-active. Agent
// shows "Unassigned" — same data gap as the other sections.
export const RETENTION_CONTENT_HTML = `
<style>
  .rt-header { display: flex; align-items: center; justify-content: space-between; margin: 28px 0 16px; }
  .rt-title { font-weight: 700; font-size: 15px; letter-spacing: 0.03em; text-transform: uppercase; color: #1f2430; }
  .rt-tags { display: flex; gap: 10px; }
  .rt-today-tag { background: #e0e7ff; color: #3730a3; font-size: 11px; font-weight: 700; letter-spacing: 0.03em; padding: 5px 12px; border-radius: 20px; }
  .rt-tag { background: #fee2e2; color: #b91c1c; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; padding: 5px 12px; border-radius: 20px; }

  .rt-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; margin-bottom: 22px; }
  @media (max-width: 1000px) { .rt-grid { grid-template-columns: 1fr; } }
  .rt-panel { background: #fff; border-left: 4px solid #15803d; border-radius: 0 14px 14px 0; padding: 20px 22px; box-shadow: 0 1px 2px rgba(16,24,40,0.04), 0 2px 8px rgba(16,24,40,0.06); }
  .rt-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
  .rt-panel-title { font-weight: 700; font-size: 13.5px; color: #1f2430; display: flex; align-items: center; gap: 10px; }
  .rt-icon-badge { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 50%; font-size: 15px; background: #dcfce7; flex-shrink: 0; }
  .rt-excel-btn { background: #16a34a; color: #fff; border: none; padding: 8px 16px; border-radius: 20px; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; }
  .rt-excel-btn:hover { background: #15803d; }

  .rt-stat-band { background: #ecfeff; border-radius: 10px; padding: 14px 18px; margin-bottom: 12px; display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; row-gap: 6px; }
  .rt-stat-big { font-size: 26px; font-weight: 700; color: #0e7490; }
  .rt-stat-label { font-size: 11px; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; color: #6b7280; }
  .rt-stat-mid { font-size: 18px; font-weight: 700; color: #0e7490; }

  .rt-sub { font-size: 12px; color: #6b7280; margin-bottom: 12px; font-style: italic; }

  table.rt-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  table.rt-table th { text-align: center; padding: 9px 8px; background: #f8f9fb; color: #6b7280; font-size: 10px; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; }
  table.rt-table th:first-child, table.rt-table td:first-child { text-align: left; }
  table.rt-table th:first-child { border-radius: 8px 0 0 8px; }
  table.rt-table th:last-child { border-radius: 0 8px 8px 0; }
  table.rt-table td { padding: 9px 8px; text-align: center; border-top: 1px solid #f1f2f5; color: #374151; }
  table.rt-table tr:hover td { background: #fafbfc; }

  .rt-pager { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; font-size: 12px; color: #6b7280; }
  .rt-pager button { border: 1px solid #ddd; background: #fff; border-radius: 20px; padding: 6px 16px; font-size: 12px; cursor: pointer; }
  .rt-pager button:disabled { opacity: 0.4; cursor: default; }

  #rtStatus { font-size: 12.5px; color: #9ca3af; margin-top: 4px; }
</style>

<div class="rt-header">
  <div class="rt-title">Retention</div>
  <div class="rt-tags"><span class="rt-today-tag" id="rtTodayTag">TODAY</span><span class="rt-tag">ANALYTICS</span></div>
</div>

<div class="rt-grid">
  <div class="rt-panel">
    <div class="rt-panel-head">
      <div class="rt-panel-title"><span class="rt-icon-badge">📈</span>First-Deposit Day-1 Retention</div>
      <button class="rt-excel-btn" id="exportRtD1Btn">📥 Excel</button>
    </div>
    <div class="rt-stat-band">
      <span class="rt-stat-big" id="rtD1Count">—</span><span class="rt-stat-label">of <span id="rtD1Cohort">—</span> deposited again</span>
      <span class="rt-stat-mid" id="rtD1Pct">—</span><span class="rt-stat-label">conversion</span>
      <span class="rt-stat-mid" id="rtD1Avg">—</span><span class="rt-stat-label">avg deposit</span>
    </div>
    <div class="rt-sub">Yesterday's first-deposit users who deposited again today</div>
    <table class="rt-table" id="rtD1Table">
      <thead><tr><th>User ID</th><th>Agent</th><th>Total Deposit Today</th><th>Deposit Count</th><th>Region</th></tr></thead>
      <tbody><tr><td colspan="5">Loading...</td></tr></tbody>
    </table>
    <div class="rt-pager">
      <span id="rtD1PageLabel">Page 1 of 1</span>
      <span><button id="rtD1Prev">← Prev</button> <button id="rtD1Next">Next →</button></span>
    </div>
  </div>

  <div class="rt-panel">
    <div class="rt-panel-head">
      <div class="rt-panel-title"><span class="rt-icon-badge">💎</span>Low Premium Active</div>
      <button class="rt-excel-btn" id="exportRtLowBtn">📥 Excel</button>
    </div>
    <div class="rt-stat-band">
      <span class="rt-stat-big" id="rtLowCount">—</span><span class="rt-stat-label">of <span id="rtLowCohort">—</span> deposited today</span>
      <span class="rt-stat-mid" id="rtLowPct">—</span><span class="rt-stat-label">conversion</span>
      <span class="rt-stat-mid" id="rtLowAvg">—</span><span class="rt-stat-label">avg deposit</span>
    </div>
    <div class="rt-sub">Low Active Users who deposited today</div>
    <table class="rt-table" id="rtLowTable">
      <thead><tr><th>User ID</th><th>Agent</th><th>VIP</th><th>Deposit Amount</th><th>Deposit Count</th></tr></thead>
      <tbody><tr><td colspan="5">Loading...</td></tr></tbody>
    </table>
    <div class="rt-pager">
      <span id="rtLowPageLabel">Page 1 of 1</span>
      <span><button id="rtLowPrev">← Prev</button> <button id="rtLowNext">Next →</button></span>
    </div>
  </div>

  <div class="rt-panel">
    <div class="rt-panel-head">
      <div class="rt-panel-title"><span class="rt-icon-badge">💎</span>High Premium Active</div>
      <button class="rt-excel-btn" id="exportRtHighBtn">📥 Excel</button>
    </div>
    <div class="rt-stat-band">
      <span class="rt-stat-big" id="rtHighCount">—</span><span class="rt-stat-label">of <span id="rtHighCohort">—</span> deposited today</span>
      <span class="rt-stat-mid" id="rtHighPct">—</span><span class="rt-stat-label">conversion</span>
      <span class="rt-stat-mid" id="rtHighAvg">—</span><span class="rt-stat-label">avg deposit</span>
    </div>
    <div class="rt-sub">High Active Users who deposited today</div>
    <table class="rt-table" id="rtHighTable">
      <thead><tr><th>User ID</th><th>Agent</th><th>VIP</th><th>Deposit Amount</th><th>Deposit Count</th></tr></thead>
      <tbody><tr><td colspan="5">Loading...</td></tr></tbody>
    </table>
    <div class="rt-pager">
      <span id="rtHighPageLabel">Page 1 of 1</span>
      <span><button id="rtHighPrev">← Prev</button> <button id="rtHighNext">Next →</button></span>
    </div>
  </div>
</div>

<div id="rtStatus"></div>

<script>
const rtState = { d1: { page: 1 }, low: { page: 1 }, high: { page: 1 } };

function rtFmtInr(n) { return '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }); }
function rtFmtNum(n) { return Number(n || 0).toLocaleString('en-IN'); }

function rtSetTodayTag(dateStr) {
  if (!dateStr) return;
  const [y, m, day] = dateStr.split('-').map(Number);
  const monthName = new Date(Date.UTC(y, m - 1, day)).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  document.getElementById('rtTodayTag').textContent = 'TODAY: ' + day + '-' + monthName;
}

async function rtLoadD1(date) {
  const statusEl = document.getElementById('rtStatus');
  try {
    const page = rtState.d1.page;
    const res = await fetch('/api/dashboard/analytics/day1-retention?page=' + page + (date ? '&date=' + date : ''));
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || res.statusText);

    document.getElementById('rtD1Count').textContent = rtFmtNum(d.retainedCount);
    document.getElementById('rtD1Cohort').textContent = rtFmtNum(d.cohortSize);
    const pct = d.cohortSize > 0 ? (d.retainedCount / d.cohortSize * 100) : 0;
    document.getElementById('rtD1Pct').textContent = pct.toFixed(2) + '%';
    document.getElementById('rtD1Avg').textContent = rtFmtInr(d.avgDeposit);

    document.querySelector('#rtD1Table tbody').innerHTML = (d.rows || []).map((r) =>
      '<tr><td>' + r.user_id + '</td><td>' + r.agent + '</td><td>' + rtFmtInr(r.day_deposit) + '</td><td>' + rtFmtNum(r.deposit_count) + '</td><td>' + r.region + '</td></tr>'
    ).join('') || '<tr><td colspan="5">No data</td></tr>';

    document.getElementById('rtD1PageLabel').textContent = 'Page ' + d.page + ' of ' + d.totalPages;
    document.getElementById('rtD1Prev').disabled = d.page <= 1;
    document.getElementById('rtD1Next').disabled = d.page >= d.totalPages;
    rtSetTodayTag(d.date);
    statusEl.textContent = 'Updated ' + new Date().toLocaleTimeString();
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
  }
}

async function rtLoadPremium(tier, date) {
  const statusEl = document.getElementById('rtStatus');
  const prefix = tier === 'low' ? 'rtLow' : 'rtHigh';
  try {
    const page = rtState[tier].page;
    const res = await fetch('/api/dashboard/analytics/premium-active?tier=' + tier + '&page=' + page + (date ? '&date=' + date : ''));
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || res.statusText);

    document.getElementById(prefix + 'Count').textContent = rtFmtNum(d.retainedCount);
    document.getElementById(prefix + 'Cohort').textContent = rtFmtNum(d.cohortSize);
    const pct = d.cohortSize > 0 ? (d.retainedCount / d.cohortSize * 100) : 0;
    document.getElementById(prefix + 'Pct').textContent = pct.toFixed(2) + '%';
    document.getElementById(prefix + 'Avg').textContent = rtFmtInr(d.avgDeposit);

    document.querySelector('#' + prefix + 'Table tbody').innerHTML = (d.rows || []).map((r) =>
      '<tr><td>' + r.user_id + '</td><td>' + r.agent + '</td><td>' + r.current_level + '</td><td>' + rtFmtInr(r.day_deposit) + '</td><td>' + rtFmtNum(r.deposit_count) + '</td></tr>'
    ).join('') || '<tr><td colspan="5">No data</td></tr>';

    document.getElementById(prefix + 'PageLabel').textContent = 'Page ' + d.page + ' of ' + d.totalPages;
    document.getElementById(prefix + 'Prev').disabled = d.page <= 1;
    document.getElementById(prefix + 'Next').disabled = d.page >= d.totalPages;
    rtSetTodayTag(d.date);
    statusEl.textContent = 'Updated ' + new Date().toLocaleTimeString();
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
  }
}

async function loadRetention(date) {
  await Promise.all([rtLoadD1(date), rtLoadPremium('low', date), rtLoadPremium('high', date)]);
}

document.getElementById('rtD1Prev').onclick = () => { if (rtState.d1.page > 1) { rtState.d1.page--; rtLoadD1(); } };
document.getElementById('rtD1Next').onclick = () => { rtState.d1.page++; rtLoadD1(); };
document.getElementById('rtLowPrev').onclick = () => { if (rtState.low.page > 1) { rtState.low.page--; rtLoadPremium('low'); } };
document.getElementById('rtLowNext').onclick = () => { rtState.low.page++; rtLoadPremium('low'); };
document.getElementById('rtHighPrev').onclick = () => { if (rtState.high.page > 1) { rtState.high.page--; rtLoadPremium('high'); } };
document.getElementById('rtHighNext').onclick = () => { rtState.high.page++; rtLoadPremium('high'); };

// Exporting straight from the rendered <table> only ever captured the
// current page's 10 rows — this fetches every page from the same API the
// table itself uses and builds the CSV from that combined JSON instead.
function rtCsvField(v) { return '"' + String(v ?? '').replace(/"/g, '""') + '"'; }
function rtRowsToCsv(header, rows, mapRow) {
  const lines = [header.map(rtCsvField).join(',')];
  rows.forEach((r) => { lines.push(mapRow(r).map(rtCsvField).join(',')); });
  return lines.join('\\n');
}
async function rtFetchAll(urlBase, sep) {
  const first = await fetch(urlBase + sep + 'page=1').then((r) => r.json());
  let rows = first.rows || [];
  for (let page = 2; page <= (first.totalPages || 1); page++) {
    const d = await fetch(urlBase + sep + 'page=' + page).then((r) => r.json());
    rows = rows.concat(d.rows || []);
  }
  return rows;
}
async function rtExport(urlBase, sep, filename, header, mapRow, btn) {
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Exporting…';
  try {
    const rows = await rtFetchAll(urlBase, sep);
    const blob = new Blob([rtRowsToCsv(header, rows, mapRow)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
  } catch (e) {
    alert('Export failed: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}
const RT_D1_HEADER = ['User ID', 'Agent', 'Deposit Amount', 'Deposit Count', 'Region'];
const RT_PREMIUM_HEADER = ['User ID', 'Agent', 'VIP', 'Deposit Amount', 'Deposit Count'];
document.getElementById('exportRtD1Btn').onclick = (e) => rtExport(
  '/api/dashboard/analytics/day1-retention', '?', 'day1-retention.csv', RT_D1_HEADER,
  (r) => [r.user_id, r.agent, r.day_deposit, r.deposit_count, r.region], e.currentTarget
);
document.getElementById('exportRtLowBtn').onclick = (e) => rtExport(
  '/api/dashboard/analytics/premium-active?tier=low', '&', 'premium-active-low.csv', RT_PREMIUM_HEADER,
  (r) => [r.user_id, r.agent, r.current_level, r.day_deposit, r.deposit_count], e.currentTarget
);
document.getElementById('exportRtHighBtn').onclick = (e) => rtExport(
  '/api/dashboard/analytics/premium-active?tier=high', '&', 'premium-active-high.csv', RT_PREMIUM_HEADER,
  (r) => [r.user_id, r.agent, r.current_level, r.day_deposit, r.deposit_count], e.currentTarget
);

// Exposed so the Analytics page's 7-day tab picker (loaded before this
// script) can re-trigger this section when the selected date changes.
window.loadRetention = loadRetention;
loadRetention();
</script>
`;
