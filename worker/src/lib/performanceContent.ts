// Performance page: Monthly Leaderboard & Incentives (top 3 agents by
// month-to-date score) + Daily/Range Performance (ranked table, all
// agents, 7 KPIs equal weight), matching the provided reference design.
// Data from /api/dashboard/performance. Real agent roster (Nisha, Pooja,
// Maya, Pragathy, Sanvi, Inaya, Muskan) differs from the reference
// screenshot's example names — expected, same as every other section.
// Incentive bracket amounts are static reference text only, not computed
// per agent — no payout logic exists yet.
export const PERFORMANCE_CONTENT_HTML = `
<style>
  .pf-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .pf-title { font-weight: 700; font-size: 15px; letter-spacing: 0.03em; text-transform: uppercase; color: #1f2430; }
  .pf-range-tag { background: #dcfce7; color: #15803d; font-size: 12px; font-weight: 700; padding: 5px 12px; border-radius: 20px; }
  .pf-legend { display: flex; align-items: center; gap: 18px; font-size: 12px; color: #4b5563; margin-bottom: 16px; flex-wrap: wrap; }
  .pf-legend span { display: inline-flex; align-items: center; gap: 6px; }
  .pf-legend i { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  .pf-incentive-row { display: flex; align-items: center; gap: 12px; font-size: 12px; color: #4b5563; margin-bottom: 24px; flex-wrap: wrap; justify-content: flex-end; }
  .pf-incentive-badge { padding: 4px 10px; border-radius: 8px; font-weight: 600; }
  .pf-ib-1 { background: #dbeafe; color: #1e40af; }
  .pf-ib-2 { background: #ede9fe; color: #5b21b6; }
  .pf-ib-3 { background: #fef3c7; color: #92400e; }

  .pf-cards { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 32px; }
  @media (max-width: 900px) { .pf-cards { grid-template-columns: 1fr; } }
  .pf-card { border-radius: 14px; padding: 22px; color: #fff; box-shadow: 0 4px 14px rgba(0,0,0,0.12); }
  .pf-card.rank-1 { background: linear-gradient(135deg, #f6b93b, #e58e26); order: 0; }
  .pf-card.rank-2 { background: linear-gradient(135deg, #9aa5b1, #717d8c); order: -1; }
  .pf-card.rank-3 { background: linear-gradient(135deg, #cd8a5e, #a86a41); order: 1; }
  .pf-card-medal { font-size: 22px; margin-bottom: 8px; }
  .pf-card-name { font-weight: 700; font-size: 17px; margin-bottom: 10px; }
  .pf-card-pct { font-size: 32px; font-weight: 700; }
  .pf-card-pct span { font-size: 16px; font-weight: 500; opacity: 0.85; }
  .pf-card-sub { font-size: 12px; opacity: 0.9; margin-top: 8px; font-style: italic; }

  .pf-tabs-row { display: flex; align-items: center; gap: 10px; margin: 28px 0 20px; flex-wrap: wrap; }
  .pf-tab { border: 1px solid #ddd; background: #fff; color: #333; border-radius: 20px; padding: 8px 18px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .pf-tab:hover { background: #f5f5f7; }
  .pf-tab.active { background: #4f46e5; border-color: #4f46e5; color: #fff; }
  .pf-date-input { border: 1px solid #ddd; background: #fff; border-radius: 20px; padding: 7px 14px; font-size: 13px; cursor: pointer; }
  .pf-kpi-tag { background: #fee2e2; color: #b91c1c; font-size: 11px; font-weight: 700; padding: 5px 12px; border-radius: 20px; margin-left: auto; }

  .pf-row { background: #fff; border-radius: 12px; padding: 16px 20px; margin-bottom: 12px; box-shadow: 0 1px 2px rgba(16,24,40,0.04), 0 2px 8px rgba(16,24,40,0.06); display: grid; grid-template-columns: auto 160px repeat(7, 1fr) 90px; align-items: center; gap: 12px; }
  @media (max-width: 1300px) { .pf-row { grid-template-columns: 1fr; } }
  .pf-rank-badge { width: 30px; height: 30px; border-radius: 50%; background: #4f46e5; color: #fff; font-weight: 700; font-size: 13px; display: flex; align-items: center; justify-content: center; }
  .pf-agent-name { font-weight: 700; font-size: 14px; color: #1f2430; }
  .pf-kpi-cell { min-width: 0; }
  .pf-kpi-label { font-size: 9px; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; color: #9ca3af; margin-bottom: 3px; }
  .pf-kpi-value { font-size: 13px; font-weight: 700; color: #1f2430; margin-bottom: 4px; }
  .pf-kpi-value.na { font-weight: 500; color: #cbd5e1; font-style: italic; font-size: 12px; }
  .pf-kpi-bar-track { height: 4px; background: #f1f2f5; border-radius: 2px; overflow: hidden; }
  .pf-kpi-bar-fill { height: 100%; border-radius: 2px; }
  .pf-score { font-weight: 700; font-size: 18px; text-align: right; }

  #pfStatus { font-size: 12.5px; color: #9ca3af; margin-top: 4px; }
</style>

<div class="pf-header">
  <div class="pf-title">Monthly Leaderboard &amp; Incentives</div>
  <div class="pf-range-tag" id="pfMonthRange">—</div>
</div>
<div class="pf-legend">
  <span><i style="background:#15803d"></i>100%+ of target</span>
  <span><i style="background:#b45309"></i>60-99% of target</span>
  <span><i style="background:#b91c1c"></i>Below 60%</span>
  <span style="color:#9ca3af;"><i style="background:#cbd5e1"></i>No users assigned — excluded, not counted against them</span>
</div>
<div class="pf-incentive-row">
  <span>Incentive brackets (rank 1 / 2 / 3):</span>
  <span class="pf-incentive-badge pf-ib-1">60%+: Rs1500/800/500</span>
  <span class="pf-incentive-badge pf-ib-2">75%+: Rs4000/2000/1400</span>
  <span class="pf-incentive-badge pf-ib-3">90%+: Rs10000/5000/2000</span>
</div>

<div class="pf-cards" id="pfCards"></div>

<div class="pf-header">
  <div class="pf-title">Daily / Range Performance</div>
</div>
<div class="pf-tabs-row" id="pfTabsRow">
  <button class="pf-tab" data-range="today">Today</button>
  <button class="pf-tab" data-range="yesterday">Yesterday</button>
  <button class="pf-tab" data-range="7d">Last 7 Days</button>
  <button class="pf-tab" data-range="30d">Last 30 Days</button>
  <button class="pf-tab" data-range="35d">Last 35 Days</button>
  <input type="date" class="pf-date-input" id="pfDatePicker" />
  <span class="pf-kpi-tag">7 KPIs, equal weight</span>
</div>

<div id="pfRows"></div>
<div id="pfStatus"></div>

<script>
const PF_KPI_ORDER = [
  ['reactivationLow', 'Reactivation Low'], ['reactivationHigh', 'Reactivation High'],
  ['retention', 'Retention'], ['vipUpgradeLow', 'Low VIP Upgrade'], ['vipUpgradeHigh', 'High VIP Upgrade'],
  ['premiumActiveLow', 'Low Premium Active'], ['premiumActiveHigh', 'High Premium Active'],
];
let pfState = { range: 'today', date: null };

function pfFmtNum(n) { return Number(n || 0).toLocaleString('en-IN'); }
function pfColorForPct(pct) {
  if (pct === null) return '#cbd5e1';
  return pct >= 100 ? '#15803d' : pct >= 60 ? '#b45309' : '#b91c1c';
}

function pfRenderCards(leaderboard, monthRange) {
  document.getElementById('pfMonthRange').textContent = monthRange || '—';
  const order = [1, 0, 2]; // rank2, rank1, rank3 visual order (gold in middle)
  const medals = ['🥇', '🥈', '🥉'];
  const html = order.map((idx) => {
    const entry = leaderboard[idx];
    if (!entry) return '';
    const pctText = entry.score === null ? '—' : entry.score.toFixed(2);
    const subText = entry.score === null ? 'No qualifying KPIs this month' :
      entry.score >= 90 ? '90%+ of target — top incentive tier' :
      entry.score >= 75 ? '75%+ of target' :
      entry.score >= 60 ? '60%+ of target' : 'Below 60% of target — no incentive yet';
    return '<div class="pf-card rank-' + (idx + 1) + '">' +
      '<div class="pf-card-medal">' + medals[idx] + '</div>' +
      '<div class="pf-card-name">' + entry.agent + '</div>' +
      '<div class="pf-card-pct">' + pctText + '<span>% of target (month)</span></div>' +
      '<div class="pf-card-sub">' + subText + '</div>' +
      '</div>';
  }).join('');
  document.getElementById('pfCards').innerHTML = html || '<div style="color:#888;">No data</div>';
}

function pfRenderRows(dailyTable) {
  const html = dailyTable.map((row, i) => {
    const kpiCells = PF_KPI_ORDER.map(([key, label]) => {
      const kpi = row.kpis[key];
      const pct = row.kpiPcts[key];
      if (kpi.den === 0) {
        return '<div class="pf-kpi-cell"><div class="pf-kpi-label">' + label + '</div><div class="pf-kpi-value na">No users assigned</div></div>';
      }
      const color = pfColorForPct(pct);
      const barPct = Math.min(100, pct);
      let valueText = pfFmtNum(kpi.num) + ' / ' + pfFmtNum(kpi.den);
      if (key === 'premiumActiveLow' || key === 'premiumActiveHigh') valueText += ' (' + pct.toFixed(1) + '%)';
      return '<div class="pf-kpi-cell">' +
        '<div class="pf-kpi-label">' + label + '</div>' +
        '<div class="pf-kpi-value" style="color:' + color + '">' + valueText + '</div>' +
        '<div class="pf-kpi-bar-track"><div class="pf-kpi-bar-fill" style="width:' + barPct + '%;background:' + color + '"></div></div>' +
        '</div>';
    }).join('');
    const scoreColor = pfColorForPct(row.score);
    const scoreText = row.score === null ? '—' : row.score.toFixed(2) + '%';
    return '<div class="pf-row">' +
      '<div class="pf-rank-badge">' + (i + 1) + '</div>' +
      '<div class="pf-agent-name">' + row.agent + '</div>' +
      kpiCells +
      '<div class="pf-score" style="color:' + scoreColor + '">' + scoreText + '</div>' +
      '</div>';
  }).join('');
  document.getElementById('pfRows').innerHTML = html || '<div style="color:#888;">No data</div>';
}

async function loadPerformance() {
  const statusEl = document.getElementById('pfStatus');
  statusEl.textContent = 'Loading...';
  try {
    const params = new URLSearchParams({ range: pfState.range });
    if (pfState.date) params.set('date', pfState.date);
    const res = await fetch('/api/dashboard/performance?' + params.toString());
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || res.statusText);

    const monthRangeLabel = d.monthStart && d.date ? (Number(d.monthStart.slice(8,10)) + '-' + new Date(d.monthStart).toLocaleString('en-US',{month:'short',timeZone:'UTC'}) + ' - ' + Number(d.date.slice(8,10)) + '-' + new Date(d.date).toLocaleString('en-US',{month:'short',timeZone:'UTC'})) : '';
    pfRenderCards(d.monthlyLeaderboard || [], monthRangeLabel);
    pfRenderRows(d.dailyTable || []);

    statusEl.textContent = 'Updated ' + new Date().toLocaleTimeString() + ' — showing ' + d.rangeStart + ' to ' + d.rangeEnd;
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
  }
}

document.querySelectorAll('.pf-tab').forEach((btn) => {
  btn.onclick = () => {
    pfState.range = btn.dataset.range;
    pfState.date = null;
    document.getElementById('pfDatePicker').value = '';
    document.querySelectorAll('.pf-tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    loadPerformance();
  };
});
document.getElementById('pfDatePicker').onchange = (e) => {
  pfState.date = e.target.value;
  pfState.range = 'today';
  document.querySelectorAll('.pf-tab').forEach((b) => b.classList.remove('active'));
  loadPerformance();
};
document.querySelector('.pf-tab[data-range="today"]').classList.add('active');

loadPerformance();
</script>
`;
