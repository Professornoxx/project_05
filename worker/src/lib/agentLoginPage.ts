// Agent login is username+password (real per-person accounts), unlike the
// single shared-key forms in loginPage.ts used by Dashboard/Configuration —
// so it gets its own small page rather than reusing renderLoginPage.
export function renderAgentLoginPage(opts: { errorMessage?: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Agent Login</title>
<meta name="robots" content="noindex" />
<style>
  body { font-family: system-ui, sans-serif; max-width: 400px; margin: 80px auto; color: #222; }
  input { width: 100%; padding: 8px; box-sizing: border-box; margin-bottom: 10px; }
  button { padding: 8px 16px; cursor: pointer; width: 100%; }
  .err { color: #b3261e; font-size: 13px; min-height: 16px; }
</style>
</head>
<body>
<h1>Agent Login</h1>
<p>Enter your username and password.</p>
<input type="text" id="username" placeholder="username" autocomplete="username" />
<input type="password" id="password" placeholder="password" autocomplete="current-password" />
<button id="loginBtn">Log in</button>
<div class="err" id="err">${opts.errorMessage ?? ""}</div>
<script>
async function attemptLogin() {
  const errEl = document.getElementById('err');
  errEl.textContent = '';
  const res = await fetch('/agent/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username: document.getElementById('username').value,
      password: document.getElementById('password').value,
    }),
  });
  if (res.ok) {
    location.href = '/agent';
  } else {
    errEl.textContent = 'Invalid username or password.';
  }
}
document.getElementById('loginBtn').onclick = attemptLogin;
document.getElementById('password').addEventListener('keydown', (e) => { if (e.key === 'Enter') attemptLogin(); });
</script>
</body>
</html>`;
}
