const Groq = require("groq-sdk");
const db = require('../db');
const learningService = require('./learningService');

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
                // FIND TABLES
                regex: /(?:busque|encontre|listar|mostre|quais|onde ficam|procurar|pesquisar|localizar)(?:\s+as)?(?:\s+tabelas?)?(?:\s+(?:de|do|da|dos|das|por|que contenham:?))?\s+(.+)/i,
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

        // State for Multi-turn Conversations
        this.conversationState = {
            status: 'IDLE',
            payload: null
        };
    }

    async processMessage(message, mode = 'ai', history = []) {
        if (mode === 'ai' && !this.groq) {
            return {
                text: "⚠️ API Key não configurada. Alternando para modo Local.",
                action: 'switch_mode',
                mode: 'local'
            };
        }

        // --- 1. HANDLE PENDING CONFIRMATIONS ---
        if (this.conversationState.status === 'AWAITING_CONFIRMATION') {
            const lowerMsg = message.trim().toLowerCase();
            if (['sim', 'yes', 's', 'y', 'confirmar', 'ok'].includes(lowerMsg)) {
                const pendingData = this.conversationState.payload;
                this.conversationState = { status: 'IDLE', payload: null };

                if (pendingData.action === 'drop_table') {
                    return await this.executeAction({
                        action: 'drop_table',
                        data: pendingData.data
                    });
                }
            } else {
                this.conversationState = { status: 'IDLE', payload: null };
                return {
                    text: "🆗 Ação cancelada. O que gostaria de fazer agora?",
                    action: "text_response"
                };
            }
        }

        let result;
        if (mode === 'local') {
            result = await this.processWithRegex(message);
        } else {
            result = await this.processWithGroq(message, history);
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

            this.conversationState = {
                status: 'AWAITING_CONFIRMATION',
                payload: result
            };
            return {
                text: `⚠️ **CONFIRMAÇÃO NECESSÁRIA** ⚠️\n\nVocê pediu para excluir a tabela **${tableName}**.\nEssa ação não pode ser desfeita.\n\nDigite **sim** para confirmar ou qualquer outra coisa para cancelar.`,
                action: 'text_response'
            };
        }

        if (result.action && result.action !== 'chat' && result.action !== 'text_response') {
            learningService.logInteraction(result.action, message, true);
        }

        return result;
    }

    async processWithGroq(message, history) {
        if (!this.groq) return { text: "⚠️ IA não configurada.", action: 'switch_mode', mode: 'local' };

        // System Prompt defining the Persona and Tools
        const systemPrompt = `
        Você é o Hap AI, um assistente especialista em Banco de Dados Oracle, atuando como um **Assistente de Dados** e **Assistente de Product Owner**.
        Sua missão é ajudar o usuário a consultar, entender e manipular dados, além de fornecer insights de negócio.

        # FERRAMENTAS DISPONÍVEIS (Responda com JSON se precisar usar uma)
        Se o usuário pedir algo que exija acesso ao banco, retorne APENAS um JSON no seguinte formato:
        { "action": "NOME_DA_ACAO", "params": { ... } }

        Ações:
        1. list_tables { search_term: string } -> Listar tabelas (Use quando user pedir "ver tabelas", "buscar", "listar").
        2. describe_table { tableName: string } -> Ver colunas/estrutura.
        3. run_sql { sql: string } -> Executar SELECT (Apenas SELECT!).
        4. draft_table { tableName: string, columns: array, ... } -> Criar rascunho de tabela.
        5. list_triggers { table_name: string } -> Listar triggers.
        6. find_record { table_name: string, value: string, column_name?: string, show_columns?: string[] } -> Localizar registro. REGRA MÚLTIPLOS: Se houver vários códigos/valores, envie TODOS no campo 'value' separados por espaço. REGRA COLUNAS: Use 'show_columns' para listar campos que o usuário pediu para ver (Ex: ["NOME", "CPF"]).

        # REGRAS DE RESPOSTA (CRÍTICO)
        1. PRIORIZE A AÇÃO. Se o usuário pedir dados, execute a query (run_sql) em vez de apenas mostrar o SQL.
        2. Se for apenas conversa, responda em texto normal (Markdown).
        3. Se for uma ação, responda APENAS o JSON.
        4. Se o usuário pedir para criar uma tabela, use a ação 'draft_table' ou sugira o SQL.
        5. Sempre seja cordial e profissional.
        `;

        const messages = [
            { role: "system", content: systemPrompt },
            ...history.map(h => ({ role: h.sender === 'user' ? 'user' : 'assistant', content: h.text })),
            { role: "user", content: message }
        ];

        try {
            const completion = await this.groq.chat.completions.create({
                messages: messages,
                model: this.modelName,
                temperature: 0.3,
                stop: null
            });

            const content = completion.choices[0]?.message?.content || "";

            // Try to parse JSON action
            try {
                // Find JSON in content (sometimes models add text around it)
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const jsonStr = jsonMatch[0];
                    const actionData = JSON.parse(jsonStr);

                    if (actionData.action) {
                        return await this.executeAction({
                            action: actionData.action,
                            data: actionData.params || actionData.data,
                            text: null // Let executeAction generate the text
                        });
                    }
                }
            } catch (e) {
                // Not JSON, treat as text
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

    async processWithRegex(message) {
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
                    });
                }
                if (intent.action === 'describe_table') {
                    return await this.executeAction({
                        action: 'describe_table',
                        data: { table_name: match[1].trim() },
                        text: `[Modo Local] Exibindo estrutura de ${match[1].trim()}...`
                    });
                }
                if (intent.action === 'find_record') {
                    return await this.executeAction({
                        action: 'find_record',
                        data: { value: match[1].trim(), table_name: match[2].trim() },
                        text: `[Modo Local] Buscando "${match[1].trim()}" em ${match[2].trim()}...`
                    });
                }
                if (intent.action === 'list_triggers') {
                    return await this.executeAction({
                        action: 'list_triggers',
                        data: { table_name: match[1] ? match[1].trim() : null },
                        text: `[Modo Local] Listando triggers...`
                    });
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
                    });
                }
                if (intent.action === 'create_table_sql') {
                    return await this.executeAction({
                        action: 'create_table_sql',
                        text: `[Modo Local] Gerando SQL...`,
                        data: {
                            tableName: match[1].trim(),
                            columns: match[2].trim()
                        }
                    });
                }
            }
        }

        return {
            text: "🤖 [Modo Local] Não entendi. Tente usar formatos padrão como 'Buscar tabelas de X'.",
            action: null
        };
    }

    async executeAction(aiResponse) {
        let { action, data, text } = aiResponse;
        data = data || aiResponse.params || {};

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
            if (action === 'list_tables') {
                const term = data.search_term ? data.search_term.trim() : '';
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
                const result = await this.performFindRecord(data);
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
                return { text: text || `Rascunho criado para **${data.tableName}**.`, action: 'draft_table', data: data };
            }

            if (action === 'create_table_sql') {
                const tableName = data.tableName || "NOVA_TABELA";
                const columnsRaw = data.columns || "ID NUMBER";
                const sql = `CREATE TABLE ${tableName.toUpperCase()} (\n  ${columnsRaw.replace(/,/g, ',\n  ')}\n);`;
                return { text: `Script para **${tableName}**:\n\`\`\`sql\n${sql}\n\`\`\``, action: 'chat' };
            }

            if (action === 'run_sql') {
                const sql = data.sql || "";
                if (sql.trim().toUpperCase().startsWith('SELECT')) {
                    try {
                        const result = await db.executeQuery(sql, {}, 50); // Limit 50 rows
                        return {
                            text: text || "Executei a consulta para você:",
                            action: 'show_data',
                            data: { metaData: result.metaData, rows: result.rows }
                        };
                    } catch (e) {
                        return { text: `Tentei executar, mas houve um erro:\n\`${e.message}\`\n\nSQL:\n\`\`\`sql\n${sql}\n\`\`\``, action: 'chat' };
                    }
                }
                return { text: `SQL sugerido (Não executado automaticamente):\n\`\`\`sql\n${sql}\n\`\`\``, action: 'chat' };
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
            'OBS': ['TX', 'DS', 'OBSERVACAO']
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

    async performFindRecord(data) {
        let tableName = (data.table_name || "").toUpperCase();
        const valueRaw = data.value;
        const columnName = data.column_name ? data.column_name.toUpperCase() : null;

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
                     FETCH NEXT 5 ROWS ONLY`,
                    { name: searchName }
                );
                if (similar.rows.length > 0) {
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
