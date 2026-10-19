// PhoneDukaan Bill Pro — preload bridge (desktop/PC build).
// Minimal, auditable surface: desktop identity + opt-in Google Drive backup relay.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('phoneDukaanDesktop', {
  isElectron: true,
  platform: process.platform,
  driveAuthStart: () => ipcRenderer.invoke('pd-drive:auth-start'),
  driveToken: () => ipcRenderer.invoke('pd-drive:token'),
  driveEnsureFolder: () => ipcRenderer.invoke('pd-drive:ensure-folder'),
  driveFindFile: (query) => ipcRenderer.invoke('pd-drive:find-file', query),
  driveList: (query) => ipcRenderer.invoke('pd-drive:list', query),
  driveUpload: (query) => ipcRenderer.invoke('pd-drive:upload', query),
  driveDownload: (query) => ipcRenderer.invoke('pd-drive:download', query),
  driveRevoke: () => ipcRenderer.invoke('pd-drive:revoke'),
});
