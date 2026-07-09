// Analytics page section 1: Region & VIP Deposit Analytics — top 10 regions
// by that day's completed deposit volume, and that same day's deposit
// volume broken down by VIP level, matching the provided reference design.
// Includes the page-level 7-day tab picker ("ALL SECTIONS BELOW") that
// future Analytics sections will also hook into. Data from
// /api/dashboard/analytics/region-vip-deposit.
export const ANALYTICS_CONTENT_HTML = `
<style>
  .an-daypicker-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
  .an-daypicker-tabs { display: flex; gap: 8px; flex-wrap: wrap; }
  .an-day-tab { border: 1px solid #ddd; background: #fff; color: #333; border-radius: 20px; padding: 8px 18px; font-size: 13px; font-weight: 600; cursor: pointer; transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease; }
  .an-day-tab:hover { background: #f5f5f7; }
  .an-day-tab.active { background: #4f46e5; border-color: #4f46e5; color: #fff; }
  .an-all-tag { background: #dcfce7; color: #15803d; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; padding: 5px 12px; border-radius: 20px; }

  .an-header { display: flex; align-items: center; justify-content: space-between; margin: 24px 0 16px; }
  .an-title { font-weight: 700; font-size: 15px; letter-spacing: 0.03em; text-transform: uppercase; color: #1f2430; }
  .an-tag { background: #dcfce7; color: #15803d; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; padding: 5px 12px; border-radius: 20px; }

  .an-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; margin-bottom: 22px; }
  @media (max-width: 1000px) { .an-grid { grid-template-columns: 1fr; } }
  .an-panel { background: #fff; border-left: 4px solid #4f46e5; border-radius: 0 14px 14px 0; padding: 20px 22px; box-shadow: 0 1px 2px rgba(16,24,40,0.04), 0 2px 8px rgba(16,24,40,0.06); }
  .an-panel.accent-purple { border-left-color: #7c3aed; }
  .an-panel-head { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
  .an-panel-title { font-weight: 700; font-size: 13.5px; color: #1f2430; }
  .an-icon-badge { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 50%; font-size: 15px; background: #e0e7ff; flex-shrink: 0; }
  .an-panel.accent-purple .an-icon-badge { background: #ede9fe; }

  .an-hbar-row { display: grid; grid-template-columns: 140px 1fr; align-items: center; gap: 10px; margin-bottom: 8px; }
  .an-hbar-label { font-size: 12px; color: #374151; text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .an-hbar-track { position: relative; height: 22px; background: #f3f4f6; border-radius: 4px; }
  .an-hbar-fill { position: absolute; top: 0; left: 0; bottom: 0; background: #3b82f6; border-radius: 4px; min-width: 2px; }
  .an-hbar-axis { display: grid; grid-template-columns: 140px 1fr; margin-top: 6px; }
  .an-hbar-axis-ticks { position: relative; height: 14px; font-size: 10px; color: #9ca3af; }
  .an-hbar-axis-ticks span { position: absolute; transform: translateX(-50%); }

  .an-vbar-chart { position: relative; height: 300px; margin-top: 6px; padding-left: 56px; }
  .an-vbar-gridline { position: absolute; left: 56px; right: 0; border-top: 1px solid #f0f1f4; font-size: 10px; color: #9ca3af; }
  .an-vbar-gridline span { position: absolute; left: -56px; top: -6px; width: 50px; text-align: right; }
  .an-vbar-bars { position: absolute; left: 56px; right: 0; bottom: 26px; top: 0; display: flex; align-items: flex-end; gap: 10px; overflow-x: auto; }
  .an-vbar-col { flex: 1; min-width: 40px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; position: relative; }
  .an-vbar { width: 60%; min-height: 2px; border-radius: 4px 4px 0 0; background: #7c3aed; }
  .an-vbar-label { position: absolute; bottom: -26px; font-size: 10px; color: #9ca3af; white-space: nowrap; transform: rotate(-25deg); transform-origin: top left; }

  #anStatus { font-size: 12.5px; color: #9ca3af; margin-top: 4px; }
</style>

<div class="an-daypicker-row">
  <div class="an-daypicker-tabs" id="anDayTabs"></div>
  <div class="an-all-tag">ALL SECTIONS BELOW</div>
</div>

<div class="an-header">
  <div class="an-title">Region &amp; VIP Deposit Analytics</div>
  <div class="an-tag">ANALYTICS</div>
</div>

<div class="an-grid">
  <div class="an-panel">
    <div class="an-panel-head">
      <span class="an-icon-badge">🌏</span>
      <div class="an-panel-title">Top 10 Regions by Deposit</div>
    </div>
    <div id="anRegionChart"></div>
  </div>

  <div class="an-panel accent-purple">
    <div class="an-panel-head">
      <span class="an-icon-badge">💎</span>
      <div class="an-panel-title">Deposit by VIP Level</div>
    </div>
    <div class="an-vbar-chart" id="anVipChart"></div>
  </div>
</div>

<div id="anStatus"></div>

<script>
function anFmtInr(n) { return '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }); }
function anFmtNum(n) { return Number(n || 0).toLocaleString('en-IN'); }

function anNiceMax(v) {
  if (v <= 0) return 10;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const niceN = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return niceN * pow;
}

function anRenderRegionChart(rows) {
  const maxVal = Math.max(...(rows || []).map((r) => r.total), 1);
  const niceMax = anNiceMax(maxVal);
  const barsHtml = (rows || []).map((r) => {
    const pct = (r.total / niceMax) * 100;
    return '<div class="an-hbar-row">' +
      '<div class="an-hbar-label">' + r.region + ' (' + anFmtNum(r.users) + ' users)</div>' +
      '<div class="an-hbar-track"><div class="an-hbar-fill" style="width:' + pct + '%" title="' + anFmtInr(r.total) + '"></div></div>' +
      '</div>';
  }).join('');

  const ticks = 7;
  const tickHtml = Array.from({ length: ticks + 1 }, (_, i) => {
    const val = Math.round((niceMax / ticks) * i);
    const leftPct = (i / ticks) * 100;
    return '<span style="left:' + leftPct + '%">' + anFmtInr(val) + '</span>';
  }).join('');

  document.getElementById('anRegionChart').innerHTML =
    (barsHtml || '<div style="color:#888;font-size:13px;">No data</div>') +
    '<div class="an-hbar-axis"><div></div><div class="an-hbar-axis-ticks">' + tickHtml + '</div></div>';
}

function anRenderVipChart(rows) {
  const present = (rows || []).filter((r) => r.users > 0);
  const maxVal = Math.max(...present.map((r) => r.total), 1);
  const niceMax = anNiceMax(maxVal);
  const steps = 8;

  let gridHtml = '';
  for (let i = 0; i <= steps; i++) {
    const val = Math.round((niceMax / steps) * i);
    const bottomPct = (i / steps) * 100;
    gridHtml += '<div class="an-vbar-gridline" style="bottom:' + bottomPct + '%"><span>' + anFmtInr(val) + '</span></div>';
  }

  const barsHtml = present.map((r) => {
    const heightPct = (r.total / niceMax) * 100;
    return '<div class="an-vbar-col">' +
      '<div class="an-vbar" style="height:' + heightPct + '%" title="' + anFmtInr(r.total) + '"></div>' +
      '<div class="an-vbar-label">VIP ' + r.level + ' (' + anFmtNum(r.users) + ' users)</div>' +
      '</div>';
  }).join('');

  document.getElementById('anVipChart').innerHTML = gridHtml + '<div class="an-vbar-bars">' + (barsHtml || '<div style="color:#888;font-size:13px;">No data</div>') + '</div>';
}

async function loadAnalytics(date) {
  const statusEl = document.getElementById('anStatus');
  statusEl.textContent = 'Loading...';
  try {
    const res = await fetch('/api/dashboard/analytics/region-vip-deposit' + (date ? '?date=' + date : ''));
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || res.statusText);

    anRenderRegionChart(d.topRegions);
    anRenderVipChart(d.byVipLevel);

    statusEl.textContent = 'Updated ' + new Date().toLocaleTimeString() + ' — showing ' + d.date;
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
  }
}

// 7-day tab picker (today + 6 previous days, IST) driving all Analytics
// sections — mirrors the Home page's day-picker pattern but as tabs
// instead of a native date input, matching the reference design.
function anTodayIST() {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const d = new Date(Date.now() + IST_OFFSET_MS);
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth()+1).padStart(2,'0') + '-' + String(d.getUTCDate()).padStart(2,'0');
}
function anBuildDays() {
  const days = [];
  const base = new Date(anTodayIST() + 'T00:00:00Z');
  for (let i = 6; i >= 0; i--) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const label = d.getUTCDate() + '-' + d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    days.push({ iso, label });
  }
  return days;
}

let anSelectedDate = anTodayIST();
function anRenderDayTabs() {
  const days = anBuildDays();
  document.getElementById('anDayTabs').innerHTML = days.map((d) =>
    '<button class="an-day-tab' + (d.iso === anSelectedDate ? ' active' : '') + '" data-date="' + d.iso + '">' + d.label + '</button>'
  ).join('');
  document.querySelectorAll('.an-day-tab').forEach((btn) => {
    btn.onclick = () => {
      anSelectedDate = btn.dataset.date;
      anRenderDayTabs();
      loadAnalytics(anSelectedDate);
      if (typeof window.loadReactivation === 'function') window.loadReactivation(anSelectedDate);
      if (typeof window.loadVipUpgrade === 'function') window.loadVipUpgrade(anSelectedDate);
      if (typeof window.loadRetention === 'function') window.loadRetention(anSelectedDate);
    };
  });
}

anRenderDayTabs();
window.loadAnalytics = loadAnalytics;
loadAnalytics(anSelectedDate);
</script>
`;
