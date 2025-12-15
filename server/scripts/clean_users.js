const fs = require('fs');
const path = require('path');
const os = require('os');

function cleanUsers() {
    try {
        const appData = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + "/.local/share");
        const dbDir = path.join(appData, 'HapAssistenteDeDados');
        const usersFile = path.join(dbDir, 'users.json');

        console.log(`Checking for users file at: ${usersFile}`);

        if (fs.existsSync(usersFile)) {
            console.log('File found. Resetting...');
            fs.writeFileSync(usersFile, '[]', 'utf-8');
            console.log('Users file has been reset to empty array []');
        } else {
            console.log('Users file not found. Nothing to clean.');
        }
    } catch (e) {
        console.error('Error cleaning users:', e);
    }
}

cleanUsers();
