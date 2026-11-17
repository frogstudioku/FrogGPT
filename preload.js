const { contextBridge, ipcRenderer: ipc } = require('electron');
contextBridge.exposeInMainWorld('api', {
  load: () => ipc.invoke('load'),
  saveChats: c => ipc.invoke('saveChats', c),
  saveSettings: s => ipc.invoke('saveSettings', s),
  chat: p => ipc.invoke('chat', p),
  feedback: f => ipc.invoke('feedback', f),
  delMemory: i => ipc.invoke('delMemory', i),
  onTok: cb => ipc.on('tok', (_, t) => cb(t))
});
