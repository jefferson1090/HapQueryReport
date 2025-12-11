const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '../chat_config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

if (config.activeBackend !== 'supabase') {
    console.error('Active backend is not Supabase. Skipping.');
    process.exit(0);
}

const supabase = createClient(config.supabase.url, config.supabase.key);

async function run() {
    console.log('Connecting to Supabase...');

    // 1. Rename TestBot/TesteBot to Rascunho
    const usersToRename = ['TestBot', 'TesteBot'];

    for (const oldName of usersToRename) {
        const { error, count, data } = await supabase
            .from('messages')
            .update({ sender: 'Rascunho' })
            .eq('sender', oldName)
            .select(); // Select to see what changed (if supported) or just rely on status

        if (error) {
            console.error(`Error renaming ${oldName}:`, error.message);
        } else {
            console.log(`Renamed messages from ${oldName} to Rascunho.`);
        }
    }

    // 2. Check Schema Columns
    const { data: sample, error: sampleError } = await supabase
        .from('messages')
        .select('*')
        .limit(1);

    if (sampleError) {
        console.error('Error fetching sample:', sampleError);
    } else if (sample && sample.length > 0) {
        console.log('Table Schema detected keys:', Object.keys(sample[0]));
    } else {
        console.log('Table appears empty, cannot infer schema.');
    }
}

run();
