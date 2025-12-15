const docService = require('./services/localDocService');

async function createManual() {
    console.log("=== CREATING APP MANUAL ===");

    // 1. Create Book
    const bookId = await docService.createBook("Manual da Aplicação", "Guia completo de uso do sistema HAP Query Report.");
    console.log(`Created Book: ${bookId}`);

    // Allow FS sync
    await new Promise(r => setTimeout(r, 1000));

    // 2. Define Pages
    const pages = [
        {
            title: "01. Visão Geral",
            content: `
            <h1>Bem-vindo ao HAP Query Report</h1>
            <p>O <strong>HAP Query Report</strong> é uma ferramenta poderosa para desenvolvedores e analistas de dados, projetada para simplificar a interação com bancos de dados Oracle e documentação de projetos.</p>
            
            <h2>Funcionalidades Principais</h2>
            <ul>
                <li><strong>Editor SQL Inteligente:</strong> Execute queries, visualize resultados e exporte dados.</li>
                <li><strong>Assistente de IA (Chat):</strong> Converse com seus dados, peça queries SQL e explicações.</li>
                <li><strong>Documentação (Docs):</strong> Crie wikis e manuais técnicos integrados.</li>
                <li><strong>Modo Escuro:</strong> Interface moderna e confortável.</li>
            </ul>

            <blockquote>"Produtividade é ter as ferramentas certas na hora certa."</blockquote>
            `
        },
        {
            title: "02. Editor SQL",
            content: `
            <h1>Editor SQL</h1>
            <p>O coração do sistema. Aqui você pode rodar qualquer comando SQL contra o banco conectado.</p>

            <h2>Comandos Básicos</h2>
            <pre><code class="language-sql">-- Selecionar todos os clientes
SELECT * FROM TB_CLIENTES;

-- Filtrar pedidos recentes
SELECT * FROM TB_PEDIDOS WHERE DT_PEDIDO > SYSDATE - 7;</code></pre>

            <h2>Dicas de Uso</h2>
            <ol>
                <li>Use <strong>Ctrl+Enter</strong> para executar a query selecionada.</li>
                <li>Clique no ícone de <strong>Raio</strong> acima dos resultados para exportar CSV.</li>
                <li>Salve seus scripts favoritos na aba "Salvos".</li>
            </ol>
            `
        },
        {
            title: "03. Chat com IA",
            content: `
            <h1>Chat Inteligente (RAG)</h1>
            <p>A IA do sistema é capaz de entender seu banco de dados e seus documentos.</p>

            <h2>O que você pode perguntar?</h2>
            <ul>
                <li><em>"Quais tabelas têm a coluna CPF?"</em></li>
                <li><em>"Crie um SQL para listar as vendas de ontem."</em></li>
                <li><em>"Explique a estrutura da tabela TB_PEDIDOS."</em></li>
            </ul>

            <p><strong>Configuração:</strong> Certifique-se de que sua chave de API (Groq) está configurada no arquivo <code>.env</code>.</p>
            `
        },
        {
            title: "04. Documentação (Docs)",
            content: `
            <h1>Sistema de Documentação</h1>
            <p>Esqueça arquivos Word perdidos. Mantenha a documentação técnica junto com o código.</p>

            <h2>Recursos do Editor</h2>
            <ul>
                <li><strong>Formatação Rica:</strong> Negrito, Itálico, Listas, Tabelas.</li>
                <li><strong>Blocos de Código:</strong> SQL, JavaScript, Python com syntax highlighting.</li>
                <li><strong>Imagens:</strong> Arraste e solte imagens diretamente no editor.</li>
                <li><strong>Chat com Docs:</strong> Abra o chat lateral e peça resumo da página atual!</li>
            </ul>
            `
        },
        {
            title: "05. Configurações",
            content: `
            <h1>Configurações e Temas</h1>
            <p>Personalize sua experiência clicando no ícone de engrenagem no canto esquerdo inferior.</p>

            <h2>Opções Disponíveis</h2>
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background-color: #f3f4f6;">
                        <th style="border: 1px solid #ddd; padding: 8px;">Opção</th>
                        <th style="border: 1px solid #ddd; padding: 8px;">Descrição</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td style="border: 1px solid #ddd; padding: 8px;">Tema</td>
                        <td style="border: 1px solid #ddd; padding: 8px;">Alternar entre Claro e Escuro.</td>
                    </tr>
                    <tr>
                        <td style="border: 1px solid #ddd; padding: 8px;">Conexões</td>
                        <td style="border: 1px solid #ddd; padding: 8px;">Gerenciar credenciais de banco de dados.</td>
                    </tr>
                    <tr>
                        <td style="border: 1px solid #ddd; padding: 8px;">IA Model</td>
                        <td style="border: 1px solid #ddd; padding: 8px;">Escolher o modelo LLM (Llama 3, etc).</td>
                    </tr>
                </tbody>
            </table>
            `
        }
    ];

    // 3. Insert Pages
    for (const page of pages) {
        const nodeId = await docService.createNode(bookId, null, page.title, "PAGE");
        await docService.updateNodeContent(nodeId, page.content, page.title);
        console.log(`  + Created Page: ${page.title}`);
        // Small delay to ensure order timestamp difference
        await new Promise(r => setTimeout(r, 200));
    }

    console.log("=== MANUAL CREATED SUCCESSFULLY ===");
}

createManual();
