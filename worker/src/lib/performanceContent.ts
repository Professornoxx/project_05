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
