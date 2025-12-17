
const fs = require('fs');
const path = require('path');

class KnowledgeService {
    constructor() {
        this.storagePath = path.join(__dirname, '../data/semantic_knowledge.json');
        this.knowledge = { schemas: [], documents: [] };
        this.loadKnowledge();
    }

    loadKnowledge() {
        try {
            const dir = path.dirname(this.storagePath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

            if (fs.existsSync(this.storagePath)) {
                this.knowledge = JSON.parse(fs.readFileSync(this.storagePath, 'utf8'));
            } else {
                this.saveKnowledge(); // Create empty
            }
        } catch (e) {
            console.error("[KnowledgeService] Load Error:", e);
        }
    }

    saveKnowledge() {
        try {
            fs.writeFileSync(this.storagePath, JSON.stringify(this.knowledge, null, 2));
        } catch (e) {
            console.error("[KnowledgeService] Save Error:", e);
        }
    }

    /**
     * Vector-Ready Search
     * Currently uses Keyword/Frequency matching.
     * Future: Replace this method with Vector DB Query.
     */
    search(query, type = 'all', limit = 5) {
        if (!query) return [];
        const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);

        // 1. Score Schemas (Tables/Columns/Concepts)
        const schemaResults = this.knowledge.schemas.map(item => {
            let score = 0;
            const term = item.term.toLowerCase();

            // Exact match
            if (term === query.toLowerCase()) score += 10;
            // Contains match
            else if (term.includes(query.toLowerCase())) score += 5;

            // Keyword match
            terms.forEach(t => {
                if (term.includes(t)) score += 1;
            });

            return { ...item, score, source: 'knowledge_base' };
        }).filter(r => r.score > 0);

        // 2. Sort by Score
        schemaResults.sort((a, b) => b.score - a.score);

        return schemaResults.slice(0, limit);
    }

    /**
     * Learn new Mapping (Reinforcement Learning)
     * @param {string} userTerm "base de cancelados"
     * @param {string} targetValue "TBL_CANCELLATIONS"
     * @param {string} type "table" | "column" | "filter_value"
     * @param {string} context Parent context (e.g. table name if type is column)
     */
    learn(userTerm, targetValue, type, context = null) {
        if (!userTerm || !targetValue) return;

        // Dedup: Check if exists
        const existingIndex = this.knowledge.schemas.findIndex(
            k => k.term.toLowerCase() === userTerm.toLowerCase() && k.target === targetValue
        );

        const entry = {
            id: `mem_${Date.now()}`,
            term: userTerm,
            target: targetValue,
            type: type,
            context: context,
            embedding: null, // Placeholder for Phase 2
            confidence: 1.0,
            created_at: new Date().toISOString()
        };

        if (existingIndex !== -1) {
            // Reinforce existing
            this.knowledge.schemas[existingIndex].confidence = Math.min(1.5, this.knowledge.schemas[existingIndex].confidence + 0.1);
            this.knowledge.schemas[existingIndex].last_used = new Date().toISOString();
        } else {
            // Add new
            this.knowledge.schemas.push(entry);
        }

        this.saveKnowledge();
        console.log(`[KnowledgeService] Learned: "${userTerm}" -> ${targetValue} (${type})`);
        return entry;
    }
}

module.exports = new KnowledgeService();
