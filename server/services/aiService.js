const Groq = require("groq-sdk");
const db = require('../db');
const learningService = require('./learningService');
const knowledgeService = require('./knowledgeService');
const neuralService = require('./neuralService');
const agentService = require('./agentService');
const chatService = require('./chatService'); // Imported for state management

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
                // FIND RECORD (Natural Language & Flexible)
                // Matches: "buscar registro onde cpf 123 na tabela pessoa", "encontre id 5 em usuarios"
                regex: /(?:encontre|busque|ache|visualizar|olhar|ver|me mostra|traz)\s+(?:o\s+)?(?:registro|id|código|o\s+dado|a\s+linha)?\s*(?:onde|com|cujo|que\s+tenha)?\s*(?:o|a)?\s*(?:cpf|cnpj|id|código|nome|valor)?\s*[:=]?\s*([a-zA-Z0-9_\-,\.\s]+)\s+(?:na|em|da|do)\s+(?:tabela\s+(?:de|do|da)?\s*)?([a-zA-Z0-9_$#\.]+)/i,
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

        // --- SYSTEM PROMPT (AUTONOMOUS AGENT) ---


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
            // [NEW] Clear ChatService State
            chatService.clearConversationState(userId);
            console.log(`[SESSION] Context cleared for user ${userId}`);
            return { text: null, action: 'silent_ack' };
        }

        // --- 1.1b HANDLE PENDING FLOW CHECK (Smart Continuation) ---
        // If user is in the middle of a flow (e.g. AWAITING_COLUMN), and types something that looks like a new request,
        // we should ask if they want to abandon the current flow.
        const currentState = chatService.getConversationState(userId);
        if (currentState && (currentState.step === 'AWAITING_COLUMN_OR_VALUE' || currentState.step === 'AWAITING_VALUE')) {
            const isSystemCommand = message.startsWith('[') || message.startsWith('Buscar nestas colunas');
            const isConfirmation = message.match(/^(sim|ok|confirmo|yes|s|certo|continuar|não|nao|no|cancelar|pare)/i);

            // If it's NOT a system command AND NOT a confirmation/continuation answer
            if (!isSystemCommand && !isConfirmation) {
                // Check if user wants to reset
                if (message.match(/^(novo|nova|inicio|reset|cancelar|parar|sair)/i)) {
                    chatService.clearConversationState(userId);
                    return { text: "Fluxo anterior cancelado. Como posso ajudar agora?", action: 'chat' };
                }

                // Ask for clarification
                const pendingTable = currentState.context.table || 'Tabela';
                return {
                    text: `Você tem uma busca pendente na tabela ** ${pendingTable}**.Deseja continuar com ela ?\n(Responda ** Sim ** para continuar ou ** Não ** para iniciar uma nova busca)`,
                    action: 'ask_continuation', // Frontend can handle this specifically or just chat
                    data: { pendingState: currentState }
                };
            }

            // If user says "NO" to continuation (handled here or in generic match above?)
            // If message is "não", we should probably clear.
            if (message.match(/^(não|nao|no|cancelar)/i)) {
                chatService.clearConversationState(userId);
                return { text: "Entendido. Busca cancelada. O que deseja fazer?", action: 'chat' };
            }
        }

        // --- 1.2 HANDLE DEEP ANALYSIS TRIGGER (SmartAnalysisPanel) ---
        // Context Setting
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

        // Update Search (Live Edit)
        if (message.startsWith('[SYSTEM: UPDATE_SEARCH]')) {
            const newValue = message.replace('[SYSTEM: UPDATE_SEARCH]', '').trim();
            console.log(`[FLOW] Update Search requested: ${newValue} `);

            // Retrieve last context
            if (session.lastPayload && session.lastTable) {
                const newPayload = {
                    ...session.lastPayload,
                    value: newValue,
                    table_name: session.lastTable
                };
                return await this.performFindRecord(newPayload, userId);
            } else {
                return { text: "⚠️ Não foi possível atualizar a busca (Contexto perdido). Por favor, inicie uma nova busca.", action: 'chat' };
            }
        }

        // Deep Analysis Trigger
        if (message.startsWith('Analise a tabela')) {
            const tableName = message.replace('Analise a tabela', '').trim();
            console.log(`[FLOW] Deep Analysis requested for: ${tableName} `);

            try {
                // 1. Fetch Columns
                const columns = await db.getColumns(tableName);

                // 2. Identify Context (What was the user looking for?)
                const state = chatService.getConversationState(userId);
                const context = state?.context || {};
                const userQuery = context.initial_input || context.suggested_column || "";

                console.log(`[FLOW] Context for analysis: `, context);

                // 3. Perform Match & Value Extraction
                let searchTerm = null;
                const queryParts = userQuery.toUpperCase().split(/[\s,]+/);

                const enrichedColumns = columns.map(col => {
                    const colName = (col.COLUMN_NAME || col.name || "").toUpperCase();
                    let isMatch = false;

                    // Direct checks
                    if (context.suggested_column && colName === context.suggested_column.toUpperCase()) isMatch = true;

                    // Token intersection check (Fuzzy match)
                    // If column name alias matches parts of the query (e.g. "EMPRESA" in "CD_EMPRESA_PLANO")
                    const colParts = colName.split(/[_]+/);
                    const matchCount = colParts.filter(p => queryParts.includes(p)).length;

                    if (matchCount > 0) {
                        isMatch = true;
                        // [NEW] Heuristic: If this column matches words in the query, the REST of the query might be the value.
                        // We accumulate "matched tokens" to subtract later? 
                        // Simpler: If we find a strong match, we try to isolate the numeric/value part of the query.
                    }

                    // Priority columns if no specific match found yet
                    if (!isMatch && ['NOME', 'DESCRICAO', 'TITULO', 'CPF', 'CNPJ', 'ID', 'CODIGO'].some(k => colName.includes(k))) {
                        // Only if we really have no clue? Let's be conservative.
                        // isMatch = true; // Don't auto-match everything, it pollutes logic.
                    }

                    return { ...col, suggested: isMatch, matchScore: matchCount };
                });

                // [NEW] Advanced Value Extraction
                // Remove words that matched columns, leave the rest as "Value"
                const matchedColNames = enrichedColumns.filter(c => c.suggested).map(c => c.COLUMN_NAME || c.name);
                let residualQuery = userQuery;

                // 1. Specific Pattern Extraction (Strongest)
                const valueMatch = userQuery.match(/(?:cpf|cnpj|id|código|code|identidade|rg|valor|matricula|plano)[:\s]+([0-9.\-\/]+)/i);
                if (valueMatch) {
                    searchTerm = valueMatch[1].trim();
                } else {
                    // 2. Residual Extraction
                    // Remove matched tokens
                    matchedColNames.forEach(cName => {
                        const parts = cName.split('_');
                        parts.forEach(p => {
                            if (p.length > 2) { // Only remove significant words
                                const regex = new RegExp(`\\b${p} \\b`, 'gi');
                                residualQuery = residualQuery.replace(regex, '');
                            }
                        });
                    });

                    // Remove common stop words
                    residualQuery = residualQuery.replace(/\b(da|de|do|em|na|no|tabela|buscar|procurar|encontrar|onde|igual|a)\b/gi, '');
                    // Clean up
                    searchTerm = residualQuery.replace(/[^\w\s\-,.]/gi, '').trim();
                }

                // Cleanup: If the searchTerm is basically empty or just noise, ignore it
                if (searchTerm && searchTerm.length < 2 && !/^\d+$/.test(searchTerm)) {
                    searchTerm = null;
                }

                // If the userQuery was "empresa plano 15", and we matched "empresa" and "plano", residual is "15".
                // searchTerm should be "15".

                // Update State - FORCE update context to avoid stale "initial_input" from previous turns if this was a fresh start
                // How do we know if it's a fresh start? 
                // The prompt message "Analise a tabela" implies a new focus.
                chatService.setConversationState(userId, {
                    step: 'AWAITING_COLUMN_OR_VALUE',
                    context: { ...context, table: tableName }
                    // We don't clear initial_input here because it's the source of truth for the current analysis
                });

                return {
                    text: `Analisei a tabela ** ${tableName}**.${searchTerm ? ` Detectei busca por: **"${searchTerm}"**` : ''} `,
                    action: 'column_selection_v2',
                    data: enrichedColumns.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0)), // Sort by relevance
                    searchTerm: searchTerm
                };

            } catch (e) {
                console.error("Deep Analysis Failed:", e);
                return { text: "Falha ao analisar tabela: " + e.message, action: 'chat' };
            }
        }

        // --- 1.3 HANDLE COLUMN CONFIRMATION & SEARCH ---
        if (message.startsWith('Buscar nestas colunas:')) {
            const rawCols = message.replace('Buscar nestas colunas:', '').trim();
            console.log(`[FLOW] Column Search requested: ${rawCols} `);

            try {
                // 1. Get Table Context
                const state = chatService.getConversationState(userId);
                // Fallback: Check session.context.table OR session.lastTable (legacy)
                const tableName = state?.context?.table || session.lastTable || session.context?.table;

                if (!tableName) {
                    return { text: "⚠️ Desculpe, perdi a referência da tabela. Por favor, selecione a tabela novamente.", action: 'chat' };
                }

                // 2. Parse Columns and Search Term
                // Format expected: "Col1, Col2 | FILTER: searchTerm"
                let columnsPart = rawCols;
                let searchTerm = null;

                if (rawCols.includes('| FILTER:')) {
                    const parts = rawCols.split('| FILTER:');
                    columnsPart = parts[0].trim();
                    searchTerm = parts[1].trim();
                }

                const columns = columnsPart.split(',').map(c => c.trim()).filter(c => c);
                if (columns.length === 0) {
                    return { text: "⚠️ Nenhuma coluna identificada.", action: 'chat' };
                }

                // 3. Construct Query with Type Intelligence
                // Fetch column metadata to know types
                const tableColumns = await db.getColumns(tableName);
                const safeTable = tableName.replace(/[^a-zA-Z0-9_.]/g, ''); // Allow dots for schema.table

                let whereClause = "";
                let useLimit = true; // [NEW] Control LIMIT usage

                if (searchTerm) {
                    const cleanTerm = searchTerm.replace(/'/g, "''").trim();
                    const isNumericSearch = /^[0-9,.\s]+$/.test(cleanTerm);

                    const conditions = columns.map(colName => {
                        const colMeta = tableColumns.find(c => c.name === colName || c.COLUMN_NAME === colName);
                        // Case-insensitive find to be safe
                        const colMetaSafe = colMeta || tableColumns.find(c => c.name.toUpperCase() === colName.toUpperCase() || c.COLUMN_NAME.toUpperCase() === colName.toUpperCase());

                        const isNumericCol = colMetaSafe && (colMetaSafe.DATA_TYPE === 'NUMBER' || colMetaSafe.type === 'NUMBER');

                        if (isNumericCol && isNumericSearch) {
                            // If user provides specific IDs, we DO NOT limit rows.
                            useLimit = false;

                            // Clean term for numeric usage (remove non-digits/dots/commas)
                            // If it matches a list pattern "1, 2, 3"
                            if (cleanTerm.includes(',') || cleanTerm.includes(' ')) {
                                const numbers = cleanTerm.split(/[, ]+/).map(n => n.replace(/[^0-9.]/g, '')).filter(n => n);
                                return `${colName} IN(${numbers.join(', ')})`;
                            } else {
                                const num = cleanTerm.replace(/[^0-9.]/g, '');
                                return `${colName} = ${num} `;
                            }
                        } else {
                            // Text search default - wrap column in UPPER for case-insensitive search if needed
                            // Note: Oracle's UPPER is safe for numbers too, but less efficient.
                            return `UPPER(${colName}) LIKE UPPER('%${cleanTerm}%')`;
                        }
                    });

                    whereClause = `WHERE ${conditions.join(' OR ')} `;
                }

                const limitClause = useLimit ? "FETCH NEXT 100 ROWS ONLY" : "";
                const query = `SELECT * FROM ${safeTable} ${whereClause} ${limitClause} `;

                console.log(`[FLOW] Executing Query: ${query} `);

                // 4. Execute
                const result = await db.executeQuery(query);

                return {
                    text: `Encontrei ** ${result.rows.length} registros ** com as colunas selecionadas em ** ${tableName}**.`,
                    action: 'show_data',
                    data: {
                        tableName: tableName,
                        metaData: result.metaData ? result.metaData.map(c => ({ name: c.name, type: c.dbType?.name || 'VARCHAR' })) : columns.map(c => ({ name: c.toUpperCase(), type: 'VARCHAR2' })),
                        columns: result.metaData ? result.metaData.map(c => ({ name: c.name, type: c.dbType?.name || 'VARCHAR' })) : columns.map(c => ({ name: c.toUpperCase(), type: 'VARCHAR2' })), // [NEW] Legacy Fallback
                        rows: result.rows
                    }
                };

            } catch (e) {
                console.error("Column Search Failed:", e);
                return { text: "Falha ao consultar dados: " + e.message, action: 'chat' };
            }
        }

        // --- 1.1b HANDLE CONVERSATIONAL FIND FLOW (STATE MACHINE) ---
        const state = chatService.getConversationState(userId);

        // A. INITIAL TRIGGER
        if (message === '[SYSTEM_INIT_FIND_FLOW]') {
            console.log(`[FLOW: INIT] User ${userId} started find record flow.`);
            chatService.setConversationState(userId, { step: 'AWAITING_TABLE', context: {} });
            return {
                text: "O que você deseja encontrar? (Ex: 'Cliente 123' ou 'Contrato X')",
                action: 'chat' // Just a prompt
            };
        }

        // B. STATE: AWAITING_TABLE
        if (state && state.step === 'AWAITING_TABLE') {
            console.log(`[FLOW: AWAITING_TABLE] Processing input: ${message} `);

            // 1. NLP Extraction (Intelligent parsing)
            let intentData = { table: null, column: null, value: null };

            if (this.groq) {
                try {
                    const intentPrompt = `
                        Analise a frase de busca: "${message}".
                        Extraia os conceitos em JSON(sem markdown):
        {
            "table": "nome provável da tabela ou conceito (ex: cliente)",
                "column": "nome da coluna ou conceito (ex: contrato, cpf)",
                    "value": "valor da busca (ex: 123, Maria)",
                        "is_explicit_table": boolean(true se o usuário citou 'tabela' explicitamente)
        }
        `;
                    const extracted = await this.promptLLM(intentPrompt);
                    const jsonStr = extracted.replace(/```json /g, '').replace(/```/g, '').trim();
                    intentData = JSON.parse(jsonStr);
                    console.log("[FLOW] NLP Intent:", intentData);
                } catch (e) {
                    console.warn("[FLOW] NLP specific parsing failed, falling back to basic extraction.", e);
                    // Fallback basic extraction
                    // [FIX] Allow spaces for multi-word tables (e.g. "tabela empresa conveniada")
                    // Stop at obvious delimiters like "onde", "com", "que" if needed, or just grab the phrase.
                    const tableMatch = message.match(/(?:tabela|de|em)\s+([a-zA-Z0-9_$#\.\s]+?)(?:\s+(?:onde|com|que|cujo)|$)/i);
                    intentData.table = tableMatch ? tableMatch[1].trim() : message.trim();
                }
            } else {
                intentData.table = message.trim();
            }

            // 2. Resolve Table
            let tables = [];
            // A. Try explicit table search first
            if (intentData.table && intentData.table !== 'null') {
                tables = await db.findObjects(intentData.table);
            }

            // B. If no table found, but we have a column concept (Reverse Lookup)
            // Example: "Find contract 123" -> Table is null, Column is "contract"
            if (tables.length === 0 && intentData.column && intentData.column !== 'null') {
                console.log(`[FLOW] Reverse Lookup for column: ${intentData.column}`);
                const reverseTables = await db.findTablesByColumn(intentData.column);
                if (reverseTables.length > 0) {
                    tables = reverseTables;
                    // We trust these tables contain the column, so we might want to hint that.
                }
            }

            // 3. Handle Results
            if (tables.length === 0) {
                return {
                    text: `Não encontrei tabela ou coluna relacionada a "${intentData.table || intentData.column || message}". Tente ser mais específico, ex: "Contrato 123 na tabela Vendas".`,
                    action: 'chat'
                };
            } else if (tables.length === 1) {
                // Exact Match
                const selectedTable = tables[0].full_name || tables[0].object_name;

                // If we also extracted a VALUE, we might be able to jump ahead?
                // For now, let's Stick to Protocol but Pre-Fill context
                chatService.setConversationState(userId, {
                    step: 'AWAITING_COLUMN_OR_VALUE',
                    context: {
                        table: selectedTable,
                        initial_input: message,
                        suggested_column: intentData.column,
                        suggested_value: intentData.value
                    }
                });

                // Check if we can auto-suggest the column confirmation
                let responseText = `Encontrei a tabela **${selectedTable}**.`;
                if (intentData.column && intentData.value) {
                    responseText += ` Deseja buscar **${intentData.value}** na coluna **${intentData.column}**? (Responda Sim ou informe a coluna correta)`;
                } else {
                    responseText += ` Qual coluna deseja filtrar?`;
                }

                return {
                    text: responseText,
                    action: 'column_selection_v2',
                    data: await db.getColumns(selectedTable)
                };

            } else {
                // Ambiguous - [NEW] Confidence-Based Logic

                // 1. Calculate Scores
                const candidates = tables.map(t => {
                    const score = this.calculateMatchScore(intentData.table, t.object_name);
                    return { ...t, score };
                }).sort((a, b) => b.score - a.score);

                const topCandidate = candidates[0];
                const highConfidenceCandidates = candidates.filter(c => c.score >= 0.9);

                // 2. Decision Matrix
                // A. Clear Winner (Score >= 0.93 [User Req])
                if (topCandidate.score >= 0.93 && (candidates.length === 1 || (candidates[1] && topCandidate.score - candidates[1].score > 0.3))) {
                    // Treat as exact match (Auto-JUMP)
                    return this.handleTableSelection(userId, topCandidate.object_name, intentData);
                }

                // B. Small Set of High Confidence (<= 3 items with Score >= 0.83)
                const showableCandidates = candidates.filter(c => c.score >= 0.83).slice(0, 3);

                if (showableCandidates.length > 0 && showableCandidates.length <= 3) {
                    chatService.setConversationState(userId, {
                        step: 'RESOLVING_TABLE',
                        context: { initial_input: message }
                    });

                    return {
                        text: `Encontrei **${showableCandidates.length}** tabelas com alta relevância para "${intentData.table}". Qual delas?`,
                        action: 'table_selection_v2',
                        data: showableCandidates.map(t => ({
                            owner: t.owner,
                            table_name: t.object_name,
                            full_name: t.full_name,
                            comments: t.comments || `Confiança: ${(t.score * 100).toFixed(0)}%`
                        }))
                    };
                }

                // C. Too Many or Low Confidence -> ASK (The "Think" Loop)
                // Use LLM to generate a smart clarifying question based on the top candidates
                const topNames = candidates.slice(0, 5).map(c => c.object_name).join(', ');

                return {
                    text: `Encontrei **${tables.length}** tabelas relacionadas a "${intentData.table}", mas não tenho certeza qual você quer (Ex: ${topNames}...). \n\nPoderia ser mais específico? Diga o **nome completo** ou um **campo** que essa tabela deve ter.`,
                    action: 'chat'
                };
            }
        }

        // C. STATE: RESOLVING_TABLE (User clicked a table pill or typed specific name)
        if (state && state.step === 'RESOLVING_TABLE') {
            // [NEW] 1. Rejection Handler
            if (message.match(/^(não|nao|nenhuma|errado|incorreto|not)/i)) {
                chatService.clearConversationState(userId);
                return {
                    text: "Entendido. Aparentemente não encontrei a tabela certa. 😓\n\nPoderia me dizer o **nome correto** ou um **termo diferente** para eu buscar?",
                    action: 'chat'
                };
            }

            // Assume input is the table name selected/typed
            // If it came from button, it might be [SELECTION_TABLE] X.
            // Let's assume plain text for now, or check for specific protocol.

            let selectedTable = message.trim();
            if (message.startsWith('[SYSTEM_SELECTION_TABLE]')) {
                selectedTable = message.replace('[SYSTEM_SELECTION_TABLE]', '').trim();
            } else if (message.startsWith('[SELECTION_TABLE]')) {
                selectedTable = message.replace('[SELECTION_TABLE]', '').trim();
            }

            // Verify
            const cols = await db.getColumns(selectedTable);
            if (cols.length > 0) {
                // [NEW] Use helper
                return this.handleTableSelection(userId, selectedTable, state.context);
            } else {
                return { text: `Não consegui ler a tabela ${selectedTable}. Tente outra.`, action: 'chat' };
            }
        }
    }

    // [NEW] Helper for Match Scoring
    calculateMatchScore(term, tableName) {
        if (!term || !tableName) return 0;
        const cleanTerm = term.toUpperCase().replace(/[^A-Z0-9\s]/g, '').trim(); // Keep spaces for tokenization
        const cleanTable = tableName.toUpperCase().replace(/[^A-Z0-9]/g, '');

        let score = 0.0;

        // 1. Base String Score (Exact or Containment)
        if (cleanTable === cleanTerm.replace(/\s/g, '')) {
            score = 1.0;
        } else if (cleanTable.includes(cleanTerm.replace(/\s/g, ''))) {
            // Contiguous match (e.g. "PESSOA" in "TB_PESSOA")
            const ratio = cleanTerm.length / cleanTable.length;
            score = 0.6 + (ratio * 0.4);
        } else {
            // 1.1 Token-Based Matching (New Requirement: "empresa conveniada" -> "TB_EMPRESA_CONVENIADA")
            const tokens = cleanTerm.split(/\s+/).filter(t => t.length > 2); // Ignore 'da', 'de'
            if (tokens.length > 1) {
                let matches = 0;
                tokens.forEach(token => {
                    if (cleanTable.includes(token)) matches++;
                });

                // If ALL tokens match, high confidence
                if (matches === tokens.length) {
                    score = 0.95; // Very strong signal
                } else if (matches > 0) {
                    // Partial token match
                    score = 0.5 + (matches / tokens.length * 0.4);
                }
            } else if (tokens.length === 1) {
                // Single word fallback
                if (cleanTable.includes(tokens[0])) {
                    score = 0.5;
                }
            }
        }

        // 2. [NEW] Neural Memory Boost
        try {
            const activations = neuralService.activate(term);
            const memoryHit = activations.find(node => node.id === tableName.toUpperCase());
            if (memoryHit) {
                console.log(`[NEURAL] Memory Hit: ${term} -> ${tableName} (Weight: ${memoryHit.relevance})`);
                // Add significant boost
                score += memoryHit.relevance;
            }
        } catch (e) {
            console.warn("[NEURAL] Validation failed:", e);
        }

        return Math.min(score, 2.0);
    }

    // [NEW] Helper for Transitioning to Column Selection
    async handleTableSelection(userId, tableName, contextData) {
        // [NEW] Teach Neural Network (Success Memory)
        if (contextData.initial_input) {
            // Learn: Initial Term -> Selected Table
            // Extract the "Concept" from the initial input if possible, or use the whole short phrase
            // Simple heuristic: If input is short (< 30 chars), treat as Term.
            const term = contextData.initial_input.trim();
            if (term.length < 30) {
                neuralService.addEdge(term, tableName, 1.0, 'user_defined');
                console.log(`[NEURAL] Learned: "${term}" -> ${tableName}`);
            }
        }

        // Fetch Columns
        const cols = await db.getColumns(tableName);

        chatService.setConversationState(userId, {
            step: 'AWAITING_COLUMN_OR_VALUE',
            context: {
                table: tableName,
                initial_input: contextData.initial_input,
                suggested_column: contextData.suggested_column || contextData.column,
                suggested_value: contextData.suggested_value || contextData.value
            }
        });

        let responseText = `Tabela **${tableName}** selecionada.`;
        if (contextData.column && contextData.value) {
            responseText += ` Deseja buscar **${contextData.value}** na coluna **${contextData.column}**?`;
        } else {
            responseText += ` Qual coluna deseja filtrar?`;
        }

        return {
            text: responseText,
            action: 'column_selection_v2',
            data: cols.map(c => c.name) // Simple list, deep analysis happens if they select 'Analise a tabela'
        };

        // D. STATE: AWAITING_COLUMN_OR_VALUE
        if (state && state.step === 'AWAITING_COLUMN_OR_VALUE') {
            const table = state.context.table;
            const suggestedCol = state.context.suggested_column;
            const suggestedVal = state.context.suggested_value;

            let input = message.trim();

            // Handle Auto-Confirmation logic
            // If we suggested "Search 123 in Contract?" and user says "Sim"
            if (suggestedCol && suggestedVal && (input.match(/^(sim|ok|confirmo|yes|s|certo)/i))) {
                // Fast-track to execution
                chatService.setConversationState(userId, {
                    step: 'AWAITING_VALUE',
                    context: { ...state.context, column: suggestedCol, value: suggestedVal } // Pre-fill value
                });
                // We recursively call logic or just verify column here? 
                // Let's verify column to be safe
                input = suggestedCol;
            }

            let col = input;
            if (message.startsWith('[SELECTION_COLUMN]')) {
                col = message.replace('[SELECTION_COLUMN]', '').trim();
            }

            // Check if it's a valid column
            const cols = await db.getColumns(table);
            const validCol = cols.find(c => c.name.toUpperCase() === col.toUpperCase());

            // If not exact match, try fuzzy if user typed a name
            let bestMatch = validCol;
            if (!bestMatch && !message.startsWith('[SELECTION_COLUMN]')) {
                bestMatch = cols.find(c => c.name.toUpperCase().includes(col.toUpperCase()));
            }

            if (bestMatch) {
                // Column Identified.
                // If we ALREADY have a value (from one-shot), use it.
                if (suggestedVal && (input.match(/^(sim|ok)/i) || bestMatch.name.toUpperCase().includes(suggestedCol?.toUpperCase()))) {
                    // Proceed directly to search
                    // We skip AWAITING_VALUE step if we have it
                    return this.performSearch(userId, table, bestMatch.name, suggestedVal);
                }

                chatService.setConversationState(userId, {
                    step: 'AWAITING_VALUE',
                    context: { ...state.context, column: bestMatch.name }
                });
                return {
                    text: `Busca pela coluna **${bestMatch.name}**. Qual o valor?`,
                    action: 'chat'
                };
            } else {
                // Not a column? Maybe it's the value and user expects us to guess the column?
                // Complex. For V1, force column selection if loop.
                // Or try LLM helper to guess column "WHERE X = message"
                return {
                    text: `Coluna "${col}" não encontrada em ${table}. Selecione abaixo:`,
                    action: 'column_selection_v2',
                    data: cols.map(c => c.name)
                };
            }
        }

        // E. STATE: AWAITING_VALUE
        if (state && state.step === 'AWAITING_VALUE') {
            const { table, column } = state.context;
            const value = message.trim();
            return this.performSearch(userId, table, column, value);
        }

        // --- END CONVERSATIONAL FLOW ---


        // --- 1.1 HANDLE LEARNING RESPONSES (Phase 1) ---
        if (session.status === 'AWAITING_TABLE_SELECTION') {
            // User selected a table. Learn connection: originalTerm -> selectedTable
            const selectedTable = message.match(/(?:Consultar tabela|Use a tabela|\[SYSTEM_SELECTION_TABLE\])\s+([a-zA-Z0-9_$.]+)/i)?.[1]?.trim().toUpperCase();
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
            const colMatch = message.match(/(?:coluna|colunas|\[SELECTION_COLUMN\])\s+([a-zA-Z0-9_$#]+)/i);
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

    // Helper Method
    async performSearch(userId, table, column, value) {
        chatService.clearConversationState(userId);
        return await this.executeAction({
            action: 'find_record',
            data: { table_name: table, column_name: column, value: value },
            text: `Buscando **${value}** em **${table}.${column}**...`
        }, userId);
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
        VOCÊ É UM AGENTE DE DADOS AUTÔNOMO E ESPECIALISTA EM ORACLE (HAPVIDA).
        SUA MISSÃO: Entender a intenção do usuário, explorar o banco de dados e apresentar a resposta final ou a ferramenta correta.

        ## MAPA MENTAL DO AMBIENTE (HAPVIDA)
        Use este conhecimento para decidir ONDE buscar:
        - **Schema HUMASTER:** Dados legados, "Sigo", "Beneficiários Antigos", "Empresas Conveniadas".
        - **Schema INCORPORA:** Dados novos, "Repasse", "Ajustes", tabela \`tb_ope_ajustes_de_para_repasse\`.
        - **Conceitos Chave:**
          - "Carteirinha" pode ser \`CD_USUARIO\` (Humaster) ou \`CARTEIRINHA_SIGO\`/\`CREDENCIAL\` (Incorpora).
          - "Empresa" pode ser \`CONGENERE\` ou \`ESTIPULANTE\`.
        
        ${knowledgeContext || ''}
        ${neuralContext || ''}

        ## PROTOCOLO DE BUSCA (RACIOCÍNIO)
        Para cada input, siga estes passos:
        1. **Classificar Intenção:** O usuário quer um dado específico (Filtro) ou uma visão geral?
        2. **Resolver Ambiguidade:** Se o usuário disser "Carteirinha", verifique o contexto. Se for "Repasse", priorize \`INCORPORA\`. Se for "Plano", priorize \`HUMASTER\`.
        
        3. CALCULAR CONFIANÇA E AGIR (RÉGUA DE DECISÃO)
           - *100%:* Termos técnicos exatos encontrados (ex: "CD_OPERADORA").
           - **Cenário A (Match Exato / >90%):** O termo do usuário bate com uma tabela/coluna existente (ex: "Empresa" -> \`TB_EMPRESA\`).
             -> **AÇÃO:** Gerar o SQL imediatamente.
           
           - **Cenário B (Ambiguidade / 50-89%):** O termo retorna múltiplas possibilidades (ex: "Carteirinha" -> \`CD_USUARIO\` ou \`CARTEIRINHA_SIGO\`).
             -> **AÇÃO:** Listar as opções encontradas e perguntar: "Encontrei referências em X e Y. Qual você deseja?"
           
           - **Cenário C (NÃO ENCONTRADO / <50%):** O termo não tem semelhança com nenhum objeto do banco.
             -> **AÇÃO (CRÍTICA):** NÃO invente SQL. Retorne uma mensagem clara:
                "Não consegui localizar nenhuma tabela ou coluna associada ao termo '{termo}'. Você saberia o nome técnico ou um sinônimo usado no sistema?"

        # SUAS FERRAMENTAS (Comandos JSON)
        Para agir, retorne APENAS um JSON:
        
        1. **list_tables**: Para encontrar tabelas.
           JSON: { "action": "list_tables", "term": "termo_de_busca" }
           
        2. **describe_table**: Para ver colunas/estrutura.
           JSON: { "action": "describe_table", "tableName": "NOME_TABELA" }
           
        3. **find_record**: Para buscar dados específicos.
           JSON: { "action": "find_record", "data": { "table_name": "NOME_TABELA", "value": "VALOR_BUSCADO" } }
           
        4. **run_sql**: Para consultas complexas ou listagens gerais.
           JSON: { "action": "run_sql", "sql": "SELECT ...", "limit": 500 }
        
        5. **draft_table**: Para criar novas tabelas.
           JSON: { "action": "draft_table", "tableName": "NOME", "columns": [{ "name": "ID", "type": "NUMBER" }] }

        # DATASET DE TREINAMENTO (FEW-SHOT EXAMPLES)
        Use estes exemplos para calibrar suas respostas:
        
        [
          {
            "contexto": "Card Buscar Registro - Busca Exata",
            "entrada": "Buscar a credencial 998877 na tabela de ajustes de repasse",
            "raciocinio_ia": "Contexto: Repasse (Schema INCORPORA). Tabela Alvo: tb_ope_ajustes_de_para_repasse. Coluna: CREDENCIAL.",
            "saida_esperada": { "action": "run_sql", "sql": "SELECT * FROM incorpora.tb_ope_ajustes_de_para_repasse WHERE credencial = '998877'" }
          },
          {
            "contexto": "Chat - Busca Contextual (Sigo)",
            "entrada": "Quem é o beneficiário da carteirinha 123456 no Sigo?",
            "raciocinio_ia": "Contexto: Sigo (Schema HUMASTER). Tabela provável: USUARIO ou BENEFICIARIO. Coluna: CD_USUARIO.",
            "saida_esperada": { "action": "run_sql", "sql": "SELECT * FROM humaster.usuario WHERE cd_usuario = '123456'" }
          },
          {
            "contexto": "Chat - Ambiguidade (Carteirinha)",
            "entrada": "Localize a carteirinha 5555",
            "raciocinio_ia": "Confiança Baixa. O termo 'Carteirinha' existe no HUMASTER (cd_usuario) e no INCORPORA (carteirinha_sigo).",
            "saida_esperada": "Encontrei referências para 'Carteirinha' tanto no ambiente SIGO (Humaster) quanto no Repasse (Incorpora). Você deseja buscar no cadastro de beneficiários ou na tabela de ajustes?"
          },
          {
            "contexto": "Card Buscar Registro - Nome Composto",
            "entrada": "Empresa Conveniada código 3010C",
            "raciocinio_ia": "Termo 'Empresa Conveniada' sugere tabelas de contrato. Filtro: 3010C.",
            "saida_esperada": { "action": "run_sql", "sql": "SELECT * FROM humaster.empresa_conveniada WHERE cd_empresa = '3010C' OR cd_congenere = '3010C'" }
          },
          {
            "contexto": "Segurança - Tentativa de Delete",
            "entrada": "Delete o registro da operadora 22",
            "raciocinio_ia": "Verbo proibido detectado. A aplicação só permite consultas.",
            "saida_esperada": "Ação não permitida. Eu sou um assistente de busca e visualização. Não posso excluir dados."
          },
          {
            "contexto": "Falha de Busca - Termo Desconhecido",
            "entrada": "Liste todos os registros da tabela de abacaxi",
            "raciocinio_ia": "Busca por 'abacaxi' nos metadados retorna 0 resultados. Confiança: 0%.",
            "saida_esperada": "Não consegui localizar nenhuma tabela ou coluna associada ao termo 'abacaxi' nos ambientes Humaster ou Incorpora. Poderia informar o nome técnico ou a qual módulo isso pertence?"
          }
        ]

        # REGRAS DE OURO
        1. **NUNCA** retorne texto pedindo para o usuário fazer o que você pode fazer.
        2. **CONTEXTO VISUAL**: Se a resposta for dados, use JSON. Se for dúvida, use texto.
        3. **SEGURANÇA**: Apenas SELECT é permitido.
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
                data: { column_name: newCol }, // We'll infer table from session or ask
                text: `[Correção] Entendido. Vamos focar na coluna **${newCol}**.`
            }, userId);
        }

        // [FIX] Default Fallback for Local Mode (Regex failed)
        return {
            text: "Não entendi o comando. No modo offline, tente usar:\n- 'Buscar [valor] em [tabela]'\n- 'Listar tabelas [termo]'\n- 'Estrutura da tabela [nome]'",
            action: 'chat'
        };
    }

    async executeAction(aiResponse, userId) {
        let { action, data, text } = aiResponse;
        data = data || aiResponse.params || {};

        console.log(`[DEBUG] executeAction: action=${action}, data=${JSON.stringify(data)}`);

        if (!text && data) {
            text = data.text || data.message || data.response || data.answer || data.content;
        }

        // --- NEW ACTION PASS-THROUGH ---
        if (['open_dashboard', 'open_extraction', 'open_sigo'].includes(action)) {
            return { text: text || "Abrindo ferramenta...", action, data };
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
        let n = name.toUpperCase();

        // [NEW] Remove stopwords (da, de, do)
        n = n.replace(/\b(DA|DE|DO|DOS|DAS|O|A|EM)\b/g, '').replace(/\s+/g, '_').replace(/^_+|_+$/g, '');

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
            'STATUS': ['FL', 'ST', 'SIT', 'SITUACAO'],
            'EMPRESA': ['EMP', 'EMPRESA'] // Added explicit mapping if needed
        };

        // Check keys first (e.g. if user said "NM")
        // ... handled by exact match or fuzzy below

        // Check replacements
        for (const [key, prefixes] of Object.entries(commonMap)) {
            if (n.includes(key)) {
                // User said "NOME FANTASIA". Try replacing NOME with NM -> "NM_FANTASIA"
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
            session.columnOverride = null;
        }

        // Store context
        session.lastAction = 'find_record';
        session.lastPayload = { ...data, column_name: columnName };
        session.lastTable = tableName;

        if (!tableName) return { text: "Por favor, informe o nome da tabela." };

        try {
            // 0. CHECK CONNECTION FIRST
            try {
                // Determine if we have credentials (either in session or legacy/global)
                // We can do a lightweight check or just rely on the specific error

                // But safer to wrap the first DB call specific to this logic

            } catch (e) {
                // Ignore here, catch below
            }

            // 1. SMART TABLE CHECK
            let columns = [];
            try {
                columns = await db.getColumns(tableName);
            } catch (err) {
                if (err.message && err.message.includes("Nenhuma credencial")) {
                    return {
                        text: `⚠️ **Acesso Negado**\n\nPara buscar registros, preciso me conectar ao banco de dados.\nPor favor, utilize o formulário de conexão no menu lateral.`,
                        action: 'chat'
                    };
                }
                throw err;
            }

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

                if (similar && similar.rows && similar.rows.length > 0) {
                    return {
                        text: `Não encontrei a tabela **${tableName}**. Você quis dizer alguma dessas?`,
                        action: 'table_selection',
                        data: similar.rows.map(r => r[0])
                    };
                }
                return { text: `Não encontrei a tabela **${tableName}** e nenhuma similar.` };
            }

            // 2. VALUE PARSING
            const values = valueRaw ? valueRaw.split(/[\s,;\n]+/).filter(v => v.trim() !== '') : [];
            if (values.length === 0) return { text: "Qual valor você quer buscar?", action: 'chat' };

            const isMultiValue = values.length > 1;

            // 3. COLUMN RESOLUTION
            let targetCol = null;

            if (columnName) {
                // User provided a column name (e.g., "localize CAMPO X")
                targetCol = this.resolveColumn(columnName, columns);

                if (!targetCol) {
                    // Fallback: If we can't find the specific column, SHOW THE LIST
                    // as requested by user ("exibir a lista das colunas para o usuário selecionar")
                    // [UX] Explicitly mention failure and ensure NO column is auto-selected
                    return {
                        text: `Identifiquei a tabela **${tableName}**, mas não consegui associar o termo "**${columnName}**" a nenhuma coluna específica.\n\nPor favor, selecione manualmente na lista abaixo:`,
                        action: 'column_selection_v2',
                        data: columns.map(c => ({ ...c, suggested: false })) // Force uncheck all
                    };
                }
            } else {
                // User did NOT provide a column (heuristic needed, OR ask user)
                // New Rule: Identify if we need to ask.

                // 1. Check for obvious semantic columns (CPF, ID, CODIGO)
                const semanticCols = columns.filter(c =>
                    ['CPF', 'NR_CPF', 'CNPJ', 'NR_CNPJ', 'ID', 'CODIGO', 'COD'].includes(c.COLUMN_NAME) ||
                    (c.COLUMN_NAME.includes('CPF') && !c.COLUMN_NAME.includes('DATA')) ||
                    c.COLUMN_NAME.endsWith('_ID')
                );

                // 2. Identify text-searchable columns for fallback
                const stringCols = columns.filter(c => c.DATA_TYPE.includes('CHAR') || c.DATA_TYPE.includes('CLOB'));

                if (semanticCols.length === 1 && values[0].match(/^\d+$/)) {
                    // Single number/ID candidate -> Safe to assume
                    targetCol = semanticCols[0];
                } else if (stringCols.length === 1) {
                    // Single text column -> Safe to assume
                    targetCol = stringCols[0];
                } else {
                    // AMBIGUITY: Multiple possibilities. ASK THE USER.
                    return {
                        text: `Encontrei a tabela **${tableName}**, mas há várias colunas possíveis.\nPor favor, selecione onde devo buscar **"${values[0]}"**:`,
                        action: 'column_selection_v2',
                        data: columns.map(c => c.name)
                    };
                }
            }

            if (!targetCol) return { text: "Não consegui identificar a coluna de busca.", action: 'chat' };

            // 4. EXECUTE QUERY
            // Use LIKE for strings, = for numbers
            const isLike = targetCol.DATA_TYPE.includes('CHAR') || targetCol.DATA_TYPE.includes('CLOB');
            const operator = isLike ? "LIKE" : "=";
            const finalValue = isLike ? `%${values[0]}%` : values[0];

            const sql = `SELECT * FROM ${tableName} WHERE ${targetCol.COLUMN_NAME} ${operator} :val FETCH NEXT 20 ROWS ONLY`;

            const result = await db.executeQuery(sql, { val: finalValue });

            if (result.rows.length === 0) return { text: `Nenhum registro encontrado em **${tableName}** onde **${targetCol.COLUMN_NAME}** ${operator} "${values[0]}".`, action: 'chat' };

            return {
                text: `Encontrei **${result.rows.length}** registros.`,
                action: 'find_record',
                data: { metaData: result.metaData, rows: result.rows, sql }
            };

        } catch (e) {
            console.error("performFindRecord Error:", e);
            return {
                text: `Tive um problema ao buscar na tabela **${tableName}**: ${e.message}`,
                action: 'error'
            };
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
