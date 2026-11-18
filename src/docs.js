// Membaca teks dari dokumen lampiran (semuanya offline).
const path = require('path');
const MAX_CHARS = 60000;               // batas teks yang disimpan per dokumen
const PLAIN = ['.txt', '.md', '.csv', '.tsv', '.json', '.xml', '.srt', '.log', '.html', '.htm'];

async function extract(name, data) {
  const buf = Buffer.from(data), ext = path.extname(name).toLowerCase();
  if (buf.length > 25 * 1024 * 1024) throw new Error('File terlalu besar (maksimal 25 MB).');
  let text;
  if (ext === '.docx') text = (await require('mammoth').extractRawText({ buffer: buf })).value;
  else if (ext === '.pdf') {
    const { extractText, getDocumentProxy } = await import('unpdf');
    text = (await extractText(await getDocumentProxy(new Uint8Array(buf)), { mergePages: true })).text;
  } else if (PLAIN.includes(ext)) {
    text = buf.toString('utf8');
    if (ext === '.html' || ext === '.htm') text = text.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ');
  } else throw new Error('Format ' + (ext || 'ini') + ' belum didukung. Gunakan PDF, DOCX, TXT, MD, CSV, atau JSON.');
  text = String(text).replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) throw new Error('Tidak ada teks yang bisa dibaca (mungkin PDF hasil scan atau berisi gambar saja).');
  return { name, text: text.slice(0, MAX_CHARS), chars: text.length, truncated: text.length > MAX_CHARS };
}
module.exports = { extract };
