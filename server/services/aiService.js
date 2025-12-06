const { GoogleGenerativeAI } = require("@google/generative-ai");
const db = require('../db');
const learningService = require('./learningService');

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
                // FIND TABLES (Refined to support "Localizar tabelas que contenham: ...")
                regex: /(?:busque|encontre|listar|mostre|quais|onde ficam|procurar|pesquisar|localizar)(?:\s+as)?(?:\s+tabelas?)?(?:\s+(?:de|do|da|dos|das|por|que contenham:?))?\s+(.+)/i,
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
                regex: /^([a-zA-Z0-9_\.$#\s]+)\s*;\s*(.+?)(?:\s*;\s*(.*))?$/i,
                action: 'draft_table'
            },
            {
                // CREATE TABLE SQL GENERATION (Legacy/Fallback)
                regex: /(?:criar|nova|create)\s+tabela\s+([a-zA-Z0-9_$#]+)\s+(?:com|with)\s+(.+)/i,
                action: 'create_table_sql'
            }
        ];
        // State for Multi-turn Conversations (e.g. Confirmations)
        this.conversationState = {
            status: 'IDLE', // IDLE, AWAITING_CONFIRMATION
            payload: null   // Data for the pending action
        };
    }

    async processMessage(message, mode = 'ai') {
        if (mode === 'ai' && !this.model) {
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
                // EXECUTE PENDING ACTION
                const pendingData = this.conversationState.payload;
                this.conversationState = { status: 'IDLE', payload: null }; // Reset

                // For drop_table, we need to execute it now
                if (pendingData.action === 'drop_table') {
                    return await this.executeAction({
                        action: 'drop_table',
                        data: pendingData.data
                    });
                }
            } else {
                // CANCEL
                this.conversationState = { status: 'IDLE', payload: null }; // Reset
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
            result = await this.processWithGemini(message);
        }

        // --- 2. INTERCEPT DANGEROUS ACTIONS ---
        if (result.action === 'drop_table') {
            // Check safety again (redundant but good)
            const tableName = result.data.tableName.toUpperCase();
            if (!tableName.startsWith('TT_')) {
                return {
                    text: `🔒 BLOQUEADO: Por segurança, apenas tabelas temporárias (iniciadas com TT_) podem ser excluídas.`,
                    action: 'text_response'
                };
            }

            // Set State and Ask Confirmation
            this.conversationState = {
                status: 'AWAITING_CONFIRMATION',
                payload: result
            };
            return {
                text: `⚠️ **CONFIRMAÇÃO NECESSÁRIA** ⚠️\n\nVocê pediu para excluir a tabela **${tableName}**.\nEssa ação não pode ser desfeita.\n\nDigite **sim** para confirmar ou qualquer outra coisa para cancelar.`,
                action: 'text_response'
            };
        }

        // LEARN: If action was successful (not null/chat only), log it
        if (result.action && result.action !== 'chat' && result.action !== 'quota_exceeded' && result.action !== 'text_response') {
            learningService.logInteraction(result.action, message, true);
        }

        return result;
    }

    async processWithRegex(message) {
        const cleanMsg = message.trim().replace(/[\[\]]/g, ''); // SANITIZE: Remove brackets [ ] from input

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

                    const indices = indicesRaw.map(i => i.trim()).filter(i => i);
                    const grants = grantsRaw.map(g => g.trim()).filter(g => g);

                    return await this.executeAction({
                        action: 'draft_table',
                        data: { tableName, columns, indices, grants },
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
            text: "🤖 [Modo Local] Não entendi. Tente usar formatos padrão como 'Buscar tabelas de X' ou 'Estrutura da Tabela Y'.",
            action: null
        };
    }

    async processWithGemini(message) {
        try {
            const dbKeywords = ['tabela', 'table', 'dados', 'data', 'registro', 'record', 'busca', 'find', 'encontre', 'select', 'estrutura', 'schema', 'coluna', 'column', 'listar', 'list', 'mostre', 'show', 'quais', 'onde'];
            const isDbQuery = dbKeywords.some(w => message.toLowerCase().includes(w));

            let tableContext = "";
            if (isDbQuery) {
                try {
                    const tables = await db.getTables();
                    tableContext = tables.slice(0, 50).join(", ");
                } catch (e) {
                    console.error("Error fetching tables for context:", e);
                }
            }

            // NEW FRIENDLY PERSONA
            const basePersona = `
            # ROLE & PERSONALITY
            Você é um **Assistente de Dados Inteligente e Amigável** chamado "Assistente HAP".
            
            # ORACLE NAMING STANDARDS & LOGIC
            **Scenario A: LAYMAN User (Generic Description)**
            - User says: "Create table for clients with name, cpf, age"
            - You MUST suggest standard names:
              - TABLE: **TT_CLIENTE** (Default to TT_ for temporary unless specified).
              - COLS: **NM_CLIENTE** (VARCHAR2(100)), **NU_CPF** (NUMBER), **NR_IDADE** (NUMBER).
            
            **Scenario B: EXPERT User (Specific Names)**
            - User says: "Create table my_table with fields x_id number, y_desc varchar"
            - You MUST respect exact names:
              - TABLE: **MY_TABLE**
              - COLS: **X_ID** (NUMBER), **Y_DESC** (VARCHAR)
            
            **Scenario C: UNDERSPECIFIED Request (Missing Info)**
            - User says: "Create table" or "Quero criar uma tabela" (without details).
            - You MUST NOT invent columns.
            - You MUST return a "text_response" asking for details and suggesting the format.
            - Example Text: "Para criar a tabela, preciso saber o nome e os campos. Tente algo como: 'Criar tabela TT_CLIENTE com nome varchar e idade number'."

            **MANDATORY PREFIXES (If suggesting):**
            - Table Default: **TT_** (Temporary).
            - Columns: **CD_** (Code), **NM_** (Name), **DS_** (Desc), **DT_** (Date), **VL_** (Money), **FL_** (Flag), **QT_** (Qty), **NU_** (Number/CPF/CNPJ).

            **SAFETY & DELETION RULES:**
            - **CRITICAL**: You MUST REFUSE to delete/drop any table that does NOT start with **TT_**.
            - If user asks to delete "CLIENTES", reject and explain: "Segurança: Só é permitido excluir tabelas temporárias (iniciadas com TT_)."
            - If user asks to delete "TT_CLIENTES", proceed (confirming first if needed).
            - **CRITICAL**: For DELETE/DROP requests, you MUST return the 'drop_table' action IMMEDIATELY. Do NOT ask for confirmation in the 'text' field. The system handles confirmation.
            
            # ACTIONS (JSON OBRIGATÓRIO)
            Responda SEMPRE com JSON.
            
            1. "draft_table": Params: { "tableName": "TT_NAME", "columns": [{ "name": "CD_ID", "type": "NUMBER" }, ...] }
            2. "list_tables": Params: { "search_term": "..." }
            3. "describe_table": Params: { "table_name": "..." }
            4. "find_record": Params: { "table_name": "...", "value": "...", "column_name": "..." (Opcional) }
            5. "drop_table": Params: { "tableName": "..." } (Para solicitações de exclusão/delete)
            6. "run_sql": Params: { "sql": "..." } (Para qualquer outro comando SQL: TRUNCATE, GRANT, ALTER, etc.)
            7. "text_response": Params: { "message": "..." } (Para dúvidas ou falta de info)
            
            Exemplo "Leigo":
            User: "Tabela de vendas com valor e data"
            JSON: {
               "action": "draft_table",
               "text": "Sugeri uma estrutura padrão para vendas.",
               "data": { "tableName": "TT_VENDA", "columns": [ { "name": "CD_VENDA", "type": "NUMBER" }, { "name": "VL_VENDA", "type": "NUMBER(15,2)" }, { "name": "DT_VENDA", "type": "DATE" } ] }
            }

            Exemplo "Falta Info":
            User: "Crie uma tabela"
            JSON: {
               "action": "text_response",
               "text": "Claro! Qual será o nome e os campos? Exemplo: 'Tabela de Produtos com codigo e preço'."
            }
            `;

            const prompt = `
            ${basePersona}
            Context: [${tableContext}]
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

            // CRITICAL: Return drop_table actions directly to processMessage for interception/confirmation
            if (aiResponse.action === 'drop_table') {
                return aiResponse;
            }

            return await this.executeAction(aiResponse);

        } catch (err) {
            console.error("Gemini Error:", err);
            const msg = err.message || "";

            if (msg.includes('429') || msg.includes('Quota') || msg.includes('Too Many Requests')) {
                return {
                    text: "⏳ **Muitas requisições!** O cérebro da IA está superaquecido (limite da API do Google). Aguarde 30s ou tente comandos simples.",
                    action: null // Action null to just show text
                };
            }

            return { text: "Ops, tive um probleminha para pensar nisso agora: " + msg, action: null };
        }
    }

    async executeAction(aiResponse) {
        const { action, data, text } = aiResponse;

        try {
            if (action === 'list_tables') {
                const term = data.search_term ? data.search_term.trim() : '';
                // SMART SEARCH LOGIC (now centralized here or in db)
                const objects = await db.findObjects(term);

                if (objects.length === 0) {
                    return {
                        text: `Hmm, não encontrei nenhuma tabela ou view com o nome **"${term}"**. Quer tentar outro nome?`,
                        action: 'chat'
                    };
                }

                // Return simple list for now, or FE can handle the array
                return {
                    text: text || `Encontrei estas tabelas para **"${term}"**:`,
                    action: 'list_tables',
                    data: objects.map(o => ({ owner: o.owner, name: o.object_name, comments: o.full_name }))
                };
            }

            if (action === 'describe_table') {
                let tableName = data.table_name.toUpperCase();
                let columns = await db.getColumns(tableName);

                if (!columns.length && !tableName.includes('.')) {
                    // Fallback search
                    const owners = await db.executeQuery(
                        `SELECT OWNER FROM ALL_OBJECTS WHERE OBJECT_TYPE = 'TABLE' AND OBJECT_NAME = :name AND OWNER NOT IN ('SYS','SYSTEM') FETCH NEXT 1 ROWS ONLY`,
                        { name: tableName }
                    );
                    if (owners.rows.length > 0) {
                        tableName = `${owners.rows[0][0]}.${tableName}`;
                        columns = await db.getColumns(tableName);
                    }
                }

                if (!columns.length) return { text: `Não consegui acessar a tabela **${tableName}**. Talvez ela não exista ou eu não tenha permissão.` };

                const responseData = { tableName, columns };
                if (columns.viewDefinition) {
                    responseData.viewDefinition = columns.viewDefinition;
                    responseData.isView = true;
                }

                return {
                    text: text || `Aqui está a estrutura da **${tableName}**:`,
                    action: 'describe_table',
                    data: responseData
                };
            }

            if (action === 'find_record') {
                const result = await this.performFindRecord(data);
                // Fix: Prioritize result.text (error/success) over generic AI text ("Ok seeking...")
                return { ...result, text: result.text || text };
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
                    text: text || `Abri um rascunho para a tabela **${data.tableName}** aqui ao lado.`,
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

            if (action === 'drop_table') {
                const tableName = data.tableName.toUpperCase();
                // Execution logic (db.js might need a specific method, or we use executeQuery)
                // Using executeQuery for generic DDL
                try {
                    await db.executeQuery(`DROP TABLE ${tableName}`);
                    return {
                        text: `✅ Tabela **${tableName}** excluída com sucesso!`,
                        action: 'text_response'
                    };
                } catch (e) {
                    return {
                        text: `❌ Erro ao excluir a tabela **${tableName}**: ${e.message}`,
                        action: 'text_response'
                    };
                }
            }

            if (action === 'run_sql') {
                return {
                    text: `Aqui está o SQL para realizar esta tarefa:\n\n\`\`\`sql\n${data.sql}\n\`\`\``,
                    action: 'chat'
                };
            }

            if (action === 'text_response') {
                return {
                    text: (data && data.message) ? data.message : text,
                    action: 'chat'
                };
            }

            return { text: text, action: 'chat' };

        } catch (err) {
            console.error("Gemini Error:", err);
            const msg = err.message || "";

            if (msg.includes('429') || msg.includes('Quota') || msg.includes('Too Many Requests')) {
                return {
                    text: "⏳ **Muitas requisições!** O cérebro da IA está superaquecido (limite da API do Google). Aguarde 30s ou tente comandos simples.",
                    action: 'text_response'
                };
            }

            if (msg.includes('Safety') || msg.includes('blocked')) {
                return {
                    text: "🛡️ **Bloqueio de Segurança**. A IA achou esse pedido arriscado e bloqueou.",
                    action: 'text_response'
                };
            }

            return { text: "Ops, tive um probleminha técnico: " + msg, action: null };
        }
    }

    async performFindRecord(data) {
        const tableName = data.table_name.toUpperCase();
        const value = data.value;
        const columnName = data.column_name ? data.column_name.toUpperCase() : null;

        try {
            const columns = await db.getColumns(tableName);
            if (!columns.length) return { text: `Tabela ${tableName} não encontrada.` };

            // ORA-01722 Fix: Check if value is numeric
            const isNumeric = !isNaN(parseFloat(value)) && isFinite(value);

            let targetCols = [];

            if (columnName) {
                // User explicitly requested a column
                const col = columns.find(c => c.COLUMN_NAME === columnName);
                if (col) {
                    targetCols = [col];
                } else {
                    // Error: Column not found. Fallback to selection UI.
                    const sortedColumns = columns.sort((a, b) => a.COLUMN_NAME.localeCompare(b.COLUMN_NAME));
                    return {
                        text: `A IA tentou buscar na coluna **${columnName}**, mas ela não existe na tabela **${tableName}**.\n\nPor favor, selecione a coluna correta abaixo:`,
                        action: 'column_selection',
                        data: {
                            tableName: tableName,
                            value: value,
                            columns: sortedColumns.map(c => ({ name: c.COLUMN_NAME, type: c.DATA_TYPE }))
                        }
                    };
                }
            } else {
                // Auto-detect columns
                targetCols = columns.filter(c => {
                    // Safety: If searching for strings (e.g. alphanumeric code), DO NOT include Number columns
                    if (c.DATA_TYPE === 'NUMBER' && !isNumeric) return false;

                    return ['NUMBER', 'VARCHAR2', 'CHAR'].includes(c.DATA_TYPE) &&
                        (
                            c.COLUMN_NAME === 'ID' ||
                            c.COLUMN_NAME.includes('_ID') ||
                            c.COLUMN_NAME.startsWith('COD') ||
                            c.COLUMN_NAME.includes('CPF') ||
                            c.COLUMN_NAME.includes('CNPJ') ||
                            c.COLUMN_NAME.startsWith('NU_') ||
                            c.COLUMN_NAME.startsWith('NR_')
                        );
                });
            }

            if (!targetCols.length && !columnName) {
                const available = columns.map(c => `**${c.COLUMN_NAME}**`).join(', ');
                return { text: `Não identifiquei colunas compatíveis com o valor **"${value}"** na tabela ${tableName}.\n\n(Se o valor for texto, ignorei colunas numéricas).\n\nAs colunas disponíveis são: ${available}.` };
            }

            const conditions = targetCols.map(c => `${c.COLUMN_NAME} = :val`).join(' OR ');
            const sql = `SELECT * FROM ${tableName} WHERE ${conditions} FETCH NEXT 5 ROWS ONLY`;

            const result = await db.executeQuery(sql, { val: value }, 10, { outFormat: db.oracledb.OUT_FORMAT_OBJECT });

            if (!result.rows.length) {
                // UX Upgrade: Return structured action for interactive column selection
                const searchedCols = targetCols.map(c => `\`${c.COLUMN_NAME}\``).join(', ');

                // Sort columns: Suggested first (if any matched logic), then Alphabetical
                const sortedColumns = columns.sort((a, b) => a.COLUMN_NAME.localeCompare(b.COLUMN_NAME));

                return {
                    text: `Não encontrei o registro **${value}** na tabela **${tableName}**.\n\nBusquei automaticamente nas colunas: ${searchedCols}.\n\nPara onde devo olhar agora? Selecione abaixo:`,
                    action: 'column_selection',
                    data: {
                        tableName: tableName,
                        value: value,
                        columns: sortedColumns.map(c => ({ name: c.COLUMN_NAME, type: c.DATA_TYPE }))
                    }
                };
            }

            return {
                text: `Encontrei estes registros:`,
                action: 'show_data',
                data: { metaData: result.metaData, rows: result.rows }
            };
        } catch (e) {
            return { text: `Erro na busca: ${e.message}` };
        }
    }
}

module.exports = new AiService();
