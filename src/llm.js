// Mesin AI tertanam: menjalankan file .gguf langsung di aplikasi (node-llama-cpp), tanpa server.
let lib, llama, model, ctx, loaded = null, queue = Promise.resolve();

async function unload() { try { await ctx?.dispose(); await model?.dispose(); } catch {} ctx = model = null; loaded = null; }

async function load(file) {
  if (ctx && loaded === file) return;      // model berganti -> muat ulang otomatis
  await unload();
  try {
    lib = lib || await import('node-llama-cpp');
    llama = llama || await lib.getLlama();
    model = await llama.loadModel({ modelPath: file });
    ctx = await model.createContext({ contextSize: 4096 });
    loaded = file;
  } catch (e) { await unload(); throw new Error('Gagal memuat model AI: ' + e.message + ' (jika RAM kurang, pilih model yang lebih kecil).'); }
}

// Unduh model dari Hugging Face (alamat "hf:pengguna/repo:kuantisasi"); mendukung model yang terpecah beberapa file.
async function download(uri, dir, onProgress) {
  lib = lib || await import('node-llama-cpp');
  const d = await lib.createModelDownloader({ modelUri: uri, dirPath: dir,
    onProgress: s => { if (onProgress && s.totalSize) onProgress(s.downloadedSize / s.totalSize); } });
  return d.download();
}

// Satukan pesan berurutan dari peran yang sama agar riwayat selalu bergantian user/model.
function toHistory(system, msgs) {
  const h = [{ type: 'system', text: system }];
  for (const m of msgs) {
    const type = m.role === 'user' ? 'user' : 'model', last = h[h.length - 1];
    if (last.type === type) { if (type === 'user') last.text += '\n' + m.content; else last.response[0] += '\n' + m.content; }
    else h.push(type === 'user' ? { type, text: m.content } : { type, response: [m.content] });
  }
  return h;
}

// Antrian: model hanya melayani satu permintaan pada satu waktu.
function ask(file, system, messages, { max = 900, temp = 0.6, onToken } = {}) {
  const run = async () => {
    await load(file);
    const last = messages[messages.length - 1];
    const seq = ctx.getSequence();
    let session;
    try {
      session = new lib.LlamaChatSession({ contextSequence: seq, autoDisposeSequence: true });
      session.setChatHistory(toHistory(system, messages.slice(0, -1)));
      return await session.prompt(last.content, { maxTokens: max, temperature: temp, onTextChunk: onToken || undefined });
    } finally {
      // Wajib mengembalikan jalur (sequence); jika tidak, pesan berikutnya gagal: "No sequences left".
      if (session) session.dispose({ disposeSequence: true }); else seq.dispose();
    }
  };
  const p = queue.then(run, run); queue = p.catch(() => {}); return p;
}
module.exports = { ask, download };
