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
                return { text: `SQL sugerido:\n\`\`\`sql\n${data.sql}\n\`\`\``, action: 'chat' };
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

    async performFindRecord(data) {
        const tableName = data.table_name.toUpperCase();
        const value = data.value;
        const columnName = data.column_name ? data.column_name.toUpperCase() : null;

        try {
            const columns = await db.getColumns(tableName);
            if (!columns.length) return { text: `Tabela ${tableName} não encontrada.` };

            const isNumeric = !isNaN(parseFloat(value)) && isFinite(value);
            let targetCols = [];

            if (columnName) {
                const col = columns.find(c => c.COLUMN_NAME === columnName);
                if (col) {
                    targetCols = [col];
                } else {
                    const sortedColumns = columns.sort((a, b) => a.COLUMN_NAME.localeCompare(b.COLUMN_NAME));
                    return {
                        text: `Coluna **${columnName}** não encontrada em **${tableName}**. Selecione abaixo:`,
                        action: 'column_selection',
                        data: {
                            tableName: tableName,
                            value: value,
                            columns: sortedColumns.map(c => ({ name: c.COLUMN_NAME, type: c.DATA_TYPE }))
                        }
                    };
                }
            } else {
                targetCols = columns.filter(c => {
                    if (c.DATA_TYPE === 'NUMBER' && !isNumeric) return false;
                    return ['NUMBER', 'VARCHAR2', 'CHAR'].includes(c.DATA_TYPE) &&
                        (c.COLUMN_NAME === 'ID' || c.COLUMN_NAME.includes('_ID') || c.COLUMN_NAME.startsWith('COD') ||
                            c.COLUMN_NAME.includes('CPF') || c.COLUMN_NAME.includes('CNPJ') || c.COLUMN_NAME.startsWith('NR_'));
                });
            }

            if (!targetCols.length && !columnName) {
                const available = columns.map(c => `**${c.COLUMN_NAME}**`).join(', ');
                return { text: `Colunas incompatíveis com "${value}".\nDisponíveis: ${available}.` };
            }

            const conditions = targetCols.map(c => `${c.COLUMN_NAME} = :val`).join(' OR ');
            const sql = `SELECT * FROM ${tableName} WHERE ${conditions} FETCH NEXT 5 ROWS ONLY`;

            const result = await db.executeQuery(sql, { val: value }, 10, { outFormat: db.oracledb.OUT_FORMAT_OBJECT });

            if (!result.rows.length) {
                const searchedCols = targetCols.map(c => `\`${c.COLUMN_NAME}\``).join(', ');
                const sortedColumns = columns.sort((a, b) => a.COLUMN_NAME.localeCompare(b.COLUMN_NAME));
                return {
                    text: `Registro **${value}** não encontrado em: ${searchedCols}. Selecione outra coluna:`,
                    action: 'column_selection',
                    data: {
                        tableName: tableName,
                        value: value,
                        columns: sortedColumns.map(c => ({ name: c.COLUMN_NAME, type: c.DATA_TYPE }))
                    }
                };
            }

            return {
                text: `Encontrei:`,
                action: 'show_data',
                data: { metaData: result.metaData, rows: result.rows }
            };
        } catch (e) {
            return { text: `Erro na busca: ${e.message}` };
        }
    }

    async processText(text, instruction) {
        if (!this.groq) {
            return "⚠️ IA não configurada (Sem API Key).";
        }

        try {
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
        1. Retorne APENAS o código SQL corrigido dentro de um bloco markdown (\`\`\`sql ... \`\`\`).
        2. A primeira linha do SQL DEVE ser um comentário (\`--\`) explicando o que foi corrigido.
        3. Formate o código para leitura.`;

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
        const systemPrompt = `Você é uma Engine de Otimização SQL.
        Sua tarefa é REESCREVER a query SQL para máxima performance.
        
        REGRAS RÍGIDAS:
        1. Retorne APENAS o código SQL dentro de um bloco markdown (\`\`\`sql ... \`\`\`).
        2. O SQL deve iniciar com o comentário: "-- Otimizado"
        3. NÃO inclua explicações, análises ou texto "Aqui está". APENAS O CÓDIGO.
        4. Se o SQL já estiver ótimo, retorne-o exatamente igual, apenas adicionando o comentário "-- Validado (Performance OK)" no topo.
        5. Melhore: SARGABILITY, JOINs (Preferencialmente ANSI), e remova SELECT * se possível (mas mantenha * se não souber as colunas).
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
        1. Retorne APENAS o SQL dentro de bloco markdown.
        2. Inclua comentário explicativo curto acima do SQL se necessário.
        3. Use aliases curtos (t1, p) e formate bem o código.`;

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
}

module.exports = new AiService();
