const $ = s => document.querySelector(s);
let stream = '';
let S = { chats: [], settings: {}, memory: [], kcount: 0, online: true }, cur = null, busy = false, viewName = 'chats';
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const md = t => esc(t).replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>').replace(/`([^`\n]+)`/g, '<code>$1</code>')
  .replace(/^#{1,3} (.+)$/gm, '<strong>$1</strong>').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
const save = () => api.saveChats(S.chats);
const chat = () => S.chats.find(c => c.id === cur);
const mq = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() { const t = S.settings.theme || 'dark'; document.documentElement.dataset.theme = t === 'auto' ? (mq.matches ? 'dark' : 'light') : t; }
mq.onchange = applyTheme;
$('#theme').onclick = () => { S.settings.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; applyTheme(); api.saveSettings(S.settings); };

function modeLabel() { return S.model ? S.model.replace(/\.gguf$/i, '').slice(0, 30) + ' · offline' : 'Belum ada model'; }
function renderSide() {
  $('#recents').innerHTML = S.chats.map(c => `<button class="nav rc ${c.id === cur ? 'cur' : ''}" data-id="${c.id}"><span>${esc(c.title)}</span><span class="x" data-del="${c.id}">✕</span></button>`).join('');
  document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === viewName));
  $('#modeChip').textContent = modeLabel(); $('#status').textContent = `${(S.kcount || 0).toLocaleString('id-ID')} pengetahuan · ${S.memory.length} memori`;
}
function render() {
  renderSide(); const v = $('#view'); $('#composer').style.display = viewName === 'chats' ? '' : 'none';
  if (viewName === 'projects') return v.innerHTML = '<div class="wrap hello"><h1>Proyek</h1><p>Kelompokkan chat, brief, dan referensi per klien. Fitur ini belum aktif.</p></div>';
  if (viewName === 'artifacts') return v.innerHTML = '<div class="wrap hello"><h1>Artefak</h1><p>Brief dan moodboard yang kamu simpan akan muncul di sini. Fitur ini belum aktif.</p></div>';
  const c = chat();
  if (!c || !c.messages.length) {
    v.innerHTML = `<div class="wrap hello"><img class="hero" src="logo.png" alt="FrogGPT"><h1>Siap membuat sesuatu yang berani?</h1><p>Aku art director-mu. Mulai dari brief, moodboard, atau kritik desain.</p>
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
async function openEula() {
  const dl = $('#dlg');
  dl.innerHTML = `<h2>Perjanjian Lisensi (EULA)</h2><pre style="white-space:pre-wrap;font:13px/1.6 var(--font);max-height:55vh;overflow:auto;margin:8px 0 14px">${esc(await api.eula())}</pre>
  <div class="row" style="justify-content:flex-end"><button class="btn" id="back">Kembali</button></div>`;
  $('#back').onclick = openSettings;
}
async function openModels() {
  const m = await api.models(), dl = $('#dlg'), ok = m.installed;
  dl.innerHTML = `<h2>Pilih model AI</h2>
  <p style="color:var(--mute)">RAM komputer Anda: ${m.ramGB} GB. Model diunduh sekali (butuh internet), setelah itu berjalan 100% offline. Model lebih besar lebih pintar, tetapi lebih lambat tanpa kartu grafis.</p>
  ${m.catalog.map(c => `<div class="mcard${c.id === m.rec ? ' rec' : ''}"><div class="mi"><b>${c.name}</b>${c.id === m.rec ? '<span class="tag">Disarankan</span>' : ''}<div class="mm">${c.desc} · ±${c.size} GB · RAM ≥ ${c.ram} GB · ${c.license}</div><div class="bar2"><i id="p_${c.id}"></i></div></div>
    <button class="btn${ok[c.id] && ok[c.id] === m.current ? ' ghost' : ''}" data-dl="${c.id}" ${ok[c.id] && ok[c.id] === m.current ? 'disabled' : ''}>${ok[c.id] ? (ok[c.id] === m.current ? 'Terpakai' : 'Pakai') : 'Unduh'}</button></div>`).join('')}
  <div id="mErr" class="err"></div>
  <div class="row"><button class="btn ghost" id="browse">Pilih file .gguf sendiri…</button><span style="flex:1"></span><button class="btn ghost" id="cl">Tutup</button></div>`;
  if (!dl.open) dl.showModal();
  $('#cl').onclick = () => dl.close();
  $('#browse').onclick = async () => { const r = await api.browseModel(); if (r.file) { S.model = r.file.split(/[\\/]/).pop(); dl.close(); renderSide(); } };
  dl.querySelectorAll('[data-dl]').forEach(b => b.onclick = async () => {
    const id = b.dataset.dl; b.disabled = true; $('#mErr').textContent = '';
    let r; if (ok[id]) r = await api.useModel(id); else { b.textContent = 'Mengunduh…'; r = await api.downloadModel(id); }
    if (r.error) { $('#mErr').textContent = r.error; b.disabled = false; b.textContent = ok[id] ? 'Pakai' : 'Unduh'; return; }
    S.model = (await api.load()).model; renderSide(); openModels();
  });
}
function openSettings() {
  const s = S.settings, dl = $('#dlg');
  dl.innerHTML = `<h2>Pengaturan</h2>
  <p style="color:var(--mute)">${(S.kcount || 0).toLocaleString('id-ID')} entri pengetahuan desain sudah tertanam. Semuanya berjalan di komputer ini tanpa internet.</p>
  <label>Model AI</label><div class="row"><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(S.model || 'Belum dipilih')}</span><button type="button" class="btn ghost" id="chgModel">Ganti model</button></div>
  <label>Lisensi</label><div class="row"><span style="flex:1">Licensed to: Ari Fitriansyah</span><button type="button" class="btn ghost" id="eulaBtn">Lihat EULA</button></div>
  <label>Tema</label><select id="s_theme"><option value="dark">Gelap</option><option value="light">Terang</option><option value="auto">Ikuti sistem</option></select>
  <div class="row"><input type="checkbox" id="s_chk" ${s.selfCheck ? 'checked' : ''}><label for="s_chk" style="margin:0;font-weight:400">Perbaiki ejaan &amp; tata bahasa jawaban sebelum tampil (lebih lambat)</label></div>
  <div class="row"><input type="checkbox" id="s_mem" ${s.memory ? 'checked' : ''}><label for="s_mem" style="margin:0;font-weight:400">Ingat preferensi dari chat</label></div>
  <label>Memori (${S.memory.length})</label><div style="max-height:160px;overflow:auto">${S.memory.map((m, i) => `<div class="mem"><span>${esc(m.text)}</span><button class="icon" data-m="${i}">✕</button></div>`).join('') || '<span style="color:var(--mute)">Belum ada.</span>'}</div>
  <div class="row" style="justify-content:flex-end"><button class="btn ghost" id="cl">Batal</button><button class="btn" id="sv">Simpan</button></div>`;
  if (!dl.open) dl.showModal();
  $('#s_theme').value = s.theme || 'dark';
  $('#chgModel').onclick = openModels;
  $('#eulaBtn').onclick = openEula;
  $('#cl').onclick = () => dl.close();
  dl.querySelectorAll('[data-m]').forEach(b => b.onclick = async () => { S.memory = await api.delMemory(+b.dataset.m); openSettings(); });
  $('#sv').onclick = async () => { S.settings = { ...s, selfCheck: $('#s_chk').checked, memory: $('#s_mem').checked, theme: $('#s_theme').value }; applyTheme(); await api.saveSettings(S.settings); dl.close(); };
}
api.onDl(({ id, p }) => { const e = $('#p_' + id); if (e) e.style.width = Math.round(p * 100) + '%'; });
api.onTok(t => { stream += t; const l = $('#live'); if (l) { l.innerHTML = md(stream); $('#view').scrollTop = $('#view').scrollHeight; } });
api.load().then(d => { S = d; applyTheme(); render(); if (!S.model) openModels(); });
