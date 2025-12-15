const docService = require('./services/localDocService');
const aiService = require('./services/aiService');

async function runTests() {
    console.log("=== STARTING RAG VERIFICATION ===");

    // 1. SETUP: Create Seed Data
    console.log("\n[1] SEEDING DATA...");
    const bookId = await docService.createBook("Manual Técnico", "Documentação do Sistema Financeiro");

    const contentSchema = `
    <h1>Esquema do Banco de Dados</h1>
    <p>O sistema utiliza um banco Oracle.</p>
    <h2>Tabelas Principais</h2>
    <ul>
        <li><strong>TB_CLIENTES</strong>: Armazena dados cadastrais dos clientes (CPF, Nome, Endereço).</li>
        <li><strong>TB_PEDIDOS</strong>: Registro de vendas e pedidos. Relacionado com clientes via ID_CLIENTE.</li>
        <li><strong>TB_PRODUTOS</strong>: Catálogo de itens disponíveis.</li>
    </ul>
    <p>A tabela de usuários é a TB_USUARIOS e possui senha criptografada.</p>
    `;

    const nodeId = await docService.createNode(bookId, null, "Estrutura do Banco", "PAGE");
    await docService.updateNodeContent(nodeId, contentSchema, "Estrutura do Banco");
    console.log(`Created Book ${bookId} -> Node ${nodeId}`);

    // Allow FS sync
    await new Promise(r => setTimeout(r, 1000));

    // 2. SCENARIOS
    const scenarios = [
        {
            name: "Keyword Search (Exact)",
            query: "TB_CLIENTES",
            expectedKeywords: ["dados cadastrais", "CPF"]
        },
        {
            name: "Natural Language Question",
            query: "Quais são as tabelas do sistema?",
            expectedKeywords: ["TB_CLIENTES", "TB_PEDIDOS"]
        },
        {
            name: "Specific Detail Retrieval",
            query: "Qual tabela guarda os usuarios?",
            expectedKeywords: ["TB_USUARIOS", "senha"]
        },
        {
            name: "Context Awareness (Summary)",
            query: "Faça um resumo sobre o banco de dados.",
            expectedKeywords: ["Oracle", "Tabelas Principais"]
        },
        {
            name: "Negative Test (Irrelevant)",
            query: "Como fazer um bolo de cenoura?",
            expectedKeywords: ["não", "contexto"] // Expecting it to say "not found" or similar
        }
    ];

    let passed = 0;

    for (const s of scenarios) {
        console.log(`\n--- TEST: ${s.name} ---`);
        console.log(`Query: "${s.query}"`);

        // Use the AI Service (End-to-End)
        // Mocking history as empty
        const response = await aiService.processDocsChat(s.query, []);
        const answer = response.text;

        console.log(`AI Answer: ${answer.substring(0, 100)}...`);

        const match = s.expectedKeywords.some(k => answer.toLowerCase().includes(k.toLowerCase()));
        if (match) {
            console.log("✅ PASS");
            passed++;
        } else {
            // Special handling for Negative Test: if it returns a generic answer or admits ignorance, it passes logical expectation but might fail keyword check if strict.
            // But here we expect it to NOT find info.
            if (s.name.includes("Negative") && (answer.includes("não") || answer.includes("sabe") || answer.includes("contexto"))) {
                console.log("✅ PASS (Correctly ignored)");
                passed++;
            } else {
                console.log(`❌ FAIL - Expected keys: ${s.expectedKeywords.join(', ')}`);
            }
        }
    }

    // 3. CLEANUP (Optional, maybe keep it for user to see?)
    // await docService.deleteBook(bookId);

    console.log(`\n=== RESULT: ${passed}/${scenarios.length} PASSED ===`);
    if (passed === scenarios.length) console.log("SYSTEM IS READY.");
}

runTests();
