// The floating Protocol Assistant, on every signed-in page. Posts to /api/agent.
(function () {
  var SPARK = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9z"/><path d="M19 14l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9z" opacity=".75"/></svg>';
  var wrap = document.createElement('div');
  wrap.innerHTML =
    '<button class="agent-fab" id="agentFab" aria-label="Open Protocol Assistant" aria-expanded="false" aria-controls="agentPanel">' + SPARK + '</button>' +
    '<section class="agent-panel" id="agentPanel" role="dialog" aria-label="Protocol Assistant" aria-hidden="true">' +
      '<div class="agent-head"><div class="dotfield" aria-hidden="true"></div><span class="spark">' + SPARK + '</span>' +
        '<div class="grow"><div class="agent-title">Protocol Assistant</div><div class="agent-subtitle">Festival of Nine Lessons &amp; Carols 2026</div></div>' +
        '<button class="agent-icon-btn" id="agentClose" aria-label="Close assistant">&times;</button></div>' +
      '<div class="agent-log" id="agentLog" aria-live="polite"><div class="msg bot">Hello! I\'m the Protocol Assistant. Ask me about the event, seating, ushering or protocol arrangements.</div></div>' +
      '<form class="agent-form" id="agentForm"><textarea id="agentInput" placeholder="Ask the assistant…" rows="1" aria-label="Message"></textarea><button class="btn btn-b" type="submit" id="agentSend">Send</button></form>' +
    '</section>';
  document.body.appendChild(wrap);

  var fab = document.getElementById('agentFab'), panel = document.getElementById('agentPanel'),
      log = document.getElementById('agentLog'), form = document.getElementById('agentForm'),
      input = document.getElementById('agentInput'), send = document.getElementById('agentSend'), history = [];
  function setOpen(open) {
    panel.classList.toggle('open', open); panel.setAttribute('aria-hidden', String(!open)); fab.setAttribute('aria-expanded', String(open));
    if (open) setTimeout(function () { input.focus(); }, 150);
  }
  fab.addEventListener('click', function () { setOpen(!panel.classList.contains('open')); });
  document.getElementById('agentClose').addEventListener('click', function () { setOpen(false); fab.focus(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panel.classList.contains('open')) setOpen(false); });
  function add(cls, text) { var d = document.createElement('div'); d.className = 'msg ' + cls; d.textContent = text; log.appendChild(d); log.scrollTop = log.scrollHeight; return d; }
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var text = input.value.trim(); if (!text || send.disabled) return;
    input.value = ''; add('user', text); history.push({ role: 'user', content: text });
    send.disabled = true; var t = add('bot typing', 'Thinking…');
    try {
      var r = await fetch('/api/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history }) });
      var data = await r.json().catch(function () { return {}; });
      t.remove();
      if (!r.ok || !data.reply) { history.pop(); add('err', data.error || 'The assistant is unavailable right now.'); }
      else { history.push({ role: 'assistant', content: data.reply }); add('bot', data.reply); }
    } catch (err) { t.remove(); history.pop(); add('err', 'Network error - please try again.'); }
    send.disabled = false; input.focus();
  });
})();
