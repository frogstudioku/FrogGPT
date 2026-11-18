// Otak FrogGPT: model tertanam + pengetahuan SQLite FTS5 + memori pengguna + pelajaran dari koreksi
const fs = require('fs'), path = require('path'), os = require('os');
const llm = require('./llm');
let D, RES, db = null, kcount = 0;
const F = n => path.join(D, n);
const rd = (n, d) => { try { return JSON.parse(fs.readFileSync(F(n), 'utf8')); } catch { return d; } };
const wr = (n, v) => fs.writeFileSync(F(n), JSON.stringify(v, null, 1));
const tok = s => (String(s).toLowerCase().match(/[a-zà-ÿ0-9]{3,}/g) || []);
const STOP = new Set('yang untuk dengan dari dan ini itu pada atau saya kamu tolong buatkan bantu membuat the and for with are you can mohon agar akan juga sudah bisa ada lebih'.split(' '));
const DEFAULTS = { selfCheck: false, memory: true };

const SYSTEM = `Kamu adalah FrogGPT, art director & konsultan desain senior. Fokus: brief kreatif, moodboard, identitas visual, tipografi, warna, layout, packaging, UI/UX, art direction, kritik desain.
Aturan: pahami tujuan, audiens, dan batasan; jika info krusial kurang, ajukan maksimal 2 pertanyaan singkat. Beri arah yang spesifik, bukan klise: palet (hex), tipografi, komposisi, alasan. Moodboard = daftar elemen visual + kata kunci pencarian gambar. Brief = Latar belakang, Tujuan, Target audiens, Pesan utama, Tone, Deliverables, Batasan, Referensi. Jika diminta memperbaiki brief, pertahankan semua angka, ukuran, tanggal, dan nama dari teks asli. Jangan mengarang fakta. Pengguna dapat melampirkan dokumen (isinya diberikan sebagai teks) dan gambar. Kamu TIDAK bisa melihat gambar: untuk gambar kamu hanya menerima hasil analisis otomatis (ukuran, rasio, palet warna, kecerahan, kontras). Jangan berpura-pura melihat isi gambar (objek, wajah, tata letak); jika perlu, minta pengguna menjelaskan. Jawab dalam bahasa pengguna (default Indonesia), rapi dan ringkas.`;

function init(userDir, resDir) {
  D = path.join(userDir, 'frogdata'); fs.mkdirSync(D, { recursive: true }); RES = resDir;
  try {
    const Database = require('better-sqlite3');
    db = new Database(path.join(resDir, 'knowledge.db'), { readonly: true, fileMustExist: true });
    kcount = db.prepare('select n from meta').get().n;
  } catch { db = null; kcount = 0; }
}
const CATALOG = [
  { id: 'ringan', name: 'Qwen2.5 1.5B', uri: 'hf:Qwen/Qwen2.5-1.5B-Instruct-GGUF:Q4_K_M', size: 1.1, ram: 4, license: 'Apache-2.0', desc: 'Ringan & cepat, cocok laptop biasa' },
  { id: 'seimbang', name: 'Qwen2.5 3B', uri: 'hf:Qwen/Qwen2.5-3B-Instruct-GGUF:Q4_K_M', size: 2.1, ram: 8, license: 'Lisensi riset (cek dulu untuk komersial)', desc: 'Lebih rapi dari 1.5B' },
  { id: 'pintar', name: 'Qwen2.5 7B', uri: 'hf:Qwen/Qwen2.5-7B-Instruct-GGUF:Q4_K_M', size: 4.7, ram: 16, license: 'Apache-2.0', desc: 'Pintar; lambat tanpa GPU' },
  { id: 'gemma26', name: 'Gemma 4 26B A4B (2026)', uri: 'hf:unsloth/gemma-4-26B-A4B-it-GGUF:UD-Q4_K_M', size: 16.9, ram: 24, license: 'Apache-2.0', desc: 'Model 2026, cepat untuk ukurannya (hanya 4B aktif)' },
  { id: 'qwen38', name: 'Qwen3.8 27B (2026)', uri: 'hf:unsloth/Qwen3.8-27B-GGUF:UD-Q4_K_M', size: 16.6, ram: 32, license: 'Apache-2.0', desc: 'Paling pintar; lambat tanpa kartu grafis' }
];
function modelFile() {
  const st = rd('models.json', {});
  if (st.current && fs.existsSync(st.current)) return st.current;
  try { const f = fs.readdirSync(path.join(RES, 'model')).find(x => x.endsWith('.gguf')); return f ? path.join(RES, 'model', f) : null; } catch { return null; }
}
const curModelName = () => { const f = modelFile(); return f ? path.basename(f) : null; };
function models() {
  const st = rd('models.json', {}), installed = {};
  for (const [k, v] of Object.entries(st.installed || {})) if (fs.existsSync(v)) installed[k] = v;
  const ram = Math.round(os.totalmem() / 1073741824);
  return { catalog: CATALOG, installed, current: modelFile(), ramGB: ram, rec: ram >= 24 ? 'gemma26' : ram >= 16 ? 'pintar' : ram >= 8 ? 'seimbang' : 'ringan' };
}
async function downloadModel(id, onProgress) {
  const c = CATALOG.find(x => x.id === id); if (!c) throw new Error('Model tidak dikenal.');
  let file;
  try { file = await llm.download(c.uri, path.join(D, 'models'), onProgress); }
  catch (e) { throw new Error('Gagal mengunduh model (butuh internet sekali): ' + e.message); }
  const st = rd('models.json', {}); st.installed = { ...(st.installed || {}), [id]: file }; st.current = file; wr('models.json', st);
  return { file };
}
function useModel(id) {
  const st = rd('models.json', {}), f = (st.installed || {})[id];
  if (!f || !fs.existsSync(f)) throw new Error('File model tidak ditemukan. Unduh ulang.');
  st.current = f; wr('models.json', st);
}
function setModelFile(f) { const st = rd('models.json', {}); st.current = f; wr('models.json', st); }

// Pencarian BM25 di SQLite FTS5: cepat walau jutaan entri.
// Lampiran: gabungkan teks dokumen & analisis gambar ke pesan; dokumen panjang dipotong ke bagian paling relevan.
function pick(text, q, budget) {
  if (text.length <= budget) return text;
  const qt = new Set(tok(q)), chunks = [];
  for (let i = 0; i < text.length; i += 900) chunks.push(text.slice(i, i + 900));
  const scored = chunks.map((c, i) => [i === 0 ? 1e6 : tok(c).filter(w => qt.has(w)).length, i, c]).sort((a, b) => b[0] - a[0]);
  let used = 0; const sel = [];
  for (const s of scored) { if (used + s[2].length > budget) continue; sel.push(s); used += s[2].length; }
  return sel.sort((a, b) => a[1] - b[1]).map(s => s[2].trim()).join('\n[...]\n') + '\n(Dokumen panjang: hanya bagian yang paling relevan dikirim ke model.)';
}
function withAttachments(m, q, budget) {
  let c = m.content;
  for (const im of m.imgs || []) c += `\n\n[Lampiran gambar: ${im.name}] Hasil analisis otomatis (bukan penglihatan): ${im.info}`;
  const docs = m.docs || [];
  for (const d of docs) c += `\n\n[Lampiran dokumen: ${d.name}]\n${pick(d.text, q, Math.floor(budget / docs.length))}`;
  return c;
}

function kbSearch(q, n = 4) {
  if (!db) return [];
  const t = [...new Set(tok(q))].filter(w => !STOP.has(w)).sort((a, b) => b.length - a.length).slice(0, 8);
  if (!t.length) return [];
  try { return db.prepare('select title, text from kb where kb match ? order by bm25(kb, 8, 1, 2, 3) limit ?').all(t.map(x => `"${x}"`).join(' OR '), n); }
  catch { return []; }
}

// Pencarian sederhana untuk memori pengguna (jumlahnya kecil).
function memSearch(q, items, n) {
  const qt = new Set(tok(q)); if (!qt.size) return [];
  return items.map(i => [tok(i.text).filter(w => qt.has(w)).length, i]).filter(x => x[0] > 0).sort((a, b) => b[0] - a[0]).slice(0, n).map(x => x[1]);
}

async function chat({ messages }, onToken) {
  const s = { ...DEFAULTS, ...rd('settings.json', {}) };
  const file = modelFile();
  if (!file) throw new Error('Belum ada model AI. Buka Pengaturan, lalu pilih "Ganti model".');
  const q = messages.filter(m => m.role === 'user').slice(-2).map(m => m.content).join(' ');
  const kn = kbSearch(q, 4);
  const rel = s.memory ? memSearch(q, rd('memory.json', []), 5) : [], lessons = rd('lessons.json', []).slice(-6);
  const sys = SYSTEM
    + (kn.length ? '\n\nPENGETAHUAN DESAIN RELEVAN:\n' + kn.map(k => `- ${k.title}: ${k.text.slice(0, 450)}`).join('\n') : '')
    + (rel.length ? '\n\nYANG KAMU INGAT TENTANG PENGGUNA (pakai untuk personalisasi & saran proaktif):\n' + rel.map(m => '- ' + m.text).join('\n') : '')
    + (lessons.length ? '\n\nPELAJARAN DARI KOREKSI SEBELUMNYA (jangan ulangi):\n' + lessons.map(l => '- ' + l.text).join('\n') : '');
  const budget = Math.min(14000, Math.max(3000, (llm.contextSize() - 2200) * 3));   // karakter untuk lampiran
  const hist = messages.slice(-8).map((m, i, a) => ({ role: m.role, content: m.role === 'user' ? withAttachments(m, q, i === a.length - 1 ? budget : 1200) : m.content }));
  let text = await llm.ask(file, sys, hist, { onToken: s.selfCheck ? null : onToken });
  if (s.selfCheck) {
    try {
      const fixed = await llm.ask(file, 'Kamu editor bahasa Indonesia. Tulis ulang teks berikut dengan ejaan dan tata bahasa yang benar tanpa mengubah isi, format, angka, atau nama. Balas hanya teks hasilnya.',
        [{ role: 'user', content: text }], { temp: 0.2, max: 1200, onToken });
      if (fixed.length > text.length * 0.6) text = fixed;
    } catch {}
  }
  if (s.memory) learn(messages[messages.length - 1].content);
  return { text, sources: kn.map(k => k.title) };
}

// Belajar dari chat tanpa memanggil model: ambil kalimat berisi fakta/preferensi pengguna.
function learn(msg) {
  if (msg.length > 500) return;
  const mem = rd('memory.json', []);
  for (const sent of msg.split(/(?<=[.!?\n])\s+/)) {
    const t = sent.trim();
    if (t.length < 15 || t.length > 200) continue;
    if (/\b(saya|kami|brand|klien|proyek|perusahaan|toko|usaha)\b/i.test(t) && /\b(suka|benci|tidak suka|ingin|butuh|bernama|adalah|memakai|pakai|menggunakan|target|jualan|menjual)\b/i.test(t)
      && !mem.some(m => m.text.toLowerCase() === t.toLowerCase())) mem.push({ text: t, ts: Date.now() });
  }
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
function loadAll() { return { chats: rd('chats.json', []), settings: { ...DEFAULTS, ...rd('settings.json', {}) }, memory: rd('memory.json', []), kcount, model: curModelName() }; }

module.exports = { withAttachments, models, downloadModel, useModel, setModelFile, init, chat, feedback, delMemory, loadAll, wr, kbSearch };
