// Standalone admin-only page at /config. Kept as one plain HTML string
// (no build step) since this is a single small form, not an app.
// Auth is enforced server-side before this HTML is ever served (see
// requireSession in index.ts) — the browser's admin_session cookie is sent
// automatically on these same-origin fetch calls, no key re-entry needed.
export const CONFIG_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Configuration — Admin</title>
<meta name="robots" content="noindex" />
<style>
  body { font-family: system-ui, sans-serif; max-width: 640px; margin: 40px auto; color: #222; }
  h1 { font-size: 20px; }
  section { border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
  label { display: block; font-weight: 600; margin-bottom: 6px; }
  input[type=text] { width: 100%; padding: 8px; box-sizing: border-box; margin-bottom: 10px; }
  button { padding: 8px 16px; cursor: pointer; }
  .status { font-size: 13px; margin-top: 10px; white-space: pre-wrap; }
  .ok { color: #0a7d2f; }
  .err { color: #b3261e; }
  .logout { float: right; font-size: 13px; }
</style>
</head>
<body>
<a class="logout" href="#" id="logoutLink">Log out</a>
<h1>Configuration</h1>
<p>Administrators only. Changes here take effect immediately and trigger a full data sync.</p>

<section>
  <h2>Bearer Token</h2>
  <label for="tokenInput">New Bearer Token</label>
  <input type="text" id="tokenInput" placeholder="paste token" />
  <button id="saveTokenBtn">Save &amp; Sync</button>
  <div class="status" id="tokenStatus"></div>
</section>

<section>
  <h2>Export Links</h2>
  <label for="depositUrl">Deposit Export URL</label>
  <input type="text" id="depositUrl" placeholder="https://..." />
  <label for="withdrawUrl">Withdrawal Export URL</label>
  <input type="text" id="withdrawUrl" placeholder="https://..." />
  <label for="walletUrl">Wallet Export URL</label>
  <input type="text" id="walletUrl" placeholder="https://..." />
  <button id="saveUrlsBtn">Save Export Links</button>
  <div class="status" id="urlsStatus"></div>
</section>

<section>
  <h2>Master Database</h2>
  <label for="fileInput">Excel file (.xlsx, may contain multiple sheets)</label>
  <input type="file" id="fileInput" accept=".xlsx,.xls" />
  <button id="uploadBtn">Upload &amp; Sync</button>
  <div class="status" id="uploadStatus"></div>
</section>

<section>
  <h2>Agent Assignments</h2>
  <p style="font-size:13px;color:#555;margin-top:0;">One column per agent (header = agent display name), each cell a user_id assigned to them.</p>
  <label for="agentFileInput">Excel file (.xlsx)</label>
  <input type="file" id="agentFileInput" accept=".xlsx,.xls" />
  <button id="agentUploadBtn">Upload Agent Assignments</button>
  <div class="status" id="agentUploadStatus"></div>
</section>

<section>
  <h2>Agent Accounts</h2>
  <p style="font-size:13px;color:#555;margin-top:0;">Login accounts for the Agent Dashboard. Display name must match a real assigned-agent value exactly — that's what scopes each agent's data.</p>
  <label for="agentNameSelect">Agent (display name)</label>
  <select id="agentNameSelect" style="width:100%;padding:8px;box-sizing:border-box;margin-bottom:10px;"><option value="">Loading agent names...</option></select>
  <label for="newAgentUsername">Username</label>
  <input type="text" id="newAgentUsername" placeholder="e.g. nisha_agent" />
  <label for="newAgentPassword">Password (min 8 characters)</label>
  <input type="text" id="newAgentPassword" placeholder="initial password" />
  <button id="createAgentAccountBtn">Create Account</button>
  <div class="status" id="agentAccountStatus"></div>

  <table id="agentAccountsTable" style="width:100%;border-collapse:collapse;margin-top:16px;font-size:13px;">
    <thead>
      <tr style="text-align:left;border-bottom:1px solid #ddd;">
        <th style="padding:6px 4px;">Username</th>
        <th style="padding:6px 4px;">Agent</th>
        <th style="padding:6px 4px;">Status</th>
        <th style="padding:6px 4px;">Created</th>
        <th style="padding:6px 4px;">Actions</th>
      </tr>
    </thead>
    <tbody><tr><td colspan="5" style="padding:6px 4px;">Loading...</td></tr></tbody>
  </table>
</section>

<script>
document.getElementById('logoutLink').onclick = async (e) => {
  e.preventDefault();
  await fetch('/config/logout', { method: 'POST' });
  location.href = '/config/login';
};

// Reads a response as JSON only when the server actually says it's JSON.
// A Cloudflare edge error (timeout, 5xx) can return an HTML page instead —
// calling res.json() on that throws a cryptic parser error ("The string did
// not match the expected pattern" in Safari) that has nothing to do with
// the real problem. This surfaces the real status/body instead.
async function readJsonSafely(res) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('json')) {
    const text = await res.text();
    throw new Error('Server returned a non-JSON response (HTTP ' + res.status + '): ' + text.slice(0, 200));
  }
  return res.json();
}

document.getElementById('saveTokenBtn').onclick = async () => {
  const statusEl = document.getElementById('tokenStatus');
  statusEl.textContent = 'Saving...';
  statusEl.className = 'status';
  try {
    const res = await fetch('/api/config/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: document.getElementById('tokenInput').value }),
    });
    const data = await readJsonSafely(res);
    if (!res.ok) throw new Error(data.error || res.statusText);
    statusEl.textContent = 'Saved. Sync: ' + data.syncTriggered;
    statusEl.className = 'status ok';
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
    statusEl.className = 'status err';
  }
};

// Prefill the current export URLs on page load so admins can see/edit
// what's actually in effect, not just blank inputs.
(async function loadExportUrls() {
  try {
    const res = await fetch('/api/config/export-urls');
    const data = await readJsonSafely(res);
    if (res.ok) {
      document.getElementById('depositUrl').value = data.deposit || '';
      document.getElementById('withdrawUrl').value = data.withdraw || '';
      document.getElementById('walletUrl').value = data.wallet || '';
    }
  } catch (e) {
    // Non-fatal: leave fields blank if this fails, admin can still type new values.
  }
})();

document.getElementById('saveUrlsBtn').onclick = async () => {
  const statusEl = document.getElementById('urlsStatus');
  statusEl.textContent = 'Saving...';
  statusEl.className = 'status';
  try {
    const res = await fetch('/api/config/export-urls', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        deposit: document.getElementById('depositUrl').value,
        withdraw: document.getElementById('withdrawUrl').value,
        wallet: document.getElementById('walletUrl').value,
      }),
    });
    const data = await readJsonSafely(res);
    if (!res.ok) throw new Error(data.error || res.statusText);
    statusEl.textContent = 'Saved.';
    statusEl.className = 'status ok';
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
    statusEl.className = 'status err';
  }
};

document.getElementById('uploadBtn').onclick = async () => {
  const statusEl = document.getElementById('uploadStatus');
  const file = document.getElementById('fileInput').files[0];
  if (!file) { statusEl.textContent = 'Choose a file first.'; statusEl.className = 'status err'; return; }
  statusEl.textContent = 'Uploading...';
  statusEl.className = 'status';
  try {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/config/upload', { method: 'POST', body: form });
    const data = await readJsonSafely(res);
    if (!res.ok) throw new Error(data.error || res.statusText);
    statusEl.textContent = 'Imported. ' + JSON.stringify(data);
    statusEl.className = 'status ok';
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
    statusEl.className = 'status err';
  }
};

document.getElementById('agentUploadBtn').onclick = async () => {
  const statusEl = document.getElementById('agentUploadStatus');
  const file = document.getElementById('agentFileInput').files[0];
  if (!file) { statusEl.textContent = 'Choose a file first.'; statusEl.className = 'status err'; return; }
  statusEl.textContent = 'Uploading...';
  statusEl.className = 'status';
  try {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/config/upload-agents', { method: 'POST', body: form });
    const data = await readJsonSafely(res);
    if (!res.ok) throw new Error(data.error || res.statusText);
    statusEl.textContent = 'Imported. ' + JSON.stringify(data);
    statusEl.className = 'status ok';
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
    statusEl.className = 'status err';
  }
};

async function loadAgentNames() {
  const select = document.getElementById('agentNameSelect');
  try {
    const res = await fetch('/api/config/agent-names');
    const data = await readJsonSafely(res);
    if (!res.ok) throw new Error(data.error || res.statusText);
    select.innerHTML = data.agentNames.length
      ? data.agentNames.map((n) => '<option value="' + n.replace(/"/g, '&quot;') + '">' + n + '</option>').join('')
      : '<option value="">No assigned agents found</option>';
  } catch (e) {
    select.innerHTML = '<option value="">Failed to load agent names</option>';
  }
}

async function loadAgentAccounts() {
  const tbody = document.querySelector('#agentAccountsTable tbody');
  try {
    const res = await fetch('/api/config/agent-accounts');
    const data = await readJsonSafely(res);
    if (!res.ok) throw new Error(data.error || res.statusText);
    if (!data.accounts.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="padding:6px 4px;">No accounts yet.</td></tr>';
      return;
    }
    tbody.innerHTML = data.accounts.map((a) => {
      const active = !!a.is_active;
      return '<tr style="border-bottom:1px solid #eee;">'
        + '<td style="padding:6px 4px;">' + a.login_username + '</td>'
        + '<td style="padding:6px 4px;">' + a.display_name + '</td>'
        + '<td style="padding:6px 4px;">' + (active ? 'Active' : 'Disabled') + '</td>'
        + '<td style="padding:6px 4px;">' + (a.created_at || '').slice(0, 10) + '</td>'
        + '<td style="padding:6px 4px;">'
        + '<button class="toggleAcctBtn" data-id="' + a.agent_id + '" data-active="' + (active ? '1' : '0') + '">' + (active ? 'Disable' : 'Enable') + '</button> '
        + '<button class="resetPwBtn" data-id="' + a.agent_id + '">Reset PW</button>'
        + '</td></tr>';
    }).join('');

    tbody.querySelectorAll('.toggleAcctBtn').forEach((btn) => {
      btn.onclick = async () => {
        const statusEl = document.getElementById('agentAccountStatus');
        const id = Number(btn.getAttribute('data-id'));
        const currentlyActive = btn.getAttribute('data-active') === '1';
        statusEl.textContent = 'Saving...';
        statusEl.className = 'status';
        try {
          const res = await fetch('/api/config/agent-accounts/toggle', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ agentId: id, isActive: !currentlyActive }),
          });
          const data = await readJsonSafely(res);
          if (!res.ok) throw new Error(data.error || res.statusText);
          statusEl.textContent = 'Updated.';
          statusEl.className = 'status ok';
          loadAgentAccounts();
        } catch (e) {
          statusEl.textContent = 'Error: ' + e.message;
          statusEl.className = 'status err';
        }
      };
    });

    tbody.querySelectorAll('.resetPwBtn').forEach((btn) => {
      btn.onclick = async () => {
        const statusEl = document.getElementById('agentAccountStatus');
        const id = Number(btn.getAttribute('data-id'));
        const newPassword = prompt('Enter a new password (min 8 characters):');
        if (!newPassword) return;
        statusEl.textContent = 'Saving...';
        statusEl.className = 'status';
        try {
          const res = await fetch('/api/config/agent-accounts/reset-password', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ agentId: id, password: newPassword }),
          });
          const data = await readJsonSafely(res);
          if (!res.ok) throw new Error(data.error || res.statusText);
          statusEl.textContent = 'Password reset.';
          statusEl.className = 'status ok';
        } catch (e) {
          statusEl.textContent = 'Error: ' + e.message;
          statusEl.className = 'status err';
        }
      };
    });
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="5" style="padding:6px 4px;">Failed to load accounts.</td></tr>';
  }
}

document.getElementById('createAgentAccountBtn').onclick = async () => {
  const statusEl = document.getElementById('agentAccountStatus');
  const displayName = document.getElementById('agentNameSelect').value;
  const username = document.getElementById('newAgentUsername').value.trim();
  const password = document.getElementById('newAgentPassword').value;
  if (!displayName) { statusEl.textContent = 'Choose an agent first.'; statusEl.className = 'status err'; return; }
  statusEl.textContent = 'Saving...';
  statusEl.className = 'status';
  try {
    const res = await fetch('/api/config/agent-accounts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName, username, password }),
    });
    const data = await readJsonSafely(res);
    if (!res.ok) throw new Error(data.error || res.statusText);
    statusEl.textContent = 'Account created.';
    statusEl.className = 'status ok';
    document.getElementById('newAgentUsername').value = '';
    document.getElementById('newAgentPassword').value = '';
    loadAgentAccounts();
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
    statusEl.className = 'status err';
  }
};

loadAgentNames();
loadAgentAccounts();
</script>
</body>
</html>`;
