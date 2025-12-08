import React, { useState, useEffect, useRef, useContext } from 'react';
import { ThemeContext } from '../context/ThemeContext';
import ReactMarkdown from 'react-markdown';
import RemarkGfm from 'remark-gfm';
import ColumnSelection from './ColumnSelection';

const AiBuilder = ({ isVisible }) => {
    const { theme } = useContext(ThemeContext);
    const [messages, setMessages] = useState([
        {
            id: 1,
            sender: 'ai',
            text: 'Olá! Estou aqui para ajudar você a descobrir insights nos seus dados.\n\nO que vamos descobrir hoje?',
            isSystem: true
        }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [viewData, setViewData] = useState(null);
    const [activeView, setActiveView] = useState('welcome'); // welcome, table_results, schema_view, data_view, draft_view
    const [mode, setMode] = useState('ai'); // 'ai' or 'local'
    const [draftData, setDraftData] = useState(null);

    // Learning Data State
    const [headlines, setHeadlines] = useState([]);
    const [skills, setSkills] = useState([]);
    const [showSkillsModal, setShowSkillsModal] = useState(false);

    // Interactive Flow State
    const [flowStep, setFlowStep] = useState(null);
    const [flowParams, setFlowParams] = useState({});

    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isVisible]);

    // Load Learning Data on Mount
    useEffect(() => {
        if (isVisible) {
            fetchHeadlines();
            fetchSkills();
        }
    }, [isVisible]);

    const fetchHeadlines = async () => {
        try {
            const res = await fetch('http://localhost:3001/api/ai/suggestions');
            const data = await res.json();
            if (Array.isArray(data)) setHeadlines(data);
        } catch (e) {
            console.error("Failed to fetch suggestions", e);
        }
    };

    const fetchSkills = async () => {
        try {
            const res = await fetch('http://localhost:3001/api/ai/skills');
            const data = await res.json();
            if (Array.isArray(data)) setSkills(data);
        } catch (e) {
            console.error("Failed to fetch skills", e);
        }
    };

    const handleFlowStart = (step, promptText) => {
        setFlowStep(step);
        setFlowParams({});
        setMessages(prev => [...prev, { id: Date.now(), sender: 'ai', text: promptText, isSystem: true }]);
    };

    const handleHeadlineClick = (headline) => {
        // ALWAYS put in input, NEVER auto-send. User wants to edit first.
        let text = headline.prompt;
        if (headline.type === 'template') text = text.replace('[TEMA]', '');
        setInput(text);
        // Optionally focus input
        // if(inputRef.current) inputRef.current.focus(); 
    };

    const handleUpdateDraft = (section, index, field, value) => {
        if (!draftData) return;
        const newData = { ...draftData };
        if (section === 'columns') {
            newData.columns[index][field] = value;
        }
        setDraftData(newData);
    };

    const handleConfirmDraft = async () => {
        setLoading(true);
        try {
            const res = await fetch('http://localhost:3001/api/ai/create-table-confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(draftData)
            });
            const data = await res.json();
            setLoading(false);
            if (data.error) {
                setMessages(prev => [...prev, { id: Date.now(), sender: 'ai', text: `Tive um problema ao criar: ${data.error}` }]);
            } else {
                setMessages(prev => [...prev, { id: Date.now(), sender: 'ai', text: `Prontinho! A tabela **${data.tableName}** foi criada com sucesso.` }]);
                setActiveView('welcome');
                setDraftData(null);
            }
        } catch (err) {
            setLoading(false);
            setMessages(prev => [...prev, { id: Date.now(), sender: 'ai', text: `Erro de conexão: ${err.message}` }]);
        }
    };

    const handleSend = async (textOverride = null) => {
        let textToSend = textOverride || input;
        if (!textToSend.trim()) return;

        // --- INTERACTIVE WIZARD LOGIC ---
        if (flowStep && !textOverride) {
            if (flowStep === 'SEARCH_KEYWORD') {
                textToSend = `Busque tabelas ${input}`;
                setFlowStep(null);
            }
            else if (flowStep === 'TRIGGER_NAME') {
                textToSend = `Ver triggers da tabela ${input}`;
                setFlowStep(null);
            }
            else if (flowStep === 'CREATE_NAME') {
                setFlowParams({ ...flowParams, name: input });
                setMessages(prev => [...prev, { id: Date.now(), sender: 'user', text: input }]);
                setMessages(prev => [...prev, { id: Date.now() + 1, sender: 'ai', text: "Quais colunas ela deve ter? (Ex: id number, nome varchar2(100))", isSystem: true }]);
                setFlowStep('CREATE_COLS');
                setInput('');
                return;
            }
            else if (flowStep === 'CREATE_COLS') {
                textToSend = `${flowParams.name}; ${input}`;
                setFlowStep(null);
            }
        }

        const userMsg = { id: Date.now(), sender: 'user', text: textToSend };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setLoading(true);

        try {
            const res = await fetch('http://localhost:3001/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: textToSend, mode: mode })
            });
            const data = await res.json();

            setLoading(false);

            if (data.error) {
                setMessages(prev => [...prev, { id: Date.now() + 1, sender: 'ai', text: "Ops: " + data.error }]);
                return;
            }

            if (data.action === 'switch_mode') {
                setMode(data.mode);
                setMessages(prev => [...prev, { id: Date.now() + 1, sender: 'ai', text: data.text }]);
                return;
            }

            if (data.action === 'quota_exceeded') {
                setMessages(prev => [...prev, { id: Date.now() + 1, sender: 'ai', text: data.text, isSystem: true }]);
                return;
            }

            // Normal Response
            setMessages(prev => [...prev, { id: Date.now() + 1, sender: 'ai', text: data.text }]);

            // Refresh learning data if action succeeded
            if (data.action && data.action !== 'chat') {
                fetchHeadlines();
                fetchSkills();
            }

            // Handle UI Action Updates
            if (data.action) {
                if (data.action === 'list_tables') {
                    setActiveView('table_results');
                    setViewData(data.data);
                } else if (data.action === 'describe_table') {
                    setActiveView('schema_view');
                    setViewData(data.data);
                } else if (data.action === 'show_data') {
                    setActiveView('data_view');
                    // data.data might be { metaData, rows } or just rows
                    setViewData(data.data.rows || data.data);
                } else if (data.action === 'draft_table') {
                    setDraftData(data.data);
                    setActiveView('draft_view');
                } else if (data.action === 'column_selection') {
                    setActiveView('column_selection');
                    setViewData(data.data);
                }
            }

        } catch (err) {
            console.error(err);
            setLoading(false);
            setMessages(prev => [...prev, { id: Date.now() + 1, sender: 'ai', text: "Erro de conexão: " + err.message }]);
        }
    };

    // Auto-select text inside [BRACKETS] when input acts as a template
    useEffect(() => {
        if (input.includes('[') && input.includes(']')) {
            setTimeout(() => {
                const inputEl = document.querySelector('input[type="text"]');
                if (inputEl) {
                    inputEl.focus();
                    const start = input.indexOf('[');
                    const end = input.indexOf(']') + 1;
                    inputEl.setSelectionRange(start, end);
                }
            }, 50);
        }
    }, [input]);

    // Auto-Generate Indices if missing
    useEffect(() => {
        if (draftData && draftData.tableName && Array.isArray(draftData.columns) && (!draftData.indices || draftData.indices.length === 0)) {
            // Suggest an index for every column by default
            const potentialIndices = draftData.columns.map(c => {
                let colName = c.name.toUpperCase();
                let tblName = draftData.tableName.toUpperCase();
                // Clean up for index name
                return {
                    name: `IDX_${tblName.substring(0, 8)}_${colName.substring(0, 10)}`,
                    column: c.name
                };
            });
            // Update draft data without clearing other stuff
            setDraftData(prev => ({ ...prev, indices: potentialIndices }));
        }
    }, [draftData?.tableName, draftData?.columns?.length]);

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // --- Render Helpers ---

    const renderTableList = () => (
        <div className="w-full h-full overflow-auto">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Owner</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tabela</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Comentários</th>
                        <th className="px-6 py-3 text-right">Ação</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {viewData && viewData.map((t, i) => (
                        <tr key={i} className="hover:bg-blue-50 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{t.owner}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">{t.name}</td>
                            <td className="px-6 py-4 text-sm text-gray-500 truncate max-w-xs">{t.comments}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                <button
                                    onClick={() => handleSend(`Estrutura da tabela ${t.owner}.${t.name}`)}
                                    className="text-blue-600 hover:text-blue-900 bg-blue-100 px-3 py-1 rounded"
                                >
                                    Ver Detalhes
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );

    const renderSchemaView = () => {
        if (!viewData) return <div className="p-4 text-gray-500">Erro: Nenhum dado de estrutura disponível.</div>;
        const columns = Array.isArray(viewData) ? viewData : (viewData?.columns || []);
        if (!columns) return <div className="p-4 text-gray-500">Erro: Formato de colunas inválido.</div>;
        return (
            <div className="w-full h-full overflow-auto">
                {viewData?.tableName && (
                    <div className="bg-gray-50 px-6 py-3 border-b border-gray-200 font-bold text-gray-700 text-sm uppercase tracking-wider sticky top-0 z-10 flex justify-between items-center">
                        <span>Estrutura: {viewData.tableName}</span>
                        {viewData.isView && <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">VIEW</span>}
                    </div>
                )}
                {viewData?.viewDefinition && (
                    <div className="bg-slate-900 mx-6 mt-6 rounded-xl overflow-hidden shadow-2xl border border-slate-700">
                        <div className="bg-slate-800 px-6 py-3 border-b border-slate-700 flex justify-between items-center">
                            <h3 className="font-mono text-base font-bold text-emerald-400 tracking-wide">Definição SQL (View)</h3>
                            <span className="text-xs text-white bg-slate-700 px-2 py-1 rounded font-bold uppercase tracking-wider">READ-ONLY</span>
                        </div>
                        <div className="p-6 overflow-x-auto bg-[#0f111a]">
                            <pre className="font-mono text-base text-cyan-300 whitespace-pre-wrap leading-relaxed shadow-none">
                                {viewData.viewDefinition}
                            </pre>
                        </div>
                    </div>
                )}
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-10">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Coluna</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nullable</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Default</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {columns.map((col, i) => (
                            <tr key={i} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">{col.COLUMN_NAME}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{col.DATA_TYPE}({col.DATA_LENGTH})</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{col.NULLABLE}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{col.DATA_DEFAULT}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    const renderDraftView = () => {
        try {
            if (!draftData) return null;
            // Defensive Copying & Defaulting
            const tableName = draftData.tableName || 'NOVA_TABELA';
            const cols = Array.isArray(draftData.columns) ? draftData.columns : [];
            const indices = Array.isArray(draftData.indices) ? draftData.indices : [];
            const grants = Array.isArray(draftData.grants) ? draftData.grants : [];

            return (
                <div className="w-full h-full overflow-auto p-4 bg-gray-50">
                    <div className="mb-6 flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                        <div className="flex-1 mr-4">
                            <label className="text-xs text-purple-600 font-bold uppercase tracking-wider mb-1 block">Nome da Tabela</label>
                            <div className="flex items-center">
                                <span className="bg-purple-100 text-purple-600 p-2 rounded-lg mr-3 text-lg">✨</span>
                                <input
                                    value={tableName}
                                    onChange={(e) => setDraftData(prev => ({ ...prev, tableName: e.target.value.toUpperCase() }))}
                                    className="text-xl font-bold text-gray-800 border-b-2 border-purple-200 focus:border-purple-600 focus:outline-none w-full bg-transparent ml-2 uppercase"
                                    placeholder="NOME_DA_TABELA"
                                />
                            </div>
                            <p className="text-xs text-gray-500 mt-1 ml-11">Revise o nome e campos antes de criar.</p>
                        </div>
                        <div className="space-x-2 flex-shrink-0">
                            <button onClick={() => { setActiveView('welcome'); setDraftData(null); }} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
                            <button onClick={handleConfirmDraft} className="px-6 py-2 text-sm bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 shadow-md transform active:scale-95 transition-all">Confirmar Criação</button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* COLUMNS EDITOR */}
                        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                            <div className="bg-gray-50 px-6 py-3 border-b border-gray-100 flex justify-between items-center">
                                <h3 className="font-bold text-gray-700 text-sm">Colunas Definidas</h3>
                                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">{cols.length} campos</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nome</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Remover</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {cols.map((col, i) => (
                                            <tr key={i} className="hover:bg-gray-50">
                                                <td className="px-4 py-3">
                                                    <input
                                                        value={col.name}
                                                        onChange={(e) => handleUpdateDraft('columns', i, 'name', e.target.value)}
                                                        className="w-full border-gray-300 rounded-md shadow-sm focus:border-purple-500 focus:ring-purple-500 sm:text-sm font-bold uppercase"
                                                    />
                                                </td>
                                                <td className="px-4 py-3">
                                                    <input
                                                        value={col.type}
                                                        onChange={(e) => handleUpdateDraft('columns', i, 'type', e.target.value)}
                                                        className="w-full border-gray-300 rounded-md shadow-sm focus:border-purple-500 focus:ring-purple-500 sm:text-sm font-mono text-blue-600 uppercase"
                                                    />
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <button onClick={() => {
                                                        const newData = { ...draftData };
                                                        newData.columns.splice(i, 1);
                                                        setDraftData(newData);
                                                    }} className="text-red-400 hover:text-red-600 font-bold px-2">×</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <div className="p-3 bg-gray-50 border-t border-gray-200 text-center">
                                    <button onClick={() => {
                                        const newData = { ...draftData };
                                        if (!Array.isArray(newData.columns)) newData.columns = [];
                                        newData.columns.push({ name: 'NOVA_COLUNA', type: 'VARCHAR2(100)' });
                                        setDraftData(newData);
                                    }} className="text-sm text-purple-600 font-medium hover:underline">+ Adicionar Coluna</button>
                                </div>
                            </div>
                        </div>

                        {/* METADATA / CONFIG EDITOR */}
                        <div className="space-y-6">
                            {/* INDICES EDITOR */}
                            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                                <h3 className="font-bold text-gray-700 text-sm mb-3 border-b pb-2 flex justify-between items-center">
                                    <span>Índices Sugeridos</span>
                                    {/* Manual add removed for now to favor automation */}
                                </h3>

                                {indices.length === 0 ? <p className="text-sm text-gray-400 italic">Nenhum índice definido.</p> : (
                                    <div className="flex flex-col gap-2">
                                        {indices.map((idx, i) => (
                                            <div key={i} className="flex items-center gap-2">
                                                {/* If it's an object, show column name, else generic */}
                                                <span className="text-[10px] bg-blue-50 text-blue-500 px-1 rounded w-16 truncate text-right font-bold" title={idx.column || '?'}>
                                                    {idx.column || 'CUSTOM'}
                                                </span>
                                                <input
                                                    value={idx.name || idx} /* Handle legacy strings or objects */
                                                    onChange={(e) => {
                                                        const newData = { ...draftData };
                                                        if (typeof newData.indices[i] === 'object') {
                                                            newData.indices[i].name = e.target.value.toUpperCase();
                                                        } else {
                                                            newData.indices[i] = e.target.value.toUpperCase();
                                                        }
                                                        setDraftData(newData);
                                                    }}
                                                    placeholder="NOME_INDICE"
                                                    className="flex-1 px-2 py-1 text-xs border border-blue-200 rounded text-blue-700 font-mono focus:border-blue-500 outline-none uppercase"
                                                />
                                                <button onClick={() => {
                                                    const newData = { ...draftData };
                                                    newData.indices.splice(i, 1);
                                                    setDraftData(newData);
                                                }} className="text-red-400 hover:text-red-600 font-bold">×</button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* GRANTS EDITOR */}
                            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                                <h3 className="font-bold text-gray-700 text-sm mb-3 border-b pb-2 flex justify-between items-center">
                                    <span>Permissões (Grants)</span>
                                    <button onClick={() => {
                                        const newData = { ...draftData };
                                        if (!newData.grants) newData.grants = [];
                                        newData.grants.push(`GRANT SELECT ON ${tableName} TO PUBLIC`);
                                        setDraftData(newData);
                                    }} className="text-xs bg-green-50 text-green-600 px-2 py-1 rounded hover:bg-green-100">+ Add</button>
                                </h3>

                                {grants.length === 0 ? <p className="text-sm text-gray-400 italic">Nenhuma permissão definida.</p> : (
                                    <div className="flex flex-col gap-2">
                                        {grants.map((grant, i) => (
                                            <div key={i} className="flex items-center gap-2">
                                                <input
                                                    value={grant}
                                                    onChange={(e) => {
                                                        const newData = { ...draftData };
                                                        newData.grants[i] = e.target.value.toUpperCase();
                                                        setDraftData(newData);
                                                    }}
                                                    className="flex-1 px-2 py-1 text-xs border border-green-200 rounded text-green-700 font-mono focus:border-green-500 outline-none uppercase"
                                                />
                                                <button onClick={() => {
                                                    const newData = { ...draftData };
                                                    newData.grants.splice(i, 1);
                                                    setDraftData(newData);
                                                }} className="text-red-400 hover:text-red-600 font-bold">×</button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            );
        } catch (err) {
            console.error("Error rendering Draft View:", err);
            return (
                <div className="p-6 bg-red-50 border border-red-200 rounded-lg text-red-700">
                    <h3 className="font-bold">Erro ao exibir rascunho</h3>
                    <p>Ocorreu um problema ao renderizar a estrutura da tabela.</p>
                    <p className="text-xs mt-2 font-mono bg-white p-2 rounded border border-red-100">{err.message}</p>
                    <button onClick={() => setDraftData(null)} className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">Fechar e Tentar Novamente</button>
                </div>
            );
        }
    };

    const renderDataView = () => {
        if (!viewData || !viewData.length) return <div className="p-4 text-gray-500">Nenhum dado para exibir.</div>;

        // Intelligent Date Formatter
        const formatCell = (val) => {
            if (val === null || val === undefined) return '';
            if (typeof val === 'object') return JSON.stringify(val);

            // Check if string looks like an ISO date (e.g., 2025-04-13T03:00:00.000Z)
            if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val)) {
                const date = new Date(val);
                if (!isNaN(date.getTime())) {
                    // Check if meaningful time exists (not 00:00:00 or 03:00:00 - common timezone offset specific)
                    // Actually, simpler heuristic: 
                    // If the time is exactly midnight UTC or 03:00 (Brasilia offset for midnight), treat as Date Only.
                    // But simpler: just check if the output time is 00:00 in local or standard.

                    // Let's rely on standard PT-BR formatting
                    const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0 || date.getSeconds() !== 0;

                    // Specific fix for "03:00:00" which is often midnight in UTC-3
                    // If we blindly convert, it might show time.
                    // Let's use logic: If string ends in T03:00:00.000Z or T00:00:00.000Z, treat as Date Only?
                    // User complained about "1965-04-13T03:00:00.000Z". Since Brazil is UTC-3, this is midnight.

                    // Try to format to Local String
                    // If the database stored just DATE, Oracle returns start of day.

                    return date.toLocaleString('pt-BR', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: hasTime ? '2-digit' : undefined,
                        minute: hasTime ? '2-digit' : undefined,
                        second: hasTime ? '2-digit' : undefined
                    });
                }
            }
            return val;
        };

        const columns = Object.keys(viewData[0]);
        return (
            <div className="w-full h-full overflow-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0">
                        <tr>
                            {columns.map(col => (
                                <th key={col} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{col}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {viewData.map((row, i) => (
                            <tr key={i} className="hover:bg-blue-50">
                                {columns.map(col => (
                                    <td key={col} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCell(row[col])}</td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };



    return (
        <div className={`flex h-full ${theme.bg} overflow-hidden font-sans`}>

            {/* --- SKILLS MODAL --- */}
            {showSkillsModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 w-[500px] max-w-full m-4 border-2 border-blue-100">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-gray-800">🧠 O que eu já aprendi</h2>
                            <button onClick={() => setShowSkillsModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                        </div>
                        <div className="max-h-[60vh] overflow-y-auto space-y-3">
                            {skills.length === 0 ? (
                                <p className="text-center text-gray-500 py-8">Ainda estou aprendendo! Use o assistente para me ensinar novos truques.</p>
                            ) : (
                                skills.map(skill => (
                                    <div key={skill.id} className="p-3 bg-blue-50 rounded-xl flex justify-between items-center group hover:bg-blue-100 transition-colors">
                                        <div>
                                            <h4 className="font-bold text-blue-800 text-sm">{skill.name}</h4>
                                            <p className="text-xs text-blue-600 opacity-80">Usado {skill.frequency} vezes</p>
                                        </div>
                                        <button
                                            onClick={() => {
                                                setShowSkillsModal(false);
                                                if (skill.id === 'draft_table') handleFlowStart('CREATE_NAME', 'Qual o nome da nova tabela?');
                                                else if (skill.id === 'list_tables') setInput('Listar todas as tabelas');
                                                else if (skill.id === 'describe_table') setInput('Descreva a tabela [NOME]');
                                                else if (skill.id === 'list_triggers') setInput('Listar triggers da tabela [NOME]');
                                                else setInput(`Executar ação: ${skill.id}`);
                                            }}
                                            className="px-3 py-1 bg-white text-blue-600 text-xs font-bold rounded-lg shadow-sm opacity-0 group-hover:opacity-100 transition-opacity transform active:scale-95"
                                        >
                                            Testar ⚡
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                        <button onClick={() => setShowSkillsModal(false)} className="mt-6 w-full py-2 bg-gray-100 font-bold text-gray-600 rounded-xl hover:bg-gray-200">
                            Fechar
                        </button>
                    </div>
                </div>
            )}

            {/* LEFT: Chat Interface */}
            <div className={`w-[40%] flex flex-col border-r ${theme.border} ${theme.sidebar} shadow-sm z-10`}>
                {/* Header */}
                <div className={`p-4 border-b ${theme.border} flex items-center justify-between bg-white/50 backdrop-blur-sm`}>
                    <div className="flex items-center space-x-2">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-md transition-all ${mode === 'ai' ? 'bg-gradient-to-tr from-blue-500 to-purple-600' : 'bg-green-600'}`}>
                            {mode === 'ai' ? 'AI' : 'LG'}
                        </div>
                        <div>
                            <h2 className={`font-bold text-sm ${theme.text}`}>Hap AI</h2>
                            <p className="text-[10px] text-gray-500 cursor-pointer hover:underline" onClick={() => setShowSkillsModal(true)}>
                                {mode === 'ai' ? 'Online • Ver Habilidades' : 'Modo Offline'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center bg-gray-200 rounded-full p-1 cursor-pointer" onClick={() => setMode(mode === 'ai' ? 'local' : 'ai')}>
                        <div className={`px-3 py-1 rounded-full text-xs font-bold transition-all duration-300 ${mode === 'ai' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>AI</div>
                        <div className={`px-3 py-1 rounded-full text-xs font-bold transition-all duration-300 ${mode === 'local' ? 'bg-white text-green-600 shadow-sm' : 'text-gray-500'}`}>Off</div>
                    </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50">
                    {messages.map((msg) => (
                        <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${msg.sender === 'user'
                                ? 'bg-blue-600 text-white rounded-br-none'
                                : (msg.isSystem ? 'bg-indigo-50 text-indigo-900 border border-indigo-100' : 'bg-white text-gray-800 border border-gray-100 rounded-bl-none')
                                }`}>
                                {msg.sender === 'ai' ? (
                                    <ReactMarkdown
                                        remarkPlugins={[RemarkGfm]}
                                        components={{
                                            code({ node, inline, className, children, ...props }) {
                                                const match = /language-(\w+)/.exec(className || '')
                                                return !inline ? (
                                                    <pre className="bg-gray-800 text-gray-100 p-3 rounded-lg my-2 text-xs font-mono overflow-x-auto border border-gray-700 shadow-inner">
                                                        <code className={className} {...props}>
                                                            {children}
                                                        </code>
                                                    </pre>
                                                ) : (
                                                    <code className="bg-gray-100 px-1 py-0.5 rounded text-red-500 font-mono text-xs" {...props}>
                                                        {children}
                                                    </code>
                                                )
                                            },
                                            p({ children }) {
                                                return <div className="mb-2 whitespace-pre-wrap leading-relaxed">{children}</div>
                                            }
                                        }}
                                    >
                                        {msg.text}
                                    </ReactMarkdown>
                                ) : (
                                    <div className="whitespace-pre-wrap leading-relaxed">{msg.text}</div>
                                )}
                            </div>
                        </div>
                    ))}
                    {loading && (
                        <div className="flex justify-start">
                            <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-none px-4 py-3 shadow-sm flex space-x-1 items-center">
                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div className={`p-3 border-t ${theme.border} bg-white`}>
                    <div className="relative">
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={mode === 'ai' ? "Ex: Quero ver os clientes de São Paulo..." : "Comandos: Busque tabelas..., Estrutura de..."}
                            className={`w-full border-gray-200 rounded-xl pr-12 pl-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none shadow-sm ${theme.input} ${theme.border}`}
                            rows={1}
                            style={{ minHeight: '44px', maxHeight: '120px' }}
                        />
                        <button
                            onClick={() => handleSend()}
                            disabled={!input.trim() || loading}
                            className={`absolute right-2 bottom-2 p-1.5 rounded-lg transition-colors ${input.trim() ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                <path d="M3.478 2.404a.75.75 0 00-.926.941l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.404z" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>

            {/* RIGHT: Content / Context Area */}
            <div className={`flex-1 flex flex-col bg-white overflow-hidden relative border-l border-gray-100`}>

                {/* Header */}
                <div className={`h-14 border-b ${theme.border} flex items-center justify-between px-6 bg-white overflow-hidden`}>
                    <h3 className="font-bold text-gray-700 text-sm uppercase tracking-wider flex items-center">
                        <span className="text-lg mr-2">📄</span>
                        {activeView === 'welcome' && 'Início'}
                        {activeView === 'table_results' && 'Resultados da Busca'}
                        {activeView === 'schema_view' && 'Estrutura da Tabela'}
                        {activeView === 'data_view' && 'Dados'}
                        {activeView === 'draft_view' && 'Rascunho'}
                    </h3>
                    <div className="flex space-x-2">
                        {activeView !== 'welcome' && (
                            <button onClick={() => { setActiveView('welcome'); setDraftData(null); }} className="text-xs text-gray-400 hover:text-gray-600">Voltar ao Início</button>
                        )}
                        <button onClick={() => setShowSkillsModal(true)} className="text-xs text-purple-600 font-bold bg-purple-50 px-2 py-1 rounded hover:bg-purple-100">
                            Ajuda
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className={`flex-1 overflow-hidden relative ${activeView === 'welcome' ? 'bg-gray-50 flex flex-col justify-center' : 'bg-white'}`}>

                    {activeView === 'welcome' && (
                        <div className="max-w-4xl mx-auto p-8 w-full">
                            <div className="text-center mb-10">
                                <h1 className="text-4xl font-extrabold text-gray-900 mb-2 tracking-tight">
                                    O que vamos construir hoje?
                                </h1>
                                <p className="text-lg text-gray-500">
                                    Escolha um atalho ou digite sua pergunta ao lado.
                                </p>
                            </div>

                            {/* DYNAMIC HEADLINES (Cards) */}
                            {/* DYNAMIC HEADLINES (Cards) - HORIZONTAL SCROLL FIXED */}
                            <div className="flex overflow-x-auto pb-6 space-x-6 px-2 snap-x">
                                {headlines.map((headline) => (
                                    <div
                                        key={headline.id}
                                        onClick={() => handleHeadlineClick(headline)}
                                        className="snap-start shrink-0 w-96 bg-white p-6 rounded-2xl shadow-sm border border-gray-100 cursor-pointer transition-all duration-300 hover:shadow-md hover:-translate-y-1 hover:border-blue-200 group flex flex-col justify-between"
                                    >
                                        <div>
                                            <div className="flex justify-between items-start mb-4">
                                                <span className="p-2 bg-blue-50 text-blue-600 rounded-lg text-xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                                    {headline.type === 'learned' ? '🧠' : (headline.type === 'template' ? '✏️' : '🚀')}
                                                </span>
                                                {headline.type === 'learned' && <span className="text-[10px] font-bold uppercase tracking-wider text-green-600 bg-green-50 px-2 py-1 rounded-full">Frequente</span>}
                                            </div>
                                            <h3 className="font-bold text-gray-800 text-lg mb-2 group-hover:text-blue-600 transition-colors whitespace-normal">
                                                {headline.title}
                                            </h3>
                                            <p className="text-sm text-gray-500 line-clamp-3 whitespace-normal">
                                                "{headline.prompt}"
                                            </p>
                                        </div>
                                    </div>
                                ))}

                                {/* Static Fallback if headlines empty/fail */}
                                {headlines.length === 0 && (
                                    <div className="w-full text-center text-gray-400 py-10">
                                        Carregando sugestões inteligentes...
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeView === 'draft_view' && renderDraftView()}
                    {activeView === 'table_results' && viewData && renderTableList()}
                    {activeView === 'schema_view' && viewData && renderSchemaView()}
                    {activeView === 'column_selection' && viewData && (
                        <ColumnSelection
                            viewData={viewData}
                            onSearch={handleSend}
                            onCancel={() => { setActiveView('welcome'); setViewData(null); }}
                        />
                    )}
                    {activeView === 'data_view' && viewData && renderDataView()}

                </div>
            </div>
        </div>
    );
}

export default AiBuilder;
