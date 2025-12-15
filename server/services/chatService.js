const fs = require('fs');
const path = require('path');
const SupabaseAdapter = require('./adapters/SupabaseAdapter');

class ChatService {
    constructor() {
        this.io = null;
        this.adapter = null;
        this.users = new Map(); // socketId -> { username, team }

        // Load Configuration
        this.configPath = path.join(__dirname, '../chat_config.json');
        this.loadConfig();

        // Initialize Local Storage for Users (Auth)
        // Note: storage options for Auth are separate from Chat Backend for now
        const appData = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + "/.local/share");
        const dbDir = path.join(appData, 'HapAssistenteDeDados');
        if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
        this.usersFile = path.join(dbDir, 'users.json');
        if (!fs.existsSync(this.usersFile)) fs.writeFileSync(this.usersFile, '[]', 'utf-8');

        // Initialize Adapter
        this.initAdapter();
    }

    loadConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                this.config = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
            } else {
                console.warn("Chat config not found, defaulting to local.");
                this.config = { activeBackend: 'local' };
            }
        } catch (e) {
            console.error("Failed to load chat config:", e);
            this.config = { activeBackend: 'local' };
        }
    }

    async initAdapter() {
        // Disconnect existing if any
        if (this.adapter && this.adapter.pool) { // crude check for Oracle
            try { await this.adapter.pool.close(); } catch (e) { }
        }
        if (this.adapter && this.adapter.client) { // crude check for Supabase
            // Supabase cleanup if needed
        }

        if (this.config.activeBackend === 'supabase') {
            this.adapter = new SupabaseAdapter(this.config.supabase);
            const connected = await this.adapter.connect();
            if (connected) {
                console.log("ChatService: Connected to Supabase.");

                // Set up listener for incoming messages
                this.adapter.setMessageHandler((msg) => {
                    this.broadcastToLocalClients(msg);
                });

                // Set up listener for message updates (Read Receipts)
                if (this.adapter.setMessageUpdateHandler) {
                    this.adapter.setMessageUpdateHandler((msg) => {
                        if (this.io) this.io.emit('message_update', msg);
                    });
                }

                // Set up listener for presence (Online Users)
                this.adapter.setPresenceHandler((onlineUsers) => {
                    if (this.io) this.io.emit('update_user_list', onlineUsers);
                });
            } else {
                console.error("ChatService: FAILED to connect to Supabase. Check Adapter logs.");
            }
        } else if (this.config.activeBackend === 'oracle') {
            this.adapter = new OracleAdapter(this.config.oracle);
            const connected = await this.adapter.connect();
            if (connected) {
                console.log("ChatService: Connected to Oracle.");

                this.adapter.setMessageHandler((msg) => {
                    this.broadcastToLocalClients(msg);
                });

                this.adapter.setPresenceHandler((onlineUsers) => {
                    if (this.io) this.io.emit('update_user_list', onlineUsers);
                });
            }
        } else {
            console.log("ChatService: Using Local File Backend (Legacy).");
        }
    }

    async switchBackend(newBackend) {
        console.log(`ChatService: Switching backend to ${newBackend}`);
        this.config.activeBackend = newBackend;

        // Persist change
        try {
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
        } catch (e) { console.error("Failed to save config switch", e); }

        await this.initAdapter();
        return true;
    }

    setSocketIo(io) {
        this.io = io;
    }

    broadcastToLocalClients(msg) {
        if (this.io) {
            this.io.emit('message', msg);
        }
    }

    // Helper: Read JSON (for users)
    readJSON(filePath) {
        try {
            if (!fs.existsSync(filePath)) return [];
            return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        } catch (e) { return []; }
    }

    // Helper: Write JSON (for users)
    writeJSON(filePath, data) {
        try { fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8'); } catch (e) { }
    }

    // Auth Methods (Kept Local for Simplicity/Stability)
    async registerUser(username, password, team) {
        const users = this.readJSON(this.usersFile);
        if (users.find(u => u.username === username)) throw new Error("Usuário já existe.");
        users.push({ username, password, team: team || 'Geral', last_seen: new Date().toISOString() });
        this.writeJSON(this.usersFile, users);
        return { success: true };
    }

    async loginUser(username, password) {
        const users = this.readJSON(this.usersFile);
        const user = users.find(u => u.username === username && u.password === password);
        if (user) {
            user.last_seen = new Date().toISOString();
            this.writeJSON(this.usersFile, users);

            // Notify Global Network that I am online
            if (this.adapter && this.adapter.trackPresence) {
                this.adapter.trackPresence(user.username, user.team);
            }

            return { success: true, username: user.username, team: user.team || 'Geral' };
        }
        return { success: false, message: "Credenciais inválidas." };
    }

    // Messaging Methods (Delegated to Adapter)
    async saveMessage(sender, content, type = 'TEXT', metadata = null, recipient = 'ALL') {
        if (this.adapter) {
            // Global Mode
            await this.adapter.sendMessage({ sender, content, type, metadata, recipient });
            // Note: We don't need to manually emit to socket here if we are subscribed to the changes,
            // because the adapter will receive the 'INSERT' event and call handleIncomingMessage -> broadcastToLocalClients.
            // This ensures we see what actually reached the server.
        } else {
            // Local fallback (Legacy)
            // ... (Simple implementation just to prevent crash if no adapter)
            console.warn("No adapter active, message drop.");
        }
    }

    async getHistory(username) {
        if (this.adapter) {
            return await this.adapter.getHistory();
        }
        return [];
    }

    async markAsRead(messageIds) {
        if (this.adapter && this.adapter.markAsRead) {
            await this.adapter.markAsRead(messageIds);
        }
    }

    async addReaction(messageId, emoji, username) {
        if (this.adapter && this.adapter.addReaction) {
            try {
                await this.adapter.addReaction(messageId, emoji, username);
            } catch (e) {
                console.error("Adapter addReaction failed:", e);
                // Don't throw, allow broadcast to continue
            }
        } else {
            // console.warn("Adapter does not support reactions (Persistence disabled).");
        }
    }

    async cleanup(days = 90) {
        if (this.adapter && this.adapter.cleanupOldMessages) {
            await this.adapter.cleanupOldMessages(days);
        }
    }

    async getLatestVersion() {
        if (this.adapter && this.adapter.getLatestVersion) {
            return await this.adapter.getLatestVersion();
        }
        return null;
    }

    async publishVersion(version, notes, url) {
        if (this.adapter && this.adapter.publishVersion) {
            return await this.adapter.publishVersion(version, notes, url);
        }
        return false;
    }
}

module.exports = new ChatService();

