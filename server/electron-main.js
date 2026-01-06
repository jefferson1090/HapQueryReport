delete process.env.ELECTRON_RUN_AS_NODE;
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
console.log('App type:', typeof app);
const path = require('path');
const net = require('net');
const startServer = require('./index'); // Restored internal require
const chatService = require('./services/chatService');
const dataBackupService = require('./services/dataBackupService');

// ... (existing code)

// --- Custom Update Check (Supabase Cloud) ---
ipcMain.handle('check-updates', async () => {
    try {
        const info = await chatService.getLatestVersion();
        if (info) {
            return info;
        }
    } catch (e) {
        console.error("Failed to check for updates:", e);
    }
    return null;
});

ipcMain.handle('open-update-folder', async () => {
    // We open the URL from the cloud record if possible, but the UI might just call this for the folder.
    // Wait, the UI calls this button "Baixar".
    // If we want to support the URL from the database, the UI should probably receive the URL in the updateInfo and just openExternal(url).
    // But to keep backward compatibility or use the folder, we can try to look up the DB again OR just use the fallback logic if not provided?
    // Actually, better: The UI received 'downloadUrl' in updateInfo.
    // I should probably change the UI to use 'shell.openExternal(info.downloadUrl)' directly if available?
    // BUT, to keep it simple and consistent:
    // I will make open-update-folder open the OneDrive text path if env var exists, OR rely on the DB url?
    // Let's stick to the existing logic for open-update-folder but prefer the One Drive path if local, 
    // However, the user said "The download link can be the OneDrive web address".
    // So, checking for updates returns { downloadUrl: 'https://...' }.
    // The UI currently calls `open-update-folder` IPC without args.
    // Check UpdateBanner.jsx: `onDownload={() => window.electronAPI?.invoke('open-update-folder')}`.
    // Use shell.openExternal(updateInfo.downloadUrl) would be better.

    // Let's modify this handler to try to read the Cloud URL if we can, or just keep the folder logic?
    // User said "Link de download... pode ser o endereço Web".
    // So I should probably change the handler to open the Web URL.
    // But I don't have the URL here unless I query again. 

    // FIX: I'll make the UI pass the URL? No, UI calls 'open-update-folder'.
    // I will query the version again or just fallback.
    // Actually, the simplest for now is:
    // 1. Get latest version (cached or fresh).
    // 2. Open its URL.

    const latest = await chatService.getLatestVersion();
    if (latest && latest.downloadUrl && latest.downloadUrl.startsWith('http')) {
        await shell.openExternal(latest.downloadUrl);
    } else {
        // Fallback to local folder opening if URL is missing or file path
        const oneDriveRoot = process.env.OneDrive || process.env.ONEDRIVE;
        if (oneDriveRoot) {
            const updateFolder = path.join(oneDriveRoot, "JEFFERSON", "versoes_app", "Version_HapAssistente");
            await shell.openPath(updateFolder);
        } else {
            shell.openFolder("Z:\\Jefferson\\Projeto Desktop Quere");
        }
    }
});

function findFreePort(startPort) {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.listen(startPort, () => {
            const port = server.address().port;
            server.close(() => resolve(port));
        });
        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                resolve(findFreePort(startPort + 1));
            } else {
                reject(err);
            }
        });
    });
}

let mainWindow;
// let serverProcess;

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
    const startUrl = process.env.ELECTRON_START_URL || `http://localhost:${serverPort}`;
    mainWindow.loadURL(startUrl);

    // Clear cache to ensure latest version is loaded
    mainWindow.webContents.session.clearCache().then(() => {
        console.log('Session cache cleared');
    });

    mainWindow.on('closed', function () {
        mainWindow = null;
    });

    // Disable Ctrl+Shift+I (DevTools)
    // Disable Ctrl+Shift+I (DevTools)
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.control && input.shift && input.key.toLowerCase() === 'i') {
            event.preventDefault();
        }
        if (input.key === 'F12') {
            event.preventDefault();
        }
    });
    // mainWindow.webContents.openDevTools();
}

// IPC Handler for Radical Focus Fix
ipcMain.on('reset-focus', () => {
    if (mainWindow) {
        // mainWindow.maximize();
        mainWindow.blur();
        mainWindow.focus();
    }
});

// const { dialog } = require('electron'); // Moved to top
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

// const { shell } = require('electron'); // Moved to top
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

// [NEW] Granular Save Handling for UI Flows
ipcMain.handle('dialog:show-save', async (event, { defaultPath, filters }) => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        defaultPath,
        filters
    });
    return canceled ? null : filePath;
});

ipcMain.handle('fs:write-file', async (event, { filePath, content, encoding }) => {
    try {
        if (encoding === 'base64') {
            await fs.promises.writeFile(filePath, Buffer.from(content, 'base64'));
        } else {
            await fs.promises.writeFile(filePath, content, encoding || 'utf-8');
        }
        return true;
    } catch (e) {
        console.error("Write File Error:", e);
        throw e;
    }
});

// PDF Export Handler
ipcMain.handle('export-pdf', async (event, htmlContent) => {
    if (!mainWindow) return false;

    // Create a hidden worker window
    let workerWindow = new BrowserWindow({
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    try {
        // Construct clean HTML document
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    body { 
                        font-family: Arial, Helvetica, sans-serif; 
                        line-height: 1.6; 
                        color: #333;
                        max-width: 800px;
                        margin: 0 auto;
                        padding: 20px;
                    }
                    img { max-width: 100%; height: auto; }
                    h1, h2, h3 { color: #111; margin-top: 1.5em; }
                    p { margin-bottom: 1em; }
                    ul, ol { margin-bottom: 1em; padding-left: 2em; }
                    blockquote { border-left: 4px solid #ccc; padding-left: 1em; margin-left: 0; color: #666; }
                    code { background: #f4f4f4; padding: 2px 5px; border-radius: 3px; font-family: monospace; }
                    pre { background: #f4f4f4; padding: 10px; border-radius: 5px; overflow-x: auto; }
                    table { border-collapse: collapse; width: 100%; margin-bottom: 1em; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                    th { background-color: #f2f2f2; }
                </style>
            </head>
            <body>
                ${htmlContent}
            </body>
            </html>
        `;

        // Load the content using data URI
        await workerWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

        const pdfData = await workerWindow.webContents.printToPDF({
            printBackground: true,
            pageSize: 'A4',
            margins: {
                top: 1, // inches equivalent roughly
                bottom: 1,
                left: 1,
                right: 1
            }
        });

        const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
            title: 'Salvar PDF',
            defaultPath: 'documento.pdf',
            filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
        });

        if (canceled || !filePath) {
            workerWindow.close();
            return false;
        }

        await fs.promises.writeFile(filePath, pdfData);
        workerWindow.close();
        return true;

    } catch (error) {
        console.error('Failed to export PDF:', error);
        if (workerWindow && !workerWindow.isDestroyed()) workerWindow.close();
        return false;
    }
});

const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// Configure logging
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
log.info('App starting...');

// Auto-updater events
autoUpdater.on('checking-for-update', () => {
    log.info('Checking for update...');
});

autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info);
    if (mainWindow) mainWindow.webContents.send('update_available', info);
});

autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded:', info);
    if (mainWindow) mainWindow.webContents.send('update_downloaded', info);
});

autoUpdater.on('download-progress', (progressObj) => {
    // log.info('Download progress:', progressObj); // Too verbose
    if (mainWindow) mainWindow.webContents.send('download_progress', progressObj);
});

autoUpdater.on('update-not-available', (info) => {
    log.info('Update not available:', info);
    if (mainWindow) mainWindow.webContents.send('update_not_available', info);
});

autoUpdater.on('error', (err) => {
    log.error('Error in auto-updater:', err);
    if (mainWindow) mainWindow.webContents.send('update_error', err.message);
});

ipcMain.handle('manual-check-update', async () => {
    try {
        if (!app.isPackaged) {
            log.info('Skipping update check (Dev Mode)');
            return null;
        }
        const result = await autoUpdater.checkForUpdates();
        return result;
    } catch (error) {
        log.error("Error checking for updates:", error);
        throw error;
    }
});

// Duplicate handler removed (consolidated below)

// --- Legacy Update Handlers Removed (Now using Supabase above) ---

app.on('ready', async () => {
    try {
        // Check if server is already running on 3001
        const isPortTaken = await new Promise((resolve) => {
            const client = new net.Socket();
            client.once('connect', () => {
                client.destroy();
                resolve(true);
            });
            client.once('error', (e) => {
                resolve(false);
            });
            client.connect(3001, '127.0.0.1');
        });

        if (isPortTaken) {
            console.log('Port 3001 is already in use. Assuming external server is running. Connecting to it...');
            serverPort = 3001;
        } else {
            console.log('Port 3001 is free. Starting internal server...');
            serverPort = 3001;
            await startServer(serverPort);
        }
    } catch (err) {
        console.error("Failed to start/connect server:", err);
    }

    createWindow();

    // Configure Auto Updater
    autoUpdater.logger = require("electron-log");
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    // Note: Feed URL is now configured via package.json (GitHub Provider)
    // We still query DB to show "New Version Available" banner in UI via chatService

    // Prevent English notification, let UI handle it
    autoUpdater.checkForUpdates();
});

ipcMain.on('restart_app', async () => {
    log.info("Client requested restart. Starting backup...");
    try {
        const version = app.getVersion();
        await dataBackupService.createBackup(version);
        log.info("Backup complete. Quitting and installing...");
    } catch (e) {
        log.error("Backup failed during restart:", e);
    }
    autoUpdater.quitAndInstall();
});


ipcMain.handle('get-server-port', () => {
    return serverPort;
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
