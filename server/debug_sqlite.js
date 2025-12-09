const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'chat.db');
console.log("Opening DB at:", dbPath);
const db = new Database(dbPath, { verbose: console.log });

try {
    // Check Users
    const users = db.prepare('SELECT * FROM HAP_CHAT_USERS').all();
    console.log("Users in DB:", users);

    // Try inserting a test user if empty
    if (users.length === 0) {
        console.log("Inserting Test User...");
        const stmt = db.prepare(`INSERT INTO HAP_CHAT_USERS (USERNAME, PASSWORD, TEAM, LAST_SEEN) VALUES (?, ?, ?, datetime('now'))`);
        stmt.run('DebugUser', '123', 'DebugTeam');
        console.log("Inserted DebugUser");

        const check = db.prepare('SELECT * FROM HAP_CHAT_USERS WHERE USERNAME = ?').get('DebugUser');
        console.log("Retrieved DebugUser:", check);
    }

} catch (err) {
    console.error("SQLite Error:", err);
}
