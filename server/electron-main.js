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
    const startUrl = process.env.ELECTRON_START_URL || 'http://localhost:3001';
    mainWindow.loadURL(startUrl);

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
