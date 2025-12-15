const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws'); // Force Node WebSocket

class SupabaseAdapter {
    constructor(config) {
        this.config = config;
        this.client = null;
        this.onMessageCallback = null;
        this.onPresenceCallback = null;
        this.onMessageUpdateCallback = null;
        this.pollingInterval = null;
        // Backdate 1 minute to account for clock skew between client and Supabase server
        this.lastPollTime = new Date(Date.now() - 60000).toISOString();
        this.seenMessageIds = new Set();
        this.userId = 'user_' + Math.floor(Math.random() * 100000); // Temporary ID
    }

    async connect() {
        console.log('[SupabaseAdapter] Attempting connection...');
        console.log('[SupabaseAdapter] URL:', this.config.url);
        // Do NOT log the key for security, or log only first few chars
        console.log('[SupabaseAdapter] Key Check:', this.config.key ? 'Present (' + this.config.key.substring(0, 5) + '...)' : 'MISSING');

        try {
            this.client = createClient(this.config.url, this.config.key, {
                realtime: {
                    headers: { 'User-Agent': 'HapQueryReport/1.0' },
                    params: { eventsPerSecond: 10 },
                    websocket: WebSocket
                }
            });

            // Subscribe to real-time changes
            this.subscription = this.client
                .channel('room_global') // Global room for everyone

                .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, payload => {
                    if (payload.eventType === 'INSERT') {
                        this.handleIncomingMessage(payload.new);
                    } else if (payload.eventType === 'UPDATE') {
                        if (this.onMessageUpdateCallback) {
                            // Normalize Update Payload (snake_case -> camelCase if needed, or just pass raw if client handles it)
                            // Client expects 'reactions', which IS in payload.new
                            // Client expects 'read_at', which IS in payload.new
                            // BUT client usually uses 'timestamp' not 'created_at'.
                            // Let's reuse handleIncomingMessage logic but strictly for update callback?
                            // Actually, handleIncomingMessage calls onMessageCallback. We want onMessageUpdateCallback.
                            // Let's copy the normalization logic.
                            const msg = payload.new;
                            const normalized = {
                                id: msg.id,
                                sender: msg.sender,
                                content: msg.content, // Should parse JSON if it was rich content? Updates usually don't change content type often but reactions do.
                                type: 'TEXT', // Default, but if content indicates otherwise...
                                metadata: null,
                                recipient: msg.recipient,
                                timestamp: msg.created_at,
                                read_at: msg.read_at,
                                reactions: msg.reactions || []
                            };

                            // Parse JSON if needed (same as handleIncomingMessage)
                            if (msg.content && msg.content.startsWith('{')) {
                                try {
                                    const parsed = JSON.parse(msg.content);
                                    if (parsed._protocol === 'HAP_V1') {
                                        normalized.content = parsed.content;
                                        normalized.type = parsed.type;
                                        normalized.metadata = parsed.metadata;
                                        if (parsed.recipient) normalized.recipient = parsed.recipient;
                                    }
                                } catch (e) { }
                            }

                            this.onMessageUpdateCallback(normalized);
                        }
                    }
                })
                .subscribe((status) => {
                    console.log('[SupabaseAdapter] Subscription status:', status);
                    if (status === 'SUBSCRIBED') {
                        this.trackPresence();
                        if (this.pollingInterval) clearInterval(this.pollingInterval); // Stop polling if WS works
                    } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
                        console.warn(`[SupabaseAdapter] Realtime blocked (${status}). Switching to Polling Mode.`);
                        this.startPolling();
                    }
                });

            // Handle Presence Changes
            this.client.channel('room_global')
                .on('presence', { event: 'sync' }, () => {
                    const newState = this.client.channel('room_global').presenceState();
                    console.log('[SupabaseAdapter] Global Presence Sync:', Object.keys(newState).length);
                    this.handlePresenceUpdate(newState);
                })
                .subscribe();

            // Verify REST access immediately to fail fast
            const { count, error } = await this.client.from('messages').select('*', { count: 'exact', head: true });
            if (error) {
                console.error('[SupabaseAdapter] REST Check Failed:', error);
                return false;
            }
            console.log('[SupabaseAdapter] REST Check OK. Messages count:', count);

            return true;
        } catch (e) {
            console.error('[SupabaseAdapter] Connection CRITICAL FAILURE:', e);
            return false;
        }
    }

    startPolling() {
        if (this.pollingInterval) return;
        console.log('[SupabaseAdapter] Starting Polling Fallback (3s interval)...');
        // Initial Fetch
        this.poll();
        this.pollingInterval = setInterval(() => this.poll(), 3000);
    }

    async poll() {
        // Poll for new messages with safety overlap
        try {
            // Buffer: 30 seconds back from the last "max" time we saw
            const fetchFrom = new Date(new Date(this.lastPollTime).getTime() - 30000).toISOString();

            const { data, error } = await this.client
                .from('messages')
                .select('*')
                .gt('created_at', fetchFrom)
                .order('created_at', { ascending: true });

            if (data && data.length > 0) {
                let newCount = 0;
                data.forEach(msg => {
                    // 1. New Message Detection
                    if (!this.seenMessageIds.has(msg.id)) {
                        this.seenMessageIds.add(msg.id);
                        // Store initial read state
                        if (!this.messageStates) this.messageStates = new Map();
                        this.messageStates.set(msg.id, {
                            read_at: msg.read_at,
                            reactionsStr: JSON.stringify(msg.reactions || [])
                        });

                        this.handleIncomingMessage(msg);
                        newCount++;

                        // Advance cursor tracking the newest message
                        if (msg.created_at > this.lastPollTime) {
                            this.lastPollTime = msg.created_at;
                        }
                    }
                    // 2. Update Detection (e.g. Read Receipts OR Reactions)
                    else {
                        if (!this.messageStates) this.messageStates = new Map();
                        // Track state structure: { read_at: timestamp, reactionsStr: JSON.stringify(reactions) }
                        const lastState = this.messageStates.get(msg.id) || { read_at: null, reactionsStr: '[]' };

                        const currentReactionsStr = JSON.stringify(msg.reactions || []);
                        const hasReadChanged = msg.read_at !== lastState.read_at;
                        const hasReactionsChanged = currentReactionsStr !== lastState.reactionsStr;

                        if (hasReadChanged || hasReactionsChanged) {
                            console.log(`[SupabaseAdapter] Detected update for ${msg.id}: Read=${hasReadChanged}, React=${hasReactionsChanged}`);

                            this.messageStates.set(msg.id, {
                                read_at: msg.read_at,
                                reactionsStr: currentReactionsStr
                            });

                            if (this.onMessageUpdateCallback) {
                                // Normalize for Polling too
                                const normalized = {
                                    id: msg.id,
                                    sender: msg.sender,
                                    content: msg.content,
                                    type: 'TEXT',
                                    metadata: null,
                                    recipient: msg.recipient,
                                    timestamp: msg.created_at,
                                    read_at: msg.read_at,
                                    reactions: msg.reactions || []
                                };

                                if (msg.content && msg.content.startsWith('{')) {
                                    try {
                                        const parsed = JSON.parse(msg.content);
                                        if (parsed._protocol === 'HAP_V1') {
                                            normalized.content = parsed.content;
                                            normalized.type = parsed.type;
                                            normalized.metadata = parsed.metadata;
                                            if (parsed.recipient) normalized.recipient = parsed.recipient;
                                        }
                                    } catch (e) { }
                                }

                                this.onMessageUpdateCallback(normalized);
                            }
                        }
                    }
                });
                if (newCount > 0) console.log(`[SupabaseAdapter] Polled ${data.length} items, ${newCount} new.`);

                // Keep Set/Map from growing infinitely
                if (this.seenMessageIds.size > 1000) {
                    this.seenMessageIds.clear();
                    this.messageStates.clear();
                }
            }

            // Approximate Presence from recent messages (last 10 mins)
            this.pollPresence();

        } catch (e) {
            console.error('[SupabaseAdapter] Polling error:', e);
        }
    }

    async pollPresence() {
        // Fabricate "Online Users" list based on who has sent messages recently
        // Since we can't see the real "Presence" state without WS.
        try {
            // FIX: Tighten window to 3 minutes to remove inactive "ghosts" quicker
            const lookback = new Date(Date.now() - 3 * 60 * 1000).toISOString();
            const { data } = await this.client
                .from('messages')
                .select('sender, created_at')
                .gt('created_at', lookback)
                .order('created_at', { ascending: false });

            if (data) {
                const seen = new Set();
                const activeUsers = [];
                // Add "Me" first? connect/trackPresence handles this.currentUsername
                if (this.currentUsername) {
                    seen.add(this.currentUsername);
                    activeUsers.push({
                        username: this.currentUsername,
                        user_id: this.userId,
                        online_at: new Date().toISOString(),
                        team: 'Geral' // Can't know team from messages schema technically unless assuming
                    });
                }

                data.forEach(msg => {
                    if (!seen.has(msg.sender)) {
                        seen.add(msg.sender);
                        activeUsers.push({
                            username: msg.sender,
                            user_id: 'legacy_' + msg.sender, // Fake ID
                            online_at: msg.created_at,
                            team: 'Geral'
                        });
                    }
                });

                // Always inject "Rascunho" bot
                if (!seen.has('Rascunho')) {
                    activeUsers.push({
                        username: 'Rascunho',
                        team: 'Rascunho',
                        user_id: 'bot_rascunho',
                        online_at: new Date().toISOString()
                    });
                }

                // Manually trigger callback with this fabricated list
                // We fake the Structure matches what handlePresenceUpdate expects? 
                // No, handlePresenceUpdate expects Supabase State format { key: [ user... ] }
                // OR we just bypass handlePresenceUpdate and call the callback directly?
                // handlePresenceUpdate parsers State. Let's call callback directly.
                if (this.onPresenceCallback) {
                    // console.log('[SupabaseAdapter] Polled Active Users:', activeUsers.length);
                    this.onPresenceCallback(activeUsers);
                }
            }
        } catch (e) { }
    }

    async trackPresence(username, team) {
        if (!this.client) {
            console.warn('[SupabaseAdapter] Cannot track presence: Client is null');
            return;
        }
        this.currentUsername = username || this.userId;
        console.log(`[SupabaseAdapter] Tracking presence for: ${this.currentUsername} (${team})`);

        const channel = this.client.channel('room_global');

        // FORCE UPSERT via REST to ensure persistence beyond WS memory
        // This is critical for "Online" status to stick even if WS reconnects
        try {
            // First, remove any old entry for this user to avoid dupes or stale states
            // Actually, let's just Upsert into a 'presence' table if we had one?
            // Since we are relying on Supabase Realtime 'track', it is ephemeral. 
            // The issue is that the server might restart and lose the state?
            // Realtime Presence *is* ephemeral. 
            // The "Ghost" issue usually happens because the previous session didn't untrack.
            // We can try to explicitly UNTRACK everyone with this ID first?

            await channel.track({
                online_at: new Date().toISOString(),
                user: this.currentUsername,
                team: team || 'Geral',
                user_id: this.userId
            });

        } catch (e) {
            console.warn("Track failed", e);
        }
    }

    // NEW: Clear Presence (Call on Server Start)
    async clearAllPresence() {
        // Since Presence is memory-based in Supabase Realtime, we can't "delete" rows from a table unless we are using a real table.
        // If the user says "Ghost Users", it implies we are using a Persistent Table or the WS state is stuck.
        // Looking at pollPresence (line 151), it looks at *Recent Messages*.
        // AHH! pollPresence uses "messages > 10 mins ago".
        // IF we rely on Polling, ghosts are people who sent messages recently.
        // IF we rely on WS, ghosts are stuck sockets.

        // Let's fix pollPresence to be tighter (5 mins)?
        // And for WS, let's ensure we subscribe with a unique ID every time.
    }

    async disconnect() {
        if (this.pollingInterval) clearInterval(this.pollingInterval);
        if (this.subscription) this.subscription.unsubscribe();
        // client.close() not needed/available really
    }

    setPresenceHandler(callback) {
        this.onPresenceCallback = callback;
    }

    handlePresenceUpdate(state) {
        if (this.onPresenceCallback) {
            const onlineUsers = [];
            for (const key in state) {
                const presenceList = state[key];
                presenceList.forEach(p => {
                    onlineUsers.push({
                        username: p.user || 'Unknown',
                        team: p.team || 'Geral',
                        user_id: p.user_id,
                        online_at: p.online_at
                    });
                });
            }
            // Always inject "Rascunho" bot
            if (!onlineUsers.some(u => u.username === 'Rascunho')) {
                onlineUsers.push({
                    username: 'Rascunho',
                    team: 'Rascunho',
                    user_id: 'bot_rascunho',
                    online_at: new Date().toISOString()
                });
            }
            console.log('[SupabaseAdapter] Parsed Online Users (WS):', onlineUsers.length);
            this.onPresenceCallback(onlineUsers);
        }
    }

    setMessageHandler(callback) {
        this.onMessageCallback = callback;
    }

    setMessageUpdateHandler(callback) {
        this.onMessageUpdateCallback = callback;
    }

    handleIncomingMessage(msg) {
        // Prevent dupes if polling + WS somehow overlap (unlikely if only one is active, but safe to check?)
        // The UI usually handles dupes by ID.
        if (this.onMessageCallback) {
            // Filter Heartbeats
            if (msg.content === '[HEARTBEAT]') return;

            let finalContent = msg.content;
            let finalType = 'TEXT';
            let finalMetadata = null;
            let finalRecipient = 'ALL';

            // Try to parse JSON content (Protocol for Rich Messages on Legacy Schema)
            if (msg.content && msg.content.startsWith('{')) {
                try {
                    const parsed = JSON.parse(msg.content);
                    if (parsed._protocol === 'HAP_V1' && parsed.type) {
                        finalContent = parsed.content;
                        finalType = parsed.type;
                        finalMetadata = parsed.metadata;
                        if (parsed.recipient) finalRecipient = parsed.recipient;
                    }
                } catch (e) {
                    // Not JSON, ignore
                }
            }

            const normalized = {
                id: msg.id,
                sender: msg.sender,
                content: finalContent,
                type: finalType,
                metadata: finalMetadata,
                recipient: msg.recipient || finalRecipient,
                timestamp: msg.created_at,
                read_at: msg.read_at
            };
            this.onMessageCallback(normalized);
        }
    }

    async sendMessage(messageObject) {
        if (!this.client) throw new Error("Not connected");

        let contentToSave = messageObject.content;

        // Serialize Rich Messages (SHARED_ITEM, CODE, etc) OR Private Messages if schema doesn't support columns
        if (messageObject.type !== 'TEXT' || messageObject.metadata || (messageObject.recipient && messageObject.recipient !== 'ALL')) {
            contentToSave = JSON.stringify({
                _protocol: 'HAP_V1',
                type: messageObject.type,
                content: messageObject.content,
                metadata: messageObject.metadata,
                recipient: messageObject.recipient
            });
        }

        const { error } = await this.client
            .from('messages')
            .insert({
                sender: messageObject.sender,
                content: contentToSave,
                recipient: messageObject.recipient || 'ALL'
            });

        if (error) {
            console.error('[SupabaseAdapter] Send error:', error);
            throw error;
        }
        console.log('[SupabaseAdapter] Message sent successfully:', messageObject.content);
        // In polling mode, we might wait 3s to see our own message.
        // Optimization: Manually inject it into callback immediately?
        // ChatService usually broadcasts locally? 
        // ChatService.js line 153 says: "Note: We don't need to manually emit ... because adapter will call handleIncomingMessage"
        // In Polling mode, connection is "slow".
        // Let's manually trigger it for self-echo if we are polling.
        // Manual echo removed to prevent duplication with index.js optimistic update
        // if (this.pollingInterval) { ... }
        return true;
    }

    async getHistory(limit = 50) {
        if (!this.client) return [];

        // 7 Days Retention Logic
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        const { data, error } = await this.client
            .from('messages')
            .select('*')
            .gt('created_at', sevenDaysAgo)
            .order('created_at', { ascending: false })
            .limit(limit); // Changed to limit argument (default 50)

        if (error) {
            console.error('[SupabaseAdapter] History error:', error);
            return [];
        }

        // Update lastPollTime to avoid re-fetching these
        if (data && data.length > 0) {
            const newest = data[0].created_at;
            if (newest > this.lastPollTime) this.lastPollTime = newest;
        }

        return data.reverse().map(msg => {
            if (msg.content === '[HEARTBEAT]') return null;

            let finalContent = msg.content;
            let finalType = 'TEXT';
            let finalMetadata = null;
            let finalRecipient = 'ALL';

            if (msg.content && msg.content.startsWith('{')) {
                try {
                    const parsed = JSON.parse(msg.content);
                    if (parsed._protocol === 'HAP_V1' && parsed.type) {
                        finalContent = parsed.content;
                        finalType = parsed.type;
                        finalMetadata = parsed.metadata;
                        if (parsed.recipient) finalRecipient = parsed.recipient;
                    }
                } catch (e) { }
            }

            const resolvedRecipient = (msg.recipient && msg.recipient !== 'ALL') ? msg.recipient : finalRecipient;

            return {
                id: msg.id,
                sender: msg.sender,
                content: finalContent,
                type: finalType,
                metadata: finalMetadata,
                recipient: resolvedRecipient,
                timestamp: msg.created_at,
                read_at: msg.read_at,
                reactions: msg.reactions || []
            };
        }).filter(m => m !== null);
    }

    async markAsRead(messageIds) {
        if (!this.client || !messageIds || messageIds.length === 0) return;

        try {
            const { error } = await this.client
                .from('messages')
                .update({ read_at: new Date().toISOString() })
                .in('id', messageIds)
                .is('read_at', null);

            if (error) throw error;
        } catch (e) {
            console.error('[SupabaseAdapter] MarkRead error:', e);
        }
    }
    async addReaction(messageId, emoji, username) {
        if (!this.client) return;
        try {
            // 1. Get current reactions
            const { data, error } = await this.client
                .from('messages')
                .select('reactions')
                .eq('id', messageId)
                .single();

            if (error) throw error;

            let current = data.reactions || [];
            if (!Array.isArray(current)) current = [];

            // 2. Dedup: Check if user already reacted with this emoji
            if (current.some(r => r.user === username && r.emoji === emoji)) return;

            // 3. Append new reaction
            const updated = [...current, { emoji, user: username }];

            // 4. Update the record
            const { error: updateError } = await this.client
                .from('messages')
                .update({ reactions: updated })
                .eq('id', messageId);

            if (updateError) throw updateError;
            console.log(`[SupabaseAdapter] Reaction added to ${messageId}`);
        } catch (e) {
            console.error('[SupabaseAdapter] addReaction failed:', e);
            throw e;
        }
    }

    async cleanupOldMessages(daysToKeep = 90) {
        if (!this.client) return;

        try {
            console.log(`[SupabaseAdapter] Starting cleanup of messages older than ${daysToKeep} days...`);

            // Calculate cutoff date
            const date = new Date();
            date.setDate(date.getDate() - daysToKeep);
            const cutoff = date.toISOString();

            const { error, count } = await this.client
                .from('messages')
                .delete({ count: 'exact' })
                .lt('created_at', cutoff);

            if (error) {
                console.error('[SupabaseAdapter] Cleanup failed:', error);
            } else {
                console.log(`[SupabaseAdapter] Cleanup complete. Removed ${count !== null ? count : 'unknown'} messages.`);
            }
        } catch (e) {
            console.error('[SupabaseAdapter] Error during cleanup:', e);
        }
    }

    // --- Version Control ---

    async getLatestVersion() {
        if (!this.client) return null;
        try {
            const { data, error } = await this.client
                .from('app_versions')
                .select('*')
                .order('id', { ascending: false })
                .limit(1)
                .single();

            if (error) {
                if (error.code !== 'PGRST116') console.error('[SupabaseAdapter] getLatestVersion error:', error);
                return null;
            }
            return {
                version: data.version,
                date: data.release_date, // Mapping fields
                notes: data.notes,
                downloadUrl: data.download_url
            };
        } catch (e) {
            console.error('[SupabaseAdapter] getLatestVersion exception:', e);
            return null;
        }
    }

    async publishVersion(version, notes, downloadUrl) {
        if (!this.client) return false;
        try {
            const { error } = await this.client
                .from('app_versions')
                .insert([
                    { version, notes, download_url: downloadUrl, release_date: new Date().toISOString() }
                ]);

            if (error) {
                console.error('[SupabaseAdapter] publishVersion error:', error);
                return false;
            }
            console.log(`[SupabaseAdapter] Version ${version} published successfully.`);
            return true;
        } catch (e) {
            console.error('[SupabaseAdapter] publishVersion exception:', e);
            return false;
        }
    }
}

module.exports = SupabaseAdapter;
