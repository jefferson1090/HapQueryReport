const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    resetFocus: () => ipcRenderer.send('reset-focus')
});
