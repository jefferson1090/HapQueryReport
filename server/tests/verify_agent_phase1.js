const fs = require('fs');
const path = require('path');

// Mock dependencies
const mockDb = {
    // Mock database responses
    query: async (sql, params) => {
        console.log(`[DB MOCK] Executing: ${sql.substring(0, 50)}...`);
        return { rows: [] };
    },
    findObjects: async (term, schema) => {
        console.log(`[DB MOCK] findObjects: ${term}`);
        if (term && term.includes('PESSOA')) {
            return [
                { owner: 'INCORPORA', object_name: 'TB_OPE_PESSOA_FISICA', full_name: 'INCORPORA.TB_OPE_PESSOA_FISICA', comments: 'PF' },
                { owner: 'INCORPORA', object_name: 'TB_OPE_PESSOA_JURIDICA', full_name: 'INCORPORA.TB_OPE_PESSOA_JURIDICA', comments: 'PJ' }
            ];
        }
        return [];
    },
    getColumns: async (tableName) => {
        console.log(`[DB MOCK] getColumns: ${tableName}`);
        return [
            { COLUMN_NAME: 'ID', DATA_TYPE: 'NUMBER' },
            { COLUMN_NAME: 'NR_CPF', DATA_TYPE: 'VARCHAR2' },
            { COLUMN_NAME: 'NM_NOME', DATA_TYPE: 'VARCHAR2' }
        ];
    },
    executeQuery: async (sql, params) => {
        console.log(`[DB MOCK] executeQuery: ${sql ? sql.substring(0, 50) : 'null'}...`);
        return { rows: [] };
    },
    getConnection: async () => ({
        execute: async () => ({ rows: [] }),
        close: async () => { }
    })
};

// Mock SERVICES
process.env.GROQ_API_KEY = "mock_key"; // Just to pass init
const aiServicePath = '../services/aiService.js';
const neuralServicePath = '../services/neuralService.js';

// Intercept require to mock db
const originalRequire = require('module').prototype.require;
require('module').prototype.require = function (request) {
    if (request.endsWith('db')) return mockDb;
    return originalRequire.apply(this, arguments);
};

// Start Test
(async () => {
    console.log("🚀 STARTING AGENT PHASE 1 VERIFICATION");

    // Load Services
    // Load Services (Singleton)
    const ai = require(aiServicePath);
    const neuralService = require(neuralServicePath);

    // clear memory for test
    if (fs.existsSync(neuralService.persistenceFile)) {
        fs.unlinkSync(neuralService.persistenceFile);
    }

    // Reset State
    ai.conversationState = { status: 'IDLE', payload: null };

    // --- SCENARIO 1: AMBIGUITY ---
    console.log("\n🧪 1. Testing Table Ambiguity (Term: 'PESSOA')");
    // Simulate: User asks for 'pessoa', AI can't map it directly, but regex/logic finds similar tables
    // We mock the AI finding matches via db.query

    // Manually triggering the logic that happens when "Table Not Found"
    // In real flow: processWithGroq -> action: 'run_sql' (fails?) -> or list_tables
    // Let's call the method that handles table ambiguity directly if possible, or simulate the message.

    // Since we don't have a real Groq response, we can't fully simulate the LLM decision.
    // BUT we can test the `executeAction` logic for `list_tables` which returns selections.

    const searchMatches = await ai.executeAction({
        action: 'list_tables',
        data: { search_term: 'PESSOA' }
    });

    // Check if it returned a selection action
    console.log(`[RESULT] Action returned: ${searchMatches.action}`);
    if (searchMatches.action === 'table_selection') {
        console.log("✅ PASSED: Agent presented table options.");
    } else {
        console.error("❌ FAILED: Agent did not present options.", searchMatches);
    }

    // --- SCENARIO 2: LEARNING ---
    console.log("\n🧪 2. Testing Learning on Selection");

    // Set the state manually as if the previous turn happened
    ai.conversationState = {
        status: 'AWAITING_TABLE_SELECTION',
        payload: { originalTerm: 'PESSOA', originalData: { value: '123' } }
    };

    // Simulate User Selection (this message comes from the frontend button)
    const selectionMsg = "Use a tabela INCORPORA.TB_OPE_PESSOA_FISICA para atender ao meu pedido anterior";

    // Process this message
    await ai.processMessage(selectionMsg, 'ai');

    // Verify Neural Memory
    const nodes = neuralService.graph.nodes;
    const edge = neuralService.graph.edges.find(e => e.from === 'PESSOA' && e.to === 'INCORPORA.TB_OPE_PESSOA_FISICA');

    if (edge) {
        console.log(`✅ PASSED: Neural Memory learned: "PESSOA" -> "${edge.to}"`);
    } else {
        console.error("❌ FAILED: Association not found in Neural Graph.");
        console.log("Graph Edges:", neuralService.graph.edges);
    }

    console.log("\n🏁 VERIFICATION COMPLETE");
})();
