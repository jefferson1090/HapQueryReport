const Groq = require("groq-sdk");
const db = require('../db');
const learningService = require('./learningService');
const knowledgeService = require('./knowledgeService');
const neuralService = require('./neuralService');
const agentService = require('./agentService');

class AiService {

    constructor() {
        this.apiKey = process.env.GROQ_API_KEY;
        this.groq = null;
        this.modelName = process.env.AI_MODEL || "llama-3.3-70b-versatile";

        if (this.apiKey) {
            this.groq = new Groq({ apiKey: this.apiKey });
        } else {
            console.warn("GROQ_API_KEY not found. AI features disabled.");
        }

        // Regex Patterns for Local Mode
        this.localIntents = [
            {
                // FIND TABLES (Specific - avoid capturing "show records")
                // Matches: "Listar tabelas de X", "Busque tabela X"
                // Excludes: "Mostre registros...", "Mostre dados..."
                regex: /^(?:listar|ver|quais|buscar|encontrar|procurar)(?:\s+as)?\s+tabelas?(?:\s+(?:de|do|da|dos|das|que\s+contenham))?\s+(?!.*(?:registro|dado|valor|conteudo|linha))(.+)$/i,
                action: 'list_tables'
            },
            {
                // DESCRIBE TABLE (Schema.Table)
                regex: /^(?:estrutura|descreva|schema|colunas|detalhes)?\s*(?:d[aeo]\s+)?(?:tabela\s+)?([a-zA-Z0-9_$#]+\.[a-zA-Z0-9_$#]+)$/i,
                action: 'describe_table'
            },
            {
                // DESCRIBE TABLE (Standard)
                regex: /(?:estrutura|descreva|schema|colunas|detalhes)\s+(?:d[aeo]\s+)?(?:tabela\s+)?([a-zA-Z0-9_$#\.]+)/i,
                action: 'describe_table'
            },
            {
                // FIND RECORD
                regex: /(?:encontre|busque|ache)\s+(?:o\s+)?(?:registro|id|código)?\s+([a-zA-Z0-9_\-]+)\s+(?:na|em)\s+(?:tabela\s+(?:de|do|da)?\s*)?([a-zA-Z0-9_$#\.]+)/i,
                action: 'find_record'
            },
            {
                // LIST TRIGGERS
                regex: /(?:listar|ver|show|check|quais)\s+(?:as\s+)?(?:triggers?|gatilhos?)(?:\s+(?:da|na|do)\s+tabela\s+([a-zA-Z0-9_$#\.]+))?/i,
                action: 'list_triggers'
            },
            {
                // DRAFT TABLE
                regex: /^([a-zA-Z0-9_\.$#\s]+)\s*;\s*(.+?)(?:\s*;\s*(.*))?$/i,
                action: 'draft_table'
            },
            {
                // CREATE TABLE SQL
                regex: /(?:criar|nova|create)\s+tabela\s+([a-zA-Z0-9_$#]+)\s+(?:com|with)\s+(.+)/i,
                action: 'create_table_sql'
            }
        ];

        // State for Multi-turn Conversations (Session Isolated)
        this.sessions = new Map();
    }

    updateConfig(config) {
        if (!config) return;

        let changed = false;
        if (config.groqApiKey && config.groqApiKey !== this.apiKey) {
            console.log('[AiService] Updating API Key from config...');
            this.apiKey = config.groqApiKey;
            this.groq = new Groq({ apiKey: this.apiKey });
            changed = true;
        }

        if (config.model && config.model !== this.modelName) {
            console.log(`[AiService] Updating Model to ${config.model}...`);
            this.modelName = config.model;
            changed = true;
        }

        if (changed) {
            console.log('[AiService] Configuration reloaded successfully.');
        }
    }

    getSession(userId) {
        if (!userId) return { status: 'IDLE', payload: null, lastTable: null, lastRecord: null };
        if (!this.sessions.has(userId)) {
            this.sessions.set(userId, {
                status: 'IDLE',
                payload: null,
                lastTable: null, // Sticky Context
                lastRecord: null,
                columnOverride: null
            });
        }
        return this.sessions.get(userId);
    }

    async processMessage(message, mode = 'ai', history = [], userId = 'default') {
        if (mode === 'ai' && !this.groq) {
            return {
                text: "⚠️ API Key não configurada. Alternando para modo Local.",
                action: 'switch_mode',
                mode: 'local'
            };
        }

        const session = this.getSession(userId);


        // --- 1.1 HANDLE SYSTEM COMMANDS ---
        if (message === '[SYSTEM: CLEAR_CONTEXT]') {
            session.lastTable = null;
            session.lastRecord = null;
            session.payload = null;
            session.status = 'IDLE';
            session.columnOverride = null; // Reset override
            console.log(`[SESSION] Context cleared for user ${userId}`);
            return { text: null, action: 'silent_ack' };
        }

        if (message.startsWith('[SYSTEM: SET_CONTEXT]')) {
            try {
                const payload = JSON.parse(message.replace('[SYSTEM: SET_CONTEXT]', '').trim());
                if (payload.table) {
                    session.lastTable = payload.table;
                    console.log(`[SESSION] Context set to table: ${payload.table} for user ${userId}`);
                    return { text: null, action: 'silent_ack' };
                }
            } catch (e) {
                console.error("Failed to parse SET_CONTEXT:", e);
            }
        }

        // --- 1.2 HANDLE PENDING CONFIRMATIONS ---
        if (session.status === 'AWAITING_CONFIRMATION') {
            const lowerMsg = message.trim().toLowerCase();
            if (['sim', 'yes', 's', 'y', 'confirmar', 'ok'].includes(lowerMsg)) {
                const pendingData = session.payload;
                session.status = 'IDLE';
                session.payload = null;

                if (pendingData.action === 'drop_table') {
                    return await this.executeAction({
                        action: 'drop_table',
                        data: pendingData.data
                    }, userId);
                }
            } else {
                session.status = 'IDLE';
                session.payload = null;
                return {
                    text: "🆗 Ação cancelada. O que gostaria de fazer agora?",
                    action: "text_response"
                };
            }
        }


        // --- 1.1 HANDLE LEARNING RESPONSES (Phase 1) ---
        if (session.status === 'AWAITING_TABLE_SELECTION') {
            // User selected a table. Learn connection: originalTerm -> selectedTable
            const selectedTable = message.match(/(?:Consultar tabela|Use a tabela)\s+([a-zA-Z0-9_$.]+)/i)?.[1]?.trim().toUpperCase();
            const { originalTerm, originalData } = session.payload;

            // 1. TEACH NEURAL NETWORK
            if (originalTerm && selectedTable) {
                // If original was "PESSOA" and selected was "TBL_PESSOA"
                neuralService.addEdge(originalTerm, selectedTable, 1.0, 'is_alias_of');
                neuralService.saveGraph(); // Persist immediately
                console.log(`[LEARNING] Connected "${originalTerm}" -> "${selectedTable}"`);
            }

            // 2. RETRY ACTION WITH CORRECT TABLE
            session.status = 'IDLE';
            session.payload = null; // Reset state
            const newData = { ...originalData, table_name: selectedTable };

            return await this.executeAction({
                action: 'find_record',
                data: newData,
                text: `Entendi! Aprendi que **"${originalTerm}"** se refere a **${selectedTable}**. Buscando...`
            }, userId);
        }

        if (session.status === 'AWAITING_COLUMN_SELECTION') {
            // User selected columns. Learn connection: originalTerm -> selectedColumn
            // The message format from UI might be complex, let's assume it sends the cleaned column name or a standard phrase
            // For now, let's assume the UI sends "Buscar ... na coluna COL_X" or similar. 
            // Ideally UI should send a structured choice, but we are parsing text.

            // Regex to extract column from standard UI messages (singular or plural start)
            let selectedCol = null;
            const colMatch = message.match(/(?:coluna|colunas)\s+([a-zA-Z0-9_$#]+)/i);
            if (colMatch) selectedCol = colMatch[1].toUpperCase();

            const { originalTerm, originalData, tableName, mode } = session.payload;

            if (selectedCol) {
                // 1. TEACH NEURAL NETWORK
                // Connect Table_Term -> Column (e.g. "TBL_PESSOA_CPF" -> "NR_CPF") creates a unique node for context?
                // Simpler: Connect "CPF" -> "NR_CPF" (Global edge, or contextualized?)
                // NeuralService supports global nodes. Let's do term -> column.
                neuralService.addEdge(originalTerm, selectedCol, 0.9, 'is_column_alias');
                neuralService.saveGraph();
                console.log(`[LEARNING] Connected "${originalTerm}" -> "${selectedCol}"`);
            }

            session.status = 'IDLE';
            session.payload = null;

            // 2. RETRY
            if (mode === 'projection') {
                // Retry with resolved columns is tricky if multiple were missing.
                // For Phase 1, let's just retry the query with the selected column found.
                // We might need to re-resolve the full list. 
                // Simple path: Update specific request and re-run.
                // But wait, 'originalData' has 'show_columns'. We need to update that array.
                const newShowCols = originalData.show_columns.map(c => c === originalTerm && selectedCol ? selectedCol : c);
                return await this.executeAction({
                    action: 'find_record',
                    data: { ...originalData, show_columns: newShowCols, table_name: tableName },
                    text: `Certo! Aprendi que **"${originalTerm}"** é **${selectedCol}**. Exibindo dados...`
                }, userId);
            } else {
                // Filter mode
                return await this.executeAction({
                    action: 'find_record',
                    data: { ...originalData, column_name: selectedCol, table_name: tableName },
                    text: `Certo! Aprendi que **"${originalTerm}"** é **${selectedCol}**. Buscando...`
                }, userId);
            }
        }

        // --- 1.2 HANDLE CONTEXTUAL FILTERING (Phase 7) ---
        // If message implies a filter ("show active", "from last month") and we have a Sticky Table Context
        // We need to inject this context into the prompt processing.
        if (session.lastTable && !message.match(/^nova busca|^reset|^esqueça/i)) {
            // Heuristic: If we have a table context, append it to the message for the LLM
            // But valid only if the user isn't asking for a NEW table.
            // We'll let the LLM decide, but we provide the context.
            // Note: effectively done in 'processWithGroq' via system prompt injection.
        }

        let result;
        if (mode === 'local') {
            result = await this.processWithRegex(message, userId);
        } else {
            result = await this.processWithGroq(message, history, userId);
        }

        // --- 2. INTERCEPT DANGEROUS ACTIONS ---
        if (result.action === 'drop_table') {
            const tableName = result.data.tableName.toUpperCase();
            if (!tableName.startsWith('TT_')) {
                return {
                    text: `🔒 BLOQUEADO: Por segurança, apenas tabelas temporárias (iniciadas com TT_) podem ser excluídas.`,
                    action: 'text_response'
                };
            }

            const session = this.getSession(userId);
            session.status = 'AWAITING_CONFIRMATION';
            session.payload = result;

            return {
                text: `⚠️ **CONFIRMAÇÃO NECESSÁRIA** ⚠️\n\nVocê pediu para excluir a tabela **${tableName}**.\nEssa ação não pode ser desfeita.\n\nDigite **sim** para confirmar ou qualquer outra coisa para cancelar.`,
                action: 'text_response'
            };
        }

        // processWithGroq ALREADY calls executeAction. Sending the result back to executeAction again
        // causes the "Double Execution" bug where the output array is treated as input params.

        // --- 3. RETURN RESULT DIRECTLY ---
        // If the result already has 'text' and 'action', it's a finished response.
        return result;
    }

    async processWithGroq(message, history, userId) {
        if (!this.groq) return { text: "⚠️ IA não configurada.", action: 'switch_mode', mode: 'local' };

        // --- SESSION CONTEXT ---
        const session = this.getSession(userId);
        let sessionContext = "";
        if (session.lastTable) {
            sessionContext = `
    # CONTEXTO DE FOCO (MUITO IMPORTANTE)
    O usuário está visualizando a tabela: **${session.lastTable}**.
    
    REGRAS DE FOCO:
    1. Se o usuário pedir "filtrar", "buscar", "ordenar" ou "mostrar", ASSUMA que é nesta tabela (${session.lastTable}).
    2. Se o usuário falar de campos (ex: "status", "nome"), tente associar às colunas desta tabela.
    3. Use a ferramenta 'resolve_column' passando '${session.lastTable}' se houver dúvida sobre qual coluna usar.
    4. **LIMITES**:
       - Padrão: use \`... FETCH NEXT 500 ROWS ONLY\`.
       - Se o usuário pedir "TUDO", "SEM LIMITES" ou "MOSTRAR TODOS", defina \`limit: 'all'\` no JSON e NÃO coloque \`FETCH NEXT/OFFSET\` no SQL.
    `;
        }

        // --- 1. RETRIEVAL (RAG) ---
        const knownTerms = knowledgeService.search(message, 'all');
        let knowledgeContext = "";
        if (knownTerms.length > 0) {
            knowledgeContext = "\n# CONTEXTO APRENDIDO (Terminologia do Usuário):\n" +
                knownTerms.map(k => `- "${k.term}" refere-se a ${k.type.toUpperCase()} "${k.target}" (Confiança: ${k.confidence})`).join("\n") +
                "\nUse este contexto para resolver ambiguidades (ex: se o usuário pedir 'Nota', e o contexto diz que Nota = NOTA_FISCAL, use NOTA_FISCAL).\n";
        }

        // --- 1.1 NEURAL ACTIVATION (Deep Memory) ---
        // Activate graph based on key nouns in the message
        let neuralContext = "";
        const words = message.split(/[\s,;?!]+/);
        const activatedNodes = [];
        const seen = new Set();

        for (const w of words) {
            if (w.length > 3) {
                const activation = neuralService.activate(w);
                for (const node of activation) {
                    if (!seen.has(node.id) && node.relevance > 0.4) {
                        activatedNodes.push(node);
                        seen.add(node.id);
                    }
                }
            }
        }

        if (activatedNodes.length > 0) {
            neuralContext = "\n# MEMÓRIA ASSOCIATIVA (Rede Neural):\n" +
                activatedNodes.slice(0, 5).map(n => `- "${n.id}" está conectado a este contexto (Relevância: ${n.relevance.toFixed(2)})`).join("\n") +
                "\n(Isso indica relações prováveis. Ex: Se 'Venda' ativa 'Produto', é provável que a query precise de JOIN entre eles).\n";
        }

        // System Prompt defining the Persona and Tools
        const systemPrompt = `
        # HAP AI — AGENTE AUTÔNOMO (BASE / SYSTEM PROMPT)

        Você é o HAP AI, um agente autônomo especializado em:
        1) Conversar com usuários leigos e técnicos, esclarecendo dúvidas sobre: gestão de dados, análise de dados, governança, e processos ligados ao universo Hapvida (gestão hospitalar/operadora) em nível conceitual e prático.
        2) Ajudar a consultar dados em banco Oracle, localizar registros, gerar extrações/relatórios, e orientar criação de rotinas (SQL/PLSQL), sempre com segurança e rastreabilidade.
        3) Montar painéis/relatórios a partir de resultados (resumos, tabelas, indicadores), e orientar importação de planilhas para o Oracle (com validação e mapeamento).

        ## PRINCÍPIOS (NÃO NEGOCIÁVEIS)
        - ZERO ALUCINAÇÃO: se você não sabe algo (ex.: tabela/coluna/regra), você declara explicitamente “não tenho esse dado ainda”.
        - DESCOBERTA GUIADA: como você não conhece o banco da empresa, você deve obter contexto aos poucos através do usuário e/ou consultas de metadados (quando permitido).
        - CONFIRMAÇÃO OBRIGATÓRIA: você NUNCA executa ações que mudem dados (INSERT/UPDATE/DELETE/MERGE/DDL/importação) sem o usuário confirmar explicitamente.
        - SEGURANÇA E PRIVACIDADE:
          - Nunca peça senha em texto livre. Se precisar, solicite que o usuário use o campo seguro/secret do app.
          - Nunca exponha dados sensíveis (PII/PHI). Ao exibir exemplos, mascarar (ex.: CPF -> ***.***.***-**).
          - Se o pedido envolver pacientes/dados clínicos identificáveis, você limita a resposta a orientação e agregações, e pede para anonimizar antes de prosseguir.
        - RASTREABILIDADE: toda consulta/extração deve registrar:
          - objetivo do usuário, tabelas usadas, filtros, hipótese/assunções, e SQL final.
        - HUMILDADE OPERACIONAL: você sugere opções, explica trade-offs, mas NÃO decide pelo usuário.

        ## MODO DE TRABALHO (FLUXO PADRÃO)
        Sempre siga esta sequência:
        1) Entender o objetivo em 1 frase (resumo).
        2) Identificar o tipo de tarefa:
           A) Dúvida conceitual (sem banco) -> Responda Texto.
           B) Descoberta de dados/metadados (listar tabelas/colunas) -> Use JSON.
           C) Consulta/extração (somente SELECT) -> Use JSON.
           D) Mudança de dados (DML/DDL/importação) -> Exige confirmação explícita.
           E) Relatório/painel (a partir do que foi extraído).
        3) Fazer PERGUNTAS MÍNIMAS (apenas o necessário). Se o usuário for leigo, ofereça opções de resposta e exemplos.
        4) Propor 2–3 caminhos com prós/contras.
        5) Pedir confirmação do caminho escolhido (principalmente em C/D/E).
        6) Executar (se autorizado) e apresentar resultado.

        ## COMO “APRENDER” O BANCO (MEMÓRIA DE CONTEXTO DA SESSÃO)
        Você cria e mantém um “Dicionário de Dados da Sessão” (DDS), atualizado conforme:
        - o usuário descreve tabelas/campos/regras,
        - você consulta metadados (ALL_TABLES/ALL_TAB_COLUMNS/COMMENTS) quando permitido,
        - você valida com amostras (ex.: 10 linhas com filtros seguros).

        ## POLÍTICA DE CONSULTAS ORACLE (SAFE BY DEFAULT)
        - Por padrão, você só gera e roda SELECT.
        - Limite inicial: Sem Limite (Exiba de 50/50 com opção de avançar até o final, e filtros por data/código quando aplicável.
        - Evite SELECT *; prefira colunas necessárias.
        - Antes de consultas pesadas, apresente estimativa de impacto e alternativa segura.

        ## CONFIRMAÇÃO (FORMATO)
        Toda vez que houver execução (consulta em banco ou qualquer mudança), você finaliza a mensagem com:
        “Confirmo que devo:
        ( ) Opção A …
        ( ) Opção B …
        Responda com: A ou B (e ajustes, se necessário).”
        
        ## TOM E POSTURA
        - Direto, sem floreio.
        - Mentor: explica o porquê e ensina o usuário a pensar.
        - Humor rápido quando couber, sem atrapalhar.
        - Não seja pretensioso: o objetivo é acertar e ser útil.

        ${knowledgeContext}
        ${neuralContext}
        
        # FERRAMENTAS & COMANDOS (MODO JSON)
        Se (E SOMENTE SE) o usuário pedir algo que exija acesso ao banco, retorne APENAS um JSON:
        { "action": "NOME_DA_ACAO", "params": { ... } }

        Ações Disponíveis:
        1. list_tables { search_term: string } -> Listar tabelas (Use quando user pedir "ver tabelas", "buscar", "listar").
        2. describe_table { tableName: string } -> Ver estrutura.
        3. run_sql { sql: string, limit: 'all' | number } -> Executar SELECT. REGRAS ORACLE:
           - JAMAIS USE 'LIMIT'. Use 'FETCH NEXT N ROWS ONLY'.
           - Se 'limit' for 'all', NÃO USE 'FETCH NEXT'.
           - Datas: Use TO_DATE('...', 'YYYY-MM-DD').
           - Strings: Case Sensitive. Use UPPER(col) LIKE UPPER('%val%').
        4. draft_table { tableName: string, columns: array, ... } -> Criar rascunho de tabela.
        5. list_triggers { table_name: string } -> Listar triggers.
        6. find_record { table_name: string, value: string } -> Localizar registro único.
        7. create_routine { name: string, goal: string, steps: array } -> Criar rotina.
        8. execute_routine { name: string } -> Executar rotina.
        9. resolve_column { table_name: string, term: string, value_context: string } -> USAR SEMPRE QUE PRECISAR SCNEAR COLUNAS.
            - term: O termo que você quer buscar nas colunas (ex: 'status', 'nome', 'data').
            - value_context: O valor que o usuário quer filtrar (opcional, ajuda a decidir o tipo).
            - table_name: O nome exato da tabela em foco.

        # CONTRATO DE RESPOSTA (MODO CONVERSA)
        Sempre que você responder ao usuário (sem executar ação ou após executar), use este JSON para formatar sua resposta:
        {
          "answer": "Texto da sua resposta aqui...",
          "panel": { "title": "...", "content": "..." }, // Opcional, para exibir tabelas/dados/SQL formatado
          "suggestions": [ // Opcional (Max 3). Use APENAS se houver ambiguidade ou próximo passo claro.
             { "label": "Texto do botão", "value": "Ação enviada ao clicar" }
          ]
        }
        
        # MODO CRIAÇÃO DE TABELA (Shorthand Rápido)
        Se o usuário informar nome da tabela e campos em linguagem natural (ex: "tabela x, campo y texto, campo z numero"), você deve:
        1. Traduzir tipos simplificados:
           - "texto", "string", "letra" -> VARCHAR2(100)
           - "numero", "valor", "inteiro" -> NUMBER
           - "data", "dia" -> DATE
           - "tamanho N" -> (N) (ex: "texto tamanho 50" -> VARCHAR2(50))
        2. Se o tipo não for informado, use o DEFAULT: VARCHAR2(100).
           3. Use a action \`draft_table\` com a estrutura montada.
        4. Sempre responda em JSON.

        REGRAS DE SUGESTÕES:
        1. NÃO use sugestões para "Preciso de ajuda" genérico.
        2. NÃO repita sugestões já dadas.
        3. Se a conversa for fluida, NÃO mande sugestões.
        `;

        // --- 1.2 HANDLE CONTEXTUAL FILTERING (Phase 7 - Backend Injection) ---
        const messages = [
            { role: "system", content: systemPrompt + sessionContext },
            ...history.map(h => ({ role: h.sender === 'user' ? 'user' : 'assistant', content: h.text })),
            { role: "user", content: message }
        ];

        try {
            const completion = await this.groq.chat.completions.create({
                messages: messages,
                model: this.modelName,
                temperature: 0.1,
                response_format: { type: "json_object" },
                stop: null
            });

            const content = completion.choices[0]?.message?.content || "";
            console.log("[DEBUG] Groq Raw Content:", content); // Debug Log

            // Try to parse JSON action or contract response
            try {
                // Find JSON in content
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const jsonStr = jsonMatch[0];
                    const parsedData = JSON.parse(jsonStr);

                    // CASE 1: ACTION (Tool Call)
                    if (parsedData.action) {
                        const payload = parsedData.params || parsedData.data || parsedData.parameters || parsedData.arguments || {};

                        // If model also sent an answer/explanation, keep it
                        let prefixText = parsedData.answer || null;

                        return await this.executeAction({
                            action: parsedData.action,
                            data: payload,
                            text: prefixText
                        }, userId);
                    }

                    // CASE 2: CONVERSATION CONTRACT (answer + suggestions)
                    if (parsedData.answer) {
                        return {
                            text: parsedData.answer,
                            action: 'chat',
                            options: parsedData.suggestions ? parsedData.suggestions.map(s => s.value || s.label) : null, // Flatten to strings for now or update frontend for objects
                            // panel: parsedData.panel // Future: Implement panel rendering
                        };
                    }
                }
            } catch (e) {
                console.error("JSON Parse Error (Attempted recovery):", e);
                // Fallback to treating content as text
            }

            return { text: content, action: 'chat' };

        } catch (e) {
            console.error("Groq Chat Error:", e);
            if (e.message && (e.message.includes('Connection error') || e.message.includes('fetch failed'))) {
                return {
                    text: `⚠️ **Erro de Conexão com a IA**\n\nNão consegui conectar ao servidor da IA (Groq). Isso geralmente acontece por:\n1. Bloqueio de Firewall/Proxy na rede da empresa.\n2. Falha na conexão de internet.\n\nPor favor, verifique se o domínio \`api.groq.com\` está liberado.`,
                    action: 'error'
                };
            }
            return { text: `Erro na IA: ${e.message}`, action: 'error' };
        }
    }

    async processWithRegex(message, userId) {
        const cleanMsg = message.trim().replace(/[\[\]]/g, '');

        for (const intent of this.localIntents) {
            const match = cleanMsg.match(intent.regex);
            if (match) {
                if (intent.action === 'list_tables') {
                    let term = match[1].trim();
                    term = term.replace(/^(?:tabelas?|de|do|da|dos|das)\s+/i, '');
                    return await this.executeAction({
                        action: 'list_tables',
                        data: { search_term: term },
                        text: `[Modo Local] Buscando tabelas com "${term}"...`
                    }, userId);
                }
                if (intent.action === 'describe_table') {
                    return await this.executeAction({
                        action: 'describe_table',
                        data: { table_name: match[1].trim() },
                        text: `[Modo Local] Exibindo estrutura de ${match[1].trim()}...`
                    }, userId);
                }
                if (intent.action === 'find_record') {
                    return await this.executeAction({
                        action: 'find_record',
                        data: { value: match[1].trim(), table_name: match[2].trim() },
                        text: `[Modo Local] Buscando "${match[1].trim()}" em ${match[2].trim()}...`
                    }, userId);
                }
                if (intent.action === 'list_triggers') {
                    return await this.executeAction({
                        action: 'list_triggers',
                        data: { table_name: match[1] ? match[1].trim() : null },
                        text: `[Modo Local] Listando triggers...`
                    }, userId);
                }
                if (intent.action === 'draft_table') {
                    let tableName = match[1].trim();
                    tableName = tableName.replace(/\s+/g, '_');
                    const columnsRaw = match[2] ? match[2].split(',') : [];
                    const restRaw = match[3] ? match[3].split(';') : [];
                    const indicesRaw = restRaw[0] ? restRaw[0].split(',') : [];
                    const grantsRaw = restRaw[1] ? restRaw[1].split(',') : [];

                    const columns = columnsRaw.map(c => {
                        const parts = c.trim().split(/\s+/);
                        const name = parts[0];
                        const type = parts.slice(1).join(' ') || 'VARCHAR2(100)';
                        return { name, type };
                    }).filter(c => c.name);

                    return await this.executeAction({
                        action: 'draft_table',
                        data: { tableName, columns, indices: indicesRaw, grants: grantsRaw },
                        text: `[Modo Rascunho] Preparando tabela **${tableName}**...`
                    }, userId);
                }
                if (intent.action === 'create_table_sql') {
                    return await this.executeAction({
                        action: 'create_table_sql',
                        text: `[Modo Local] Gerando SQL...`,
                        data: {
                            tableName: match[1].trim(),
                            columns: match[2].trim()
                        }
                    }, userId);
                }
            }
        }

        // Reset/Correction Intent
        const resetMatch = cleanMsg.match(/(?:esqueça|esquecer|reaprender|corrigir)\s+(?:o\s+termo\s+)?(.+)/i);
        if (resetMatch) {
            return await this.executeAction({
                action: 'reset_term',
                data: { term: resetMatch[1].trim() },
                text: `[Modo Aprendizado] Esquecendo associações para "${resetMatch[1].trim()}"...`
            }, userId);
        }

        // Column Override Intent (New)
        // Matches: "Use a coluna X", "Pelo campo Y", "Na coluna Z"
        // Column Override Intent (Improved)
        // Matches: "Use a coluna X", "Pelo campo Y", "Na coluna Z", "campo codigo"
        const colOverrideMatch = cleanMsg.match(/(?:use|pelo|na|no|usar|testar)?\s*(?:a\s+)?(?:coluna|campo)\s+([a-zA-Z0-9_$]+)/i);
        if (colOverrideMatch) {
            const newCol = colOverrideMatch[1].trim().toUpperCase();

            // Check if we have a previous search context to re-run immediately
            const session = this.getSession(userId);
            if (session.lastAction === 'find_record') {
                const lastData = session.lastPayload;
                // Update column and re-run
                const newData = { ...lastData, column_name: newCol };

                // Set override for safety
                session.columnOverride = newCol;

                return await this.executeAction({
                    action: 'find_record',
                    data: newData,
                    text: `[Correção] Entendido. Buscando em **${lastData.table_name}** usando a coluna **${newCol}**...`
                }, userId);
            }

            return await this.executeAction({
                action: 'column_override',
                data: { columnName: newCol },
                text: `[Modo Correção] Entendido. Vou usar a coluna **${newCol}** na próxima busca.`
            }, userId);
        }

        return {
            text: "🤖 [Modo Local] Não entendi. Tente usar formatos padrão como 'Buscar tabelas de X'.",
            action: null
        };
    }

    async executeAction(aiResponse, userId) {
        let { action, data, text } = aiResponse;
        data = data || aiResponse.params || {};

        console.log(`[DEBUG] executeAction: action=${action}, data=${JSON.stringify(data)}`);

        if (!text && data) {
            text = data.text || data.message || data.response || data.answer || data.content;
        }

        // Silent Bubble Fix: If we still don't have text, generate a generic waiting message
        if (!text) {
            if (action === 'list_tables') text = "Buscando tabelas...";
            else if (action === 'describe_table') text = "Analisando estrutura...";
            else if (action === 'run_sql') text = "Gerando SQL...";
            else if (action === 'draft_table') text = "Criando rascunho...";
            else text = "Processando...";
        }

        try {
            if (action === 'clarification') {
                const questionText = data.question || "Qual tabela você se refere?";
                return {
                    text: questionText,
                    action: 'clarification',
                    data: {
                        question: questionText,
                        options: data.options || []
                    }
                };
            }

            if (action === 'list_tables') {
                // Robust extraction: Check search_term, term, value, name
                const rawTerm = data.search_term || data.term || data.value || data.name || '';
                const term = typeof rawTerm === 'string' ? rawTerm.trim() : '';

                // GUARDRAIL: Empty term -> Ask Question
                if (!term) {
                    return {
                        text: "Qual tabela você está procurando? (Você pode dizer o nome, parte do nome ou o assunto)",
                        action: 'clarification',
                        data: {
                            question: "Qual tabela você está procurando?",
                            options: ["Tabelas de Clientes", "Tabelas de Vendas", "Tabelas Financeiras"]
                        }
                    };
                }

                console.log(`[DEBUG] list_tables: term="${term}" (extracted from ${JSON.stringify(data)})`);

                const objects = await db.findObjects(term);
                if (objects.length === 0) {
                    return { text: `Hmm, não encontrei nenhuma tabela com **"${term}"**.`, action: 'chat' };
                }
                return {
                    text: text || `Encontrei estas tabelas:`,
                    action: 'list_tables',
                    data: objects.map(o => ({ owner: o.owner, name: o.object_name, comments: o.full_name }))
                };
            }

            if (action === 'describe_table') {
                let tableName = (data.table_name || data.tableName || "").toUpperCase();
                if (!tableName) return { text: "⚠️ Nome da tabela não informado." };

                // SAVE CONTEXT
                this.getSession(userId).lastTable = tableName;

                let columns = await db.getColumns(tableName);
                if (!columns.length && !tableName.includes('.')) {
                    const owners = await db.executeQuery(`SELECT OWNER FROM ALL_OBJECTS WHERE OBJECT_TYPE='TABLE' AND OBJECT_NAME=:name AND OWNER NOT IN('SYS','SYSTEM') FETCH NEXT 1 ROWS ONLY`, { name: tableName });
                    if (owners.rows.length > 0) {
                        tableName = `${owners.rows[0][0]}.${tableName}`;
                        columns = await db.getColumns(tableName);
                    }
                }
                if (!columns.length) return { text: `Não consegui acessar **${tableName}**.` };

                const responseData = { tableName, columns };
                if (columns.viewDefinition) {
                    responseData.viewDefinition = columns.viewDefinition;
                    responseData.isView = true;
                }
                return { text: text || `Estrutura da **${tableName}**:`, action: 'describe_table', data: responseData };
            }

            if (action === 'find_record') {
                const result = await this.performFindRecord(data, userId);
                return { ...result, text: result.text || text };
            }

            if (action === 'list_triggers') {
                const tableName = data.table_name ? data.table_name.toUpperCase() : null;
                let sql = `SELECT TRIGGER_NAME, TABLE_NAME, STATUS, TRIGGERING_EVENT FROM ALL_TRIGGERS WHERE OWNER NOT IN('SYS', 'SYSTEM')`;
                const params = {};
                if (tableName) { sql += ` AND TABLE_NAME = :tbl`; params.tbl = tableName; }
                else { sql += ` FETCH NEXT 20 ROWS ONLY`; }

                const result = await db.executeQuery(sql, params);
                if (result.rows.length === 0) return { text: "Nenhuma trigger encontrada." };
                return { text: text, action: 'show_data', data: { metaData: result.metaData, rows: result.rows } };
            }

            if (action === 'draft_table') {
                // GUARDRAIL: Missing Structure -> Ask Question
                if (!data.tableName || !data.columns) {
                    return {
                        text: "Qual será o nome da nova tabela e quais colunas ela deve ter?",
                        action: 'clarification',
                        data: {
                            question: "Qual será o nome da nova tabela e quais colunas ela deve ter?"
                        }
                    };
                }
                return { text: text || `Rascunho criado para **${data.tableName}**.`, action: 'draft_table', data: data };
            }

            if (action === 'create_table_sql') {
                const tableName = data.tableName || "NOVA_TABELA";
                const columnsRaw = data.columns || "ID NUMBER";
                const sql = `CREATE TABLE ${tableName.toUpperCase()} (\n  ${columnsRaw.replace(/,/g, ',\n  ')}\n);`;
                return { text: `Script para **${tableName}**:\n\`\`\`sql\n${sql}\n\`\`\``, action: 'chat' };
            }

            if (action === 'resolve_column') {
                const session = this.getSession(userId);
                const tableName = data.table_name || session.lastTable;
                const term = data.term || '';

                if (!tableName) {
                    return { text: "Não identifiquei qual tabela estamos analisando. Pode me lembrar?", action: 'chat' };
                }

                try {
                    // 1. Describe table to get real columns
                    const cols = await db.describeTable(tableName);

                    // 2. Fuzzy Match
                    const candidates = cols.filter(c =>
                        c.name.includes(term.toUpperCase()) ||
                        term.toUpperCase().includes(c.name)
                    );

                    // 3. Decision Logic
                    if (candidates.length === 1) {
                        // Perfect Match -> Confirm with user? Or assume?
                        // "Thinking Protocol" says: Confirm if fuzzy.
                        if (candidates[0].name === term.toUpperCase()) {
                            // Exact match, maybe safe to proceed, but let's be polite per user request.
                            // Actually, user wants "run_sql" eventually.
                            // Let's return a "Suggested Action" that the UI can click.
                            return {
                                text: `Encontrei a coluna **${candidates[0].name}**. É essa que você quer usar para filtrar?`,
                                action: 'clarification',
                                data: {
                                    question: `Filtrar por ${candidates[0].name}?`,
                                    options: [`Sim, filtrar por ${candidates[0].name}`, `Não, mostrar todas`]
                                }
                            };
                        } else {
                            // Fuzzy match
                            return {
                                text: `Encontrei **${candidates[0].name}** para "${term}". É isso?`,
                                action: 'clarification',
                                data: {
                                    question: `Você quis dizer ${candidates[0].name}?`,
                                    options: [`Sim, usar ${candidates[0].name}`, `Não, ver outras colunas`]
                                }
                            };
                        }
                    } else if (candidates.length > 1) {
                        // Multiple candidates
                        return {
                            text: `Para "${term}", encontrei estas colunas. Qual delas?`,
                            action: 'clarification',
                            data: {
                                question: "Qual coluna?",
                                options: candidates.map(c => c.name).slice(0, 5) // Limit to 5 buttons
                            }
                        };
                    } else {
                        // No match -> Show all relevant
                        return {
                            text: `Não encontrei nenhuma coluna com "${term}" na tabela ${tableName}. Aqui estão as colunas disponíveis:`,
                            action: 'clarification',
                            data: {
                                question: "Selecione a coluna correta:",
                                options: cols.slice(0, 8).map(c => c.name) // First 8 columns
                            }
                        };
                    }

                } catch (e) {
                    return { text: `Erro ao analisar colunas: ${e.message}`, action: 'chat' };
                }
            }

            if (action === 'run_sql') {
                const sql = data.sql || "";
                const limit = data.limit || 500; // Default buffer to 500, not 50

                // GUARDRAIL: Empty SQL -> Ask Question
                if (!sql || sql.trim().length === 0) {
                    return {
                        text: "Que dados você gostaria de visualizar? (Ex: 'Vendas de hoje', 'Erros no log', 'Usuários ativos')",
                        action: 'clarification',
                        data: {
                            question: "Que dados você gostaria de visualizar?",
                            options: ["Últimos erros", "Vendas do dia", "Cadastros recentes"]
                        }
                    };
                }

                // --- TEACH NEURAL NETWORK ---
                // If SQL contains JOINs, learn the connection
                if (sql.toUpperCase().includes('JOIN')) {
                    // Simple regex to find table names (very basic)
                    const matches = sql.match(/FROM\s+([a-zA-Z0-9_$#]+)|JOIN\s+([a-zA-Z0-9_$#]+)/gi);
                    if (matches && matches.length >= 2) {
                        const tables = matches.map(m => m.split(/\s+/).pop());
                        for (let i = 0; i < tables.length - 1; i++) {
                            neuralService.addEdge(tables[i], tables[i + 1], 0.2, 'joined_in_query');
                        }
                    }
                }

                if (sql.trim().toUpperCase().startsWith('SELECT')) {
                    try {
                        const result = await db.executeQuery(sql, {}, limit); // Use dynamic limit
                        return {
                            text: text || "Executei a consulta para você:",
                            action: 'show_data',
                            data: { metaData: result.metaData, rows: result.rows, sql: sql }
                        };
                    } catch (e) {
                        return { text: `Tentei executar, mas houve um erro:\n\`${e.message}\`\n\nSQL:\n\`\`\`sql\n${sql}\n\`\`\``, action: 'chat' };
                    }
                }
                return { text: `SQL sugerido (Não executado automaticamente):\n\`\`\`sql\n${sql}\n\`\`\``, action: 'chat' };
            }

            if (action === 'create_routine') {
                const routine = agentService.saveRoutine({
                    name: data.name,
                    goal: data.goal,
                    steps: data.steps || []
                });
                return {
                    text: `✅ **Rotina Criada!**\nNome: **${routine.name}**\nObjetivo: ${routine.goal}\n\nAgora você pode pedir "Executar rotina ${routine.name}".`,
                    action: 'chat'
                };
            }

            if (action === 'execute_routine') {
                return await agentService.executeRoutine(data.name, this);
            }

            if (action === 'text_response') {
                try {
                    // RAG: Retrieval Step
                    const docService = require('./localDocService');
                    const relevantNodes = await docService.searchNodes(message);

                    let contextText = "";

                    // 1. Priority: Current Open Document (if User asks for "this" or "summary")
                    // We include it regardless if it's open, marking it strongly.
                    if (currentContext && currentContext.content) {
                        contextText += `=== DOCUMENTO ABERTO (Foco Principal) ===\n[Título: ${currentContext.title}]\nConteúdo: ${currentContext.content.substring(0, 3000)}\n\n`;
                    }

                    // 2. Global Search Results
                    if (relevantNodes.length > 0) {
                        contextText += `=== OUTROS DOCUMENTOS RELACIONADOS ===\n` + relevantNodes.map(n =>
                            `[Título: ${n.NM_TITLE}]\nConteúdo: ${n.SNIPPET.substring(0, 1000)}...`
                        ).join("\n\n---\n\n");
                    }

                    if (!contextText) {
                        contextText = "Nenhum documento relevante encontrado.";
                    }

                    const systemPrompt = `
            Você é um assistente especialista na documentação do projeto.
            Use o contexto fornecido abaixo para responder à pergunta do usuário.
            
            # REGRAS
            1. Se houver um "DOCUMENTO ABERTO", priorize ele para perguntas como "resuma este documento", "o que diz aqui", etc.
            2. Se a resposta não estiver no contexto, diga que não sabe, mas tente ser útil.
            3. Mantenha as respostas concisas e formatadas em Markdown.

            # CONTEXTO (Documentos Recuperados)
            ${contextText}
            `;

                    const historyMessages = history.map(h => ({
                        role: h.sender === 'user' ? 'user' : 'assistant',
                        content: h.text
                    }));

                    const completion = await this.groq.chat.completions.create({
                        messages: [
                            { role: "system", content: systemPrompt },
                            ...historyMessages,
                            { role: "user", content: message }
                        ],
                        model: this.modelName,
                        temperature: 0.3,
                    });

                    const answer = completion.choices[0]?.message?.content || "Houve um erro ao gerar a resposta.";
                    return { text: answer, action: 'chat' };

                } catch (e) {
                    console.error("Docs Chat Error:", e);
                    return { text: `Erro no chat: ${e.message}`, action: 'error' };
                }
            }

            return { text: text, action: 'chat' };

        } catch (err) {
            console.error("Exec Error:", err);
            return { text: "Erro na execução: " + err.message, action: null };
        }
    }

    // Helper to resolve column names (Fuzzy, Abbrev, Exact)
    resolveColumn(name, columns) {
        if (!name) return null;
        const n = name.toUpperCase();

        // 1. Exact Match
        let match = columns.find(c => c.COLUMN_NAME === n);
        if (match) return match;

        // 2. Common Abbreviations (Add more as needed)
        const commonMap = {
            'NOME': ['NM', 'NO', 'NAME', 'DESC'],
            'DATA': ['DT', 'DATE'],
            'NUMERO': ['NR', 'NU', 'NUM'],
            'CODIGO': ['CD', 'COD', 'CODE'],
            'VALOR': ['VL', 'VAL'],
            'OBS': ['TX', 'DS', 'OBSERVACAO'],
            'STATUS': ['FL', 'ST', 'SIT', 'SITUACAO']
        };

        // Check keys first (e.g. if user said "NM")
        // ... handled by exact match or fuzzy below

        // Check replacements
        for (const [key, prefixes] of Object.entries(commonMap)) {
            if (n.includes(key)) {
                // User said "NOME FANTASIA". Try replacing NOME with NM -> "NM FANTASIA"
                // Check each prefix
                for (const p of prefixes) {
                    const testName = n.replace(key, p).replace(/\s+/g, '_'); // "NM_FANTASIA"
                    // Try exact after search
                    match = columns.find(c => c.COLUMN_NAME === testName);
                    if (match) return match;

                    // Try contains
                    match = columns.find(c => c.COLUMN_NAME.includes(testName));
                    if (match) return match;
                }
            }
        }

        // 3. Simple Fuzzy (Contains) - e.g. "FANTASIA" -> "NM_FANTASIA"
        // Prioritize if it ends with the name (e.g. "_NAME")
        match = columns.find(c => c.COLUMN_NAME.endsWith('_' + n) || c.COLUMN_NAME.startsWith(n + '_'));
        if (match) return match;

        match = columns.find(c => c.COLUMN_NAME.includes(n));
        return match;
    }

    async performFindRecord(data, userId) {
        const session = this.getSession(userId);

        let tableName = (data.table_name || session.lastTable || "").toUpperCase();
        const valueRaw = data.value;
        let columnName = data.column_name ? data.column_name.toUpperCase() : null;

        // Apply Override from SESSION if exists
        if (session.columnOverride) {
            console.log(`[AiService] Applying Column Override: ${session.columnOverride}`);
            columnName = session.columnOverride;
            // Clear it after use - single shot override
            session.columnOverride = null;
        }

        // Store context for potential retry/override in SESSION
        session.lastAction = 'find_record';
        session.lastPayload = { ...data, column_name: columnName };
        session.lastTable = tableName; // STICKY CONTEXT

        if (!tableName) return { text: "Por favor, informe o nome da tabela." };

        try {
            // 1. SMART TABLE CHECK
            let columns = await db.getColumns(tableName);
            if (!columns.length) {
                // Table Ambiguity logic ...
                const searchName = tableName.split('.').pop();
                const similar = await db.executeQuery(
                    `SELECT OWNER || '.' || OBJECT_NAME as FULL_NAME FROM ALL_OBJECTS 
                     WHERE OBJECT_TYPE IN ('TABLE','VIEW') 
                     AND (OBJECT_NAME = :name OR OBJECT_NAME LIKE '%' || :name || '%')
                     AND OWNER NOT IN ('SYS','SYSTEM') 
                     AND OWNER NOT IN ('SYS','SYSTEM')`,
                    { name: searchName }
                );

                if (similar.rows.length > 0) {
                    // STORE STATE FOR LEARNING
                    session.status = 'AWAITING_TABLE_SELECTION';
                    session.payload = {
                        originalTerm: tableName,
                        originalData: data
                    };

                    return {
                        text: `Não encontrei a tabela **${tableName}**. Você quis dizer alguma dessas?`,
                        action: 'table_selection',
                        data: similar.rows.map(r => r[0])
                    };
                }
                return { text: `Não encontrei a tabela **${tableName}** e nenhuma similar.` };
            }

            // 2. VALUE PARSING
            const values = valueRaw.split(/[\s,;\n]+/).filter(v => v.trim() !== '');
            const isMultiValue = values.length > 1;

            // 3. COLUMN RESOLUTION
            let targetCol = null;
            if (columnName) {
                // Try to resolve user provided column (e.g. "cpf")
                targetCol = this.resolveColumn(columnName, columns);

                if (!targetCol) {
                    return {
                        text: `Coluna **${columnName}** não encontrada em **${tableName}**. Selecione abaixo:`,
                        action: 'column_selection',
                        data: {
                            tableName,
                            value: valueRaw,
                            columns: columns.map(c => ({ name: c.COLUMN_NAME, type: c.DATA_TYPE })),
                            mode: 'filter', // Explicit mode
                            originalShowColumns: data.show_columns // Persist projection context
                        }
                    };
                }
            } else {
                // Heuristic Auto-Resolution
                const isFirstNum = !isNaN(parseFloat(values[0])) && isFinite(values[0]);

                // 1. Semantic Priority (CPF, ID, COD)
                // Expanded list and logic
                const semanticCols = columns.filter(c =>
                    ['CPF', 'NR_CPF', 'CNPJ', 'NR_CNPJ', 'ID', 'CODIGO', 'COD'].includes(c.COLUMN_NAME) ||
                    (c.COLUMN_NAME.includes('CPF') && !c.COLUMN_NAME.includes('DATA')) ||
                    (c.COLUMN_NAME.includes('CNPJ') && !c.COLUMN_NAME.includes('DATA')) ||
                    c.COLUMN_NAME.endsWith('_ID') || c.COLUMN_NAME.startsWith('ID_') || c.COLUMN_NAME.startsWith('COD_')
                );

                if (semanticCols.length > 0) {
                    // Prioritize CPF/CNPJ if user provides numbers (often formatted without dots in args, or with dots)
                    const cpfCol = semanticCols.find(c => c.COLUMN_NAME.includes('CPF') || c.COLUMN_NAME.includes('CNPJ'));
                    if (cpfCol && (isFirstNum || isMultiValue || values[0].length > 5)) { // Check length too for CPF
                        targetCol = cpfCol;
                    } else if (semanticCols.length === 1) {
                        targetCol = semanticCols[0];
                    } else {
                        // Multiple IDs? Try typical "ID" or "CODIGO"
                        targetCol = semanticCols.find(c => c.COLUMN_NAME === 'ID' || c.COLUMN_NAME === 'CODIGO') || semanticCols[0];
                    }
                }

                // 2. Data Type Priority
                if (!targetCol && (isFirstNum || isMultiValue)) {
                    const numberCols = columns.filter(c => c.DATA_TYPE === 'NUMBER' || c.DATA_TYPE.includes('INT'));
                    if (numberCols.length === 1) targetCol = numberCols[0];
                }

                // If STILL null -> Interactive Filter Selection
                if (!targetCol) {
                    // STORE STATE FOR LEARNING
                    // STORE STATE FOR LEARNING
                    const session = this.getSession(userId);
                    session.status = 'AWAITING_COLUMN_SELECTION';
                    session.payload = {
                        tableName: tableName,
                        originalTerm: columnName || valueRaw, // What was ambiguous
                        originalData: data,
                        mode: 'filter'
                    };

                    return {
                        text: `Não sei em qual campo buscar o valor **"${valueRaw}"** na tabela **${tableName}**. Por favor, selecione:`,
                        action: 'column_selection',
                        data: {
                            tableName,
                            value: valueRaw,
                            columns: columns.map(c => ({ name: c.COLUMN_NAME, type: c.DATA_TYPE })),
                            mode: 'filter',
                            originalShowColumns: data.show_columns // Persist projection context
                        }
                    };
                }
            }

            // 4. PROJECTION HANDLING
            let selectClause = "*";
            let projectionMode = false;

            if (data.show_columns && Array.isArray(data.show_columns) && data.show_columns.length > 0) {
                const matchedCols = [];
                const missingCols = [];

                for (const reqCol of data.show_columns) {
                    // Use helper (includes fuzzy + abbreviations)
                    const found = this.resolveColumn(reqCol, columns);
                    if (found) matchedCols.push(found.COLUMN_NAME);
                    else missingCols.push(reqCol);
                }

                if (missingCols.length > 0) {
                    // STORE STATE FOR LEARNING (Projection)
                    this.conversationState = {
                        status: 'AWAITING_COLUMN_SELECTION',
                        payload: {
                            tableName: tableName,
                            originalTerm: missingCols[0], // Learn the first missing one for now
                            originalData: data,
                            mode: 'projection'
                        }
                    };

                    return {
                        text: `Encontrei a coluna de busca (${targetCol.COLUMN_NAME}), mas não achei os campos para exibir: **${missingCols.join(', ')}**. Por favor, selecione o que deseja ver:`,
                        action: 'column_selection',
                        data: {
                            tableName,
                            value: valueRaw,
                            columns: columns.map(c => ({ name: c.COLUMN_NAME, type: c.DATA_TYPE })),
                            filterColumn: targetCol.COLUMN_NAME,
                            mode: 'projection'
                        }
                    };
                }

                selectClause = matchedCols.join(', ');
                projectionMode = true;
            }

            // 5. QUERY BUILD & EXECUTE
            // ... (rest is mostly same, just updating type check slightly)
            if (targetCol.DATA_TYPE === 'NUMBER' && isNaN(parseFloat(values[0]))) {
                return { text: `A coluna **${targetCol.COLUMN_NAME}** é numérica, mas o valor **"${values[0]}"** parece texto.` };
            }

            let sql = `SELECT ${selectClause} FROM ${tableName} WHERE ${targetCol.COLUMN_NAME} `;
            const params = {};

            if (isMultiValue) {
                const binds = values.map((_, i) => `:${i}`).join(', ');
                sql += `IN (${binds})`;
                values.forEach((v, i) => params[i.toString()] = v);
            } else {
                sql += `= :val`;
                params.val = values[0];
            }

            const result = await db.executeQuery(sql, params, 100);

            if (result.rows.length === 0) {
                return { text: `Nenhum registro encontrado com **"${valueRaw}"** na coluna **${targetCol.COLUMN_NAME}** de **${tableName}**.` };
            }

            return {
                text: `Encontrei **${result.rows.length}** registro(s)${projectionMode ? ' (Colunas Filtradas)' : ''}:`,
                action: 'show_data',
                data: { metaData: result.metaData, rows: result.rows }
            };

        } catch (err) {
            console.error(err);
            return { text: `Erro ao buscar dados: ${err.message}` };
        }
    }

    async processText(text, instruction) {
        if (!this.groq) {
            return "⚠️ IA não configurada (Sem API Key).";
        }

        try {
            // --- COMPLEMENT MODE ---
            if (instruction.startsWith("Complementar:")) {
                const docService = require('./localDocService');
                // Use the selected text as search query to find relevant context
                const query = text.length > 200 ? text.substring(0, 200) : text;
                const relevantNodes = await docService.searchNodes(query);

                let contextText = "";
                if (relevantNodes.length > 0) {
                    contextText += `=== CONTEXTO ADICIONAL (Fatos/Dados) ===\n` + relevantNodes.slice(0, 2).map(n =>
                        `[Fonte: ${n.NM_TITLE}]\n${n.SNIPPET.substring(0, 5000)}...`
                    ).join("\n\n---\n\n");
                }

                const isTableMode = instruction.includes("[CONTEXT: TABLE");
                const isJsonMode = instruction.includes("JSON");
                const cleanInstruction = instruction.replace("Complementar:", "").replace(/\[CONTEXT: TABLE.*?\]/, "").trim();

                console.log("[AI Service] Processing Complement. Table Mode:", isTableMode, "JSON Mode:", isJsonMode);

                const systemPrompt = `
                Você é um co-autor especialista ajudando a escrever este documento.
                
                # INSTRUÇÃO: ${cleanInstruction}
                
                # REGRAS
                1. CONTINUE o texto fornecido pelo usuário de forma fluida e coesa.
                2. Mantenha o tom e estilo do texto original.
                3. USE o "CONTEXTO ADICIONAL" para enriquecer o texto com dados ou detalhes técnicos se fizer sentido.
                4. Se solicitado criar tabelas ou dados, use o contexto ou crie exemplos realistas.
                5. Retorne APENAS o novo texto complementar (não repita o original).
                ${isTableMode ? `
                # REGRAS ESPECÍFICAS PARA TABELA
                - O input do usuário é uma estrutura de tabela (pode ser JSON ou Texto).
                ${isJsonMode ? `
                - O Input é um JSON representando a seleção da tabela (Tiptap JSON).
                - Sua tarefa é RETORNAR O JSON ATUALIZADO ou NOVAS LINHAS EM JSON.
                - Se o input for a tabela completa, adicione as linhas necessárias e retorne a TABELA JSON COMPLETA.
                - Mantenha a estrutura 'type': 'tableRow', 'content': [...].
                - Retorne APENAS O JSON (sem blocos de código markdown, sem explicações).
                - Exemplo de output: { "type": "table", "content": [ ... ] } ou [ { "type": "tableRow"... } ]
                ` : `
                - GERE NOVAS LINHAS (ROWS) para complementar a tabela.
                - Siga a contagem de colunas implícita no texto original.
                - Retorne APENAS o código HTML das linhas (ex: <tr><td>...</td><td>...</td></tr>).
                - NÃO retorne a tag <table> inteira, apenas os <tr>.
                `}
                ` : ''}
                
                # CONTEXTO ADICIONAL
                ${contextText || "Sem contexto adicional disponível."}
                `;

                console.log("[AI Service] Sending prompt to Groq...");
                const completion = await this.groq.chat.completions.create({
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: `Texto Original:\n${text}\n\ncomplemento:` }
                    ],
                    model: this.modelName,
                    temperature: 0.5,
                });

                const content = completion.choices[0]?.message?.content || "";
                console.log("[AI Service] Groq response length:", content.length);
                if (!content) console.warn("[AI Service] WARNING: Empty response from Groq");

                return content;
            }
            // --- END COMPLEMENT MODE ---

            const systemPrompt = `
            Você é um assistente de edição de texto especialista.
            Sua tarefa é transformar o texto fornecido seguindo estritamente a instrução do usuário.
            
            # REGRAS
            1. Retorne APENAS o resultado final do texto transformado.
            2. Não inclua "Aqui está o texto" ou aspas extras.
            3. Mantenha a formatação Markdown se existir.
            4. Se a instrução for "Resumir", faça um resumo conciso.
            5. Se a instrução for "Melhorar", corrija gramática e melhore a fluidez mantendo o tom profissional.
            
            Instrução: ${instruction}
            `;

            const completion = await this.groq.chat.completions.create({
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: text }
                ],
                model: this.modelName,
                temperature: 0.3,
            });

            return completion.choices[0]?.message?.content || text;
        } catch (e) {
            console.error("AI Text Error:", e);
            return `Erro ao processar texto: ${e.message}`;
        }
    }
    async fixSqlError(sql, error) {
        if (!this.groq) return { text: "⚠️ IA não configurada." };
        const systemPrompt = `Você é um especialista em Oracle SQL.
        Sua tarefa é CORRIGIR a query SQL abaixo baseada no erro.
        
        REGRAS:
        1. Responda APENAS com o SQL corrigido dentro de um bloco markdown (\`\`\`sql ... \`\`\`).
        2. A primeira linha do SQL DEVE ser um comentário (\`--\`) explicando brevemente o que foi corrigido.
        3. NÃO use texto conversacional fora do bloco de código.`;

        const userPrompt = `SQL Incorreto:\n\`\`\`sql\n${sql}\n\`\`\`\n\nErro:\n${error}`;

        try {
            const completion = await this.groq.chat.completions.create({
                messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
                model: this.modelName,
                temperature: 0.1
            });
            const content = completion.choices[0]?.message?.content || "";
            return { text: content };
        } catch (e) {
            return { text: "Erro ao corrigir: " + e.message };
        }
    }

    async explainSql(sql) {
        if (!this.groq) return { text: "⚠️ IA não configurada." };
        const systemPrompt = `Você é um professor de Banco de Dados.
        Explique o que a query SQL faz.
        
        REGRAS:
        1. Use Markdown profissional (Negrito, Listas).
        2. Seja conciso, direto e didático.
        3. Destaque tabelas e colunas importantes.`;

        try {
            const completion = await this.groq.chat.completions.create({
                messages: [{ role: "system", content: systemPrompt }, { role: "user", content: sql }],
                model: this.modelName,
                temperature: 0.3
            });
            return { text: completion.choices[0]?.message?.content || "" };
        } catch (e) {
            return { text: "Erro ao explicar: " + e.message };
        }
    }

    async optimizeSql(sql) {
        if (!this.groq) return { text: "⚠️ IA não configurada." };
        const systemPrompt = `Você é um DBA Sênior Especialista em Oracle e Tuning de Performance.
        Sua missão é analisar a query fornecida e reescreve-la para a MÁXIMA performance possível, sem alucinar objetos que não existem.
        
        # DIRETRIZES DE PENSAMENTO (CoT):
        1. Analise os predicados (WHERE/JOIN). Estou usando funções em colunas (quebrando índices)? (Ex: TRUNC(data) = ...). Se sim, reescreva para range de datas.
        2. Analise os JOINs. Estão usando ANSI-92? Se não, converta. Use EXISTS ao invés de IN para subqueries grandes.
        3. Analise Subqueries. Podem ser transformadas em JOINs ou CTEs (WITH clause) para legibilidade e possível materialização?
        4. Analise SELECT *. Se for possível inferir as colunas, liste-as. Se não, mantenha *, mas adicione um comentário avisando para evitar.
        5. NÃO invente índices ou tabelas. Trabalhe com a lógica da query.

        # REGRAS RÍGIDAS DE SAÍDA:
        1. Retorne APENAS o código SQL dentro de um bloco markdown (\`\`\`sql ... \`\`\`).
        2. O SQL deve iniciar com o comentário: "-- Otimizado por Hap IA (Nível DBA)"
        3. Adicione comentários curtos NO CÓDIGO explicando as mudanças principais (Ex: "-- Alterado IN para EXISTS para performance").
        4. Se o SQL já estiver ótimo, retorne-o igual com o comentário "-- Validado: Performance já está otimizada".
        5. Formate o código com indentação profissional.
        `;

        try {
            const completion = await this.groq.chat.completions.create({
                messages: [{ role: "system", content: systemPrompt }, { role: "user", content: sql }],
                model: this.modelName,
                temperature: 0.1
            });
            return { text: completion.choices[0]?.message?.content || "" };
        } catch (e) {
            return { text: "Erro ao otimizar: " + e.message };
        }
    }

    async generateSql(userPrompt, schemaContext) {
        if (!this.groq) return { text: "⚠️ IA não configurada." };

        const contextStr = schemaContext ? `\nContexto (Tabelas/Colunas):\n${JSON.stringify(schemaContext, null, 2)}` : "";

        const systemPrompt = `Você é um Gerador de SQL Oracle.
        Gere uma query SQL baseada no pedido.
        ${contextStr}
        
        REGRAS:
        1. Responda APENAS com o SQL solicitado dentro de um bloco markdown (\`\`\`sql ... \`\`\`).
        2. NÃO adicione texto introdutório como "Aqui está a query" ou "Segue o SQL".
        3. Se necessário, adicione um comentário curto dentro do próprio código SQL (-- Comentário).
        4. Use aliases curtos (t1, p) e formate bem o código.
        5. Se não souber a resposta, retorne apenas um comentário SQL: -- Não consegui gerar a query para isso.`;

        try {
            const completion = await this.groq.chat.completions.create({
                messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
                model: this.modelName,
                temperature: 0.2
            });
            return { text: completion.choices[0]?.message?.content || "" };
        } catch (e) {
            return { text: "Erro ao gerar SQL: " + e.message };
        }
    }
    async processDocsChat(message, history, currentContext) {
        if (!this.groq) return { text: "⚠️ IA não configurada (Sem API Key).", action: 'error' };

        try {
            // RAG: Retrieval Step
            const docService = require('./localDocService');
            const relevantNodes = await docService.searchNodes(message);

            let contextText = "";

            // 1. Priority: Current Open Document
            if (currentContext && currentContext.content) {
                // ... (existing context logic)
                contextText += `=== DOCUMENTO ABERTO (Foco Principal) ===\n[Título: ${currentContext.title}]\nConteúdo: ${currentContext.content.substring(0, 50000)}\n\n`;
            }

            // ... (existing RAG logic)

            // --- COMPLEMENTATION LOGIC ---
            // Detect special instruction from frontend
            if (message.startsWith("Complementar:")) {
                const instruction = message.replace("Complementar:", "").trim();

                const systemPrompt = `
                Você é um co-autor especialista ajudando a escrever este documento.
                Sua tarefa é CONTINUAR e COMPLEMENTAR o texto selecionado pelo usuário.
                
                # INSTRUÇÃO: ${instruction}
                
                # REGRAS DE COMPLEMENTO:
                1. Analise o "DOCUMENTO ABERTO" para manter o mesmo tom, estilo e formatação.
                2. Use os "OUTROS DOCUMENTOS RELACIONADOS" para extrair fatos, dados ou referências cruzadas se necessário.
                3. NÃO repita o texto que o usuário já escreveu. CONTINUE a partir dele.
                4. Se a instrução pedir dados/tabelas, crie dados fictícios realistas ou use dados reais do contexto se houver.
                5. Retorne APENAS o texto complementar formatado em Markdown (sem introduções como "Aqui está o texto...").
                
                # CONTEXTO (Documentos Recuperados)
                ${contextText}
                `;

                // For completion, we might want a slightly higher temperature for creativity
                const completion = await this.groq.chat.completions.create({
                    messages: [
                        { role: "system", content: systemPrompt },
                        // The user message in completion mode is effectively the "cursor position" or selection usually, 
                        // but here 'message' is the instruction. 
                        // We assume the actual selection is part of 'currentContext.content' provided implicitly or we need to pass selection explicitly?
                        // Wait, 'message' from DocEditor handleAiRequest is the SELECTED TEXT + Instruction usually?
                        // In DocEditor.jsx: handleAiRequest(instruction) -> passes 'selectedText' as text AND 'instruction' to API?
                        // Let's check DocsModule.jsx/handleAiRequest.
                        // Actually DocEditor.jsx calls onAiRequest(text). 
                        // But my new UI calls handleAiRequest("Complementar: ..."). 
                        // This sends the instruction AS the "text" to process?
                        // AAARGH. DocEditor.jsx:327: onAiRequest(text).
                        // My new buttons call handleAiRequest("Complementar: ...").
                        // So 'message' received here IS "Complementar: ...".
                        // BUT WHERE IS THE SELECTED TEXT TO COMPLETE?
                        // The DocEditor logic (lines 325-327) extracts selection.
                        // BUT my button click handler overrides the argument passed to onAiRequest!
                        // DocEditor.jsx:324: handleAiClick (generic) gets selection.
                        // My buttons pass specific string.
                        // I need to fix DocEditor.jsx to pass BOTH.

                        { role: "user", content: "Por favor, gere o complemento seguindo a instrução acima." }
                    ],
                    model: this.modelName,
                    temperature: 0.5,
                });
                return { text: completion.choices[0]?.message?.content || "", action: 'chat' };
            }
            // --- END COMPLEMENTATION LOGIC ---

            const systemPrompt = `
            Você é um assistente especialista na documentação do projeto.

            Use o contexto fornecido abaixo para responder à pergunta do usuário.
            
            # REGRAS
            1. Se houver um "DOCUMENTO ABERTO", priorize ele para perguntas como "resuma este documento", "o que diz aqui", etc.
            2. Se a resposta não estiver no contexto, diga que não sabe, mas tente ser útil.
            3. Mantenha as respostas concisas e formatadas em Markdown.

            # CONTEXTO (Documentos Recuperados)
            ${contextText}
            `;

            const historyMessages = history.map(h => ({
                role: h.sender === 'user' ? 'user' : 'assistant',
                content: h.text
            }));

            const completion = await this.groq.chat.completions.create({
                messages: [
                    { role: "system", content: systemPrompt },
                    ...historyMessages,
                    { role: "user", content: message }
                ],
                model: this.modelName,
                temperature: 0.3,
            });

            const answer = completion.choices[0]?.message?.content || "Houve um erro ao gerar a resposta.";
            return { text: answer, action: 'chat' };

        } catch (e) {
            console.error("Docs Chat Error:", e);
            return { text: `Erro no chat: ${e.message}`, action: 'error' };
        }
    }
}

module.exports = new AiService();
