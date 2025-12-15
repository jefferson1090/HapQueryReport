console.log('Process Versions:', process.versions);
const electron = require('electron');
console.log('Electron Module Keys:', Object.keys(electron));
console.log('Is Main Process?', process.type);
