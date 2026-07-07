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
</script>
</body>
</html>`;
