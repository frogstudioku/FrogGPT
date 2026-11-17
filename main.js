const { app, BrowserWindow, ipcMain, dialog, net } = require('electron');
const path = require('path'), fs = require('fs');
const brain = require('./src/brain');

let kcount = 0;
app.whenReady().then(() => {
  kcount = brain.init(app.getPath('userData'), __dirname);
  const win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 820, minHeight: 560, title: 'FrogGPT',
    backgroundColor: '#faf9f6', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  });
  win.loadFile('renderer/index.html');
});
app.on('window-all-closed', () => app.quit());

ipcMain.handle('load', () => ({ ...brain.loadAll(), kcount, online: net.isOnline() }));
ipcMain.handle('saveChats', (_, c) => brain.wr('chats.json', c));
ipcMain.handle('saveSettings', (_, s) => brain.wr('settings.json', s));
ipcMain.handle('chat', async (_, p) => {
  try { return await brain.chat({ ...p, online: net.isOnline() }); }
  catch (e) { return { error: e.message }; }
});
ipcMain.handle('feedback', (_, f) => brain.feedback(f));
ipcMain.handle('delMemory', (_, i) => brain.delMemory(i));
ipcMain.handle('importKnowledge', async () => {
  const r = await dialog.showOpenDialog({ filters: [{ name: 'JSON', extensions: ['json'] }], properties: ['openFile', 'multiSelections'] });
  if (r.canceled) return kcount;
  r.filePaths.forEach(f => fs.copyFileSync(f, path.join(brain.dir(), 'knowledge', Date.now() + '-' + path.basename(f))));
  return (kcount = brain.init(app.getPath('userData'), __dirname));
});
