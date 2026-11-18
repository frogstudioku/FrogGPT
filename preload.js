const { contextBridge, ipcRenderer: ipc } = require('electron');
contextBridge.exposeInMainWorld('api', {
  load: () => ipc.invoke('load'),
  saveChats: c => ipc.invoke('saveChats', c),
  saveSettings: s => ipc.invoke('saveSettings', s),
  chat: p => ipc.invoke('chat', p),
  feedback: f => ipc.invoke('feedback', f),
  delMemory: i => ipc.invoke('delMemory', i),
  extractDoc: (n, d) => ipc.invoke('extractDoc', n, d),
  eula: () => ipc.invoke('eula'),
  models: () => ipc.invoke('models'),
  downloadModel: id => ipc.invoke('modelDownload', id),
  useModel: id => ipc.invoke('modelUse', id),
  browseModel: () => ipc.invoke('modelBrowse'),
  onDl: cb => ipc.on('dl', (_, d) => cb(d)),
  onTok: cb => ipc.on('tok', (_, t) => cb(t))
});
