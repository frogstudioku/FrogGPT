// Membuat basis pengetahuan desain (target 5000 entri) memakai LLM.
// Online : ANTHROPIC_API_KEY=... node tools/gen-knowledge.js --expand --per 20
// Offline: pastikan Ollama berjalan, lalu: node tools/gen-knowledge.js --expand
const fs = require('fs'), path = require('path');
const arg = n => process.argv.includes('--' + n) ? process.argv[process.argv.indexOf('--' + n) + 1] : null;
const PER = +(arg('per') || 20), OUT = path.join(__dirname, '..', 'knowledge', 'generated');
const KEY = process.env.ANTHROPIC_API_KEY, MODEL = process.env.MODEL || (KEY ? 'claude-sonnet-5-5' : 'qwen2.5:7b');
const ANGLES = 'definisi, prinsip inti, kesalahan umum, contoh penerapan, checklist, istilah teknis, studi kasus singkat, tips art director, tren, batasan/kapan dilanggar, pertanyaan untuk klien, pengaruh budaya, alat/software, aksesibilitas, cetak vs digital, referensi gaya, cara memberi kritik, contoh kalimat brief, hubungan dengan elemen lain, latihan';

async function ask(p) {
  if (KEY) {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 8000, messages: [{ role: 'user', content: p }] }) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error?.message); return j.content[0].text;
  }
  const r = await fetch('http://127.0.0.1:11434/api/chat', { method: 'POST', body: JSON.stringify({ model: MODEL, stream: false, messages: [{ role: 'user', content: p }] }) });
  return (await r.json()).message.content;
}
const json = t => JSON.parse(t.match(/[\[{][\s\S]*[\]}]/)[0]);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const tf = path.join(__dirname, 'topics.json'); const topics = JSON.parse(fs.readFileSync(tf, 'utf8'));
  if (process.argv.includes('--expand')) for (const cat in topics) {
    const more = json(await ask(`Beri 25 subtopik desain BARU untuk kategori "${cat}" (selain: ${topics[cat].join(', ')}). Balas JSON array string saja.`));
    topics[cat] = [...new Set([...topics[cat], ...more])]; console.log('expand', cat, topics[cat].length);
  }
  fs.writeFileSync(tf, JSON.stringify(topics, null, 1));
  let total = 0;
  for (const cat in topics) for (const sub of topics[cat]) {
    const f = path.join(OUT, (cat + '-' + sub).replace(/[^\w]+/g, '_') + '.json'); if (fs.existsSync(f)) continue;
    try {
      const arr = json(await ask(`Tulis ${PER} entri pengetahuan desain AKURAT berbahasa Indonesia untuk subtopik "${sub}" (kategori ${cat}). Tiap entri memakai sudut berbeda dari: ${ANGLES}. Tiap entri 2–4 kalimat, padat, spesifik, tanpa mengarang fakta/tanggal. Balas JSON array: [{"title","text","tags":[...]}]`));
      fs.writeFileSync(f, JSON.stringify(arr.map((e, i) => ({ id: `${sub}-${i}`, topic: cat, ...e })), null, 1)); total += arr.length; console.log(sub, arr.length);
    } catch (e) { console.log('gagal', sub, e.message); }
  }
  console.log('Selesai. Entri baru:', total);
})();
