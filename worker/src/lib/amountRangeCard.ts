// Reusable "Amount Range" summary card — Today/Yesterday toggle, a
// 4-bucket (<10,000 / 10,000-19,999 / 20,000-49,999 / 50,000+) table of
// order count + total amount, an Excel export button, and a Total row.
// Added as the last section on Home (deposit + withdrawal), Action
// Center, Analytics, Performance, and Platform Analysis — same card
// shape everywhere, only the title/icon/data source differ per
// instance. Backed by GET /api/dashboard/amount-range.
export const AMOUNT_RANGE_CARD_STYLES = `
<style>
  .ar-card { background: #fff; border-radius: 14px; padding: 20px 22px; box-shadow: 0 1px 2px rgba(16,24,40,0.04), 0 2px 8px rgba(16,24,40,0.06); border-left: 4px solid #4f46e5; margin-bottom: 22px; }
  .ar-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
  .ar-title-row { display: flex; align-items: center; gap: 10px; }
  .ar-icon-badge { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 50%; font-size: 15px; background: #e0e7ff; flex-shrink: 0; }
  .ar-title { font-weight: 700; font-size: 14px; color: #1f2430; }
  .ar-excel-btn { background: #16a34a; color: #fff; border: none; padding: 8px 16px; border-radius: 20px; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: background 0.15s ease, transform 0.1s ease; }
  .ar-excel-btn:hover { background: #15803d; }
  .ar-excel-btn:active { transform: scale(0.97); }
  .ar-tabs { display: flex; gap: 8px; margin-bottom: 16px; }
  .ar-tab { border: 1px solid #ddd; background: #fff; color: #333; border-radius: 20px; padding: 8px 18px; font-size: 13px; font-weight: 600; cursor: pointer; transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease; }
  .ar-tab:hover { background: #f5f5f7; }
  .ar-tab.active { background: #4f46e5; border-color: #4f46e5; color: #fff; }
  table.ar-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  table.ar-table th { text-align: left; padding: 9px 8px; background: #f8f9fb; color: #6b7280; font-size: 10px; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; }
  table.ar-table th:not(:first-child), table.ar-table td:not(:first-child) { text-align: right; }
  table.ar-table th:first-child { border-radius: 8px 0 0 8px; }
  table.ar-table th:last-child { border-radius: 0 8px 8px 0; }
  table.ar-table td { padding: 9px 8px; border-top: 1px solid #f1f2f5; color: #374151; }
  table.ar-table tr:hover td { background: #fafbfc; }
  table.ar-table tr.ar-total-row td { font-weight: 700; color: #1f2430; border-top: 2px solid #e5e7eb; }
  .ar-status { font-size: 12.5px; color: #9ca3af; margin-top: 6px; }
</style>
`;

// opts.icon is a single emoji (kept consistent with every other card's
// icon badge in this codebase). opts.instanceId must be unique per card
// on a page (e.g. "arHome", "arWithdraw") since several of these can
// appear on one page (Home has two).
export function renderAmountRangeCard(opts: {
  instanceId: string;
  title: string;
  icon: string;
  source: "deposit" | "withdrawal";
  cohortScope?: "vip-near-upgrade";
  showTierTabs?: boolean;
}): string {
  const id = opts.instanceId;
  const cohortScope = opts.cohortScope ?? "all";
  const showTierTabs = opts.showTierTabs ?? false;
  return `
<div class="ar-card" id="${id}Card">
  <div class="ar-head">
    <div class="ar-title-row">
      <span class="ar-icon-badge">${opts.icon}</span>
      <span class="ar-title">${opts.title}</span>
    </div>
    <button class="ar-excel-btn" id="${id}ExcelBtn">📥 Excel</button>
  </div>
  <div class="ar-tabs" id="${id}DateTabs">
    <button class="ar-tab active" data-date-mode="today">Today</button>
    <button class="ar-tab" data-date-mode="yesterday">Yesterday</button>
  </div>
  ${showTierTabs ? `
  <div class="ar-tabs" id="${id}TierTabs">
    <button class="ar-tab active" data-tier="low">Low VIP</button>
    <button class="ar-tab" data-tier="high">High VIP</button>
  </div>` : ""}
  <table class="ar-table" id="${id}Table">
    <thead><tr><th>Amount Range</th><th>Total Orders</th><th>Total Amount</th></tr></thead>
    <tbody><tr><td colspan="3">Loading...</td></tr></tbody>
  </table>
  <div class="ar-status" id="${id}Status"></div>
</div>
<script>
(function () {
  var state = { dateMode: 'today', tier: 'low' };
  function fmtNum(n) { return Number(n || 0).toLocaleString('en-IN'); }
  function fmtInr(n) { return '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }); }
  function todayIST() {
    var IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    var d = new Date(Date.now() + IST_OFFSET_MS);
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth()+1).padStart(2,'0') + '-' + String(d.getUTCDate()).padStart(2,'0');
  }
  function resolveDate() {
    if (state.dateMode === 'today') return todayIST();
    var d = new Date(todayIST() + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  async function load() {
    var statusEl = document.getElementById('${id}Status');
    statusEl.textContent = 'Loading...';
    try {
      var params = new URLSearchParams({ source: '${opts.source}', date: resolveDate(), scope: '${cohortScope}' });
      ${showTierTabs ? "params.set('tier', state.tier);" : ""}
      var res = await fetch('/api/dashboard/amount-range?' + params.toString());
      var d = await res.json();
      if (!res.ok) throw new Error(d.error || res.statusText);
      var body = d.ranges.map(function (r) {
        return '<tr><td>' + r.range + '</td><td>' + fmtNum(r.totalOrders) + '</td><td>' + fmtInr(r.totalAmount) + '</td></tr>';
      }).join('');
      body += '<tr class="ar-total-row"><td>Total</td><td>' + fmtNum(d.total.totalOrders) + '</td><td>' + fmtInr(d.total.totalAmount) + '</td></tr>';
      document.querySelector('#${id}Table tbody').innerHTML = body;
      statusEl.textContent = 'Updated ' + new Date().toLocaleTimeString() + ' — showing ' + d.date;
    } catch (e) {
      statusEl.textContent = 'Error: ' + e.message;
    }
  }
  document.querySelectorAll('#${id}DateTabs .ar-tab').forEach(function (btn) {
    btn.onclick = function () {
      state.dateMode = btn.dataset.dateMode;
      document.querySelectorAll('#${id}DateTabs .ar-tab').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      load();
    };
  });
  ${showTierTabs ? `
  document.querySelectorAll('#${id}TierTabs .ar-tab').forEach(function (btn) {
    btn.onclick = function () {
      state.tier = btn.dataset.tier;
      document.querySelectorAll('#${id}TierTabs .ar-tab').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      load();
    };
  });` : ""}
  document.getElementById('${id}ExcelBtn').onclick = function () {
    var rows = [...document.querySelectorAll('#${id}Table tr')];
    var csv = rows.map(function (row) {
      return [...row.children].map(function (c) { return '"' + c.textContent.trim().replace(/"/g,'""') + '"'; }).join(',');
    }).join('\\n');
    var blob = new Blob([csv], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '${id}-amount-range.csv';
    a.click();
  };
  load();
})();
</script>
`;
}

// One instance per page section, each wrapped with its own styles block
// (matches the existing per-content-file <style> convention used
// throughout this codebase) so each card constant is a fully
// self-contained drop-in appended as that page's last section.
export const HOME_DEPOSIT_AMOUNT_RANGE_CARD = AMOUNT_RANGE_CARD_STYLES + renderAmountRangeCard({
  instanceId: "arHomeDeposit", title: "Deposit Amount Range", icon: "💰", source: "deposit",
});
export const HOME_WITHDRAWAL_AMOUNT_RANGE_CARD = renderAmountRangeCard({
  instanceId: "arHomeWithdrawal", title: "Withdrawal Amount Range", icon: "🏦", source: "withdrawal",
});
export const ACTION_CENTER_AMOUNT_RANGE_CARD = AMOUNT_RANGE_CARD_STYLES + renderAmountRangeCard({
  instanceId: "arActionCenter", title: "Deposit Amount Range — VIP Near Upgrade", icon: "💰", source: "deposit",
  cohortScope: "vip-near-upgrade", showTierTabs: true,
});
export const ANALYTICS_AMOUNT_RANGE_CARD = AMOUNT_RANGE_CARD_STYLES + renderAmountRangeCard({
  instanceId: "arAnalytics", title: "Deposit Amount Range", icon: "💰", source: "deposit",
});
export const PERFORMANCE_AMOUNT_RANGE_CARD = AMOUNT_RANGE_CARD_STYLES + renderAmountRangeCard({
  instanceId: "arPerformance", title: "Deposit Amount Range", icon: "💰", source: "deposit",
});
export const PLATFORM_ANALYSIS_AMOUNT_RANGE_CARD = AMOUNT_RANGE_CARD_STYLES + renderAmountRangeCard({
  instanceId: "arPlatformAnalysis", title: "Deposit Amount Range", icon: "💰", source: "deposit",
});
