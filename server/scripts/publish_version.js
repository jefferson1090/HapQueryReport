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
    console.error("Missing Supabase credentials.");
    process.exit(1);
}

// Version Info from Args
const version = process.argv[2];
const notes = process.argv[3] || "Sem notas de versão.";
let url = process.argv[4];

// Auto-generate GitHub Release URL if missing
if (!url) {
    url = `https://github.com/jefferson1090/HapQueryReport/releases/tag/v${version}`;
    console.log("\n[INFO] No URL provided. Auto-generating GitHub Release URL:");
    console.log(`       ${url}`);
}

if (!version) {
    console.error("Usage: node publish_version.js <version> <notes> [url]");
    process.exit(1);
}

// Reminder
console.log("\nIMPORTANT: Create a Release on GitHub:");
console.log(`           Tag: v${version}`);
console.log(`           Upload: .exe file`);
console.log("           (Auto-updates will pull from GitHub from now on)\n");

async function run() {
    console.log(`Publishing version ${version} to Supabase...`);
    const client = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Direct Insert
    const { data, error } = await client
        .from('app_versions')
        .insert([
            {
                version,
                notes,
                download_url: url,
                release_date: new Date().toISOString()
            }
        ]);

    if (error) {
        if (error.code === '23505') { // Unique violation
            console.log("SUCCESS: Version already exists in DB (Skipping insert).");
            process.exit(0);
        }
        console.error("PUBLISH ERROR:", JSON.stringify(error, null, 2));
        process.exit(1);
    } else {
        console.log("SUCCESS: Version published.");
        process.exit(0);
    }
}

run();
