const SupabaseAdapter = require('./services/adapters/SupabaseAdapter');
const path = require('path');
const fs = require('fs');

async function diagnose() {
    console.log("=== SUPABASE DIAGNOSIS ===");

    // 1. Load Config
    const configPath = path.join(__dirname, 'chat_config.json');
    if (!fs.existsSync(configPath)) {
        console.error("❌ No chat_config.json found.");
        return;
    }
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (config.activeBackend !== 'supabase') {
        console.error("❌ Backend is not set to 'supabase'.");
        return;
    }

    // 2. Connect
    const adapter = new SupabaseAdapter(config.supabase);
    const connected = await adapter.connect();
    if (!connected) {
        console.error("❌ Failed to connect to Supabase.");
        return;
    }
    console.log("✅ Connected to Supabase.");

    // 3. Setup Listener for Self-Verification
    let eventReceived = false;
    adapter.setMessageUpdateHandler((msg) => {
        console.log("✅ REALTIME EVENT RECEIVED:", msg);
        eventReceived = true;
    });

    // 4. Test Write (Insert)
    const testMsgId = 'diag_' + Date.now();
    const testContent = `[DIAGNOSIS] Test at ${new Date().toISOString()}`;

    console.log(`\n--- Test 1: Sending Message (${testMsgId}) ---`);
    try {
        // We can't force ID in send, so we send and inspect result? 
        // Adapter.sendMessage doesn't return the ID. using raw client.
        const { data, error } = await adapter.client
            .from('messages')
            .insert({
                sender: 'DiagnosisBot',
                content: testContent,
                recipient: 'ALL'
            })
            .select()
            .single();

        if (error) throw error;
        console.log("✅ Message Inserted. ID:", data.id);
        const realId = data.id;

        // 5. Test Update (Reaction)
        console.log(`\n--- Test 2: Adding Reaction ---`);
        await adapter.addReaction(realId, '🧪', 'DiagnosisBot');
        console.log("✅ addReaction method completed without error.");

        // 6. Test Read Receipt
        console.log(`\n--- Test 3: Mark as Read ---`);
        await adapter.markAsRead([realId]);
        console.log("✅ markAsRead method completed without error.");

        // 7. Wait for Realtime Event
        console.log(`\n--- Waiting 5s for Realtime Events... ---`);
        await new Promise(r => setTimeout(r, 5000));

        if (eventReceived) {
            console.log("\n✅ SUCCESS: Realtime events are working!");
        } else {
            console.error("\n❌ FAILURE: Operations succeeded via REST, but NO Realtime events received.");
            console.error("   Possible Causes:");
            console.error("   1. 'Realtime' replication not enabled for 'messages' table.");
            console.error("   2. Network firewall blocking WebSockets.");
        }

        // Cleanup
        await adapter.client.from('messages').delete().eq('id', realId);
        console.log("\n(Cleaned up test message)");

    } catch (e) {
        console.error("❌ TEST FAILED:", e);
    }

    process.exit(0);
}

diagnose();
