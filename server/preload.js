const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    resetFocus: () => ipcRenderer.send('reset-focus'),
    selectFile: () => ipcRenderer.invoke('select-file'),
    readFile: (path) => ipcRenderer.invoke('read-file', path),
    onUpdateAvailable: (callback) => ipcRenderer.on('update_available', (_event, value) => callback(value)),
    onUpdateDownloaded: (callback) => ipcRenderer.on('update_downloaded', (_event, value) => callback(value)),
    restartApp: () => ipcRenderer.send('restart_app')
});
