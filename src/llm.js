// Mesin AI tertanam: menjalankan file .gguf langsung di aplikasi (node-llama-cpp), tanpa server & tanpa internet.
let lib, ctx, queue = Promise.resolve();

async function load(file) {
  if (ctx) return;
  try {
    lib = await import('node-llama-cpp');
    const llama = await lib.getLlama();
    const model = await llama.loadModel({ modelPath: file });
    ctx = await model.createContext({ contextSize: 4096 });
  } catch (e) { throw new Error('Gagal memuat model AI: ' + e.message); }
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
    const session = new lib.LlamaChatSession({ contextSequence: ctx.getSequence() });
    session.setChatHistory(toHistory(system, messages.slice(0, -1)));
    try { return await session.prompt(last.content, { maxTokens: max, temperature: temp, onTextChunk: onToken || undefined }); }
    finally { session.dispose(); }
  };
  const p = queue.then(run, run); queue = p.catch(() => {}); return p;
}
module.exports = { ask };
