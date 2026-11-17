const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const brain = require('./src/brain');

const RES = app.isPackaged ? path.join(process.resourcesPath, 'data') : path.join(__dirname, 'resources');
let win;
app.whenReady().then(() => {
  brain.init(app.getPath('userData'), RES);
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 820, minHeight: 560, title: 'FrogGPT',
    backgroundColor: '#faf9f6', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  });
  win.loadFile('renderer/index.html');
});
app.on('window-all-closed', () => app.quit());

ipcMain.handle('load', () => brain.loadAll());
ipcMain.handle('saveChats', (_, c) => brain.wr('chats.json', c));
ipcMain.handle('saveSettings', (_, s) => brain.wr('settings.json', s));
ipcMain.handle('chat', async (_, p) => {
  try { return await brain.chat(p, t => win.webContents.send('tok', t)); }
  catch (e) { return { error: e.message }; }
});
ipcMain.handle('feedback', (_, f) => brain.feedback(f));
ipcMain.handle('delMemory', (_, i) => brain.delMemory(i));
