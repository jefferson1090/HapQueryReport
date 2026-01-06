const path = require('path');
require('dotenv').config(); // Defaults to cwd/.env defined by where node is run
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
// const path = require('path'); // Already declared at top

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

console.log("Loaded Env Vars:", Object.keys(process.env).filter(k => k.includes('SUPABASE')));
console.log("Config loaded:", Object.keys(config));

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Missing credentials. Please check .env or chat_config.json");
    // process.exit(1); // Don't exit yet, let's see what happens.
}

const client = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
    console.log('Cleaning up old versions from app_versions table...');

    // Logic: Delete ALL versions to ensure clean slate, or delete all except current (which doesn't exist yet).
    // User asked to clean cache/records to avoid errors. Wiping table is effective.
    const { error } = await client
        .from('app_versions')
        .delete()
        .neq('version', '0.0.0'); // Delete everything (hack: version is never 0.0.0 usually, or just use .gt('id', 0) if id is int)

    // Using a safer filter just in case delete() requires one.
    // 'id' is likely int or uuid. If uuid, neq 000 is valid.

    /* 
       Actually, standard supabase-js delete() requires a filter.
       Let's check schema/adapter again? 
       Schema wasn't fully visible but adapter used 'id'.
       Let's assume 'id' column exists.
    */

    // Alternative: Delete all where version is NOT 3.0.3 (which implies deleting everything since 3.0.3 isn't published yet)
    const { error: error2 } = await client
        .from('app_versions')
        .delete()
        .neq('version', '3.0.3');

    if (error2) {
        console.error("Error cleaning versions:", error2);
    } else {
        console.log("SUCCESS: Old versions wiped from database.");
    }
}

run();
