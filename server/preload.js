const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    resetFocus: () => ipcRenderer.send('reset-focus'),
    selectFile: () => ipcRenderer.invoke('select-file'),
    readFile: (path) => ipcRenderer.invoke('read-file', path)
});
