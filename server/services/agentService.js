const fs = require('fs');
const path = require('path');
const db = require('../db');
const neuralService = require('./neuralService');

class AgentService {
    constructor() {
        this.routinesPath = path.join(__dirname, '../data/routines.json');
        this.routines = [];
        this.loadRoutines();
    }

    loadRoutines() {
        try {
            const dir = path.dirname(this.routinesPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

            if (fs.existsSync(this.routinesPath)) {
                this.routines = JSON.parse(fs.readFileSync(this.routinesPath, 'utf8'));
            } else {
                this.saveRoutines();
            }
        } catch (e) {
            console.error("AgentService Load Error:", e);
        }
    }

    saveRoutines() {
        try {
            fs.writeFileSync(this.routinesPath, JSON.stringify(this.routines, null, 2));
        } catch (e) {
            console.error("AgentService Save Error:", e);
        }
    }

    saveRoutine(routine) {
        // { id, name, goal, steps: [] }
        if (!routine.id) routine.id = `rt_${Date.now()}`;

        const idx = this.routines.findIndex(r => r.name === routine.name);
        if (idx >= 0) {
            this.routines[idx] = routine;
        } else {
            this.routines.push(routine);
        }
        this.saveRoutines();
        return routine;
    }

    async executeRoutine(routineName, aiServiceContext) {
        const routine = this.routines.find(r => r.name.toLowerCase() === routineName.toLowerCase());
        if (!routine) return { error: `Rotina "${routineName}" não encontrada.` };

        const results = [];

        for (const step of routine.steps) {
            // Emulate AI Action execution
            // We reuse the aiService.executeAction logic if possible, or reimplement basic here

            let output = null;
            try {
                if (step.action === 'run_sql') {
                    output = await db.executeQuery(step.params.sql);
                }
                else if (step.action === 'list_tables') {
                    output = await db.findObjects(step.params.search_term);
                }
                // Add more autonomous steps here
                results.push({ step: step.description || step.action, status: 'success', data: output });
            } catch (e) {
                results.push({ step: step.description || step.action, status: 'error', error: e.message });
                break; // Stop on error
            }
        }

        return {
            text: `Executei a rotina **${routine.name}**.`,
            action: 'agent_report',
            data: { routineName: routine.name, steps: results }
        }; // Special UI view for agent reports
    }

    /**
     * PLANNING ENGINE
     * Takes a goal and uses the Neural Graph + Available Tools to propose a plan.
     */
    async planTask(goal) {
        // 1. Identify Key Nouns (Concepts)
        const words = goal.split(' '); // Simple tokenizer
        const context = [];

        for (const w of words) {
            if (w.length > 3) {
                const associations = neuralService.activate(w);
                if (associations.length > 0) {
                    context.push({ term: w, related: associations.map(a => a.id).slice(0, 3) });
                }
            }
        }

        // Return the context so the LLM can generate the JSON plan
        return {
            context_found: context,
            suggested_tools: ['run_sql', 'list_tables', 'filter_data']
        };
    }
}

module.exports = new AgentService();
