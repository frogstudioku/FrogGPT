# FrogGPT — AI Art Director (model tertanam, 100% offline)

Aplikasi desktop Windows (Electron). Tidak memakai Ollama, Anthropic, atau server apa pun.
- **Model AI**: file `.gguf` dijalankan langsung di dalam aplikasi lewat `node-llama-cpp`.
- **Pengetahuan**: database SQLite FTS5 (`knowledge.db`) ikut terpasang; pencarian BM25 tetap cepat untuk jutaan entri.
- **Memori & koreksi**: tersimpan di `%APPDATA%/FrogGPT/frogdata/`.

## Bangun EXE (GitHub Actions)
1. Taruh sumber pengetahuan di `knowledge-src/` (`.json`, `.jsonl`, `.md`, `.txt`).
2. Push tag, mis. `v0.2.0`. Workflow membangun `knowledge.db`, mengunduh model Qwen2.5-1.5B-Instruct (Q4_K_M), lalu mengemasnya ke installer.

## Jalankan lokal
```
npm install
npm run build-kb                 # membuat resources/knowledge.db (jalankan SEBELUM rebuild)
npm run rebuild                   # mengompilasi modul native untuk Electron (sekali)
# letakkan model di resources/model/model.gguf
npm start
```
Model lain: taruh file `.gguf` apa pun di `resources/model/` (cek lisensinya sebelum dibagikan).

## Batas
- Installer NSIS dan aset GitHub Release maksimal ±2 GB (model + database + Electron).
- Model kecil (1–3B) lemah di bahasa Indonesia dan penalaran; jawaban perlu ditinjau.
