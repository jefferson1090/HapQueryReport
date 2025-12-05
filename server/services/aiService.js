const { GoogleGenerativeAI } = require("@google/generative-ai");
const db = require('../db');

class AiService {

    constructor() {
        this.apiKey = process.env.GEMINI_API_KEY;
        this.genAI = null;
        this.model = null;

        if (this.apiKey) {
            this.genAI = new GoogleGenerativeAI(this.apiKey);
            const modelName = process.env.GEMINI_MODEL || "gemini-1.5-flash";
            this.model = this.genAI.getGenerativeModel({ model: modelName });
        } else {
            console.warn("GEMINI_API_KEY not found. AI features disabled.");
        }

        // Regex Patterns for Local Mode
        this.localIntents = [
            {
                // FIND TABLES (Refined to be looser with 'tabelas' keyword)
                regex: /(?:busque|encontre|listar|mostre|quais|onde ficam|procurar|pesquisar)(?:\s+as)?(?:\s+tabelas?)?(?:\s+(?:de|do|da|dos|das|por))?\s+(.+)/i,
                action: 'list_tables'
            },
            {
                // DESCRIBE TABLE (Direct Schema.Table support added)
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
                // DRAFT TABLE (Structured Input: Name; Cols; Indices; Grants)
                // We use a broader match and then validate inside the handler
                // Allow spaces in table name (will be sanitized)
                regex: /^([a-zA-Z0-9_\.$#\s]+)\s*;\s*(.+?)(?:\s*;\s*(.*))?$/i,
                action: 'draft_table'
            },
            {
                // CREATE TABLE SQL GENERATION (Legacy/Fallback)
                regex: /(?:criar|nova|create)\s+tabela\s+([a-zA-Z0-9_$#]+)\s+(?:com|with)\s+(.+)/i,
                action: 'create_table_sql'
            },
            {
                // CREATE TABLE HELP (Fallback)
                regex: /(?:criar|nova|create)\s+tabela/i,
                action: 'create_table_help'
            }
        ];
    }

    async processMessage(message, mode = 'ai') {
        // Force local if AI not configured
        if (mode === 'ai' && !this.model) {
            return {
                text: "⚠️ API Key não configurada. Alternando para modo Local.",
                action: 'switch_mode',
                mode: 'local'
            };
        }

        if (mode === 'local') {
            return await this.processWithRegex(message);
        } else {
            return await this.processWithGemini(message);
        }
    }

    // --- STRATEGY: LOCAL (REGEX) ---
    async processWithRegex(message) {
        const cleanMsg = message.trim();

        for (const intent of this.localIntents) {
            const match = cleanMsg.match(intent.regex);
            if (match) {
                if (intent.action === 'list_tables') {
                    // Cleanup term: remove common prefixes if regex leaked them
                    let term = match[1].trim();
                    term = term.replace(/^(?:tabelas?|de|do|da|dos|das)\s+/i, '');

                    return await this.executeAction({
                        action: 'list_tables',
                        data: { search_term: term },
                        text: `[Modo Local] Buscando tabelas para "${term}"...`
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
                    // match[1] = TableName
                    // match[2] = Columns (comma separated)
                    // match[3] = Indices/Grants (rest)

                    let tableName = match[1].trim();
                    tableName = tableName.replace(/\s+/g, '_'); // Sanitize spaces

                    const columnsRaw = match[2] ? match[2].split(',') : [];
                    const restRaw = match[3] ? match[3].split(';') : [];

                    const indicesRaw = restRaw[0] ? restRaw[0].split(',') : [];
                    const grantsRaw = restRaw[1] ? restRaw[1].split(',') : [];

                    const columns = columnsRaw.map(c => {
                        const parts = c.trim().split(/\s+/);
                        const name = parts[0];
                        const type = parts.slice(1).join(' ') || 'VARCHAR2(100)'; // Default type
                        return { name, type };
                    }).filter(c => c.name);

                    const indices = indicesRaw.map(i => i.trim()).filter(i => i);
                    const grants = grantsRaw.map(g => g.trim()).filter(g => g);

                    return await this.executeAction({
                        action: 'draft_table',
                        data: { tableName, columns, indices, grants },
                        text: `[Modo Rascunho] Preparando tabela **${tableName}**...`
                    });
                }

                if (intent.action === 'create_table_sql') {
                    // Regex captures are in match, pass them
                    return await this.executeAction({
                        action: 'create_table_sql',
                        text: `[Modo Local] Gerando SQL...`,
                        data: {
                            tableName: match[1].trim(),
                            columns: match[2].trim()
                        }
                    });
                }
                if (intent.action === 'create_table_help') {
                    return await this.executeAction({
                        action: 'create_table_help',
                        data: {},
                        text: `[Modo Local] Ajuda criação de tabela`
                    });
                }
            }
        }

        return {
            text: "🤖 [Modo Local] Não entendi. Tente usar formatos padrão:\n- 'Busque tabelas de clientes'\n- 'Estrutura da TB_CLIENTE'\n- 'Encontre 123 na TB_PEDIDO'",
            action: null
        };
    }

    // --- STRATEGY: GEMINI (AI) ---
    async processWithGemini(message) {
        try {
            // OPTIMIZATION: Dynamic Context
            const dbKeywords = ['tabela', 'table', 'dados', 'data', 'registro', 'record', 'busca', 'find', 'encontre', 'select', 'estrutura', 'schema', 'coluna', 'column', 'listar', 'list', 'mostre', 'show', 'quais', 'onde'];
            const isDbQuery = dbKeywords.some(w => message.toLowerCase().includes(w));

            let tableContext = "";

            if (isDbQuery) {
                // Limit to 50 tables to save context
                try {
                    const tables = await db.getTables();
                    tableContext = tables.slice(0, 50).join(", ");
                } catch (e) {
                    console.error("Error fetching tables for context:", e);
                }
            }

            // USER DEFINED PERSONA (Assistente de Dados - Refined)
            const basePersona = `
            # ROLE & OBJECTIVE
            Você é um **Assistente de Dados** experiente, objetivo e direto ao ponto.
            Sua função é gerenciar os bancos de dados Oracle (Schemas: INCORPORA e HUMASTER) com precisão e segurança.

            # CONTEXT
            Schemas Padrão: **INCORPORA** e **HUMASTER**.
            Tabelas disponíveis: [${tableContext}].

            # DIRECTIVES (Diretrizes de Comportamento)
            1. **Respostas Curtas e Objetivas:** Vá direto ao ponto. Evite rodeios.
            2. **Formatação de Código:** Sempre exiba códigos SQL e outros scripts dentro de blocos Markdown bonitos (ex: \`\`\`sql ... \`\`\`).
            3. **Prioridade de Criação:** Quando o usuário pedir para CRIAR (CREATE) uma tabela ou objeto, **NÃO** gere apenas o script no chat.
               - USE A ACTION "draft_table".
               - GERE o JSON necessário para abrir o painel lateral de criação.
               - O usuário quer "ver o objeto na janela ao lado" e confirmar com um botão.
            
            # CORE CAPABILITIES
            - **DDL Inteligente:** Inferir tipos de dados se não forem informados (ex: id -> NUMBER, nome -> VARCHAR2(100)).
            - **Segurança:** Nunca execute DROP/TRUNCATE.
            - **Consultas:** Use JOINs explícitos e aliases.

            # OUTPUT FORMAT (JSON STRICT)
            Responda SEMPRE com este JSON exato:
            { 
              "text": "Explicação curta em Markdown (com blocos de código se necessário)", 
              "action": "ACTION_NAME", 
              "data": {params} 
            }
            
            - "list_tables": { "search_term": "..." }
            - "describe_table": { "table_name": "..." }
            - "find_record": { "table_name": "...", "value": "...", "target_column": "COLUNA_OPCIONAL" }
            - "chat": {} (Dúvidas gerais)
            - "draft_table": { "tableName": "NOME", "columns": [ {"name": "COL", "type": "TYPE"} ], "indices": [], "grants": [] }

            Exemplo de Criação:
            User: "Crie a tabela logs com id e mensagem"
            JSON: {
              "text": "Aqui está a estrutura da tabela **logs**. Confirme ao lado.",
              "action": "draft_table",
              "data": { "tableName": "LOGS", "columns": [ {"name": "ID", "type": "NUMBER"}, {"name": "MENSAGEM", "type": "VARCHAR2(200)"} ] }
            }
            `;

            let systemInstruction = "";
            if (isDbQuery) {
                systemInstruction = basePersona + `\nFoco: Análise técnica e consultas ao banco.`;
            } else {
                systemInstruction = basePersona + `\nFoco: Responder dúvidas gerais de forma divertida e técnica.`;
            }

            const prompt = `
            ${systemInstruction}
            User Query: "${message}"
            `;

            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            let text = response.text();
            text = text.replace(/```json/g, '').replace(/```/g, '').trim();

            let aiResponse;
            try {
                aiResponse = JSON.parse(text);
            } catch (e) {
                return { text: text, action: 'chat' };
            }

            return await this.executeAction(aiResponse);

        } catch (err) {
            console.error("Gemini Error:", err);
            if (err.message && err.message.includes("429")) {
                return {
                    text: "⏳ Cota da IA excedida. Mude para o **Modo Local** para continuar.",
                    action: 'quota_exceeded'
                };
            }
            return { text: "Erro na IA: " + err.message, action: null };
        }
    }

    // --- COMMON EXECUTOR ---
    async executeAction(aiResponse) {
        const { action, data, text } = aiResponse;

        try {
            if (action === 'list_tables') {
                const term = data.search_term ? data.search_term.trim() : '';
                console.log(`[LocalSearch] Term: "${term}"`);

                // PRIORITIZE INCORPORA AND HUMASTER
                const tables = await db.executeQuery(
                    `SELECT OWNER, OBJECT_NAME, 'N/A' as COMMENTS 
                     FROM ALL_OBJECTS 
                     WHERE OBJECT_TYPE = 'TABLE'
                     AND (
                        UPPER(OBJECT_NAME) LIKE UPPER(:term) 
                        OR UPPER(OWNER) LIKE UPPER(:term)
                     )
                     AND OWNER NOT IN ('SYS', 'SYSTEM', 'XDB', 'WMSYS', 'CTXSYS', 'MDSYS', 'ORDDATA')
                     ORDER BY 
                        CASE WHEN OWNER IN ('INCORPORA', 'HUMASTER') THEN 0 ELSE 1 END,
                        OWNER, 
                        OBJECT_NAME
                     FETCH NEXT 50 ROWS ONLY`,
                    { term: `%${term}%` }
                );

                console.log(`[LocalSearch] Found: ${tables.rows.length}`);

                if (tables.rows.length === 0) {
                    return {
                        text: `⚠️ **Nenhuma tabela encontrada** para "${term}".\n\nTente termos mais genéricos.`,
                        action: 'chat'
                    };
                }

                return {
                    text: text,
                    action: 'list_tables',
                    data: tables.rows.map(r => ({ owner: r[0], name: r[1], comments: r[2] }))
                };
            }

            if (action === 'describe_table') {
                let tableName = data.table_name.toUpperCase();
                let columns = await db.getColumns(tableName);

                // Smart Fallback: If not found and no schema provided, try to find the owner
                if (!columns.length && !tableName.includes('.')) {
                    console.log(`[Describe] Table ${tableName} not found in current schema. Searching globally...`);

                    // Prioritize INCORPORA/HUMASTER in fallback too
                    const owners = await db.executeQuery(
                        `SELECT OWNER FROM ALL_OBJECTS 
                         WHERE OBJECT_TYPE = 'TABLE' 
                         AND OBJECT_NAME = :name 
                         AND OWNER NOT IN ('SYS','SYSTEM') 
                         ORDER BY CASE WHEN OWNER IN ('INCORPORA', 'HUMASTER') THEN 0 ELSE 1 END
                         FETCH NEXT 5 ROWS ONLY`,
                        { name: tableName }
                    );

                    if (owners.rows.length > 0) {
                        const foundOwner = owners.rows[0][0]; // Pick first matching owner
                        console.log(`[Describe] Found in schema: ${foundOwner}`);
                        tableName = `${foundOwner}.${tableName}`;
                        columns = await db.getColumns(tableName);
                    }
                }

                if (!columns.length) return { text: `Tabela **${tableName}** não encontrada ou você não tem permissão.` };

                const responseData = { tableName, columns };
                if (columns.viewDefinition) {
                    responseData.viewDefinition = columns.viewDefinition;
                    responseData.isView = true;
                }

                return {
                    text: `Aqui está a estrutura da ${columns.viewDefinition ? 'VIEW' : 'tabela'} **${tableName}**:`,
                    action: 'describe_table',
                    data: responseData
                };
            }

            if (action === 'find_record') {
                const tableName = data.table_name.toUpperCase();
                const value = data.value;
                const explicitCol = data.target_column ? data.target_column.toUpperCase() : null;

                const columns = await db.getColumns(tableName);
                if (!columns.length) return { text: `Tabela ${tableName} não encontrada.` };

                let targetCols = [];

                if (explicitCol) {
                    // Try to match the explicit column requested by AI
                    const match = columns.find(c => c.name === explicitCol);
                    if (match) targetCols = [match];
                }

                if (targetCols.length === 0) {
                    // Heuristic Fallback
                    targetCols = columns.filter(c =>
                        ['NUMBER', 'VARCHAR2', 'CHAR'].includes(c.type) &&
                        (
                            c.name === 'ID' ||
                            c.name.includes('_ID') ||
                            c.name.startsWith('COD') ||
                            c.name.includes('CPF') ||
                            c.name.includes('MATRICULA') ||
                            c.name.includes('USUARIO')
                        )
                    );
                }

                if (!targetCols.length) return { text: `Não consegui identificar a coluna de busca (ID/Código) na tabela ${tableName}. Tente especificar a coluna.` };

                // Create OR conditions for all candidates
                const conditions = targetCols.map((c, i) => `${c.name} = :val`).join(' OR ');

                // Use quotes for table name and bind value safely
                const sql = `SELECT * FROM "${tableName.split('.').pop()}" WHERE ${conditions} FETCH NEXT 5 ROWS ONLY`;
                // Note: If schema is present, we need to handle it. getColumns uses pure name.
                // Assuming simple SELECT * FROM "TABLE" relies on current schema session or exact match.
                // Better approach: Use the fully qualified name if we have it from describe logic?
                // For now, let's assume tableName might have schema or not.
                // Safest is raw string if it has schema:

                let queryTable = tableName;
                if (!queryTable.includes('.')) {
                    // If we found it via getColumns, proceed. 
                    // But for SELECT, we might need schema if it's not in default.
                    // IMPORTANT: db.js `getColumns` queries ALL_TAB_COLUMNS. 
                    // Use a more robust SELECT:
                }

                // REFINED QUERY:
                const querySql = `SELECT * FROM ${tableName} WHERE ${conditions} FETCH NEXT 5 ROWS ONLY`;

                try {
                    const result = await db.executeQuery(querySql, { val: value });
                    if (!result.rows.length) return { text: `Registro **${value}** não encontrado na tabela **${tableName}**.` };

                    return {
                        text: text,
                        action: 'show_data',
                        data: { metaData: result.metaData, rows: result.rows }
                    };
                } catch (err) {
                    return { text: `Erro na busca: ${err.message}. Verifique se a tabela existe no schema atual.` };
                }
            }

            if (action === 'list_triggers') {
                const tableName = data.table_name ? data.table_name.toUpperCase() : null;
                let sql = `SELECT TRIGGER_NAME, TABLE_NAME, STATUS, TRIGGERING_EVENT FROM ALL_TRIGGERS WHERE OWNER NOT IN ('SYS', 'SYSTEM')`;
                const params = {};

                if (tableName) {
                    sql += ` AND TABLE_NAME = :tbl`;
                    params.tbl = tableName;
                } else {
                    sql += ` FETCH NEXT 20 ROWS ONLY`;
                }

                const result = await db.executeQuery(sql, params);

                if (result.rows.length === 0) return { text: tableName ? `Nenhuma trigger encontrada para a tabela ${tableName}.` : "Nenhuma trigger encontrada." };

                return {
                    text: text,
                    action: 'show_data',
                    data: { metaData: result.metaData, rows: result.rows }
                };
            }

            if (action === 'draft_table') {
                return {
                    text: `Aqui está o rascunho da tabela **${data.tableName}**. Verifique e confirme ao lado.`,
                    action: 'draft_table',
                    data: data
                };
            }

            if (action === 'create_table_sql') {
                const tableName = data.tableName || "NOVA_TABELA";
                const columnsRaw = data.columns || "ID NUMBER";

                const sql = `CREATE TABLE ${tableName.toUpperCase()} (\n  ${columnsRaw.replace(/,/g, ',\n  ')}\n);`;

                return {
                    text: `Aqui está o script para criar a tabela **${tableName}**:\n\n\`\`\`sql\n${sql}\n\`\`\``,
                    action: 'chat'
                };
            }

            if (action === 'create_table_help') {
                const sql = `CREATE TABLE NOME_DA_TABELA (\n  ID NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,\n  NOME VARCHAR2(100) NOT NULL,\n  DATA_CRIACAO DATE DEFAULT SYSDATE\n);`;
                return {
                    text: `Para criar uma tabela, você pode dizer: "Criar tabela CLIENTES com ID number, NOME varchar2".\n\nExemplo completo:\n\`\`\`sql\n${sql}\n\`\`\``,
                    action: 'chat'
                };
            }

            return { text: text, action: 'chat' };

        } catch (err) {
            console.error(err);
            return { text: `Erro: ${err.message}` };
        }
    }
}

module.exports = new AiService();
