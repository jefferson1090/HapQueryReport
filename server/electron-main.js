const { app, BrowserWindow, ipcMain } = require('electron');
console.log('ELECTRON_RUN_AS_NODE:', process.env.ELECTRON_RUN_AS_NODE);
console.log('App type:', typeof app);
const path = require('path');
const server = require('./index'); // This starts the Express server

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        icon: path.join(__dirname, 'icon.png')
    });

    // Load the local server
    // Note: index.js starts listening on port 3001
    mainWindow.loadURL('http://localhost:3001');

    mainWindow.on('closed', function () {
        mainWindow = null;
    });
}

// IPC Handler for Radical Focus Fix
ipcMain.on('reset-focus', () => {
    if (mainWindow) {
        mainWindow.blur();
        mainWindow.focus();
    }
});

const { dialog } = require('electron');
const fs = require('fs');

ipcMain.handle('select-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [{ name: 'CSV Files', extensions: ['csv', 'txt'] }]
    });
    return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('read-file', async (event, path) => {
    return await fs.promises.readFile(path, 'utf-8');
});

const { shell } = require('electron');
ipcMain.handle('show-item-in-folder', async (event, path) => {
    shell.showItemInFolder(path);
});

ipcMain.handle('save-file', async (event, { filename, content, type }) => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        defaultPath: filename,
        filters: [
            { name: type === 'csv' ? 'CSV Files' : 'Excel Files', extensions: [type] }
        ]
    });

    if (canceled || !filePath) return null;

    // Content determines format. If it's a buffer (Excel), write buffer. 
    // We expect content to be passed appropriately.
    // For simplicity, we'll assume content is passed as a Buffer or string.
    // However, JSON IPC doesn't handle Buffers well without conversion. 
    // We will expect base64 string for binary (xlsx) and plain string for text (csv).

    if (type === 'xlsx') {
        await fs.promises.writeFile(filePath, Buffer.from(content, 'base64'));
    } else {
        await fs.promises.writeFile(filePath, content, 'utf-8');
    }

    return filePath;
});

const { autoUpdater } = require('electron-updater');

// Auto-updater events
autoUpdater.on('update-available', () => {
    if (mainWindow) mainWindow.webContents.send('update_available');
});

autoUpdater.on('update-downloaded', () => {
    if (mainWindow) mainWindow.webContents.send('update_downloaded');
});

ipcMain.on('restart_app', () => {
    autoUpdater.quitAndInstall();
});

app.on('ready', () => {
    createWindow();
    autoUpdater.checkForUpdatesAndNotify();
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') {
        app.quit();
        process.exit(0); // Force exit to kill child processes (Express server)
    }
});

app.on('activate', function () {
    if (mainWindow === null) {
        createWindow();
    }
});
