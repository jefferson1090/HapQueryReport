const fs = require('fs');
const path = require('path');
const os = require('os');

// Store learning data in user specific directory to persist across restarts/updates
const LEARNING_FILE = path.join(os.homedir(), '.gemini', 'antigravity', 'oracle_lowcode_learning.json');

class LearningService {
    constructor() {
        this.data = {
            interactions: [],
            patterns: {},
            skills: [],
            headlines: []
        };
        this.loadData();
    }

    loadData() {
        try {
            if (fs.existsSync(LEARNING_FILE)) {
                const raw = fs.readFileSync(LEARNING_FILE, 'utf8');
                this.data = JSON.parse(raw);

                // Force-inject defaults even if file exists (to update for existing users)
                this.ensureDefaults();

            } else {
                this.ensureDefaults();

                const dir = path.dirname(LEARNING_FILE);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                this.saveData();
            }
        } catch (e) {
            console.error("Failed to load learning data:", e);
        }
    }

    ensureDefaults() {
        // HEADLINES
        const defaultHeadlines = [
            { id: 'start_1', title: '🔍 Buscar Tabela', prompt: 'Buscar uma tabela', type: 'template' },
            { id: 'start_2', title: '⚡ Executar Query', prompt: 'Executar uma query', type: 'template' },
            { id: 'start_3', title: '✨ Criar Tabela', prompt: 'Criar uma tabela', type: 'template' },
            { id: 'start_4', title: '🔎 Localizar Registro', prompt: 'Localizar registro', type: 'template' },
            { id: 'start_6', title: '📝 Listar Triggers', prompt: 'Listar triggers', type: 'template' }
        ];

        // Merge defaults ensuring we don't duplicate by ID
        defaultHeadlines.forEach(dh => {
            if (!this.data.headlines.some(h => h.id === dh.id)) {
                this.data.headlines.push(dh);
            } else {
                // Update existing default (in case we changed wording)
                const idx = this.data.headlines.findIndex(h => h.id === dh.id);
                this.data.headlines[idx] = dh;
            }
        });

        // SKILLS
        const defaultSkills = [
            'list_tables',
            'describe_table',
            'find_record',
            'draft_table',
            'list_triggers',
            'create_table_sql'
        ];

        defaultSkills.forEach(s => {
            if (!this.data.skills.includes(s)) {
                this.data.skills.push(s);
                if (!this.data.patterns[s]) this.data.patterns[s] = 1; // Give it a base score
            }
        });
    }

    saveData() {
        try {
            fs.writeFileSync(LEARNING_FILE, JSON.stringify(this.data, null, 2));
        } catch (e) {
            console.error("Failed to save learning data:", e);
        }
    }

    logInteraction(intent, prompt, success = true) {
        if (!success) return;

        // 1. Log History (Audit)
        this.data.interactions.push({
            timestamp: new Date().toISOString(),
            intent,
            prompt: prompt.substring(0, 100)
        });
        if (this.data.interactions.length > 500) this.data.interactions.shift();

        // 2. Update Pattern Frequency
        if (!this.data.patterns[intent]) this.data.patterns[intent] = 0;
        this.data.patterns[intent]++;

        // 3. Smart Headline Promotion
        // Map intents to specific template IDs
        const intentMap = {
            'draft_table': 'start_3',
            'list_tables': 'start_1',
            'describe_table': 'start_2',
            'find_record': 'start_4',
            'create_report': 'start_5',
            'list_triggers': 'start_6'
        };

        const templateId = intentMap[intent];

        if (templateId) {
            // It matches a known template. Promote that template, BUT ALSO check if we should learn the specific phrase.
            // If the user uses a very specific phrasing repeatedly that is NOT the default prompt, we might want to capture it.
            // For now, let's just lower the threshold for promotion.
            if (this.data.patterns[intent] >= 2) {
                // Find the template
                const idx = this.data.headlines.findIndex(h => h.id === templateId);
                if (idx >= 0) {
                    // Promote existing
                    const item = this.data.headlines.splice(idx, 1)[0];
                    item.type = 'learned';
                    this.data.headlines.unshift(item);
                }
            }
        }

        // ALWAYS try to learn new exact phrase if repeated, even if it maps to an intent (override/add variation)
        // This ensures "My Custom Command" gets saved even if we mapped it to "list_tables" internally.
        if (this.data.patterns[intent] >= 2) {
            const existing = this.data.headlines.find(h => h.prompt === prompt);
            // If we don't have this EXACT prompt as a headline yet
            if (!existing) {
                // If it's significantly different from the default template prompt
                const defaultTemplate = this.data.headlines.find(h => h.id === intentMap[intent]);
                if (!defaultTemplate || defaultTemplate.prompt !== prompt) {
                    let title = prompt;
                    if (title.length > 20) title = title.substring(0, 20) + '...';

                    this.data.headlines.unshift({
                        id: `learned_${Date.now()}`,
                        title: `De novo: ${title}`,
                        prompt: prompt,
                        type: 'learned'
                    });
                }
            }
        }

        // Limit headlines
        if (this.data.headlines.length > 8) {
            this.data.headlines.pop();
        }

        this.saveData();
    }

    getSuggestions() {
        return this.data.headlines;
    }

    getSkills() {
        // Map learned intents to user-friendly descriptions
        const descriptions = {
            'list_tables': 'Listar e buscar tabelas no banco',
            'describe_table': 'Explicar a estrutura e colunas',
            'find_record': 'Localizar registros específicos',
            'draft_table': 'Assistente de criação de tabelas',
            'list_triggers': 'Analisar gatilhos (triggers) do sistema',
            'create_table_sql': 'Gerar SQL de criação de tabelas (Rápido)',
            'chat': 'Conversar e tirar dúvidas gerais'
        };

        return this.data.skills.map(s => ({
            id: s,
            name: descriptions[s] || `Executar ação: ${s}`,
            frequency: this.data.patterns[s] || 0
        })).sort((a, b) => b.frequency - a.frequency);
    }
}

module.exports = new LearningService();
