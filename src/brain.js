// Otak FrogGPT: retrieval pengetahuan desain + memori + pelajaran dari koreksi + self-check
const fs = require('fs'), path = require('path');
let D, K = [];
const F = n => path.join(D, n);
const rd = (n, d) => { try { return JSON.parse(fs.readFileSync(F(n), 'utf8')); } catch { return d; } };
const wr = (n, v) => fs.writeFileSync(F(n), JSON.stringify(v, null, 1));
const tok = s => (String(s).toLowerCase().match(/[a-zà-ÿ0-9]{3,}/g) || []);

const DEFAULTS = { mode: 'auto', ollamaUrl: 'http://127.0.0.1:11434', ollamaModel: 'qwen2.5:7b',
  apiKey: '', onlineModel: 'claude-sonnet-5-5', selfCheck: true, memory: true };

const SYSTEM = `Kamu adalah FrogGPT, art director & konsultan desain senior. Fokus: brief kreatif, moodboard, identitas visual, tipografi, warna, layout, packaging, UI/UX, fotografi/art direction, kritik desain.
Cara kerja: (1) pahami tujuan, audiens, dan batasan; bila info krusial kurang, ajukan maksimal 2 pertanyaan singkat. (2) beri arah yang spesifik dan berani, bukan klise: palet (hex), tipografi, komposisi, referensi gaya, serta alasannya. (3) untuk moodboard, tulis daftar elemen visual + kata kunci pencarian gambar. (4) untuk brief, gunakan struktur: Latar belakang, Tujuan, Target audiens, Pesan utama, Tone, Deliverables, Batasan, Referensi. (5) beri kritik jujur dan konstruktif.
Gunakan bahasa yang sama dengan pengguna (default Indonesia), kalimat rapi dan ringkas. Jangan mengarang fakta; bila tidak yakin, katakan.`;

function init(userDir, appDir) {
  D = path.join(userDir, 'frogdata'); fs.mkdirSync(path.join(D, 'knowledge'), { recursive: true });
  K = [];
  const walk = dir => { if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) walk(p);
      else if (f.name.endsWith('.json')) try { K.push(...JSON.parse(fs.readFileSync(p, 'utf8'))); } catch {}
    } };
  walk(path.join(appDir, 'knowledge')); walk(path.join(D, 'knowledge'));
  K.forEach(k => k._t = tok(`${k.title} ${k.text} ${(k.tags || []).join(' ')} ${k.topic || ''}`));
  return K.length;
}

function search(q, items, n, get) {
  const qt = new Set(tok(q)); if (!qt.size || !items.length) return [];
  const df = {}; items.forEach(i => new Set(get(i)).forEach(t => df[t] = (df[t] || 0) + 1));
  return items.map(i => {
    const t = get(i); let s = 0;
    for (const w of qt) { const c = t.filter(x => x === w).length; if (c) s += (1 + Math.log(c)) * Math.log(1 + items.length / df[w]); }
    return [s / Math.sqrt(t.length + 10), i];
  }).filter(x => x[0] > 0).sort((a, b) => b[0] - a[0]).slice(0, n).map(x => x[1]);
}

async function llm(s, mode, system, messages, max = 2000) {
  if (mode === 'online') {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': s.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: s.onlineModel, max_tokens: max, system, messages }) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error?.message || 'Gagal terhubung ke API online');
    return j.content.map(c => c.text || '').join('');
  }
  let r;
  try { r = await fetch(s.ollamaUrl + '/api/chat', { method: 'POST',
    body: JSON.stringify({ model: s.ollamaModel, stream: false, messages: [{ role: 'system', content: system }, ...messages] }) }); }
  catch { throw new Error('Mode offline butuh Ollama yang berjalan. Pasang dari ollama.com lalu jalankan: ollama pull ' + s.ollamaModel); }
  const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Ollama error');
  return j.message.content;
}

async function chat({ messages, online }) {
  const s = { ...DEFAULTS, ...rd('settings.json', {}) };
  const mode = s.mode === 'auto' ? (online && s.apiKey ? 'online' : 'offline') : s.mode;
  if (mode === 'online' && !s.apiKey) throw new Error('Isi API key di Pengaturan, atau pilih mode Offline.');
  const q = messages.filter(m => m.role === 'user').slice(-2).map(m => m.content).join(' ');
  const kn = search(q, K, 5, x => x._t);
  const mem = rd('memory.json', []), lessons = rd('lessons.json', []).slice(-8);
  const rel = s.memory ? search(q, mem, 6, x => tok(x.text)) : [];
  const sys = SYSTEM
    + (kn.length ? '\n\nPENGETAHUAN DESAIN RELEVAN:\n' + kn.map(k => `- ${k.title}: ${k.text}`).join('\n') : '')
    + (rel.length ? '\n\nYANG KAMU INGAT TENTANG PENGGUNA (pakai untuk personalisasi & beri saran proaktif):\n' + rel.map(m => '- ' + m.text).join('\n') : '')
    + (lessons.length ? '\n\nPELAJARAN DARI KOREKSI SEBELUMNYA (jangan ulangi kesalahan ini):\n' + lessons.map(l => '- ' + l.text).join('\n') : '');
  const hist = messages.slice(-20).map(m => ({ role: m.role, content: m.content }));
  let text = await llm(s, mode, sys, hist);
  if (s.selfCheck) {
    try {
      text = await llm(s, mode, 'Kamu editor senior. Kembalikan HANYA versi final jawaban, tanpa komentar tentang proses.',
        [{ role: 'user', content: `Permintaan pengguna:\n${q}\n\nDraf jawaban:\n${text}\n\nPeriksa: salah ketik/tata bahasa, klaim yang tidak pasti, instruksi yang terlewat, dan kalimat bertele-tele. Perbaiki lalu tulis ulang versi finalnya.` }]);
    } catch {}
  }
  if (s.memory) learn(s, mode, messages[messages.length - 1].content, text).catch(() => {});
  return { text, mode, sources: kn.map(k => k.title) };
}

async function learn(s, mode, userMsg, answer) {
  const out = await llm(s, mode, 'Ekstrak fakta penting dan tahan lama tentang pengguna (nama, brand, klien, gaya yang disukai/dibenci, warna, proyek berjalan, batasan). Balas HANYA JSON array string singkat; [] jika tidak ada.',
    [{ role: 'user', content: `Pengguna: ${userMsg}\nAsisten: ${answer.slice(0, 600)}` }], 400);
  const arr = JSON.parse(out.match(/\[[\s\S]*\]/)?.[0] || '[]');
  const mem = rd('memory.json', []);
  for (const t of arr) if (typeof t === 'string' && t.length > 3 && !mem.some(m => m.text.toLowerCase() === t.toLowerCase())) mem.push({ text: t, ts: Date.now() });
  wr('memory.json', mem.slice(-500));
}

function feedback({ up, user, answer, note }) {
  const l = rd('lessons.json', []);
  l.push({ ts: Date.now(), text: up
    ? `Jawaban untuk "${user.slice(0, 80)}" disukai. Pertahankan gaya: ${answer.slice(0, 160).replace(/\n/g, ' ')}`
    : `Untuk permintaan seperti "${user.slice(0, 100)}", jawaban sebelumnya kurang tepat${note ? ': ' + note : ''}.` });
  wr('lessons.json', l.slice(-100));
}
function delMemory(i) { const m = rd('memory.json', []); m.splice(i, 1); wr('memory.json', m); return m; }
function loadAll() { return { chats: rd('chats.json', []), settings: { ...DEFAULTS, ...rd('settings.json', {}) }, memory: rd('memory.json', []) }; }

module.exports = { init, chat, feedback, delMemory, loadAll, wr, dir: () => D };
