const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    resetFocus: () => ipcRenderer.send('reset-focus'),
    selectFile: () => ipcRenderer.invoke('select-file'),
    readFile: (path) => ipcRenderer.invoke('read-file', path),
    onUpdateAvailable: (callback) => ipcRenderer.on('update_available', (_event, value) => callback(value)),
    onUpdateDownloaded: (callback) => ipcRenderer.on('update_downloaded', (_event, value) => callback(value)),
    onDownloadProgress: (callback) => ipcRenderer.on('download_progress', (_event, value) => callback(value)),
    onUpdateNotAvailable: (callback) => ipcRenderer.on('update_not_available', (_event, value) => callback(value)),
    onUpdateError: (callback) => ipcRenderer.on('update_error', (_event, value) => callback(value)),
    restartApp: () => ipcRenderer.send('restart_app'),
    showItemInFolder: (path) => ipcRenderer.invoke('show-item-in-folder', path),
    saveFile: (data) => ipcRenderer.invoke('save-file', data),
    exportPDF: (html) => ipcRenderer.invoke('export-pdf', html),
    getServerPort: () => ipcRenderer.invoke('get-server-port'),
    // Generic invoke for dynamic calls (updates, etc)
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args)
});
