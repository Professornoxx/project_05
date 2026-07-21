// Performance page: redesigned to match the provided reference (Monthly
// Leaderboard & Incentives, How Scoring Works panel, Incentive Brackets,
// department-wise leaderboard cards, Overall Ranking with Gold/Silver/
// Bronze + ranked list). Live data from /api/dashboard/performance's
// departments + fullMonthlyRanking fields (see that endpoint's comment in
// index.ts for how each department is defined — Reactivation Team and VIP
// Team average their existing Low/High KPI pair, General uses Retention,
// FTD Team is a genuinely new metric with no prior KPI, all confirmed
// 2026-07-21). Overall Ranking is every agent with a valid month-to-date
// score, not just the top 3 the old monthlyLeaderboard field kept.
export const PERFORMANCE_CONTENT_HTML = `
<style>
  .pf-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
  .pf-title { font-weight: 700; font-size: 15px; letter-spacing: 0.03em; text-transform: uppercase; color: #1f2430; }
  .pf-range-tag { background: #dcfce7; color: #15803d; font-size: 12px; font-weight: 700; padding: 5px 14px; border-radius: 20px; }

  .pf-top-panel { background: #fff; border-radius: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); padding: 20px 22px; margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  @media (max-width: 900px) { .pf-top-panel { grid-template-columns: 1fr; } }
  .pf-panel-heading { font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: #6b7280; margin-bottom: 12px; }
  .pf-scoring-list { display: flex; flex-direction: column; gap: 10px; font-size: 13px; color: #374151; }
  .pf-scoring-list span { display: inline-flex; align-items: center; gap: 8px; }
  .pf-scoring-list i { width: 9px; height: 9px; border-radius: 50%; display: inline-block; flex-shrink: 0; }

  .pf-brackets { display: flex; gap: 12px; }
  @media (max-width: 500px) { .pf-brackets { flex-direction: column; } }
  .pf-bracket-box { flex: 1; border-radius: 10px; padding: 14px 12px; text-align: center; }
  .pf-bracket-1 { background: #e0e7ff; }
  .pf-bracket-2 { background: #ede9fe; }
  .pf-bracket-3 { background: #fef3c7; }
  .pf-bracket-threshold { font-weight: 700; font-size: 15px; color: #1f2430; margin-bottom: 6px; }
  .pf-bracket-amounts { font-size: 12px; color: #4b5563; }

  .pf-main-grid { display: grid; grid-template-columns: 1fr 1.3fr; gap: 20px; align-items: start; }
  @media (max-width: 1100px) { .pf-main-grid { grid-template-columns: 1fr; } }

  .pf-dept-column { display: flex; flex-direction: column; gap: 16px; }
  .pf-dept-card { background: #fff; border-radius: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); padding: 16px 18px; }
  .pf-dept-title { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: #1f2430; margin-bottom: 12px; }
  .pf-dept-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .pf-dept-row:last-child { margin-bottom: 0; }
  .pf-dept-medal { font-size: 15px; width: 18px; text-align: center; flex-shrink: 0; }
  .pf-dept-body { flex: 1; min-width: 0; }
  .pf-dept-name { font-size: 12.5px; font-weight: 600; color: #1f2430; margin-bottom: 4px; }
  .pf-dept-bar-track { height: 6px; background: #f1f2f5; border-radius: 3px; overflow: hidden; }
  .pf-dept-bar-fill { height: 100%; border-radius: 3px; }
  .pf-dept-pct { font-size: 12.5px; font-weight: 700; flex-shrink: 0; width: 48px; text-align: right; }

  .pf-ranking-column { display: flex; flex-direction: column; gap: 14px; }
  .pf-ranking-heading { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: #1f2430; }
  .pf-filter-row { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); padding: 10px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .pf-filter-btn { border: none; background: #f1f2f5; color: #333; border-radius: 20px; padding: 8px 16px; font-size: 12.5px; font-weight: 600; cursor: pointer; }
  .pf-filter-btn.active { background: #1f2430; color: #fff; }
  .pf-filter-sep { color: #d1d5db; }
  .pf-filter-btn.ghost { background: #f1f2f5; color: #6b7280; display: inline-flex; align-items: center; gap: 4px; }

  .pf-medal-card { border-radius: 12px; padding: 18px 20px; color: #fff; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .pf-medal-card.gold { background: linear-gradient(135deg, #f0b429, #d68910); }
  .pf-medal-card.silver { background: linear-gradient(135deg, #94a3b8, #64748b); }
  .pf-medal-card.bronze { background: linear-gradient(135deg, #b8763e, #92500f); }
  .pf-medal-left { display: flex; align-items: center; gap: 14px; min-width: 0; }
  .pf-medal-icon { font-size: 26px; flex-shrink: 0; }
  .pf-medal-rank-label { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85; margin-bottom: 2px; }
  .pf-medal-name { font-size: 17px; font-weight: 700; margin-bottom: 3px; }
  .pf-medal-sub { font-size: 11.5px; opacity: 0.9; }
  .pf-medal-pct { font-size: 26px; font-weight: 700; text-align: right; flex-shrink: 0; }
  .pf-medal-pct span { display: block; font-size: 10.5px; font-weight: 500; opacity: 0.85; text-transform: uppercase; letter-spacing: 0.03em; }

  .pf-rank-list { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); overflow: hidden; }
  .pf-rank-list-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-top: 1px solid #f0f0f0; font-size: 13px; }
  .pf-rank-list-row:first-child { border-top: none; }
  .pf-rank-list-row.last { border-left: 3px solid #dc2626; }
  .pf-rank-num { color: #6b7280; font-weight: 600; width: 60px; flex-shrink: 0; }
  .pf-rank-name { flex: 1; font-weight: 600; color: #1f2430; }
  .pf-rank-pct { font-weight: 700; }
</style>

<div class="pf-header">
  <div class="pf-title">Monthly Leaderboard &amp; Incentives</div>
  <div class="pf-range-tag" id="pfMonthRange">—</div>
</div>

<div class="pf-top-panel">
  <div>
    <div class="pf-panel-heading">How Scoring Works</div>
    <div class="pf-scoring-list">
      <span><i style="background:#15803d"></i>100%+ of target -- fully on track</span>
      <span><i style="background:#c2410c"></i>60-99% of target -- getting there</span>
      <span><i style="background:#dc2626"></i>Below 60% of target</span>
      <span style="color:#9ca3af;"><i style="background:#cbd5e1"></i>No users assigned this criterion -- excluded, not counted against the agent</span>
    </div>
  </div>
  <div>
    <div class="pf-panel-heading" style="text-align:right;">Incentive Brackets (Rank 1 / 2 / 3)</div>
    <div class="pf-brackets">
      <div class="pf-bracket-box pf-bracket-1"><div class="pf-bracket-threshold">60%+</div><div class="pf-bracket-amounts">Rs1500 / 800 / 500</div></div>
      <div class="pf-bracket-box pf-bracket-2"><div class="pf-bracket-threshold">75%+</div><div class="pf-bracket-amounts">Rs4000 / 2000 / 1400</div></div>
      <div class="pf-bracket-box pf-bracket-3"><div class="pf-bracket-threshold">90%+</div><div class="pf-bracket-amounts">Rs10000 / 5000 / 2000</div></div>
    </div>
  </div>
</div>

<div class="pf-main-grid">
  <div class="pf-dept-column" id="pfDeptColumn"></div>
  <div class="pf-ranking-column">
    <div class="pf-ranking-heading">🏆 Overall Ranking -- Average Across All Departments</div>
    <div class="pf-filter-row" id="pfFilterRow">
      <button class="pf-filter-btn active" data-range="month">This Month</button>
      <button class="pf-filter-btn" data-range="yesterday">Till Yesterday</button>
      <span class="pf-filter-sep">|</span>
      <button class="pf-filter-btn ghost" data-range="month-alt">🏆 This Month</button>
    </div>
    <div id="pfMedalCards"></div>
    <div class="pf-rank-list" id="pfRankList"></div>
  </div>
</div>

<div id="pfStatus" style="font-size:12.5px;color:#9ca3af;margin-top:12px;"></div>

<script>
const pfState = { asOfDate: null }; // null = today ("This Month"); set = "Till Yesterday"

function pfColorForPct(pct) { return pct >= 100 ? '#15803d' : pct >= 60 ? '#c2410c' : '#dc2626'; }
function pfMedal(i) { return ['🥇', '🥈', '🥉'][i] || (i + 1) + 'th'; }
function pfTierNote(pct) {
  if (pct >= 90) return '90%+ of target -- top incentive tier';
  if (pct >= 75) return '75%+ of target';
  if (pct >= 60) return '60%+ of target';
  return 'Below 60% of target -- no incentive yet';
}
function pfFmtDateLabel(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const monthName = new Date(Date.UTC(y, m - 1, d)).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  return d + '-' + monthName;
}

function pfRenderDepartments(departments) {
  document.getElementById('pfDeptColumn').innerHTML = departments.map((dept) =>
    '<div class="pf-dept-card">' +
      '<div class="pf-dept-title">' + dept.icon + ' ' + dept.name + '</div>' +
      (dept.agents.length > 0 ? dept.agents.map((a, i) => {
        const color = pfColorForPct(a.pct);
        return '<div class="pf-dept-row">' +
          '<div class="pf-dept-medal">' + pfMedal(i) + '</div>' +
          '<div class="pf-dept-body">' +
            '<div class="pf-dept-name">' + a.agent + '</div>' +
            '<div class="pf-dept-bar-track"><div class="pf-dept-bar-fill" style="width:' + Math.min(100, a.pct) + '%;background:' + color + '"></div></div>' +
          '</div>' +
          '<div class="pf-dept-pct" style="color:' + color + '">' + a.pct.toFixed(1) + '%</div>' +
        '</div>';
      }).join('') : '<div style="font-size:12px;color:#9ca3af;">No qualifying agents yet</div>') +
    '</div>'
  ).join('');
}

function pfRenderRanking(fullMonthlyRanking) {
  const top3 = fullMonthlyRanking.slice(0, 3);
  const rest = fullMonthlyRanking.slice(3);
  const tierClass = ['gold', 'silver', 'bronze'];
  const tierLabel = ['GOLD', 'SILVER', 'BRONZE'];
  const medal = ['🥇', '🥈', '🥉'];

  document.getElementById('pfMedalCards').innerHTML = top3.map((r, i) =>
    '<div class="pf-medal-card ' + tierClass[i] + '" style="margin-bottom:10px;">' +
      '<div class="pf-medal-left">' +
        '<div class="pf-medal-icon">' + medal[i] + '</div>' +
        '<div>' +
          '<div class="pf-medal-rank-label">' + tierLabel[i] + '</div>' +
          '<div class="pf-medal-name">' + r.agent + '</div>' +
          '<div class="pf-medal-sub">' + pfTierNote(r.pct) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="pf-medal-pct">' + r.pct.toFixed(1) + '%<span>of target</span></div>' +
    '</div>'
  ).join('') || '<div style="color:#888;font-size:13px;">No agents with a qualifying score yet this month.</div>';

  document.getElementById('pfRankList').innerHTML = rest.map((r, i) => {
    const isLast = i === rest.length - 1;
    const suffix = r.rank === 1 ? 'ST' : r.rank === 2 ? 'ND' : r.rank === 3 ? 'RD' : 'TH';
    const rankLabel = r.rank + suffix + (isLast ? ' (LAST)' : '');
    return '<div class="pf-rank-list-row' + (isLast ? ' last' : '') + '">' +
      '<div class="pf-rank-num">' + rankLabel + '</div>' +
      '<div class="pf-rank-name">' + r.agent + '</div>' +
      '<div class="pf-rank-pct" style="color:' + pfColorForPct(r.pct) + '">' + r.pct.toFixed(1) + '%</div>' +
    '</div>';
  }).join('');
}

async function pfLoad() {
  const statusEl = document.getElementById('pfStatus');
  statusEl.textContent = 'Loading...';
  try {
    const params = new URLSearchParams({ range: 'today' });
    if (pfState.asOfDate) params.set('date', pfState.asOfDate);
    const res = await fetch('/api/dashboard/performance?' + params.toString());
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || res.statusText);

    document.getElementById('pfMonthRange').textContent = pfFmtDateLabel(d.monthStart) + ' - ' + pfFmtDateLabel(d.date);
    pfRenderDepartments(d.departments || []);
    pfRenderRanking(d.fullMonthlyRanking || []);

    statusEl.textContent = 'Updated ' + new Date().toLocaleTimeString() + ' — month-to-date through ' + d.date;
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
  }
}

document.querySelectorAll('#pfFilterRow .pf-filter-btn[data-range]').forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll('#pfFilterRow .pf-filter-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    if (btn.dataset.range === 'yesterday') {
      const d = new Date(); d.setUTCDate(d.getUTCDate() - 1);
      pfState.asOfDate = d.toISOString().slice(0, 10);
    } else {
      pfState.asOfDate = null; // "This Month" and the ghost "🏆 This Month" both mean as-of-today
    }
    pfLoad();
  };
});

pfLoad();
</script>
`;

// Daily / Range Performance: a second, separate section appended below
// Monthly Leaderboard & Incentives, per explicit instruction — its own
// date/range control, independent of the Monthly section's. UI-only for
// now: static/mock data (exact numbers from the reference image), no
// backend endpoint yet, structured (DR_MOCK_DATA + render functions kept
// separate from the pf* ones above) so a real fetch can be swapped in
// later without touching the render logic.
//
// IMPORTANT: flagging a real inconsistency for whoever wires this to real
// data, rather than silently picking a side. This section's department-
// to-KPI mapping does NOT match the Monthly Leaderboard section directly
// above it, per the reference images given for each:
//   - Reactivation Team: Reactivation Low + High — SAME as Monthly's
//     Reactivation Team. Consistent.
//   - General (here): Low + High VIP Upgrade — Monthly's "General" card
//     uses Retention instead.
//   - VIP Team (here): Low + High Premium Active — Monthly's "VIP Team"
//     card uses VIP Upgrade Low/High instead.
//   - FTD Team (here): Retention + a new "FD 2-5 Days Conversion" metric
//     — Monthly's "FTD Team" card uses a single new first-deposit-count
//     metric instead, and doesn't show Retention at all.
// In short: "VIP Team" and "General" mean different KPIs depending on
// which section of this same page you're looking at, and "FTD Team"
// combines Retention with a still-undefined "FD 2-5 Days Conversion"
// metric here specifically. Confirm the intended mapping (and define
// "FD 2-5 Days Conversion" — it isn't any existing KPI) before wiring
// this section to real data.
export const DAILY_RANGE_PERFORMANCE_CONTENT_HTML = `
<style>
  .dr-header { display: flex; align-items: center; justify-content: space-between; margin: 28px 0 4px; }
  .dr-title { font-weight: 700; font-size: 15px; letter-spacing: 0.03em; text-transform: uppercase; color: #1f2430; }
  .dr-tag { background: #fee2e2; color: #b91c1c; font-size: 11px; font-weight: 700; letter-spacing: 0.03em; padding: 5px 12px; border-radius: 20px; }
  .dr-sub { font-size: 12px; color: #888; font-style: italic; margin-bottom: 14px; }

  .dr-filter-row { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); padding: 10px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 20px; }
  .dr-filter-btn { border: 1px solid #ddd; background: #fff; color: #333; border-radius: 20px; padding: 8px 16px; font-size: 12.5px; font-weight: 600; cursor: pointer; }
  .dr-filter-btn.active { background: #4f46e5; border-color: #4f46e5; color: #fff; }
  .dr-filter-sep { color: #d1d5db; }
  .dr-date-badge { border: 1px solid #ddd; background: #fafafa; color: #333; border-radius: 20px; padding: 8px 16px; font-size: 12.5px; font-weight: 600; cursor: pointer; }

  .dr-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  @media (max-width: 1000px) { .dr-grid { grid-template-columns: 1fr; } }
  .dr-card { background: #fff; border-radius: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); padding: 16px 18px; }
  .dr-card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .dr-card-title { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; color: #1f2430; }
  .dr-card-count { font-size: 11px; color: #9ca3af; font-weight: 600; }
  .dr-card-list { max-height: 420px; overflow-y: auto; }

  .dr-row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid #f0f0f0; }
  .dr-row:first-child { border-top: none; }
  .dr-rank { width: 24px; height: 24px; border-radius: 50%; background: #4f46e5; color: #fff; font-size: 11.5px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .dr-agent { font-size: 13px; font-weight: 700; color: #1f2430; width: 92px; flex-shrink: 0; }
  .dr-metrics { flex: 1; display: flex; gap: 14px; min-width: 0; }
  .dr-metric { flex: 1; min-width: 0; }
  .dr-metric-label { font-size: 9px; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; color: #9ca3af; margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dr-metric-value { font-size: 11.5px; font-weight: 700; color: #1f2430; margin-bottom: 4px; }
  .dr-metric-value.na { font-weight: 500; color: #cbd5e1; font-style: italic; }
  .dr-metric-bar-track { height: 4px; background: #f1f2f5; border-radius: 2px; overflow: hidden; }
  .dr-metric-bar-fill { height: 100%; border-radius: 2px; }
  .dr-score { font-weight: 700; font-size: 15px; text-align: right; width: 62px; flex-shrink: 0; }
</style>

<div class="dr-header">
  <div class="dr-title">Daily / Range Performance</div>
  <div class="dr-tag">Scored per department</div>
</div>
<div class="dr-sub">Pick a date or range below -- every department's list recalculates against that window (separate from the Monthly Leaderboard's own date-range control above).</div>

<div class="dr-filter-row" id="drFilterRow">
  <button class="dr-filter-btn active" data-range="today">Today</button>
  <button class="dr-filter-btn" data-range="yesterday">Yesterday</button>
  <button class="dr-filter-btn" data-range="7d">Last 7 Days</button>
  <button class="dr-filter-btn" data-range="30d">Last 30 Days</button>
  <button class="dr-filter-btn" data-range="35d">Last 35 Days</button>
  <span class="dr-filter-sep">|</span>
  <button class="dr-date-badge" id="drDateBadge">📅 21-July</button>
</div>

<div class="dr-grid" id="drGrid"></div>

<div id="drStatus" style="font-size:12.5px;color:#9ca3af;margin-top:12px;"></div>

<script>
// Stand-in for a future live endpoint — see the file-level comment above
// for the unresolved department-to-KPI mapping question this mock
// intentionally leaves open (matches the reference image's own numbers
// exactly rather than reusing the Monthly section's different mapping).
const DR_MOCK_DATA = {
  date: '21-July',
  departments: [
    { name: 'FTD Team', icon: '🎉', totalAgents: 12, metricLabels: ['Retention', 'FD 2-5 Days Conver...'], agents: [
      { agent: 'Sahana (SL)', m1: '4/7 (57.1%)', m1pct: 57.1, m2: '1/19 (5.3%)', m2pct: 5.3, score: 58.77 },
      { agent: 'Lakshmi (WFH)', m1: '3/7 (42.9%)', m1pct: 42.9, m2: '0/17 (0.0%)', m2pct: 0.0, score: 50.00 },
      { agent: 'Naira (WFH)', m1: '3/12 (25.0%)', m1pct: 25.0, m2: '1/42 (2.4%)', m2pct: 2.4, score: 45.63 },
      { agent: 'Reetu (WFH)', m1: '2/10 (20.0%)', m1pct: 20.0, m2: '0/39 (0.0%)', m2pct: 0.0, score: 33.33 },
      { agent: 'Nisha (WFH)', m1: '2/11 (18.2%)', m1pct: 18.2, m2: '1/57 (1.8%)', m2pct: 1.8, score: 33.23 },
      { agent: 'Rithika (WFH)', m1: null, m2: '1/18 (5.6%)', m2pct: 5.6, score: 18.52 },
      { agent: 'Amar (WFH)', m1: '1/11 (9.1%)', m1pct: 9.1, m2: '1/53 (1.9%)', m2pct: 1.9, score: 18.30 },
    ]},
    { name: 'VIP Team', icon: '💎', totalAgents: 12, metricLabels: ['Low Premium Active', 'High Premium Active'], agents: [
      { agent: 'Amar (WFH)', m1: '24/147 (16.3%)', m1pct: 16.3, m2: '4/7 (57.1%)', m2pct: 57.1, score: 73.32 },
      { agent: 'Preethy (WFH)', m1: '6/38 (15.8%)', m1pct: 15.8, m2: '1/2 (50.0%)', m2pct: 50.0, score: 72.56 },
      { agent: 'Sahana (SL)', m1: '58/528 (11.0%)', m1pct: 11.0, m2: '80/274 (29.2%)', m2pct: 29.2, score: 57.40 },
      { agent: 'Lakshmi (WFH)', m1: '51/521 (9.8%)', m1pct: 9.8, m2: '71/234 (30.3%)', m2pct: 30.3, score: 57.33 },
      { agent: 'Shakshi (WFH)', m1: '4/78 (5.1%)', m1pct: 5.1, m2: '2/4 (50.0%)', m2pct: 50.0, score: 57.33 },
      { agent: 'Anitha (WFH)', m1: '53/416 (12.7%)', m1pct: 12.7, m2: '36/148 (24.3%)', m2pct: 24.3, score: 52.95 },
      { agent: 'Reetu (WFH)', m1: '37/448 (8.3%)', m1pct: 8.3, m2: '21/74 (28.4%)', m2pct: 28.4, score: 52.34 },
    ]},
    { name: 'Reactivation Team', icon: '🔄', totalAgents: 12, metricLabels: ['Reactivation Low', 'Reactivation High'], agents: [
      { agent: 'Sathya (WFH)', m1: '3/30', m1pct: 10.0, m2: '3/10', m2pct: 30.0, score: 20.00 },
      { agent: 'Naira (WFH)', m1: '4/30', m1pct: 13.3, m2: '1/10', m2pct: 10.0, score: 11.67 },
      { agent: 'Muskhan (WFH)', m1: '3/30', m1pct: 10.0, m2: '1/10', m2pct: 10.0, score: 10.00 },
      { agent: 'Sahana (SL)', m1: '2/30', m1pct: 6.7, m2: '1/10', m2pct: 10.0, score: 8.33 },
      { agent: 'Reetu (WFH)', m1: '5/30', m1pct: 16.7, m2: '0/10', m2pct: 0.0, score: 8.33 },
      { agent: 'Anitha (WFH)', m1: '1/30', m1pct: 3.3, m2: '1/10', m2pct: 10.0, score: 6.67 },
      { agent: 'Nisha (WFH)', m1: '4/30', m1pct: 13.3, m2: '0/10', m2pct: 0.0, score: 6.67 },
    ]},
    { name: 'General', icon: '📊', totalAgents: 12, metricLabels: ['Low VIP Upgrade', 'High VIP Upgrade'], agents: [
      { agent: 'Naira (WFH)', m1: '4/10', m1pct: 40.0, m2: '1/5', m2pct: 20.0, score: 30.00 },
      { agent: 'Nisha (WFH)', m1: '1/10', m1pct: 10.0, m2: '1/5', m2pct: 20.0, score: 15.00 },
      { agent: 'Anitha (WFH)', m1: '2/10', m1pct: 20.0, m2: '0/5', m2pct: 0.0, score: 10.00 },
      { agent: 'Lakshmi (WFH)', m1: '2/10', m1pct: 20.0, m2: '0/5', m2pct: 0.0, score: 10.00 },
      { agent: 'Reetu (WFH)', m1: '1/10', m1pct: 10.0, m2: '0/5', m2pct: 0.0, score: 5.00 },
      { agent: 'Sahana (SL)', m1: '1/10', m1pct: 10.0, m2: '0/5', m2pct: 0.0, score: 5.00 },
      { agent: 'Sathya (WFH)', m1: '1/10', m1pct: 10.0, m2: '0/5', m2pct: 0.0, score: 5.00 },
    ]},
  ],
};

function drColorForPct(pct) { return pct >= 100 ? '#15803d' : pct >= 60 ? '#c2410c' : '#dc2626'; }

function drMetricCell(label, value, pct) {
  if (value === null) {
    return '<div class="dr-metric"><div class="dr-metric-label">' + label + '</div><div class="dr-metric-value na">No users assigned</div></div>';
  }
  const color = drColorForPct(pct);
  return '<div class="dr-metric">' +
    '<div class="dr-metric-label">' + label + '</div>' +
    '<div class="dr-metric-value" style="color:' + color + '">' + value + '</div>' +
    '<div class="dr-metric-bar-track"><div class="dr-metric-bar-fill" style="width:' + Math.min(100, pct) + '%;background:' + color + '"></div></div>' +
    '</div>';
}

function drRenderDepartments(departments) {
  document.getElementById('drGrid').innerHTML = departments.map((dept) =>
    '<div class="dr-card">' +
      '<div class="dr-card-head">' +
        '<div class="dr-card-title">' + dept.icon + ' ' + dept.name + '</div>' +
        '<div class="dr-card-count">' + dept.totalAgents + ' agents</div>' +
      '</div>' +
      '<div class="dr-card-list">' +
        dept.agents.map((a, i) =>
          '<div class="dr-row">' +
            '<div class="dr-rank">' + (i + 1) + '</div>' +
            '<div class="dr-agent">' + a.agent + '</div>' +
            '<div class="dr-metrics">' +
              drMetricCell(dept.metricLabels[0], a.m1, a.m1pct) +
              drMetricCell(dept.metricLabels[1], a.m2, a.m2pct) +
            '</div>' +
            '<div class="dr-score" style="color:' + drColorForPct(a.score) + '">' + a.score.toFixed(2) + '%</div>' +
          '</div>'
        ).join('') +
      '</div>' +
    '</div>'
  ).join('');
}

function drRender(data) {
  document.getElementById('drDateBadge').textContent = '📅 ' + data.date;
  drRenderDepartments(data.departments);
  document.getElementById('drStatus').textContent = 'Showing mock data — not yet connected to a live endpoint.';
}

document.querySelectorAll('#drFilterRow .dr-filter-btn').forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll('#drFilterRow .dr-filter-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    // Range switching has no real effect yet — DR_MOCK_DATA is static
    // regardless of range until this is wired to a live endpoint.
    drRender(DR_MOCK_DATA);
  };
});

drRender(DR_MOCK_DATA);
</script>
`;
