const fs = require('fs');
const path = require('path');
const SupabaseAdapter = require('./adapters/SupabaseAdapter');

class ChatService {
    constructor() {
        this.io = null;
        this.adapter = null;
        this.users = new Map(); // socketId -> { username, team }

        // Initialize Data Directory (APPDATA)
        const appData = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + "/.local/share");
        this.dbDir = path.join(appData, 'HapAssistenteDeDados');
        if (!fs.existsSync(this.dbDir)) fs.mkdirSync(this.dbDir, { recursive: true });

        // Paths
        this.legacyConfigPath = path.join(__dirname, '../chat_config.json');
        this.configPath = path.join(this.dbDir, 'config.json');
        this.usersFile = path.join(this.dbDir, 'users.json');
        this.onStatusCallback = null;
        this.messagesFile = path.join(this.dbDir, 'messages.json');

        if (!fs.existsSync(this.usersFile)) fs.writeFileSync(this.usersFile, '[]', 'utf-8');

        // Load & Migrate Configuration
        this.loadConfig();

        // Initialize Adapter
        this.initAdapter();
    }

    loadConfig() {
        try {
            // 1. Migration: Check for legacy config in install dir
            if (fs.existsSync(this.legacyConfigPath)) {
                console.log("ChatService: Legacy config found. Migrating to APPDATA...");
                try {
                    const legacyData = fs.readFileSync(this.legacyConfigPath, 'utf-8');
                    fs.writeFileSync(this.configPath, legacyData, 'utf-8');
                    // Rename legacy to .bak to avoid re-migration/confusion, or delete.
                    // Let's rename for safety.
                    fs.renameSync(this.legacyConfigPath, this.legacyConfigPath + '.bak');
                    console.log("ChatService: Migration successful.");
                } catch (migErr) {
                    console.error("ChatService: Migration failed:", migErr);
                }
            }

            // 2. Load from APPDATA
            if (fs.existsSync(this.configPath)) {
                this.config = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
            } else {
                console.warn("Chat config not found in APPDATA, defaulting to local/empty.");
                this.config = { activeBackend: 'local' };
            }
        } catch (e) {
            console.error("Failed to load chat config:", e);
            this.config = { activeBackend: 'local' };
        }

        // FORCE SUPABASE from ENV if available (User Priority: Online)
        const envUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
        const envKey = process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        console.log(`[ChatService] Checking Env Logic: URL=${!!envUrl}, Key=${!!envKey ? 'YES' : 'NO'}`);
        if (!envUrl) console.log("[ChatService] Env Vars available:", JSON.stringify(Object.keys(process.env).filter(k => k.includes('SUPABASE'))));

        if (envUrl && envKey) {
            // Determine if we should force switch
            // User said "I want Online". If config is 'local', switch.
            if (this.config.activeBackend === 'local' || !this.config.activeBackend) {
                this.config.activeBackend = 'supabase';
                console.log("ChatService: Supabase Environment Detected. Forcing Online Mode.");
            }

            // Ensure config has credentials
            if (!this.config.supabase) this.config.supabase = {};
            this.config.supabase.url = envUrl;
            this.config.supabase.key = envKey;
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

                if (this.onStatusCallback && this.adapter.setStatusHandler) {
                    this.adapter.setStatusHandler(this.onStatusCallback);
                }

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

    // Messaging Methods (Delegated to Adapter OR Local Storage)
    async saveMessage(sender, content, type = 'TEXT', metadata = null, recipient = 'ALL') {
        const msg = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            sender,
            content,
            type,
            metadata,
            recipient,
            created_at: new Date().toISOString(),
            read_at: null,
            reactions: []
        };

        if (this.adapter) {
            await this.adapter.sendMessage(msg);
        } else {
            // Local JSON Persistence
            const messages = this.readJSON(this.messagesFile);
            messages.push(msg);
            // Limit history to 1000 messages
            if (messages.length > 1000) messages.shift();
            this.writeJSON(this.messagesFile, messages);

            // Should we broadcast here? server/index.js handles socket.io broadcast.
            // But if we want consistent ID, we should return the msg object?
            // index.js constructs its own payload. Ideally we return the saved msg.
        }
        return msg; // Return the full message object with ID
    }

    async getHistory(username) {
        if (this.adapter) {
            return await this.adapter.getHistory();
        } else {
            // Local JSON
            // Filter: Public (ALL) or Private involving 'username'
            const messages = this.readJSON(this.messagesFile);
            if (!username || username === 'ALL') {
                // Return last 50 global messages? 
                // Current logic usually fetches ALL relevant.
                return messages;
            }
            return messages.filter(m =>
                m.recipient === 'ALL' ||
                m.recipient === username ||
                m.sender === username
            );
        }
    }

    async markAsRead(messageIds) {
        const timestamp = new Date().toISOString();
        if (this.adapter && this.adapter.markAsRead) {
            await this.adapter.markAsRead(messageIds);
        } else {
            // Local JSON
            const messages = this.readJSON(this.messagesFile);
            let updated = false;
            messages.forEach(m => {
                if (messageIds.includes(m.id) && !m.read_at) {
                    m.read_at = timestamp;
                    updated = true;
                }
            });
            if (updated) this.writeJSON(this.messagesFile, messages);
        }
    }

    async addReaction(messageId, emoji, username) {
        if (this.adapter && this.adapter.addReaction) {
            try {
                await this.adapter.addReaction(messageId, emoji, username);
            } catch (e) { }
        } else {
            // Local JSON
            const messages = this.readJSON(this.messagesFile);
            const msg = messages.find(m => m.id === messageId);
            if (msg) {
                if (!msg.reactions) msg.reactions = [];
                // Dedup
                if (!msg.reactions.some(r => r.user === username && r.emoji === emoji)) {
                    msg.reactions.push({ emoji, user: username });
                    this.writeJSON(this.messagesFile, messages);

                    // Broadcast reaction? index.js handles socket event but uses `addReaction` just for storage.
                    // Ideally we emit here too? No, index.js listens to event provided by User.
                }
            }
        }
    }

    async cleanup(daysToKeep) {
        if (this.adapter && this.adapter.cleanupOldMessages) {
            await this.adapter.cleanupOldMessages(daysToKeep);
        }
    }

    setStatusHandler(callback) {
        this.onStatusCallback = callback;
        if (this.adapter && this.adapter.setStatusHandler) {
            this.adapter.setStatusHandler(callback);
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

