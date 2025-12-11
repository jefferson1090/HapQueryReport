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
                            this.onMessageUpdateCallback(payload.new);
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
                        this.messageStates.set(msg.id, msg.read_at);

                        this.handleIncomingMessage(msg);
                        newCount++;

                        // Advance cursor tracking the newest message
                        if (msg.created_at > this.lastPollTime) {
                            this.lastPollTime = msg.created_at;
                        }
                    }
                    // 2. Update Detection (e.g. Read Receipts)
                    else {
                        if (!this.messageStates) this.messageStates = new Map();
                        const lastReadAt = this.messageStates.get(msg.id);

                        // If read_at changed (e.g. from null to timestamp), emit update
                        if (msg.read_at !== lastReadAt) {
                            console.log(`[SupabaseAdapter] Detected update for ${msg.id}: read_at ${lastReadAt} -> ${msg.read_at}`);
                            this.messageStates.set(msg.id, msg.read_at);

                            if (this.onMessageUpdateCallback) {
                                this.onMessageUpdateCallback(msg);
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
            const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
            const { data } = await this.client
                .from('messages')
                .select('sender, created_at')
                .gt('created_at', tenMinutesAgo)
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

        // Try WS Track
        const channel = this.client.channel('room_global');
        // Check if subscribed before tracking?
        // Just attempt it.
        channel.track({
            online_at: new Date().toISOString(),
            user: this.currentUsername,
            team: team || 'Geral',
            user_id: this.userId
        }).catch(e => console.warn("WS Track failed (expected in polling mode)", e));
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
            .limit(1000); // Safety limit, but high enough for 7 days of normal chat

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
                read_at: msg.read_at
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
}

module.exports = SupabaseAdapter;
