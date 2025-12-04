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
        icon: path.join(__dirname, 'public', 'vite.svg') // Optional: Add an icon
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

app.on('ready', createWindow);

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
