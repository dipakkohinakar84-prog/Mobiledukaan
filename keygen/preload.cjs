// PhoneDukaan KeyGen — preload: minimal IPC bridge, no Node in the window.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('keygen', {
  issue: (deviceId) => ipcRenderer.invoke('keygen:issue', deviceId),
  getLog: () => ipcRenderer.invoke('keygen:log'),
  openLogFolder: () => ipcRenderer.invoke('keygen:log-folder'),
  getPaths: () => ipcRenderer.invoke('keygen:paths'),
});
