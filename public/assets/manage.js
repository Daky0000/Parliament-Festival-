// User management on the Super Admin and Admin pages. Talks to /api/users.
(function () {
  var form = document.getElementById('addForm'), toggle = document.getElementById('addToggle'),
      cancel = document.getElementById('addCancel'), flash = document.getElementById('flash');
  if (!form) return;

  function show(open) {
    form.hidden = !open; toggle.setAttribute('aria-expanded', String(open));
    if (open) form.querySelector('input[name=name]').focus();
  }
  toggle.addEventListener('click', function () { show(form.hidden); });
  cancel.addEventListener('click', function () { form.reset(); show(false); });

  function say(kind, html) { flash.innerHTML = '<div class="notice ' + kind + '" role="status">' + html + '</div>'; flash.scrollIntoView({ block: 'nearest' }); }
  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function passwordNotice(intro, pw) {
    say('info', intro + '<div class="pw-row"><code class="pw">' + esc(pw) + '</code><button type="button" class="btn btn-o btn-sm" id="pwCopy">Copy</button><button type="button" class="btn btn-b btn-sm" id="pwDone">Done</button></div><span class="small muted">This password is shown once. Give it to the person directly.</span>');
    document.getElementById('pwCopy').onclick = function () { navigator.clipboard && navigator.clipboard.writeText(pw); this.textContent = 'Copied'; };
    document.getElementById('pwDone').onclick = function () { location.reload(); };
  }

  async function call(payload) {
    var r = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    var data = await r.json().catch(function () { return {}; });
    if (r.status === 401) { location.href = '/login?next=' + encodeURIComponent(location.pathname); }
    if (!r.ok) throw new Error(data.error || 'Something went wrong.');
    return data;
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var f = new FormData(form), btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      var data = await call({ action: 'create', name: f.get('name'), email: f.get('email'), role: f.get('role'), password: f.get('password') });
      form.reset(); show(false);
      if (data.password) passwordNotice('<b>' + esc(data.user.name) + '</b> can now sign in with this password:', data.password);
      else location.reload();
    } catch (err) { say('danger', esc(err.message)); }
    btn.disabled = false;
  });

  var CONFIRM = {
    reset: function (n) { return 'Reset the password for ' + n + '? Their current password stops working and they are signed out.'; },
    disable: function (n) { return 'Disable ' + n + '? They are signed out and cannot sign in until enabled again.'; },
    delete: function (n) { return 'Remove ' + n + ' permanently? This cannot be undone.'; }
  };
  document.querySelectorAll('.people [data-act]').forEach(function (b) {
    b.addEventListener('click', async function () {
      var row = b.closest('tr'), act = b.getAttribute('data-act'), name = row.getAttribute('data-name');
      if (CONFIRM[act] && !confirm(CONFIRM[act](name))) return;
      b.disabled = true;
      try {
        var data = await call({ action: act, email: row.getAttribute('data-email') });
        if (act === 'reset') passwordNotice('New password for <b>' + esc(name) + '</b>:', data.password);
        else location.reload();
      } catch (err) { say('danger', esc(err.message)); }
      b.disabled = false;
    });
  });
})();
