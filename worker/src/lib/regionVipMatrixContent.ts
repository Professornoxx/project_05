// Dashboard (Home page) section, last on the page: Region vs VIP Depositor
// Matrix. UI-only per explicit instruction: static/mock data matching the
// provided reference design exactly (layout, spacing, colors, filters,
// scrollable table). No backend endpoint yet — wiring to real data is a
// deliberate follow-up, not done here.
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
    <button class="rv-filter-btn active" id="rvFilterDay">Day</button>
    <button class="rv-filter-btn" id="rvFilterMulti">Multi-select Dates</button>
    <button class="rv-filter-btn" id="rvFilterWeek">Week (Mon-Sun)</button>
    <button class="rv-filter-btn" id="rvFilterMonth">Month</button>
    <select class="rv-date-select" id="rvDateSelect">
      <option>21-July</option>
      <option>20-July</option>
      <option>19-July</option>
      <option>18-July</option>
      <option>17-July</option>
    </select>
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
      <tbody>
        <tr><td>Tamil Nadu</td><td>10</td><td>17</td><td>10</td><td>45</td><td>48</td><td>33</td><td>10</td><td>3</td><td>1</td><td>1</td><td>178</td></tr>
        <tr><td>Karnataka</td><td>25</td><td>8</td><td>4</td><td>17</td><td>14</td><td>4</td><td>3</td><td>0</td><td>0</td><td>0</td><td>75</td></tr>
        <tr><td>Unknown</td><td>27</td><td>13</td><td>3</td><td>4</td><td>3</td><td>1</td><td>0</td><td>1</td><td>0</td><td>0</td><td>52</td></tr>
        <tr><td>Maharashtra</td><td>7</td><td>7</td><td>3</td><td>13</td><td>5</td><td>7</td><td>4</td><td>1</td><td>2</td><td>0</td><td>49</td></tr>
        <tr><td>Uttar Pradesh</td><td>5</td><td>7</td><td>4</td><td>13</td><td>9</td><td>2</td><td>2</td><td>0</td><td>0</td><td>0</td><td>42</td></tr>
        <tr><td>Kerala</td><td>2</td><td>2</td><td>0</td><td>10</td><td>10</td><td>7</td><td>5</td><td>1</td><td>0</td><td>0</td><td>37</td></tr>
        <tr><td>Andhra Pradesh</td><td>1</td><td>2</td><td>6</td><td>7</td><td>8</td><td>7</td><td>4</td><td>1</td><td>0</td><td>0</td><td>36</td></tr>
        <tr><td>Gujarat Belt</td><td>1</td><td>2</td><td>3</td><td>11</td><td>6</td><td>7</td><td>2</td><td>1</td><td>0</td><td>0</td><td>33</td></tr>
        <tr><td>Madhya Pradesh</td><td>0</td><td>6</td><td>2</td><td>4</td><td>8</td><td>4</td><td>1</td><td>1</td><td>1</td><td>0</td><td>27</td></tr>
        <tr><td>Bihar Belt</td><td>1</td><td>6</td><td>1</td><td>6</td><td>7</td><td>1</td><td>1</td><td>0</td><td>1</td><td>0</td><td>24</td></tr>
        <tr><td>West Bengal</td><td>1</td><td>2</td><td>3</td><td>10</td><td>4</td><td>0</td><td>1</td><td>0</td><td>0</td><td>0</td><td>21</td></tr>
        <tr><td>Rajasthan</td><td>1</td><td>0</td><td>0</td><td>4</td><td>5</td><td>2</td><td>0</td><td>0</td><td>0</td><td>0</td><td>12</td></tr>
        <tr><td>Delhi NCR</td><td>0</td><td>3</td><td>0</td><td>1</td><td>6</td><td>1</td><td>0</td><td>0</td><td>0</td><td>0</td><td>11</td></tr>
      </tbody>
    </table>
  </div>
</div>

<script>
['rvFilterDay', 'rvFilterMulti', 'rvFilterWeek', 'rvFilterMonth'].forEach((id) => {
  document.getElementById(id).onclick = () => {
    ['rvFilterDay', 'rvFilterMulti', 'rvFilterWeek', 'rvFilterMonth'].forEach((otherId) => {
      document.getElementById(otherId).classList.toggle('active', otherId === id);
    });
  };
});

function rvTableToCsv(tableEl) {
  const rows = [...tableEl.querySelectorAll('tr')];
  return rows.map((row) => [...row.children].map((c) => '"' + c.textContent.trim().replace(/"/g,'""') + '"').join(',')).join('\\n');
}
document.getElementById('rvExportBtn').onclick = () => {
  const blob = new Blob([rvTableToCsv(document.getElementById('rvTable'))], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'region-vip-depositor-matrix.csv';
  a.click();
};
</script>
`;
