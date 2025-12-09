const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class ChatService {
    constructor() {
        this.io = null;
        this.users = new Map(); // socketId -> { username, team }

        // Initialize SQLite Database
        // Fix: Use AppData to avoid permission issues in Program Files
        const appData = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + "/.local/share");
        const dbDir = path.join(appData, 'HapAssistenteDeDados');

        if (!fs.existsSync(dbDir)) {
            try {
                fs.mkdirSync(dbDir, { recursive: true });
            } catch (e) {
                console.error("Failed to create DB directory:", e);
            }
        }

        const dbPath = path.join(dbDir, 'chat.db');
        console.log("Database Path:", dbPath);

        this.db = new Database(dbPath); // verbose: console.log

        this.initializeSchema();
    }

    setSocketIo(io) {
        this.io = io;
    }

    initializeSchema() {
        try {
            console.log("Initializing SQLite Chat Schema...");

            // HAP_CHAT_USERS
            this.db.prepare(`
                CREATE TABLE IF NOT EXISTS HAP_CHAT_USERS (
                    USERNAME TEXT PRIMARY KEY,
                    PASSWORD TEXT,
                    TEAM TEXT,
                    LAST_SEEN DATETIME
                )
            `).run();

            // HAP_CHAT_MESSAGES
            this.db.prepare(`
                CREATE TABLE IF NOT EXISTS HAP_CHAT_MESSAGES (
                    ID INTEGER PRIMARY KEY AUTOINCREMENT,
                    SENDER TEXT,
                    CONTENT TEXT,
                    MSG_TYPE TEXT DEFAULT 'TEXT',
                    METADATA TEXT,
                    RECIPIENT TEXT DEFAULT 'ALL',
                    TIMESTAMP DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `).run();

            console.log("SQLite Chat Schema initialized.");
        } catch (err) {
            console.error("Failed to initialize chat schema:", err);
        }
    }

    async registerUser(username, password, team) {
        try {
            const stmt = this.db.prepare(`INSERT INTO HAP_CHAT_USERS (USERNAME, PASSWORD, TEAM, LAST_SEEN) VALUES (?, ?, ?, datetime('now'))`);
            stmt.run(username, password, team || 'Geral');
            return { success: true };
        } catch (err) {
            if (err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
                throw new Error("Usuário já existe.");
            }
            throw err;
        }
    }

    async loginUser(username, password) {
        try {
            const stmt = this.db.prepare(`SELECT USERNAME, TEAM FROM HAP_CHAT_USERS WHERE USERNAME = ? AND PASSWORD = ?`);
            const user = stmt.get(username, password);

            if (user) {
                // Update Last Seen
                this.db.prepare(`UPDATE HAP_CHAT_USERS SET LAST_SEEN = datetime('now') WHERE USERNAME = ?`).run(username);
                return { success: true, username: user.USERNAME, team: user.TEAM || 'Geral' };
            }
            return { success: false, message: "Credenciais inválidas." };
        } catch (err) {
            throw err;
        }
    }

    async saveMessage(sender, content, type = 'TEXT', metadata = null, recipient = 'ALL') {
        try {
            const stmt = this.db.prepare(`INSERT INTO HAP_CHAT_MESSAGES (SENDER, CONTENT, MSG_TYPE, METADATA, RECIPIENT) VALUES (?, ?, ?, ?, ?)`);
            stmt.run(
                sender,
                content,
                type,
                metadata ? JSON.stringify(metadata) : null,
                recipient
            );
        } catch (err) {
            console.error("Error saving message:", err);
        }
    }

    async getHistory(username) {
        try {
            // Get messages where recipient is ALL, or user is sender, or user is recipient
            const sql = `
                SELECT SENDER, CONTENT, MSG_TYPE, METADATA, TIMESTAMP, RECIPIENT 
                FROM HAP_CHAT_MESSAGES 
                WHERE RECIPIENT = 'ALL' 
                   OR SENDER = ? 
                   OR RECIPIENT = ?
                ORDER BY ID DESC LIMIT 50
            `;
            const rows = this.db.prepare(sql).all(username, username);

            // Reverse to show oldest first in chat window
            return rows.map(row => ({
                sender: row.SENDER,
                content: row.CONTENT,
                type: row.MSG_TYPE,
                metadata: row.METADATA ? JSON.parse(row.METADATA) : null,
                timestamp: row.TIMESTAMP,
                recipient: row.RECIPIENT
            })).reverse();
        } catch (err) {
            console.error("Error fetching history:", err);
            return [];
        }
    }
}

module.exports = new ChatService();
