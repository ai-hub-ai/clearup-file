const { contextBridge, ipcRenderer, clipboard } = require('electron')

contextBridge.exposeInMainWorld('api', {
  scanStart: (opts) => ipcRenderer.invoke('scan:start', opts),
  scanStop: () => ipcRenderer.invoke('scan:stop'),
  scanPause: () => ipcRenderer.invoke('scan:pause'),
  scanResume: () => ipcRenderer.invoke('scan:resume'),
  onScanMatch: (cb) => ipcRenderer.on('scan:match', (_e, data) => cb(data)),
  onScanMatchBatch: (cb) => ipcRenderer.on('scan:matchBatch', (_e, data) => cb(data)),
  onScanProgress: (cb) => ipcRenderer.on('scan:progress', (_e, data) => cb(data)),
  onScanDone: (cb) => ipcRenderer.on('scan:done', (_e, data) => cb(data)),
  deleteFiles: (paths) => ipcRenderer.invoke('file:delete', { paths }),
  trashFiles: (paths) => ipcRenderer.invoke('file:trash', { paths }),
  revealInFolder: (path) => ipcRenderer.invoke('file:reveal', { path }),
  openPath: (path) => ipcRenderer.invoke('file:open', { path }),
  copyText: (text) => clipboard.writeText(String(text || '')),
  moveFiles: (paths, destination) => ipcRenderer.invoke('file:move', { paths, destination }),
  openDirectoryDialog: () => ipcRenderer.invoke('dialog:openDir')
})
