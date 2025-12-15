const SupabaseAdapter = require('./services/adapters/SupabaseAdapter');
const path = require('path');
const fs = require('fs');

async function checkSchema() {
    // Load config
    const configPath = path.join(__dirname, 'chat_config.json');
    if (!fs.existsSync(configPath)) {
        console.error("No config found");
        return;
    }
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    if (config.activeBackend !== 'supabase') {
        console.log("Not using Supabase backend");
        return;
    }

    const adapter = new SupabaseAdapter(config.supabase);
    const connected = await adapter.connect();

    if (!connected) {
        console.error("Failed to connect");
        return;
    }

    console.log("Fetching one message to inspect structure...");
    try {
        const { data, error } = await adapter.client
            .from('messages')
            .select('*')
            .limit(1);

        if (error) {
            console.error("Error selecting:", error);
        } else if (data.length > 0) {
            console.log("Sample Message Keys:", Object.keys(data[0]));
            console.log("Sample Message:", data[0]);
        } else {
            console.log("No messages found, cannot infer schema.");
        }
    } catch (e) {
        console.error("Exception:", e);
    }
}

checkSchema();
