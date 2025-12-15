const fs = require('fs');
const path = require('path');

const appData = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + "/.local/share");
const dbDir = path.join(appData, 'HapAssistenteDeDados');
const usersFile = path.join(dbDir, 'users.json');

if (fs.existsSync(usersFile)) {
    try {
        const users = JSON.parse(fs.readFileSync(usersFile, 'utf-8'));
        let found = false;
        const newUsers = users.map(u => {
            if (u.username === 'TestBot' || u.username === 'TesteBot') {
                found = true;
                console.log(`Found ${u.username}. Renaming to Rascunho...`);
                return { ...u, username: 'Rascunho', team: 'Rascunho' };
            }
            return u;
        });

        if (found) {
            fs.writeFileSync(usersFile, JSON.stringify(newUsers, null, 2), 'utf-8');
            console.log('Successfully renamed bot to Rascunho.');
        } else {
            console.log('TestBot/TesteBot not found in users.json.');
        }
    } catch (e) {
        console.error('Error processing users.json:', e);
    }
} else {
    console.error('users.json not found at:', usersFile);
}
