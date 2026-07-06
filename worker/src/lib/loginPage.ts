export const LOGIN_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Admin Login</title>
<meta name="robots" content="noindex" />
<style>
  body { font-family: system-ui, sans-serif; max-width: 400px; margin: 80px auto; color: #222; }
  input { width: 100%; padding: 8px; box-sizing: border-box; margin-bottom: 10px; }
  button { padding: 8px 16px; cursor: pointer; }
  .err { color: #b3261e; font-size: 13px; }
</style>
</head>
<body>
<h1>Admin Login</h1>
<p>Enter the admin key to access Configuration.</p>
<input type="password" id="key" placeholder="admin key" />
<button id="loginBtn">Log in</button>
<div class="err" id="err"></div>
<script>
document.getElementById('loginBtn').onclick = async () => {
  const res = await fetch('/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key: document.getElementById('key').value }),
  });
  if (res.ok) {
    location.href = '/config';
  } else {
    document.getElementById('err').textContent = 'Invalid key.';
  }
};
</script>
</body>
</html>`;
