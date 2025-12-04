const { app } = require('electron');
console.log('ENV ELECTRON_RUN_AS_NODE:', process.env.ELECTRON_RUN_AS_NODE);
console.log('Electron Version:', process.versions.electron);
console.log('Process Type:', process.type);
const electron = require('electron');
console.log('Electron Module Keys:', Object.keys(electron));
console.log('Electron App Object (from require):', electron.app);
if (app) {
    console.log('Electron is working!');
    app.quit();
} else {
    console.error('Electron is NOT working properly.');
    process.exit(1);
}
