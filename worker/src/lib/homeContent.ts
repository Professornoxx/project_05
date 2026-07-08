// Dashboard Home page — section 1: daily KPI overview, matching the
// provided reference design (gradient top bar, day picker, 4+3 KPI cards,
// Net Flow row). Data comes from /api/dashboard/home-stats.
export const HOME_CONTENT_HTML = `
<style>
  .gradient-bar { height: 6px; background: linear-gradient(90deg, #6d28d9, #7c3aed, #a855f7); border-radius: 6px; margin: -8px 0 20px; }
  .controls-row { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
  .day-controls { display: flex; align-items: center; gap: 10px; }
  .day-label { font-size: 12px; color: #888; font-weight: 600; letter-spacing: 0.04em; }
  .day-today { color: #ea580c; font-weight: 700; font-size: 16px; }
  .day-controls input[type=date] { padding: 8px 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; }
  .reset-btn { background: #4f46e5; color: #fff; border: none; padding: 9px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px; }
  .totals-line { font-size: 14px; color: #444; }
  .totals-line b { margin-left: 4px; }
  .kpi-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 20px; }
  .kpi-card { background: #fff; border-radius: 10px; padding: 20px; border-left: 5px solid #ccc; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
  .kpi-card .bar { width: 26px; height: 3px; margin-bottom: 10px; border-radius: 2px; }
  .kpi-card .value { font-size: 26px; font-weight: 800; margin-bottom: 4px; }
  .kpi-card .label { font-size: 12px; font-weight: 700; letter-spacing: 0.04em; color: #444; }
  .kpi-card .sub { font-size: 12px; color: #888; margin-top: 4px; }
  .c-green { border-color: #10b981; } .c-green .bar { background: #10b981; } .c-green .value { color: #10b981; }
  .c-red { border-color: #dc2626; } .c-red .bar { background: #dc2626; } .c-red .value { color: #dc2626; }
  .c-orange { border-color: #f59e0b; } .c-orange .bar { background: #f59e0b; } .c-orange .value { color: #b45309; }
  .c-pink { border-color: #ec4899; } .c-pink .bar { background: #ec4899; } .c-pink .value { color: #ec4899; }
  .c-blue { border-color: #3b82f6; } .c-blue .bar { background: #3b82f6; } .c-blue .value { color: #2563eb; }
  .c-purple { border-color: #8b5cf6; } .c-purple .bar { background: #8b5cf6; } .c-purple .value { color: #7c3aed; }
  .net-flow { background: #fff; border-radius: 10px; padding: 14px 20px; display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 10px; }
  .net-flow .nf-label { font-size: 12px; font-weight: 700; color: #666; letter-spacing: 0.04em; }
  .net-flow .nf-values { font-size: 14px; color: #333; }
  .net-flow .nf-values b { margin-left: 4px; }
  .nf-negative { color: #dc2626; } .nf-positive { color: #10b981; }
  #homeStatus { font-size: 13px; color: #888; margin-top: 10px; }
</style>

<div class="gradient-bar"></div>

<div class="controls-row">
  <div class="day-controls">
    <span class="day-label">DAY</span>
    <span class="day-today" id="dayLabel">TODAY</span>
    <input type="date" id="dayPicker" />
    <button class="reset-btn" id="resetTodayBtn">Reset to Today</button>
  </div>
  <div class="totals-line">
    Total Users:<b id="totalUsers">—</b>
    &nbsp;&nbsp;Registered Active:<b id="registeredActive">—</b>
  </div>
</div>

<div class="kpi-row">
  <div class="kpi-card c-green"><div class="bar"></div><div class="value" id="totalDeposit">—</div><div class="label">TOTAL DEPOSIT</div><div class="sub">✓ Complete orders only</div></div>
  <div class="kpi-card c-red"><div class="bar"></div><div class="value" id="totalWithdraw">—</div><div class="label">TOTAL WITHDRAW</div><div class="sub">✓ In-Review + Processing + Complete</div></div>
  <div class="kpi-card c-orange"><div class="bar"></div><div class="value" id="depositOrders">—</div><div class="label">DEPOSIT ORDERS</div><div class="sub">✓ Complete order count for the day</div></div>
  <div class="kpi-card c-pink"><div class="bar"></div><div class="value" id="withdrawOrders">—</div><div class="label">WITHDRAW ORDERS</div><div class="sub">✓ In-Review + Processing + Complete count</div></div>
</div>

<div class="net-flow">
  <div class="nf-label">NET FLOW</div>
  <div class="nf-values">Difference:<b id="nfDifference">—</b> &nbsp;&nbsp;Withdraw/Deposit:<b id="nfRatio">—</b></div>
</div>

<div class="kpi-row">
  <div class="kpi-card c-blue"><div class="bar"></div><div class="value" id="depositUsers">—</div><div class="label">DEPOSIT USERS</div><div class="sub">✓ Unique users with complete deposits</div></div>
  <div class="kpi-card c-orange"><div class="bar"></div><div class="value" id="withdrawUsers">—</div><div class="label">WITHDRAW USERS</div><div class="sub">✓ Unique users with active withdrawals</div></div>
  <div class="kpi-card c-purple"><div class="bar"></div><div class="value" id="activeUsers">—</div><div class="label">ACTIVE USERS</div><div class="sub">✓ Unique users with deposit history, active via deposit/withdraw/bets</div></div>
</div>

<div id="homeStatus"></div>

<script>
function todayStr() {
  // IST, not the viewer's browser timezone — must match the server's
  // todayIST() default so "TODAY" always means the same calendar date
  // regardless of who's looking at the dashboard or from where.
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const d = new Date(Date.now() + IST_OFFSET_MS);
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth()+1).padStart(2,'0') + '-' + String(d.getUTCDate()).padStart(2,'0');
}
function fmtInr(n) {
  if (n === null || n === undefined) return '—';
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}
function fmtNum(n) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString('en-IN');
}

const picker = document.getElementById('dayPicker');
picker.value = todayStr();

async function loadStats(date) {
  const statusEl = document.getElementById('homeStatus');
  statusEl.textContent = 'Loading...';
  document.getElementById('dayLabel').textContent = date === todayStr() ? 'TODAY' : date;
  try {
    const res = await fetch('/api/dashboard/home-stats?date=' + date);
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || res.statusText);

    document.getElementById('totalUsers').textContent = fmtNum(d.totalUsers);
    document.getElementById('registeredActive').textContent = fmtNum(d.registeredActive);
    document.getElementById('totalDeposit').textContent = fmtInr(d.totalDeposit);
    document.getElementById('totalWithdraw').textContent = fmtInr(d.totalWithdraw);
    document.getElementById('depositOrders').textContent = fmtNum(d.depositOrders);
    document.getElementById('withdrawOrders').textContent = fmtNum(d.withdrawOrders);
    document.getElementById('depositUsers').textContent = fmtNum(d.depositUsers);
    document.getElementById('withdrawUsers').textContent = fmtNum(d.withdrawUsers);
    document.getElementById('activeUsers').textContent = fmtNum(d.activeUsers);

    const diff = d.totalDeposit - d.totalWithdraw;
    const diffEl = document.getElementById('nfDifference');
    diffEl.textContent = (diff >= 0 ? '+' : '-') + fmtInr(Math.abs(diff)).replace('₹','₹');
    diffEl.className = diff < 0 ? 'nf-negative' : 'nf-positive';

    const ratio = d.totalDeposit > 0 ? (d.totalWithdraw / d.totalDeposit * 100) : 0;
    document.getElementById('nfRatio').textContent = ratio.toFixed(1) + '%';

    statusEl.textContent = 'Updated ' + new Date().toLocaleTimeString();
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
  }
}

// Sections 2 (Deposit Analysis) and 3 (Withdraw Analysis) register their
// loaders here so the day picker drives all three sections at once instead
// of only section 1 — they each default to today server-side otherwise.
function reloadAllSections(date) {
  loadStats(date);
  if (typeof window.loadDepositAnalysis === 'function') window.loadDepositAnalysis(date);
  if (typeof window.loadWithdrawAnalysis === 'function') window.loadWithdrawAnalysis(date);
  if (typeof window.loadWithdrawalAnalysis === 'function') window.loadWithdrawalAnalysis(date);
}

document.getElementById('resetTodayBtn').onclick = () => {
  picker.value = todayStr();
  reloadAllSections(picker.value);
};
picker.onchange = () => reloadAllSections(picker.value);

reloadAllSections(picker.value);
</script>
`;
