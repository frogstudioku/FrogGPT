const $ = s => document.querySelector(s);
let stream = '';
let S = { chats: [], settings: {}, memory: [], kcount: 0, online: true }, cur = null, busy = false, viewName = 'chats';
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const md = t => esc(t).replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>').replace(/`([^`\n]+)`/g, '<code>$1</code>')
  .replace(/^#{1,3} (.+)$/gm, '<strong>$1</strong>').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
const save = () => api.saveChats(S.chats);
const chat = () => S.chats.find(c => c.id === cur);

function modeLabel() { return 'Model tertanam · offline'; }
function renderSide() {
  $('#recents').innerHTML = S.chats.map(c => `<button class="nav rc ${c.id === cur ? 'on' : ''}" data-id="${c.id}"><span>${esc(c.title)}</span><span class="x" data-del="${c.id}">✕</span></button>`).join('');
  $('#modeChip').textContent = modeLabel(); $('#status').textContent = `${(S.kcount || 0).toLocaleString('id-ID')} pengetahuan · ${S.memory.length} memori`;
}
function render() {
  renderSide(); const v = $('#view'); $('#composer').style.display = viewName === 'chats' ? '' : 'none';
  if (viewName === 'projects') return v.innerHTML = '<div class="wrap hello"><h1>Proyek</h1><p>Kelompokkan chat, brief, dan referensi per klien. Fitur ini belum aktif.</p></div>';
  if (viewName === 'artifacts') return v.innerHTML = '<div class="wrap hello"><h1>Artefak</h1><p>Brief dan moodboard yang kamu simpan akan muncul di sini. Fitur ini belum aktif.</p></div>';
  const c = chat();
  if (!c || !c.messages.length) {
    v.innerHTML = `<div class="wrap hello"><div style="font-size:44px">🐸</div><h1>Siap membuat sesuatu yang berani?</h1><p>Aku art director-mu. Mulai dari brief, moodboard, atau kritik desain.</p>
    <div class="chips">${['Buatkan creative brief untuk kedai kopi lokal', 'Susun moodboard untuk brand skincare hijau', 'Kritik palet warna dan font di desain saya', 'Beri 3 arah konsep untuk poster festival musik'].map(t => `<button data-q="${t}">${t}</button>`).join('')}</div></div>`;
    return;
  }
  v.innerHTML = '<div class="wrap">' + c.messages.map((m, i) => m.role === 'user'
    ? `<div class="msg user">${esc(m.content)}</div>`
    : `<div class="msg ai"><div class="body ${m.error ? 'err' : ''}">${md(m.content)}</div>${m.error ? `<div class="tools"><button data-settings="1">Buka Pengaturan</button><button data-retry="${i}">Coba lagi</button></div>` : `<div class="tools"><button data-copy="${i}">Salin</button><button data-up="${i}">👍</button><button data-down="${i}">👎 Koreksi</button><button data-retry="${i}">Ulangi</button>${m.sources?.length ? `<span>· dasar: ${esc(m.sources.slice(0, 3).join(', '))}</span>` : ''}</div>`}</div>`).join('')
    + (busy ? `<div class="msg ai"><div class="body" id="live">${stream ? md(stream) : 'Sedang berpikir…'}</div></div>` : '') + '</div>';
  v.scrollTop = v.scrollHeight;
}
function newChat() { cur = null; viewName = 'chats'; render(); $('#input').focus(); }
async function send(text, regen) {
  if (busy || (!regen && !text.trim())) return;
  if (!cur) { const c = { id: 'c' + Date.now(), title: text.slice(0, 40), messages: [] }; S.chats.unshift(c); cur = c.id; }
  const c = chat(); if (!regen) c.messages.push({ role: 'user', content: text });
  busy = true; stream = ''; $('#send').disabled = true; render();
  const r = await api.chat({ messages: c.messages.filter(m => !m.error) });
  busy = false; stream = ''; $('#send').disabled = false;
  c.messages.push(r.error ? { role: 'assistant', content: r.error, error: true } : { role: 'assistant', content: r.text, sources: r.sources });
  save(); render(); setTimeout(async () => { S.memory = (await api.load()).memory; renderSide(); }, 4000);
}
$('#composer').onsubmit = e => { e.preventDefault(); const t = $('#input').value; $('#input').value = ''; $('#input').style.height = 'auto'; send(t); };
$('#input').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#composer').requestSubmit(); } };
$('#input').oninput = e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; };
$('#new').onclick = newChat; $('#toggle').onclick = () => $('#side').classList.toggle('hide');
document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { viewName = b.dataset.view; render(); });
$('#settingsBtn').onclick = openSettings;
document.addEventListener('click', e => {
  const t = e.target, d = t.dataset, rc = t.closest('.rc'), c = chat();
  if (d.del) { S.chats = S.chats.filter(x => x.id !== d.del); if (cur === d.del) cur = null; save(); return render(); }
  if (rc) { cur = rc.dataset.id; viewName = 'chats'; return render(); }
  if (d.settings) return openSettings();
  if (d.q) return send(d.q);
  if (d.copy) return navigator.clipboard.writeText(c.messages[d.copy].content);
  if (d.up || d.down) { const i = +(d.up || d.down), up = d.up !== undefined; let note = '';
    if (!up) note = window.prompt('Apa yang kurang tepat? FrogGPT akan mengingatnya.') || '';
    api.feedback({ up, user: c.messages[i - 1].content, answer: c.messages[i].content, note }); t.textContent = '✓ Tersimpan';
    if (!up && note) send('Koreksi: ' + note + '. Tolong perbaiki jawabanmu.'); return; }
  if (d.retry) { c.messages.splice(+d.retry); save(); return send('', true); }
});
function openSettings() {
  const s = S.settings, dl = $('#dlg');
  dl.innerHTML = `<h2>Pengaturan</h2>
  <p style="color:var(--mute)">Model AI dan ${(S.kcount || 0).toLocaleString('id-ID')} entri pengetahuan sudah tertanam. Semuanya berjalan di komputer ini tanpa internet.</p>
  <div class="row"><input type="checkbox" id="s_chk" ${s.selfCheck ? 'checked' : ''}><label for="s_chk" style="margin:0;font-weight:400">Perbaiki ejaan &amp; tata bahasa jawaban sebelum tampil (lebih lambat)</label></div>
  <div class="row"><input type="checkbox" id="s_mem" ${s.memory ? 'checked' : ''}><label for="s_mem" style="margin:0;font-weight:400">Ingat preferensi dari chat</label></div>
  <label>Memori (${S.memory.length})</label><div style="max-height:160px;overflow:auto">${S.memory.map((m, i) => `<div class="mem"><span>${esc(m.text)}</span><button class="icon" data-m="${i}">✕</button></div>`).join('') || '<span style="color:var(--mute)">Belum ada.</span>'}</div>
  <div class="row" style="justify-content:flex-end"><button class="btn ghost" id="cl">Batal</button><button class="btn" id="sv">Simpan</button></div>`;
  if (!dl.open) dl.showModal();
  $('#cl').onclick = () => dl.close();
  dl.querySelectorAll('[data-m]').forEach(b => b.onclick = async () => { S.memory = await api.delMemory(+b.dataset.m); openSettings(); });
  $('#sv').onclick = async () => { S.settings = { ...s, selfCheck: $('#s_chk').checked, memory: $('#s_mem').checked }; await api.saveSettings(S.settings); dl.close(); };
}
api.onTok(t => { stream += t; const l = $('#live'); if (l) { l.innerHTML = md(stream); $('#view').scrollTop = $('#view').scrollHeight; } });
api.load().then(d => { S = d; render(); });
