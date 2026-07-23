// Platform Analysis page, last section: Game Activity. Four cards, two
// grids. Grid 1 — Top Games (per user+game wagering total) and Highest
// Single Bet (per user's single largest wallet_details row) — both
// scoped to "new" users (first-ever deposit within the last 33 days,
// same is_first_deposit cohort as New vs Old User Analysis) and both
// reading real-gameplay wallet_details rows only (game_name + source_name
// populated — the inverse of the Bonus Claim Report's bonus-row filter).
// No bet/win type column exists in this data (see index.ts endpoint
// comment), so "Bet Amount" here is total wagering activity, not stakes
// net of payouts — agreed as the honest proxy available 2026-07-22.
// Grid 2 — High/Low Roller Active: VIP-tiered lifetime-engagement
// leaderboards (eligibility criteria + card shape modeled on a reference
// design; thresholds recalibrated to this project's own data since the
// reference's absolute numbers produced zero eligible users here — see
// the roller-active endpoint comment in index.ts for the exact numbers
// and how they were derived). Data from
// /api/dashboard/platform-analysis/game-activity/{top-games,highest-bet,
// roller-active}. Styled to match the existing pa-/wp- card conventions
// used elsewhere on this page (pill period tabs, icon-badge panel head,
// sticky-header table, Prev/Next pager, paginated CSV export).
export const GAME_ACTIVITY_CONTENT_HTML = `
<style>
  .ga-header { display: flex; align-items: center; justify-content: space-between; margin: 28px 0 14px; flex-wrap: wrap; gap: 10px; }
  .ga-title { font-weight: 700; font-size: 15px; letter-spacing: 0.03em; text-transform: uppercase; }
  .ga-tag { background: #fee2e2; color: #b91c1c; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; padding: 4px 10px; border-radius: 6px; }
  .ga-period-tabs { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
  .ga-period-tabs button { border: 1px solid #ddd; background: #fff; color: #333; border-radius: 999px; padding: 8px 18px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .ga-period-tabs button.active { background: #4338ca; border-color: #4338ca; color: #fff; }
  .ga-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: start; }
  @media (max-width: 1000px) { .ga-grid { grid-template-columns: 1fr; } }
  .ga-panel { background: #fff; border-radius: 0 10px 10px 0; padding: 18px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  .ga-panel.indigo { border-left: 4px solid #6366f1; }
  .ga-panel.amber { border-left: 4px solid #f59e0b; }
  .ga-panel.green { border-left: 4px solid #16a34a; }
  .ga-panel.red { border-left: 4px solid #ef4444; }
  .ga-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 6px; flex-wrap: wrap; }
  .ga-panel-title-group { display: flex; align-items: center; gap: 10px; }
  .ga-icon-badge { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 999px; font-size: 15px; flex-shrink: 0; }
  .ga-icon-badge.indigo { background: #eef2ff; }
  .ga-icon-badge.amber { background: #fef3c7; }
  .ga-icon-badge.green { background: #dcfce7; }
  .ga-icon-badge.red { background: #fee2e2; }
  .ga-panel-title { font-weight: 700; font-size: 14px; }
  .ga-count-badge { background: #eef2ff; color: #4338ca; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 999px; white-space: nowrap; margin-left: 8px; }
  .ga-excel-btn { background: #16a34a; color: #fff; border: none; padding: 7px 14px; border-radius: 16px; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; }
  .ga-panel-sub { font-size: 12px; color: #888; font-style: italic; margin: 6px 0 14px; line-height: 1.5; }
  .ga-table-wrap { max-height: 460px; overflow-y: auto; }
  table.ga-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  table.ga-table th { text-align: right; padding: 8px 6px; background: #fafafa; color: #666; font-size: 10px; text-transform: uppercase; position: sticky; top: 0; }
  table.ga-table th:first-child, table.ga-table th:nth-child(2), table.ga-table th:nth-child(3), table.ga-table th:nth-child(4),
  table.ga-table td:first-child, table.ga-table td:nth-child(2), table.ga-table td:nth-child(3), table.ga-table td:nth-child(4) { text-align: left; }
  table.ga-table td { padding: 8px 6px; text-align: right; border-top: 1px solid #f0f0f0; }
  .ga-today { background: #dcfce7; color: #15803d; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 10px; }
  .ga-pager { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; font-size: 12px; color: #666; }
  .ga-pager button { border: 1px solid #ddd; background: #fff; border-radius: 16px; padding: 5px 14px; font-size: 12px; cursor: pointer; }
  .ga-pager button:disabled { opacity: 0.4; cursor: default; }
</style>

<div class="ga-header">
  <div class="ga-title">Game Activity</div>
  <div class="ga-tag">PLATFORM</div>
</div>

<div class="ga-period-tabs" id="gaPeriodTabs">
  <button class="active" data-period="15days">Last 15 Days</button>
  <button data-period="day">Day</button>
  <button data-period="week">Week</button>
  <button data-period="month">Month</button>
</div>

<div class="ga-grid">
  <div class="ga-panel indigo">
    <div class="ga-panel-head">
      <div class="ga-panel-title-group">
        <div class="ga-icon-badge indigo">🎮</div>
        <div class="ga-panel-title">Top Games - New Users<span class="ga-count-badge" id="gaTopGamesCount">—</span></div>
      </div>
      <button class="ga-excel-btn" id="gaTopGamesExport">📥 Excel</button>
    </div>
    <div class="ga-panel-sub">New = users whose first-ever deposit landed within the last 33 days. Bet-only (excludes win payouts), total wagered per user per game, highest first.</div>
    <div class="ga-table-wrap">
      <table class="ga-table" id="gaTopGamesTable">
        <thead><tr><th>User ID</th><th>VIP</th><th>Agent</th><th>Game Name</th><th>Total Bet Amount</th><th>Last Active</th></tr></thead>
        <tbody><tr><td colspan="6">Loading...</td></tr></tbody>
      </table>
    </div>
    <div class="ga-pager">
      <span id="gaTopGamesPageLabel">Page 1 of 1</span>
      <span><button id="gaTopGamesPrev">← Prev</button> <button id="gaTopGamesNext">Next →</button></span>
    </div>
  </div>

  <div class="ga-panel amber">
    <div class="ga-panel-head">
      <div class="ga-panel-title-group">
        <div class="ga-icon-badge amber">💰</div>
        <div class="ga-panel-title">Highest Single Bet - New Users<span class="ga-count-badge" id="gaHighestBetCount">—</span></div>
      </div>
      <button class="ga-excel-btn" id="gaHighestBetExport">📥 Excel</button>
    </div>
    <div class="ga-panel-sub">New = users whose first-ever deposit landed within the last 33 days. Each user's single largest bet transaction and which game it was on.</div>
    <div class="ga-table-wrap">
      <table class="ga-table" id="gaHighestBetTable">
        <thead><tr><th>User ID</th><th>VIP</th><th>Agent</th><th>Highest Bet</th><th>Game Name</th><th>Last Active</th></tr></thead>
        <tbody><tr><td colspan="6">Loading...</td></tr></tbody>
      </table>
    </div>
    <div class="ga-pager">
      <span id="gaHighestBetPageLabel">Page 1 of 1</span>
      <span><button id="gaHighestBetPrev">← Prev</button> <button id="gaHighestBetNext">Next →</button></span>
    </div>
  </div>
</div>

<div class="ga-grid" style="margin-top:20px;">
  <div class="ga-panel green">
    <div class="ga-panel-head">
      <div class="ga-panel-title-group">
        <div class="ga-icon-badge green">💎</div>
        <div class="ga-panel-title">High Roller Active<span class="ga-count-badge" id="gaHighRollerCount">—</span></div>
      </div>
      <button class="ga-excel-btn" id="gaHighRollerExport">📥 Excel</button>
    </div>
    <div class="ga-panel-sub">VIP 7+, avg lifetime deposit ₹500+, 20+ lifetime deposits, ₹12,000+ lifetime total deposit, avg bet size (selected period) over ₹40, active within 15 days.</div>
    <div class="ga-table-wrap">
      <table class="ga-table" id="gaHighRollerTable">
        <thead><tr><th>User ID</th><th>VIP</th><th>Agent</th><th>Total Deposit</th><th>Wallet Balance</th><th>Top Game Played</th></tr></thead>
        <tbody><tr><td colspan="6">Loading...</td></tr></tbody>
      </table>
    </div>
    <div class="ga-pager">
      <span id="gaHighRollerPageLabel">Page 1 of 1</span>
      <span><button id="gaHighRollerPrev">← Prev</button> <button id="gaHighRollerNext">Next →</button></span>
    </div>
  </div>

  <div class="ga-panel red">
    <div class="ga-panel-head">
      <div class="ga-panel-title-group">
        <div class="ga-icon-badge red">🪙</div>
        <div class="ga-panel-title">Low Roller Active<span class="ga-count-badge" id="gaLowRollerCount">—</span></div>
      </div>
      <button class="ga-excel-btn" id="gaLowRollerExport">📥 Excel</button>
    </div>
    <div class="ga-panel-sub">VIP 2-6, avg lifetime deposit under ₹500, under 20 lifetime deposits, under ₹12,000 lifetime total deposit, avg bet size (selected period) under ₹40, active within 10 days.</div>
    <div class="ga-table-wrap">
      <table class="ga-table" id="gaLowRollerTable">
        <thead><tr><th>User ID</th><th>VIP</th><th>Agent</th><th>Total Deposit</th><th>Wallet Balance</th><th>Top Game Played</th></tr></thead>
        <tbody><tr><td colspan="6">Loading...</td></tr></tbody>
      </table>
    </div>
    <div class="ga-pager">
      <span id="gaLowRollerPageLabel">Page 1 of 1</span>
      <span><button id="gaLowRollerPrev">← Prev</button> <button id="gaLowRollerNext">Next →</button></span>
    </div>
  </div>
</div>

<div id="gaStatus" style="font-size:13px;color:#888;margin-top:8px;"></div>

<script>
const gaState = { period: '15days', topGames: { page: 1 }, highestBet: { page: 1 }, highRoller: { page: 1 }, lowRoller: { page: 1 } };

function gaFmtInr(n) { return '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN'); }
function gaFmtLastActive(iso) {
  if (!iso) return '—';
  const then = new Date(iso.replace(' ', 'T') + (iso.includes('Z') ? '' : 'Z'));
  const days = Math.floor((Date.now() - then.getTime()) / 86400000);
  if (days <= 0) return '<span class="ga-today">Today</span>';
  return days + 'd ago';
}
function gaCsvField(v) { return '"' + String(v ?? '').replace(/"/g, '""') + '"'; }
function gaRowsToCsv(header, rows, mapRow) {
  const lines = [header.map(gaCsvField).join(',')];
  rows.forEach((r) => { lines.push(mapRow(r).map(gaCsvField).join(',')); });
  return lines.join('\\n');
}
async function gaFetchAllPages(urlBase) {
  const sep = urlBase.includes('?') ? '&' : '?';
  const first = await fetch(urlBase + sep + 'page=1').then((r) => r.json());
  let rows = first.rows || [];
  for (let page = 2; page <= (first.totalPages || 1); page++) {
    const d = await fetch(urlBase + sep + 'page=' + page).then((r) => r.json());
    rows = rows.concat(d.rows || []);
  }
  return rows;
}
async function gaExportPaginated(urlBase, filename, header, mapRow, btn) {
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Exporting…';
  try {
    const rows = await gaFetchAllPages(urlBase);
    const blob = new Blob([gaRowsToCsv(header, rows, mapRow)], { type: 'text/csv' });
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

async function gaLoadTopGames() {
  const statusEl = document.getElementById('gaStatus');
  try {
    const s = gaState.topGames;
    const res = await fetch('/api/dashboard/platform-analysis/game-activity/top-games?period=' + gaState.period + '&page=' + s.page);
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || res.statusText);

    document.querySelector('#gaTopGamesTable tbody').innerHTML = (d.rows || []).map((r) =>
      '<tr><td>' + r.user_id + '</td><td>' + r.vip + '</td><td>' + r.agent + '</td><td>' + r.game_name +
      '</td><td>' + gaFmtInr(r.total_bet) + '</td><td>' + gaFmtLastActive(r.last_active) + '</td></tr>'
    ).join('') || '<tr><td colspan="6">No data</td></tr>';

    document.getElementById('gaTopGamesCount').textContent = Number(d.total || 0).toLocaleString('en-IN');
    document.getElementById('gaTopGamesPageLabel').textContent = 'Page ' + d.page + ' of ' + d.totalPages;
    document.getElementById('gaTopGamesPrev').disabled = d.page <= 1;
    document.getElementById('gaTopGamesNext').disabled = d.page >= d.totalPages;
    statusEl.textContent = 'Updated ' + new Date().toLocaleTimeString();
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
  }
}

async function gaLoadHighestBet() {
  const statusEl = document.getElementById('gaStatus');
  try {
    const s = gaState.highestBet;
    const res = await fetch('/api/dashboard/platform-analysis/game-activity/highest-bet?period=' + gaState.period + '&page=' + s.page);
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || res.statusText);

    document.querySelector('#gaHighestBetTable tbody').innerHTML = (d.rows || []).map((r) =>
      '<tr><td>' + r.user_id + '</td><td>' + r.vip + '</td><td>' + r.agent + '</td><td>' + gaFmtInr(r.highest_bet) +
      '</td><td>' + r.game_name + '</td><td>' + gaFmtLastActive(r.last_active) + '</td></tr>'
    ).join('') || '<tr><td colspan="6">No data</td></tr>';

    document.getElementById('gaHighestBetCount').textContent = Number(d.total || 0).toLocaleString('en-IN');
    document.getElementById('gaHighestBetPageLabel').textContent = 'Page ' + d.page + ' of ' + d.totalPages;
    document.getElementById('gaHighestBetPrev').disabled = d.page <= 1;
    document.getElementById('gaHighestBetNext').disabled = d.page >= d.totalPages;
    statusEl.textContent = 'Updated ' + new Date().toLocaleTimeString();
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
  }
}

async function gaLoadRoller(tier) {
  const statusEl = document.getElementById('gaStatus');
  const prefix = tier === 'high' ? 'gaHighRoller' : 'gaLowRoller';
  try {
    const s = tier === 'high' ? gaState.highRoller : gaState.lowRoller;
    const res = await fetch('/api/dashboard/platform-analysis/game-activity/roller-active?tier=' + tier + '&period=' + gaState.period + '&page=' + s.page);
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || res.statusText);

    document.querySelector('#' + prefix + 'Table tbody').innerHTML = (d.rows || []).map((r) =>
      '<tr><td>' + r.user_id + '</td><td>' + r.vip + '</td><td>' + r.agent + '</td><td>' + gaFmtInr(r.total_deposit) +
      '</td><td>' + gaFmtInr(r.user_balance) + '</td><td>' + r.top_game_played + '</td></tr>'
    ).join('') || '<tr><td colspan="6">No data</td></tr>';

    document.getElementById(prefix + 'Count').textContent = Number(d.total || 0).toLocaleString('en-IN');
    document.getElementById(prefix + 'PageLabel').textContent = 'Page ' + d.page + ' of ' + d.totalPages;
    document.getElementById(prefix + 'Prev').disabled = d.page <= 1;
    document.getElementById(prefix + 'Next').disabled = d.page >= d.totalPages;
    statusEl.textContent = 'Updated ' + new Date().toLocaleTimeString();
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
  }
}

function gaLoadAll() {
  gaLoadTopGames();
  gaLoadHighestBet();
  gaLoadRoller('high');
  gaLoadRoller('low');
}

document.querySelectorAll('#gaPeriodTabs button').forEach((btn) => {
  btn.onclick = () => {
    gaState.period = btn.dataset.period;
    gaState.topGames.page = 1;
    gaState.highestBet.page = 1;
    gaState.highRoller.page = 1;
    gaState.lowRoller.page = 1;
    document.querySelectorAll('#gaPeriodTabs button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    gaLoadAll();
  };
});

document.getElementById('gaTopGamesPrev').onclick = () => { if (gaState.topGames.page > 1) { gaState.topGames.page--; gaLoadTopGames(); } };
document.getElementById('gaTopGamesNext').onclick = () => { gaState.topGames.page++; gaLoadTopGames(); };
document.getElementById('gaHighestBetPrev').onclick = () => { if (gaState.highestBet.page > 1) { gaState.highestBet.page--; gaLoadHighestBet(); } };
document.getElementById('gaHighestBetNext').onclick = () => { gaState.highestBet.page++; gaLoadHighestBet(); };
document.getElementById('gaHighRollerPrev').onclick = () => { if (gaState.highRoller.page > 1) { gaState.highRoller.page--; gaLoadRoller('high'); } };
document.getElementById('gaHighRollerNext').onclick = () => { gaState.highRoller.page++; gaLoadRoller('high'); };
document.getElementById('gaLowRollerPrev').onclick = () => { if (gaState.lowRoller.page > 1) { gaState.lowRoller.page--; gaLoadRoller('low'); } };
document.getElementById('gaLowRollerNext').onclick = () => { gaState.lowRoller.page++; gaLoadRoller('low'); };

document.getElementById('gaTopGamesExport').onclick = (e) => gaExportPaginated(
  '/api/dashboard/platform-analysis/game-activity/top-games?period=' + gaState.period,
  'top-games-new-users.csv',
  ['User ID', 'VIP', 'Agent', 'Game Name', 'Total Bet Amount', 'Last Active'],
  (r) => [r.user_id, r.vip, r.agent, r.game_name, r.total_bet, r.last_active],
  e.currentTarget
);
document.getElementById('gaHighestBetExport').onclick = (e) => gaExportPaginated(
  '/api/dashboard/platform-analysis/game-activity/highest-bet?period=' + gaState.period,
  'highest-single-bet-new-users.csv',
  ['User ID', 'VIP', 'Agent', 'Highest Bet', 'Game Name', 'Last Active'],
  (r) => [r.user_id, r.vip, r.agent, r.highest_bet, r.game_name, r.last_active],
  e.currentTarget
);
document.getElementById('gaHighRollerExport').onclick = (e) => gaExportPaginated(
  '/api/dashboard/platform-analysis/game-activity/roller-active?tier=high&period=' + gaState.period,
  'high-roller-active.csv',
  ['User ID', 'VIP', 'Agent', 'Total Deposit', 'Wallet Balance', 'Top Game Played'],
  (r) => [r.user_id, r.vip, r.agent, r.total_deposit, r.user_balance, r.top_game_played],
  e.currentTarget
);
document.getElementById('gaLowRollerExport').onclick = (e) => gaExportPaginated(
  '/api/dashboard/platform-analysis/game-activity/roller-active?tier=low&period=' + gaState.period,
  'low-roller-active.csv',
  ['User ID', 'VIP', 'Agent', 'Total Deposit', 'Wallet Balance', 'Top Game Played'],
  (r) => [r.user_id, r.vip, r.agent, r.total_deposit, r.user_balance, r.top_game_played],
  e.currentTarget
);

gaLoadAll();
</script>
`;
