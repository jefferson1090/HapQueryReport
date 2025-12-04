const electron = require('electron');
console.log('Process Type:', process.type);
console.log('Electron keys:', Object.keys(electron));
console.log('App from electron:', electron.app);
if (electron.app) {
    console.log('App is defined');
    electron.app.quit();
} else {
    console.log('App is undefined');
    process.exit(1);
}
