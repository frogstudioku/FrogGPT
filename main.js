const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path'), fs = require('fs');
const brain = require('./src/brain');
const docs = require('./src/docs');

const RES = app.isPackaged ? path.join(process.resourcesPath, 'data') : path.join(__dirname, 'resources');
const ICON = path.join(__dirname, 'renderer', 'logo.png');
const SPLASH_MS = 3000; // lama minimum splash screen tampil
let win;

app.whenReady().then(() => {
  const t0 = Date.now();
  brain.init(app.getPath('userData'), RES);

  // Splash screen: tanpa bingkai, tanpa bayangan
  const splash = new BrowserWindow({
    width: 960, height: 640, frame: false, transparent: true, hasShadow: false, resizable: false,
    movable: false, center: true, show: false, skipTaskbar: true, alwaysOnTop: true, icon: ICON
  });
  splash.loadFile('renderer/splash.html');
  splash.once('ready-to-show', () => splash.show());

  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 820, minHeight: 560, title: 'FrogGPT', show: false,
    backgroundColor: '#15110e', autoHideMenuBar: true, icon: ICON,
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  });
  win.loadFile('renderer/index.html');
  win.once('ready-to-show', () => setTimeout(() => {
    win.show(); if (!splash.isDestroyed()) splash.destroy();
  }, Math.max(0, SPLASH_MS - (Date.now() - t0))));
});
app.on('window-all-closed', () => app.quit());

ipcMain.handle('load', () => brain.loadAll());
ipcMain.handle('extractDoc', async (_, name, data) => {
  try { return await docs.extract(name, data); } catch (e) { return { error: e.message }; }
});
ipcMain.handle('eula', () => fs.readFileSync(path.join(__dirname, 'EULA.txt'), 'utf8'));
ipcMain.handle('saveChats', (_, c) => brain.wr('chats.json', c));
ipcMain.handle('saveSettings', (_, s) => brain.wr('settings.json', s));
ipcMain.handle('chat', async (_, p) => {
  try { return await brain.chat(p, t => win.webContents.send('tok', t)); }
  catch (e) { return { error: e.message }; }
});
ipcMain.handle('feedback', (_, f) => brain.feedback(f));
ipcMain.handle('delMemory', (_, i) => brain.delMemory(i));
ipcMain.handle('models', () => brain.models());
ipcMain.handle('modelDownload', async (_, id) => {
  try { return await brain.downloadModel(id, p => win.webContents.send('dl', { id, p })); }
  catch (e) { return { error: e.message }; }
});
ipcMain.handle('modelUse', (_, id) => { try { brain.useModel(id); return {}; } catch (e) { return { error: e.message }; } });
ipcMain.handle('modelBrowse', async () => {
  const r = await dialog.showOpenDialog(win, { filters: [{ name: 'Model GGUF', extensions: ['gguf'] }], properties: ['openFile'] });
  if (r.canceled) return {};
  brain.setModelFile(r.filePaths[0]); return { file: r.filePaths[0] };
});
