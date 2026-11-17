# FrogGPT — AI Art Director untuk Windows

Aplikasi desktop (Electron) berfokus pada desain: brief, moodboard, art direction, kritik.
- **Online**: Claude API (isi API key di Pengaturan).
- **Offline**: model lokal lewat [Ollama](https://ollama.com) (`ollama pull qwen2.5:7b`).
- **Otomatis**: online bila ada internet + API key, selain itu offline.

## Jalankan
```
npm install
npm start
```
## Bangun EXE
Lokal: `npm run dist` → hasil di `dist/` (installer + portable).
GitHub: push tag `v0.1.0` → Actions membangun EXE dan melampirkannya ke Release.

## Basis pengetahuan 5000 entri
`knowledge/seed.json` hanya 12 contoh. Untuk 5000 entri:
```
ANTHROPIC_API_KEY=sk-ant-... npm run gen-knowledge -- --expand --per 20
```
Skrip memperluas `tools/topics.json` (12 kategori × ~30 subtopik) lalu menulis ±20 entri per subtopik ke `knowledge/generated/`. Bisa dilanjutkan jika terhenti. **Tinjau hasilnya** sebelum dirilis, karena ditulis oleh LLM.

## Cara "belajar"
Model tidak dilatih ulang. Peningkatannya lewat: (1) memori fakta pengguna, (2) pelajaran dari 👍/👎+koreksi, (3) pencarian pengetahuan desain, (4) pass self-check sebelum jawaban tampil.

## Data pengguna
`%APPDATA%/FrogGPT/frogdata/` (chats, memory, lessons, settings).
