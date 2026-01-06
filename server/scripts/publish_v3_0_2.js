require('dotenv').config({ path: '../.env' }); // Adjust path if needed
const chatService = require('../services/chatService');

// DEBUG: Print loaded env vars
console.log("Loaded ENV vars containing 'SUPABASE':");
Object.keys(process.env).forEach(k => {
    if (k.includes('SUPABASE')) {
        console.log(`${k}: ${process.env[k] ? 'EXISTS' : 'MISSING'}`);
    }
});

// Force Supabase backend
chatService.config.activeBackend = 'supabase';

(async () => {
    console.log("Initializing Adapter...");
    await chatService.initAdapter();

    const version = '3.0.2';
    const notes = 'v3.0.2: Novos temas (Standard Light e Dracula Plus), correções de UI e melhorias de performance.';
    // GitHub Release URL format: https://github.com/<user>/<repo>/releases/download/<tag>/<filename>
    // Filename: Hap-Assistente-de-Dados Setup 3.0.2.exe -> Hap-Assistente-de-Dados%20Setup%203.0.2.exe
    const url = 'https://github.com/jefferson1090/HapQueryReport/releases/download/v3.0.2/Hap-Assistente-de-Dados%20Setup%203.0.2.exe';

    console.log(`Publishing version ${version}...`);
    const success = await chatService.publishVersion(version, notes, url);

    if (success) {
        console.log("SUCCESS: Version published to Supabase.");
    } else {
        console.error("FAILURE: Could not publish version.");
    }

    process.exit(0);
})();
