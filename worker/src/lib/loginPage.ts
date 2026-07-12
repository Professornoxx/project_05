// Parameterized so Dashboard and Configuration get fully independent login
// pages/sessions — logging into one does not grant access to the other.
export function renderLoginPage(opts: { title: string; postUrl: string; redirectUrl: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>BrightPath — ${opts.title}</title>
<meta name="robots" content="noindex" />
<style>
  body { font-family: system-ui, sans-serif; max-width: 400px; margin: 80px auto; color: #222; }
  .brand { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
  .brand-mark { width: 28px; height: 28px; border-radius: 8px; background: #4f46e5; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 15px; flex-shrink: 0; }
  .brand-name { font-weight: 700; font-size: 15px; color: #4f46e5; }
  h1 { margin-top: 4px; }
  input { width: 100%; padding: 8px; box-sizing: border-box; margin-bottom: 10px; }
  button { padding: 8px 16px; cursor: pointer; }
  .err { color: #b3261e; font-size: 13px; }
</style>
</head>
<body>
<div class="brand"><span class="brand-mark">B</span><span class="brand-name">BrightPath</span></div>
<h1>${opts.title}</h1>
<p>Enter the admin key to continue.</p>
<input type="password" id="key" placeholder="admin key" />
<button id="loginBtn">Log in</button>
<div class="err" id="err"></div>
<script>
document.getElementById('loginBtn').onclick = async () => {
  const res = await fetch('${opts.postUrl}', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key: document.getElementById('key').value }),
  });
  if (res.ok) {
    location.href = '${opts.redirectUrl}';
  } else {
    document.getElementById('err').textContent = 'Invalid key.';
  }
};
</script>
</body>
</html>`;
}
