const http = require('http');

const API_HOST = 'localhost';
const API_PORT = 3001;
const API_BASE = '/api/docs';
const BOOK_ID = 1765218608059; // Manual Técnico

const PAGES = [
    {
        title: "1. Introdução e Visão Geral",
        content: `
            <h1>Manual da Aplicação Oracle Low-Code</h1>
            <p>Bem-vindo à documentação oficial do sistema. Esta aplicação foi desenvolvida para oferecer uma interface moderna e eficiente para gerenciamento de bancos de dados Oracle, comunicação de equipe e documentação de processos.</p>
            
            <h2>Principais Módulos</h2>
            <p>O sistema é composto por 5 módulos principais, acessíveis através da barra lateral esquerda:</p>
            <ul>
                <li><strong>💬 Team Chat:</strong> Ferramenta de comunicação em tempo real com suporte a compartilhamento de queries e documentos.</li>
                <li><strong>⚡ SQL Runner:</strong> Editor SQL avançado com Inteligência Artificial integrada para execução, correção e otimização de queries.</li>
                <li><strong>📄 Importador CSV:</strong> Ferramenta para importação em massa de dados com mapeamento automático de colunas e criação de tabelas.</li>
                <li><strong>📚 Docs (Wiki):</strong> Sistema de documentação integrado (onde você está lendo isso) com suporte a edição rica e PDF.</li>
                <li><strong>🤖 AI Builder:</strong> Assistente para geração de estruturas de banco de dados e tira-dúvidas.</li>
            </ul>

            <div style="background-color: #f0f9ff; border-left: 4px solid #0077cc; padding: 10px; margin: 10px 0;">
                <strong>Dica:</strong> Você pode navegar entre os módulos rapidamente clicando nos ícones da barra lateral ou usando atalhos de teclado configurados.
            </div>
        `
    },
    {
        title: "2. Team Chat - Comunicação",
        content: `
            <h1>Team Chat</h1>
            <p>O <strong>Team Chat</strong> é o centro de colaboração da equipe. Diferente de chats comuns, ele é integrado ao contexto do banco de dados.</p>

            <h2>Funcionalidades Principais</h2>
            <h3>1. Canais e Privado</h3>
            <ul>
                <li><strong># Geral:</strong> Canal público onde todas as mensagens são visíveis para a equipe.</li>
                <li><strong>Mensagens Diretas (DM):</strong> Clique em um usuário na lista lateral (verde = online) para abrir uma conversa privada.</li>
            </ul>

            <h3>2. Compartilhamento Rico</h3>
            <p>Ao clicar no ícone de <strong>Compartilhar (Share)</strong> no topo do chat, você pode enviar:</p>
            <ul>
                <li><strong>Queries SQL Salvas:</strong> Envie queries complexas para um colega. Ele poderá executá-las com um clique.</li>
                <li><strong>Páginas do Docs:</strong> Link direto para uma documentação específica.</li>
                <li><strong>Lembretes:</strong> Compartilhe tarefas do backlog.</li>
            </ul>

            <h3>3. Recursos de Mensagem</h3>
            <ul>
                <li><strong>Detecção de Código:</strong> O chat detecta automaticamente se você está enviando SQL e formata o texto como código.</li>
                <li><strong>Reações:</strong> Clique em uma mensagem para reagir com emojis.</li>
                <li><strong>Responder:</strong> Use o recurso de resposta para manter o contexto da conversa.</li>
                <li><strong>Notificações:</strong> Contador de mensagens não lidas aparece ao lado do nome do usuário.</li>
            </ul>

            <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 10px;">
                <strong>Nota:</strong> O chat mantém histórico das conversas. Se você sair e voltar, suas mensagens anteriores serão carregadas.
            </div>
        `
    },
    {
        title: "3. SQL Runner - Guia Completo",
        content: `
            <h1>SQL Runner</h1>
            <p>O <strong>SQL Runner</strong> é uma IDE completa para Oracle Database dentro da aplicação.</p>

            <h2>Interface do Editor</h2>
            <ul>
                <li><strong>Abas Múltiplas:</strong> Trabalhe em várias queries simultaneamente. Clique no <strong>+</strong> para abrir nova aba.</li>
                <li><strong>Autocomplete:</strong> O editor sugere comandos SQL e nomes de tabelas/colunas enquanto você digita.</li>
                <li><strong>Formatação:</strong> Clique no ícone <strong>{}</strong> para formatar seu SQL automaticamente (identação e caixa alta).</li>
            </ul>

            <h2>Execução e Resultados</h2>
            <ol>
                <li>Digite seu comando (Ex: <code>SELECT * FROM EMPLOYEES</code>).</li>
                <li>Pressione <strong>CTRL + ENTER</strong> ou clique em <strong>Executar</strong>.</li>
                <li>Os resultados aparecem na grade inferior.</li>
            </ol>
            
            <h3>Recursos da Grade de Resultados</h3>
            <ul>
                <li><strong>Virtual Scroll:</strong> Suporta visualização de milhares de registros sem travar.</li>
                <li><strong>Ordenação/Redimensionar:</strong> Arraste as colunas para reordenar. Clique duplo na divisória para ajuste automático de largura.</li>
                <li><strong>Filtros:</strong> Clique em "Filtros" para buscar dados específicos nas colunas resultantes.</li>
            </ul>

            <h2>Inteligência Artificial (IA)</h2>
            <p>O SQL Runner possui integração profunda com IA:</p>
            <ul>
                <li><strong>Explique isso:</strong> Selecione uma query complexa e peça para a IA explicar o que ela faz.</li>
                <li><strong>Corrigir Erro:</strong> Se sua query der erro (ex: ORA-00942), clique em <strong>✨ Corrigir com IA</strong>. O sistema analisará o erro e o schema para sugerir a correção.</li>
                <li><strong>Otimizar:</strong> A IA pode reescrever sua query para melhor performance.</li>
            </ul>

            <h2>Exportação</h2>
            <p>Você pode exportar os resultados da grade para:</p>
            <ul>
                <li><strong>Excel (.xlsx):</strong> Mantém formatação.</li>
                <li><strong>CSV:</strong> Para importação em outros sistemas.</li>
            </ul>
        `
    },
    {
        title: "4. Importador CSV - Passo a Passo",
        content: `
            <h1>Importador CSV</h1>
            <p>Ferramenta para carga de dados (Data Loading) que automatiza a criação de tabelas.</p>

            <h2>Como Importar</h2>
            
            <h3>Passo 1: Upload</h3>
            <p>Arraste seu arquivo <code>.csv</code> para a área pontilhada ou clique para selecionar. O sistema analisará automaticamente:</p>
            <ul>
                <li>Separador (vírgula, ponto-e-vírgula, pipe).</li>
                <li>Codificação.</li>
                <li>Headers (Cabeçalhos).</li>
            </ul>

            <h3>Passo 2: Mapeamento e Definição</h3>
            <p>Nesta etapa, você define:</p>
            <ul>
                <li><strong>Nome da Tabela:</strong> O sistema sugere baseado no nome do arquivo (Ex: <code>CLIENTES_2024</code>).</li>
                <li><strong>Tipos de Colunas:</strong> O sistema infere se é <code>NUMBER</code>, <code>DATE</code> ou <code>VARCHAR2</code>, mas você pode alterar.</li>
            </ul>
            <p><em>Verifique a pré-visualização dos dados antes de prosseguir.</em></p>

            <h3>Passo 3: Confirmação e Permissões</h3>
            <ul>
                <li><strong>Tabela Existente:</strong> Se a tabela já existir, você terá a opção de <strong>Recriar (DROP/CREATE)</strong> ou voltar para renomear.</li>
                <li><strong>GRANT Automático:</strong> Você pode especificar um usuário (ex: <code>APLICACAO_WEB</code>) para receber permissão de <code>SELECT/INSERT</code> automaticamente após a criação.</li>
            </ul>

            <h2>Histórico</h2>
            <p>O importador mantém um registro das últimas importações realizadas, permitindo:</p>
            <ul>
                <li>Ver quantos registros foram importados.</li>
                <li>Conceder permissões tardias (botão Editar Permissão).</li>
                <li>Excluir a tabela e o histórico (Botão Lixeira).</li>
            </ul>
        `
    },
    {
        title: "5. Módulo Docs - Editor",
        content: `
            <h1>Módulo Docs (Wiki)</h1>
            <p>Este manual foi criado utilizando o próprio módulo Docs.</p>

            <h2>Estrutura</h2>
            <p>O Docs organiza o conteúdo em <strong>Livros (Books)</strong>. Cada livro contém uma árvore infinita de <strong>Páginas</strong>.</p>

            <h2>Editor WYSIWYG</h2>
            <p>O editor oferece uma experiência similar ao MS Word:</p>
            <ul>
                <li><strong>Formatação:</strong> Negrito, Itálico, Sublinhado, Cores.</li>
                <li><strong>Mídia:</strong> Suporte a Imagens (copiar e colar), Tabelas e Links.</li>
                <li><strong>Paginação A4:</strong> O editor quebra o conteúdo visualmente em páginas A4, ideal para gerar PDFs prontos para impressão.</li>
            </ul>

            <h2>Atalhos Úteis</h2>
            <ul>
                <li><code>CTRL + K</code>: Abre a busca rápida (Spotlight) para encontrar qualquer página.</li>
                <li><code>/ (Barra)</code>: Abre o menu de comandos rápidos (se habilitado) para inserir tabelas ou listas.</li>
            </ul>

            <div style="background-color: #e2e3e5; padding: 15px; border-radius: 5px;">
                <strong>Backup:</strong> Todo o conteúdo é salvo automaticamente no banco de dados a cada alteração. Não é necessário clicar em "Salvar".
            </div>
        `
    },
    {
        title: "6. Dicas e Atalhos",
        content: `
            <h1>Dicas Gerais e Atalhos</h1>
            
            <h2>Teclado</h2>
            <table>
                <thead>
                    <tr>
                        <th>Contexto</th>
                        <th>Atalho</th>
                        <th>Ação</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Geral</td>
                        <td><code>CTRL + K</code></td>
                        <td>Busca Global (Páginas)</td>
                    </tr>
                    <tr>
                        <td>SQL Runner</td>
                        <td><code>CTRL + ENTER</code></td>
                        <td>Executar Query Selecionada</td>
                    </tr>
                    <tr>
                        <td>Chat</td>
                        <td><code>ENTER</code></td>
                        <td>Enviar Mensagem</td>
                    </tr>
                     <tr>
                        <td>Chat</td>
                        <td><code>SHIFT + ENTER</code></td>
                        <td>Quebra de linha</td>
                    </tr>
                </tbody>
            </table>

            <h2>Solução de Problemas Comuns</h2>
            <h3>Erro "Table or view does not exist"</h3>
            <p>Isso geralmente ocorre porque você está logado com um usuário que não tem permissão para ver a tabela. Use o <strong>Chat</strong> para pedir permissão ao dono da tabela ou peça ao DBA.</p>
            
            <h3>Importação CSV Travada</h3>
            <p>Se o arquivo for muito grande (> 100MB), a importação pode demorar. Acompanhe a barra de progresso. Se travar, verifique se há caracteres especiais estranhos no arquivo CSV.</p>
        `
    }
];

function request(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: API_HOST,
            port: API_PORT,
            path: path,
            method: method,
            headers: { 'Content-Type': 'application/json' }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try { resolve(data ? JSON.parse(data) : null); }
                    catch (e) { resolve(null); }
                } else {
                    reject(new Error(`Status ${res.statusCode}: ${data}`));
                }
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function run() {
    console.log("Starting Manual Population (Target: Manual Tecnico)...");

    // 1. Fetch Tree for Manual Tecnico
    console.log("Fetching tree...");
    let tree = [];
    try {
        tree = await request('GET', `${API_BASE}/books/${BOOK_ID}/tree`);
    } catch (e) { console.log("Tree fetch failed (maybe book empty), continuing..."); }

    // 2. Delete Existing Pages
    if (tree && tree.length > 0) {
        console.log(`Deleting ${tree.length} existing root pages in Manual Tecnico...`);
        const deleteNode = async (node) => {
            if (node.children) { for (const c of node.children) await deleteNode(c); }
            process.stdout.write(`Del: ${node.NM_TITLE}... `);
            await request('DELETE', `${API_BASE}/nodes/${node.ID_NODE}`);
        };
        for (const node of tree) await deleteNode(node);
        console.log("\nDeletion Complete.");
    } else {
        console.log("Manual Tecnico is already empty.");
    }

    // 3. Create New Pages
    console.log("Creating new detailed pages...");
    for (const page of PAGES) {
        process.stdout.write(`Creating ${page.title}... `);
        const res = await request('POST', `${API_BASE}/nodes`, {
            bookId: BOOK_ID,
            parentId: null,
            title: page.title,
            type: 'PAGE'
        });

        if (res && res.id) {
            await request('PUT', `${API_BASE}/nodes/${res.id}`, { content: page.content });
            console.log("✓ Done.");
        } else {
            console.log("✕ Failed.");
        }
    }
    console.log("SUCCESS: Manual Created in correct book.");
}

run().catch(console.error);
