require('dotenv').config({ path: '.env' });
const fs = require('fs');
const path = require('path');
const SupabaseAdapter = require('../services/adapters/SupabaseAdapter');
const { createClient } = require('@supabase/supabase-js');

// Try to load from chat_config.json
let config = {};
try {
    const configPath = path.join(__dirname, '..', 'chat_config.json');
    if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
} catch (e) {
    console.error("Failed to load chat_config.json", e);
}

const SUPABASE_URL = process.env.SUPABASE_URL || (config.supabase && config.supabase.url);
const SUPABASE_KEY = process.env.SUPABASE_KEY || (config.supabase && config.supabase.key);

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Missing credentials");
    process.exit(1);
}

async function run() {
    const client = createClient(SUPABASE_URL, SUPABASE_KEY);
    const adapter = new SupabaseAdapter(client);

    const latest = await adapter.getLatestVersion();
    if (latest) {
        console.log("LATEST VERSION IN DB:", latest.version);
    } else {
        console.log("No version found.");
    }
}

run();
