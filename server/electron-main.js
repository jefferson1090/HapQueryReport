const { app, BrowserWindow } = require('electron');
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
