const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Constants
const SUPABASE_URL = 'https://sdqykyhfzfobtycvvitm.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_9GAeu6u_XeImbZGZivau5g_4S71IhHD';
const LOCAL_CONFIG_PATH = path.join(__dirname, '../chat_config.json');

class ConfigManager {
    constructor() {
        this.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        this.config = this.loadLocalConfig();
    }

    // Load local config file (Sync)
    loadLocalConfig() {
        try {
            if (fs.existsSync(LOCAL_CONFIG_PATH)) {
                return JSON.parse(fs.readFileSync(LOCAL_CONFIG_PATH, 'utf8'));
            }
        } catch (error) {
            console.error('[ConfigManager] Failed to load local config:', error);
        }
        return {};
    }

    // Save config to local file
    saveLocalConfig(newConfig) {
        try {
            fs.writeFileSync(LOCAL_CONFIG_PATH, JSON.stringify(newConfig, null, 2));
            this.config = newConfig;
            console.log('[ConfigManager] Local config updated successfully.');
            return true;
        } catch (error) {
            console.error('[ConfigManager] Failed to save local config:', error);
            return false;
        }
    }

    // Sync remote config -> local
    async syncResponse() {
        console.log('[ConfigManager] Checking for remote configuration updates...');
        try {
            // Determine Channel (Default to 'production' for safety)
            const channel = this.config.channel || 'production';
            console.log(`[ConfigManager] syncing using channel: ${channel}`);

            const { data, error } = await this.supabase
                .from('app_config')
                .select('key, value, environment')
                .eq('environment', channel);

            if (error) throw error;

            if (!data || data.length === 0) {
                // If Beta returns nothing, maybe fallback to production? 
                // For now, strict isolation is safer.
                console.log(`[ConfigManager] No remote config found for channel: ${channel}`);
                return;
            }

            // Convert array of {key, value} to object
            const remoteConfigMap = {};
            data.forEach(item => {
                // Map supabase keys to app config properties
                if (item.key === 'groq_api_key') remoteConfigMap.groqApiKey = item.value;
                if (item.key === 'groq_model') remoteConfigMap.model = item.value;
            });

            // Compare and Update
            let hasChanges = false;
            const mergedConfig = { ...this.config };

            for (const [key, value] of Object.entries(remoteConfigMap)) {
                if (mergedConfig[key] !== value) {
                    console.log(`[ConfigManager] Update found for ${key}`);
                    mergedConfig[key] = value;
                    hasChanges = true;
                }
            }

            if (hasChanges) {
                this.saveLocalConfig(mergedConfig);
                return mergedConfig;
            } else {
                console.log('[ConfigManager] Local config is up to date.');
            }

        } catch (error) {
            console.error('[ConfigManager] Sync failed:', error.message);
            // On error, continue using local config
        }
        return this.config;
    }

    // Get a specific config value
    get(key) {
        return this.config[key];
    }

    getChannel() {
        return this.config.channel || 'production';
    }
}

module.exports = new ConfigManager();
