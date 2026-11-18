const $ = s => document.querySelector(s);
let stream = '', pend = { docs: [], imgs: [] };
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
    ? `<div class="msg user">${esc(m.content)}${m.imgs || m.docs ? `<div class="atts">${(m.imgs || []).map(a => attHTML(a, '')).join('')}${(m.docs || []).map(a => attHTML(a, '')).join('')}</div>` : ''}</div>`
    : `<div class="msg ai"><div class="body ${m.error ? 'err' : ''}">${md(m.content)}</div>${m.error ? `<div class="tools"><button data-settings="1">Buka Pengaturan</button><button data-retry="${i}">Coba lagi</button></div>` : `<div class="tools"><button data-copy="${i}">Salin</button><button data-up="${i}">👍</button><button data-down="${i}">👎 Koreksi</button><button data-retry="${i}">Ulangi</button>${m.sources?.length ? `<span>· dasar: ${esc(m.sources.slice(0, 3).join(', '))}</span>` : ''}</div>`}</div>`).join('')
    + (busy ? `<div class="msg ai"><div class="body" id="live">${stream ? md(stream) : 'Sedang berpikir…'}</div></div>` : '') + '</div>';
  v.scrollTop = v.scrollHeight;
}
const kb = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const attHTML = (a, rm) => `<div class="att">${a.thumb ? `<img src="${a.thumb}" alt="">` : '<div class="ic"><svg class="i"><use href="#i-file"/></svg></div>'}<div><span class="n">${esc(a.name)}</span><small>${esc(a.meta || '')}</small></div>${rm}</div>`;
function renderAtts() {
  const all = [...pend.imgs.map((a, i) => [a, 'i' + i]), ...pend.docs.map((a, i) => [a, 'd' + i])], el = $('#atts');
  el.classList.toggle('on', all.length > 0);
  el.innerHTML = all.map(([a, k]) => attHTML(a, `<button type="button" class="rm" data-rm="${k}" title="Hapus">✕</button>`)).join('');
}
function flash(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(flash.t); flash.t = setTimeout(() => t.classList.remove('on'), 6000); }
const RATIOS = [['1:1', 1], ['4:3', 4 / 3], ['3:2', 1.5], ['16:9', 16 / 9], ['21:9', 21 / 9], ['5:4', 1.25], ['4:5', .8], ['2:3', 2 / 3], ['3:4', .75], ['9:16', 9 / 16], ['3:1', 3]];
function ratioName(w, h) { const r = w / h; let b = RATIOS[0]; for (const x of RATIOS) if (Math.abs(x[1] - r) < Math.abs(b[1] - r)) b = x; return Math.abs(b[1] - r) / r < .04 ? b[0] : r.toFixed(2) + ':1'; }
// Foto tidak "dilihat" model; yang dikirim hanya data hasil analisis (ukuran, palet, kecerahan, kontras, saturasi).
async function analyzeImage(file) {
  const url = URL.createObjectURL(file);
  const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('gambar tidak bisa dibuka')); i.src = url; });
  const W = img.naturalWidth, H = img.naturalHeight, s = Math.min(1, 96 / Math.max(W, H));
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(W * s)); c.height = Math.max(1, Math.round(H * s));
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height).data, bins = {};
  let n = 0, sl = 0, sl2 = 0, ss = 0, sr = 0, sb = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    const r = d[i], gr = d[i + 1], b = d[i + 2], k = ((r >> 4) << 8) | ((gr >> 4) << 4) | (b >> 4), o = bins[k] || (bins[k] = { n: 0, r: 0, g: 0, b: 0 });
    o.n++; o.r += r; o.g += gr; o.b += b; n++;
    const l = .2126 * r + .7152 * gr + .0722 * b, mx = Math.max(r, gr, b), mn = Math.min(r, gr, b);
    sl += l; sl2 += l * l; ss += mx ? (mx - mn) / mx : 0; sr += r; sb += b;
  }
  n = n || 1;
  const pal = [];
  for (const o of Object.values(bins).map(o => ({ n: o.n, r: o.r / o.n, g: o.g / o.n, b: o.b / o.n })).sort((a, b) => b.n - a.n)) {
    const near = pal.find(p => Math.hypot(p.r - o.r, p.g - o.g, p.b - o.b) < 50);
    if (near) near.n += o.n; else if (pal.length < 10) pal.push(o);
  }
  const hex = p => '#' + [p.r, p.g, p.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  const top = pal.sort((a, b) => b.n - a.n).slice(0, 6).map(p => `${hex(p)} (${Math.round(p.n / n * 100)}%)`).join(', ');
  const mean = sl / n, sd = Math.sqrt(Math.max(0, sl2 / n - mean * mean)), bright = mean / 2.55, con = sd / 2.55, sat = ss / n * 100, wb = sr / Math.max(1, sb);
  const info = `Ukuran ${W}×${H} px (rasio ${ratioName(W, H)}, ${W > H * 1.05 ? 'lanskap' : H > W * 1.05 ? 'potret' : 'persegi'}). Palet dominan: ${top}. Kecerahan ${Math.round(bright)}/100 (${bright < 35 ? 'gelap' : bright < 65 ? 'sedang' : 'terang'}), kontras ${con < 12 ? 'rendah' : con < 22 ? 'sedang' : 'tinggi'}, saturasi ${sat < 25 ? 'rendah' : sat < 55 ? 'sedang' : 'tinggi'}, nuansa ${wb > 1.12 ? 'hangat' : wb < .9 ? 'dingin' : 'netral'}.`;
  const t = document.createElement('canvas'), ts = Math.min(1, 120 / Math.max(W, H)); t.width = Math.max(1, Math.round(W * ts)); t.height = Math.max(1, Math.round(H * ts));
  const tg = t.getContext('2d'); tg.fillStyle = '#fff'; tg.fillRect(0, 0, t.width, t.height); tg.drawImage(img, 0, 0, t.width, t.height);
  URL.revokeObjectURL(url);
  return { info, thumb: t.toDataURL('image/jpeg', .7), meta: `${W}×${H} · ${kb(file.size)}` };
}
async function addFiles(files) {
  for (const f of files) {
    try {
      if (f.type.startsWith('image/')) {
        if (pend.imgs.length >= 4) throw new Error('maksimal 4 gambar per pesan.');
        pend.imgs.push({ name: f.name || 'gambar.png', ...(await analyzeImage(f)) });
      } else {
        if (pend.docs.length >= 3) throw new Error('maksimal 3 dokumen per pesan.');
        const r = await api.extractDoc(f.name, await f.arrayBuffer());
        if (r.error) throw new Error(r.error);
        pend.docs.push({ name: r.name, text: r.text, meta: kb(f.size) + (r.truncated ? ' · dipotong' : '') });
      }
    } catch (e) { flash((f.name || 'File') + ': ' + e.message); }
  }
  renderAtts();
}
function newChat() { cur = null; viewName = 'chats'; render(); $('#input').focus(); }
async function send(text, regen) {
  if (busy || (!regen && !text.trim())) return;
  if (!cur) { const c = { id: 'c' + Date.now(), title: text.slice(0, 40), messages: [] }; S.chats.unshift(c); cur = c.id; }
  const c = chat();
  if (!regen) {
    const m = { role: 'user', content: text };
    if (pend.docs.length) m.docs = pend.docs.map(({ name, text, meta }) => ({ name, text, meta }));
    if (pend.imgs.length) m.imgs = pend.imgs.map(({ name, thumb, info, meta }) => ({ name, thumb, info, meta }));
    c.messages.push(m); pend = { docs: [], imgs: [] }; renderAtts();
  }
  busy = true; stream = ''; $('#send').disabled = true; render();
  const r = await api.chat({ messages: c.messages.filter(m => !m.error).map(m => ({ role: m.role, content: m.content, docs: m.docs, imgs: m.imgs && m.imgs.map(({ name, info }) => ({ name, info })) })) });
  busy = false; stream = ''; $('#send').disabled = false;
  c.messages.push(r.error ? { role: 'assistant', content: r.error, error: true } : { role: 'assistant', content: r.text, sources: r.sources });
  save(); render(); setTimeout(async () => { S.memory = (await api.load()).memory; renderSide(); }, 4000);
}
$('#composer').onsubmit = e => { e.preventDefault(); let t = $('#input').value; if (!t.trim() && (pend.docs.length || pend.imgs.length)) t = 'Tolong analisis lampiran ini.'; $('#input').value = ''; $('#input').style.height = 'auto'; send(t); };
$('#input').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#composer').requestSubmit(); } };
$('#input').oninput = e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; };
$('#attach').onclick = () => $('#file').click();
$('#file').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
$('#input').onpaste = e => { const fs = [...(e.clipboardData?.files || [])]; if (fs.length) { e.preventDefault(); addFiles(fs); } };
addEventListener('dragover', e => { e.preventDefault(); document.body.classList.add('drop'); });
addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('drop'); });
addEventListener('drop', e => { e.preventDefault(); document.body.classList.remove('drop'); if (viewName === 'chats') addFiles([...e.dataTransfer.files]); });
$('#new').onclick = newChat; $('#toggle').onclick = () => $('#side').classList.toggle('hide');
document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { viewName = b.dataset.view; render(); });
$('#settingsBtn').onclick = openSettings;
document.addEventListener('click', e => {
  const t = e.target, d = t.dataset, rc = t.closest('.rc'), c = chat();
  if (d.rm) { (d.rm[0] === 'i' ? pend.imgs : pend.docs).splice(+d.rm.slice(1), 1); return renderAtts(); }
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
