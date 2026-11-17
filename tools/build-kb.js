// Membangun knowledge.db (SQLite FTS5) dari folder sumber.
// Pakai: node tools/build-kb.js knowledge-src resources/knowledge.db
// Format sumber: .json (array entri), .jsonl (satu entri per baris; disarankan untuk data besar), .md/.txt (dipotong per paragraf).
// Entri: {"title","text","topic","tags":[...]}
const fs = require('fs'), path = require('path'), Database = require('better-sqlite3');
const src = process.argv[2] || 'knowledge-src', out = process.argv[3] || 'resources/knowledge.db';
fs.mkdirSync(path.dirname(out), { recursive: true }); if (fs.existsSync(out)) fs.unlinkSync(out);
const db = new Database(out); db.pragma('journal_mode=OFF'); db.pragma('synchronous=OFF');
db.exec('create virtual table kb using fts5(title, text, topic, tags, tokenize="unicode61 remove_diacritics 2"); create table meta(n integer);');
const ins = db.prepare('insert into kb values (?,?,?,?)'); let n = 0;
const add = e => { if (!e || !e.text || String(e.text).length < 20) return; ins.run(String(e.title || ''), String(e.text), String(e.topic || ''), (e.tags || []).join(' ')); n++; };
const chunk = (name, txt) => { let buf = ''; for (const p of txt.split(/\n\s*\n/)) { if (buf && (buf + p).length > 700) { add({ title: name, text: buf.trim(), topic: 'dokumen' }); buf = ''; } buf += p + '\n\n'; } add({ title: name, text: buf.trim(), topic: 'dokumen' }); };
const walk = d => { for (const f of fs.readdirSync(d, { withFileTypes: true })) {
  const p = path.join(d, f.name);
  if (f.isDirectory()) walk(p);
  else if (/\.json$/i.test(f.name)) { const j = JSON.parse(fs.readFileSync(p, 'utf8')); (Array.isArray(j) ? j : [j]).forEach(add); }
  else if (/\.jsonl$/i.test(f.name)) fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).forEach(l => add(JSON.parse(l)));
  else if (/\.(md|txt)$/i.test(f.name)) chunk(f.name.replace(/\.\w+$/, ''), fs.readFileSync(p, 'utf8'));
} };
db.transaction(() => walk(src))();
db.prepare('insert into meta values (?)').run(n); db.exec("insert into kb(kb) values('optimize')"); db.close();
console.log('Entri:', n, '->', out);
