// Platform Analysis section, last on the page: Region vs VIP Depositor
// Matrix. Live data from
// /api/dashboard/platform-analysis/region-vip-matrix (see that endpoint's
// comment in index.ts for the VIP-bracket-capped-at-10 definition and the
// day/week/month/multi date modes). Layout/styling matches the provided
// reference design; only the data source changed from the original static
// mock. Originally placed on the Home page, moved here per follow-up
// request.
export const REGION_VIP_MATRIX_CONTENT_HTML = `
<style>
  .rv-header { display: flex; align-items: center; justify-content: space-between; margin: 24px 0 14px; }
  .rv-title { font-weight: 700; font-size: 15px; letter-spacing: 0.03em; text-transform: uppercase; }
  .rv-tag { background: #dcfce7; color: #15803d; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; padding: 4px 10px; border-radius: 6px; }
  .rv-panel { background: #fff; border-left: 4px solid #10b981; border-radius: 0 10px 10px 0; padding: 18px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); margin-bottom: 20px; }
  .rv-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
  .rv-panel-title-group { display: flex; align-items: center; gap: 10px; }
  .rv-panel-icon { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 999px; background: #d1fae5; font-size: 15px; flex-shrink: 0; }
  .rv-panel-title { font-weight: 700; font-size: 14px; }
  .rv-excel-btn { background: #16a34a; color: #fff; border: none; padding: 7px 14px; border-radius: 16px; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; }
  .rv-panel-sub { font-size: 12px; color: #888; margin: 6px 0 16px; line-height: 1.5; }

  .rv-controls { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
  .rv-filter-btn { border: 1px solid #ddd; background: #fff; color: #333; border-radius: 999px; padding: 8px 16px; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; }
  .rv-filter-btn.active { background: #4338ca; border-color: #4338ca; color: #fff; }
  .rv-date-select { border: 1px solid #ddd; background: #fff; border-radius: 8px; padding: 8px 12px; font-size: 12px; cursor: pointer; }

  .rv-table-wrap { max-height: 420px; overflow: auto; border: 1px solid #f0f0f0; border-radius: 8px; }
  table.rv-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  table.rv-table th { text-align: right; padding: 8px 12px; background: #fafafa; color: #666; font-size: 10px; text-transform: uppercase; position: sticky; top: 0; z-index: 1; white-space: nowrap; }
  table.rv-table th:first-child { text-align: left; position: sticky; left: 0; z-index: 2; background: #fafafa; }
  table.rv-table td { padding: 8px 12px; text-align: right; border-top: 1px solid #f0f0f0; white-space: nowrap; }
  table.rv-table td:first-child { text-align: left; font-weight: 600; position: sticky; left: 0; background: #fff; }
  table.rv-table tbody tr:nth-child(even) td { background: #fafafa; }
  table.rv-table tbody tr:nth-child(even) td:first-child { background: #fafafa; }
  table.rv-table td:last-child, table.rv-table th:last-child { font-weight: 700; }
</style>

<div class="rv-header">
  <div class="rv-title">Region vs VIP Depositor Matrix</div>
  <div class="rv-tag">PLATFORM</div>
</div>

<div class="rv-panel">
  <div class="rv-panel-head">
    <div class="rv-panel-title-group">
      <div class="rv-panel-icon">🗺️</div>
      <div class="rv-panel-title">Region vs VIP Depositor Matrix</div>
    </div>
    <button class="rv-excel-btn" id="rvExportBtn">📥 Excel</button>
  </div>
  <div class="rv-panel-sub">
    Rows = Region, columns = VIP level, each cell = how many DISTINCT users in that Region+VIP combination made at least one COMPLETE deposit within the selected range. A user active on multiple selected days is counted once, not once per day.
  </div>

  <div class="rv-controls">
    <button class="rv-filter-btn active" id="rvFilterDay" data-mode="day">Day</button>
    <button class="rv-filter-btn" id="rvFilterMulti" data-mode="multi">Multi-select Dates</button>
    <button class="rv-filter-btn" id="rvFilterWeek" data-mode="week">Week (Mon-Sun)</button>
    <button class="rv-filter-btn" id="rvFilterMonth" data-mode="month">Month</button>
    <select class="rv-date-select" id="rvDateSelect"></select>
    <select class="rv-date-select" id="rvMultiSelect" multiple size="4" style="display:none; min-width:110px;"></select>
  </div>

  <div class="rv-table-wrap">
    <table class="rv-table" id="rvTable">
      <thead>
        <tr>
          <th>Region</th>
          <th>VIP 1</th><th>VIP 2</th><th>VIP 3</th><th>VIP 4</th><th>VIP 5</th>
          <th>VIP 6</th><th>VIP 7</th><th>VIP 8</th><th>VIP 9</th><th>VIP 10</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody id="rvTableBody"><tr><td colspan="12">Loading...</td></tr></tbody>
    </table>
  </div>
</div>

<div id="rvStatus" style="font-size:13px;color:#888;"></div>

<script>
const rvState = { mode: 'day' };

function rvAddDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function rvFmtDateLabel(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const monthName = new Date(Date.UTC(y, m - 1, d)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  return d + '-' + monthName;
}

// Populate both date pickers with the last 14 days once — the single
// <select> drives day/week/month (any date in the target week/month
// works as the reference), the multi <select> drives multi-select mode.
(function rvPopulateDates() {
  const today = new Date().toISOString().slice(0, 10);
  const dates = Array.from({ length: 14 }, (_, i) => rvAddDays(today, -i));
  const single = document.getElementById('rvDateSelect');
  const multi = document.getElementById('rvMultiSelect');
  single.innerHTML = dates.map((d) => '<option value="' + d + '">' + rvFmtDateLabel(d) + '</option>').join('');
  multi.innerHTML = dates.map((d) => '<option value="' + d + '">' + rvFmtDateLabel(d) + '</option>').join('');
  multi.options[0].selected = true;
})();

function rvTableToCsv(tableEl) {
  const rows = [...tableEl.querySelectorAll('tr')];
  return rows.map((row) => [...row.children].map((c) => '"' + c.textContent.trim().replace(/"/g,'""') + '"').join(',')).join('\\n');
}

async function rvLoad() {
  const statusEl = document.getElementById('rvStatus');
  try {
    const params = new URLSearchParams({ mode: rvState.mode });
    if (rvState.mode === 'multi') {
      const selected = [...document.getElementById('rvMultiSelect').selectedOptions].map((o) => o.value);
      params.set('dates', (selected.length > 0 ? selected : [document.getElementById('rvDateSelect').value]).join(','));
    } else {
      params.set('date', document.getElementById('rvDateSelect').value);
    }

    const res = await fetch('/api/dashboard/platform-analysis/region-vip-matrix?' + params.toString());
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || res.statusText);

    document.getElementById('rvTableBody').innerHTML = (d.regions || []).map((r) =>
      '<tr><td>' + r.region + '</td>' + r.levels.map((v) => '<td>' + v + '</td>').join('') + '<td>' + r.total + '</td></tr>'
    ).join('') || '<tr><td colspan="12">No data</td></tr>';

    const rangeText = d.range.start === d.range.end ? rvFmtDateLabel(d.range.start) : rvFmtDateLabel(d.range.start) + ' to ' + rvFmtDateLabel(d.range.end);
    statusEl.textContent = 'Updated ' + new Date().toLocaleTimeString() + ' — showing ' + rangeText;
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
  }
}

['rvFilterDay', 'rvFilterMulti', 'rvFilterWeek', 'rvFilterMonth'].forEach((id) => {
  document.getElementById(id).onclick = () => {
    ['rvFilterDay', 'rvFilterMulti', 'rvFilterWeek', 'rvFilterMonth'].forEach((otherId) => {
      document.getElementById(otherId).classList.toggle('active', otherId === id);
    });
    const mode = document.getElementById(id).dataset.mode;
    rvState.mode = mode;
    document.getElementById('rvDateSelect').style.display = mode === 'multi' ? 'none' : '';
    document.getElementById('rvMultiSelect').style.display = mode === 'multi' ? '' : 'none';
    rvLoad();
  };
});
document.getElementById('rvDateSelect').onchange = rvLoad;
document.getElementById('rvMultiSelect').onchange = rvLoad;

document.getElementById('rvExportBtn').onclick = () => {
  const blob = new Blob([rvTableToCsv(document.getElementById('rvTable'))], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'region-vip-depositor-matrix.csv';
  a.click();
};

rvLoad();
</script>
`;
