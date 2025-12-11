
require('dotenv').config({ path: '../.env' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load Config
const configPath = path.join(__dirname, '../chat_config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

if (!config.supabase || !config.supabase.url) {
    console.error("Missing Supabase config");
    process.exit(1);
}

const supabase = createClient(config.supabase.url, config.supabase.key);

async function testRest() {
    console.log("1. Testing REST (HTTP) Connection...");
    const { data, error } = await supabase.from('messages').select('count', { count: 'exact', head: true });
    if (error) {
        console.error("   [REST FAILED]", error.message);
        return false;
    }
    console.log("   [REST SUCCESS] Connection OK. Table exists.");
    return true;
}

async function testRealtime() {
    console.log("2. Testing Realtime (WebSockets)...");

    const user = 'TestBot_' + Math.floor(Math.random() * 1000);
    const channel = supabase.channel('room_global', {
        config: {
            presence: { key: user },
        },
    });

    channel
        .on('presence', { event: 'sync' }, () => {
            const state = channel.presenceState();
            console.log("   [REALTIME] Presence Sync received!", Object.keys(state).length, "users online.");
            console.log("   [REALTIME] Users:", JSON.stringify(state, null, 2));
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }) => {
            console.log('   [REALTIME] Join:', key, newPresences);
        })
        .on('broadcast', { event: 'test' }, (payload) => {
            console.log('   [REALTIME] Broadcast received:', payload);
        })
        .subscribe(async (status) => {
            console.log("   [REALTIME] Subscription Status:", status);
            if (status === 'SUBSCRIBED') {
                console.log("   [REALTIME SUCCESS] Connected!");
                await channel.track({ online_at: new Date().toISOString(), user: user, team: 'BotTeam' });
                console.log(`   [INFO] I am ${user}, tracking presence...`);
            }
        });

    // Keep Node process alive and send Heartbeats for Polling Presence
    console.log('[TESTBOT] Starting Heartbeat Loop (every 30s)...');
    setInterval(async () => {
        try {
            await supabase.from('messages').insert({
                sender: 'TestBot',
                content: '[HEARTBEAT]',
                // created_at is auto
            });
            console.log('[TESTBOT] Sent Heartbeat (keeps me "online" for pollers).');
        } catch (e) {
            console.error('[TESTBOT] Heartbeat failed:', e.message);
        }
    }, 30000); // 30 seconds to be safe ensuring visibility

    // Keep alive for a bit
    setInterval(() => {
        console.log("   ... waiting for events ...");
    }, 5000);
}

async function run() {
    const restOk = await testRest();
    if (restOk) {
        await testRealtime();
    } else {
        console.log("Skipping Realtime test due to REST failure.");
    }
}

run();
