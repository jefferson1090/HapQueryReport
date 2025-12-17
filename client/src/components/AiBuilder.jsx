import React, { useState, useEffect, useRef, useContext } from 'react';
import ReactMarkdown from 'react-markdown';
import RemarkGfm from 'remark-gfm';
import { ThumbsUp, ThumbsDown, Check, X, AlertTriangle, Lightbulb } from 'lucide-react';
import { ThemeContext } from '../context/ThemeContext';
import { useApi } from '../context/ApiContext';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import ColumnSelection from './ColumnSelection';

import AdminModule from './AdminModule';

const AiBuilder = ({ isVisible }) => {
    const { theme } = useContext(ThemeContext);
    const { apiUrl } = useApi();

    // Admin Module State
    const [showAdmin, setShowAdmin] = useState(false);

    // Load Messages from LocalStorage
    const [messages, setMessages] = useState(() => {
        const saved = localStorage.getItem('ai_chat_history');
        if (saved) return JSON.parse(saved);
        return [];
    });

    // Load Active View State
    const [activeView, setActiveView] = useState(() => {
        return localStorage.getItem('ai_active_view') || 'welcome';
    });
    const [viewData, setViewData] = useState(() => {
        const saved = localStorage.getItem('ai_view_data');
        return saved ? JSON.parse(saved) : null;
    });

    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [headlines, setHeadlines] = useState([]);
    const [skills, setSkills] = useState([]);
    const [flowStep, setFlowStep] = useState(null);
    const [flowParams, setFlowParams] = useState({});
    const [draftData, setDraftData] = useState(null);
    const [mode, setMode] = useState('ai');
    const [showSkillsModal, setShowSkillsModal] = useState(false);
    const [tableFilter, setTableFilter] = useState('');

    // Data Grid State (Filter & Sort)
    const [dataSort, setDataSort] = useState({ key: null, direction: 'asc' });
    const [dataFilters, setDataFilters] = useState({});

    // Persistence Effect
    useEffect(() => {
        localStorage.setItem('ai_chat_history', JSON.stringify(messages));
    }, [messages]);

    useEffect(() => {
        localStorage.setItem('ai_active_view', activeView);
    }, [activeView]);

    useEffect(() => {
        if (viewData) {
            localStorage.setItem('ai_view_data', JSON.stringify(viewData));
        } else {
            localStorage.removeItem('ai_view_data');
        }
    }, [viewData]);

    // Learning / Feedback State
    const [correctionModalOpen, setCorrectionModalOpen] = useState(false);
    const [correctionData, setCorrectionData] = useState({ term: '', value: '', type: 'table', context: '' });
    const [likedMessages, setLikedMessages] = useState(new Set());

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
            const res = await fetch(`${apiUrl}/api/ai/suggestions`);
            const data = await res.json();
            if (Array.isArray(data)) setHeadlines(data);
        } catch (e) {
            console.error("Failed to fetch suggestions", e);
        }
    };

    const fetchSkills = async () => {
        try {
            const res = await fetch(`${apiUrl}/api/ai/skills`);
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
            const res = await fetch(`${apiUrl}/api/ai/create-table-confirm`, {
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

    // Session ID for AI Context Isolation
    const [sessionId] = useState(() => {
        let sid = localStorage.getItem('ai_session_id');
        if (!sid) {
            sid = 'user_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('ai_session_id', sid);
        }
        return sid;
    });

    const handleSend = async (textOverride = null) => {
        let textToSend = textOverride || input;
        if (!textToSend.trim()) return;

        // --- ADMIN SHORTCUT ---
        if (textToSend === 'ADMIN:OPEN') {
            setShowAdmin(true);
            setInput('');
            setMessages(prev => [...prev, { id: Date.now(), sender: 'system', text: 'Opening Hive Mind Control Tower...' }]);
            return;
        }

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
            const res = await fetch(`${apiUrl}/api/ai/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: textToSend, mode: mode, userId: sessionId })
            });
            const data = await res.json();
            console.log("[DEBUG] AiBuilder Response:", JSON.stringify(data));
            console.log(`[DEBUG] Action: ${data.action}, View Data Present? ${!!data.data}`);

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



            // Handle LEARNING actions
            if (data.action === 'clarification') {
                setMessages(prev => [...prev, {
                    id: Date.now() + 2,
                    sender: 'ai',
                    isCustom: true,
                    content: (
                        <div className="bg-orange-50 p-4 rounded-xl border border-orange-200 space-y-3">
                            <div className="flex items-center gap-2 text-orange-700 font-bold">
                                <AlertTriangle size={18} />
                                <span>Preciso de ajuda</span>
                            </div>
                            <p className="text-gray-700">{data.data.question}</p>
                            <div className="flex flex-wrap gap-2">
                                {data.data.options && data.data.options.map((opt, i) => (
                                    <button
                                        key={i}
                                        onClick={() => handleSend(opt)}
                                        className="px-3 py-2 bg-white border border-orange-300 text-orange-800 rounded-lg hover:bg-orange-100 transition-colors text-sm font-medium"
                                    >
                                        {opt}
                                    </button>
                                ))}
                                <button
                                    onClick={() => handleSend("Nenhuma dessas")}
                                    className="px-3 py-2 text-gray-500 hover:bg-gray-100 rounded-lg text-sm"
                                >
                                    Nenhuma dessas
                                </button>
                            </div>
                        </div>
                    )
                }]);
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
                    // Store COMPLETE data object (metaData + rows) to allow correct header rendering
                    setViewData(data.data);
                } else if (data.action === 'draft_table') {
                    setDraftData(data.data);
                    setActiveView('draft_view');
                } else if (data.action === 'column_selection') {
                    setActiveView('column_selection');
                    setViewData(data.data);
                } else if (data.action === 'table_selection') {
                    setActiveView('table_selection');
                    setViewData(data.data);
                } else if (data.action === 'agent_report') {
                    setActiveView('agent_report');
                    setViewData(data.data);
                }
            }

        } catch (err) {
            console.error(err);
            setLoading(false);
            setMessages(prev => [...prev, { id: Date.now() + 1, sender: 'ai', text: "Erro de conexão: " + err.message }]);
        }
    };

    const handleFeedback = async (type, msg) => {
        if (type === 'like') {
            setLikedMessages(prev => new Set(prev).add(msg.id));
            // Optional: Send implicit positive feedback
        } else {
            // Open Correction Modal
            // Try to infer term from last user message? For now manual.
            setCorrectionData({ term: '', value: '', type: 'table', context: '' });
            setCorrectionModalOpen(true);
        }
    };

    const submitCorrection = async () => {
        try {
            await fetch(`${apiUrl}/api/ai/feedback`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(correctionData)
            });
            setCorrectionModalOpen(false);
            setMessages(prev => [...prev, { id: Date.now(), sender: 'ai', text: `Obrigado! Aprendi que **"${correctionData.term}"** significa **${correctionData.value}**.` }]);
            fetchHeadlines(); // Refresh suggestions
        } catch (e) {
            console.error("Feedback error", e);
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

    const handleExitDataView = async () => {
        // 1. Switch View immediately
        setActiveView('welcome');
        setViewData(null);

        // 2. Inform Backend to Clear Context (Fire and forget)
        try {
            await fetch(`${apiUrl}/api/ai/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: '[SYSTEM: CLEAR_CONTEXT]', mode: 'ai' }) // Backend now handles this silently
            });
            console.log("Context cleared on backend.");
        } catch (e) {
            console.error("Failed to clear context:", e);
        }
    };

    const handleShowData = async (table) => {
        const fullTableName = `${table.owner}.${table.name}`;
        setLoading(true);
        try {
            // 1. Fetch Data
            const res = await fetch(`${apiUrl}/api/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sql: `SELECT * FROM ${fullTableName}`, limit: 50 })
            });
            const result = await res.json();

            if (result.error) throw new Error(result.error);

            // 2. Set Active View to 'data'
            setActiveView('data');
            // Store metadata about the table we are viewing for context
            setViewData({
                rows: result.rows,
                metaData: result.metaData,
                tableName: fullTableName
            });

            // 3. Inform AI about context (Ghost Message)
            // We append a system message so the user sees the confirmation
            setMessages(prev => [...prev, {
                id: Date.now(),
                sender: 'ai',
                text: `👁️ ** Estou enxergando os dados da tabela \`${fullTableName}\`.**\n\nVocê pode pedir filtros como *"Mostre apenas os ativos"* ou *"Busque pelo nome X"* e eu tentarei entender as colunas automaticamente.`
            }]);

            // 4. Force Context Sync to Backend
            try {
                await fetch(`${apiUrl}/api/ai/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: `[SYSTEM: SET_CONTEXT] { "table": "${fullTableName}" }`,
                        mode: 'ai'
                    })
                });
                console.log("Context 'lastTable' set on backend.");
            } catch (e) {
                console.error("Failed to set context:", e);
            }

        } catch (e) {
            console.error("Show Data Error:", e);
            setMessages(prev => [...prev, { id: Date.now(), sender: 'ai', text: `Erro ao buscar dados: ${e.message}` }]);
        } finally {
            setLoading(false);
        }
    };

    const renderTableList = () => {
        const filteredData = viewData ? viewData.filter(t =>
            t.name.toLowerCase().includes(tableFilter.toLowerCase()) ||
            t.owner.toLowerCase().includes(tableFilter.toLowerCase())
        ) : [];

        return (
            <div className="w-full h-full overflow-hidden flex flex-col">
                <div className="p-4 bg-white border-b border-gray-200">
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Filtrar tabelas..."
                            value={tableFilter}
                            onChange={(e) => setTableFilter(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                        />
                        <div className="absolute left-3 top-2.5 text-gray-400">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>
                    </div>
                    <div className="mt-2 text-xs text-gray-500">
                        Exibindo {filteredData.length} de {viewData ? viewData.length : 0} tabelas
                    </div>
                </div>
                <div className="flex-1 overflow-auto">
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
                            {filteredData.map((t, i) => (
                                <tr key={i} className="hover:bg-blue-50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{t.owner}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">{t.name}</td>
                                    <td className="px-6 py-4 text-sm text-gray-500 truncate max-w-xs">{t.comments}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                                        <button
                                            onClick={() => handleSend(`Estrutura da tabela ${t.owner}.${t.name}`)}
                                            className="text-gray-600 hover:text-blue-900 bg-gray-100 px-3 py-1 rounded text-xs"
                                        >
                                            Estrutura
                                        </button>
                                        <button
                                            onClick={() => handleShowData(t)}
                                            className="text-white hover:bg-emerald-600 bg-emerald-500 px-3 py-1 rounded text-xs shadow-sm font-bold"
                                        >
                                            Exibir Dados
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

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
                <div className="w-full h-full overflow-auto p-4 bg-gray-50 custom-scroll">
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
                                </h3>

                                {indices.length === 0 ? <p className="text-sm text-gray-400 italic">Nenhum índice definido.</p> : (
                                    <div className="flex flex-col gap-2">
                                        {indices.map((idx, i) => (
                                            <div key={i} className="flex items-center gap-2">
                                                <span className="text-[10px] bg-blue-50 text-blue-500 px-1 rounded w-16 truncate text-right font-bold" title={idx.column || '?'}>
                                                    {idx.column || 'CUSTOM'}
                                                </span>
                                                <input
                                                    value={idx.name || idx}
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


    // --- Render Helpers ---

    const renderRoutineReport = () => {
        if (!viewData || !viewData.steps) return null;
        const { routineName, steps } = viewData;

        return (
            <div className="w-full h-full overflow-auto bg-slate-50 p-6 custom-scroll">
                <div className="max-w-3xl mx-auto">
                    <div className="mb-6 flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-purple-600 flex items-center justify-center text-white shadow-lg">
                            <Lightbulb size={24} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-slate-800">Relatório da Rotina</h2>
                            <p className="text-slate-500 font-medium">Execução: {routineName}</p>
                        </div>
                    </div>

                    <div className="space-y-6">
                        {steps.map((step, i) => (
                            <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-fade-in-up" style={{ animationDelay: `${i * 100}ms` }}>
                                <div className={`px-6 py-4 border-b border-gray-100 flex justify-between items-center ${step.status === 'error' ? 'bg-red-50' : ''}`}>
                                    <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${step.status === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                            }`}>
                                            {i + 1}
                                        </div>
                                        <span className="font-bold text-gray-700">{step.step}</span>
                                    </div>
                                    <span className={`text-xs font-bold px-2 py-1 rounded uppercase ${step.status === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                        }`}>{step.status}</span>
                                </div>
                                <div className="p-6">
                                    {step.data && Array.isArray(step.data) ? (
                                        <div className="overflow-x-auto">
                                            <p className="text-xs font-bold text-gray-400 uppercase mb-2">Resultado ({step.data.length} itens)</p>
                                            <div className="max-h-60 overflow-y-auto bg-slate-50 rounded border border-slate-100">
                                                <table className="min-w-full divide-y divide-gray-200">
                                                    <thead className="bg-gray-100 sticky top-0">
                                                        <tr>
                                                            {step.data.length > 0 && Object.keys(step.data[0]).slice(0, 5).map(k => (
                                                                <th key={k} className="px-4 py-2 text-left text-xs font-bold text-gray-500 uppercase">{k}</th>
                                                            ))}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {step.data.slice(0, 10).map((row, idx) => (
                                                            <tr key={idx} className="bg-white">
                                                                {Object.values(row).slice(0, 5).map((val, vIdx) => (
                                                                    <td key={vIdx} className="px-4 py-2 text-xs text-gray-600 truncate max-w-[150px]">
                                                                        {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                                                                    </td>
                                                                ))}
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    ) : (
                                        <pre className="text-xs text-slate-600 whitespace-pre-wrap font-mono bg-slate-50 p-3 rounded">
                                            {JSON.stringify(step.data || step.error, null, 2)}
                                        </pre>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    };

    const renderDataView = () => {
        if (!viewData && !Array.isArray(viewData)) return <div className="p-4 text-gray-500">Nenhum dado para exibir.</div>;

        let rows = [];
        let columns = [];

        if (viewData.metaData && viewData.rows) {
            columns = viewData.metaData.map(m => m.name);
            rows = viewData.rows;
        } else if (Array.isArray(viewData) && viewData.length > 0) {
            rows = viewData;
            columns = Object.keys(rows[0]);
        } else {
            return <div className="p-4 text-gray-500">Nenhum dado encontrado.</div>;
        }

        // --- FILTER LOGIC ---
        let processedRows = rows.filter(row => {
            return columns.every((col, colIdx) => {
                const filterVal = dataFilters[col] ? dataFilters[col].toLowerCase() : '';
                if (!filterVal) return true;

                const cellVal = Array.isArray(row) ? row[colIdx] : row[col];
                const strVal = cellVal === null || cellVal === undefined ? '' : String(cellVal).toLowerCase();
                return strVal.includes(filterVal);
            });
        });

        // --- SORT LOGIC ---
        if (dataSort.key) {
            const colIdx = columns.indexOf(dataSort.key);
            processedRows.sort((a, b) => {
                const valA = Array.isArray(a) ? a[colIdx] : a[dataSort.key];
                const valB = Array.isArray(b) ? b[colIdx] : b[dataSort.key];

                if (valA === valB) return 0;
                if (valA === null || valA === undefined) return 1;
                if (valB === null || valB === undefined) return -1;

                // Try numeric sort
                const numA = Number(valA);
                const numB = Number(valB);
                if (!isNaN(numA) && !isNaN(numB)) {
                    return dataSort.direction === 'asc' ? numA - numB : numB - numA;
                }

                // String sort
                return dataSort.direction === 'asc'
                    ? String(valA).localeCompare(String(valB))
                    : String(valB).localeCompare(String(valA));
            });
        }

        const handleSort = (col) => {
            setDataSort(prev => ({
                key: col,
                direction: prev.key === col && prev.direction === 'asc' ? 'desc' : 'asc'
            }));
        };

        const handleFilterChange = (col, val) => {
            setDataFilters(prev => ({ ...prev, [col]: val }));
        };

        const formatCell = (val) => {
            if (val === null || val === undefined) return <span className="text-gray-300 italic">null</span>;
            if (typeof val === 'object') return JSON.stringify(val);
            if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val)) {
                const date = new Date(val);
                if (!isNaN(date.getTime())) {
                    const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0 || date.getSeconds() !== 0;
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

        const handleRemoteFilter = async (e) => {
            if (e.key === 'Enter') {
                // Synthesize a prompt for the AI based on active filters
                const activeFilters = Object.entries(dataFilters)
                    .filter(([_, val]) => val && val.trim() !== '')
                    .map(([col, val]) => `${col} contém "${val}"`)
                    .join(", ");

                if (activeFilters.length > 0) {
                    const prompt = `Filtre a tabela ${viewData.tableName} onde: ${activeFilters}`;
                    setInput(prompt); // Show in chat box
                    await handleSend(prompt); // Send to AI
                } else {
                    // If all cleared, maybe reload default?
                    // For now, let user manually ask to clear or "Show Data" again
                }
            }
        };

        return (
            <div className="flex flex-col h-full bg-white">
                <div className="flex-1 overflow-auto custom-scroll relative">
                    <table className="min-w-full divide-y divide-gray-200 border-collapse">
                        <thead className="bg-gray-50 sticky top-0 z-20 shadow-sm">
                            <tr>
                                {columns.map(col => (
                                    <th key={col} className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider border-b border-gray-200 bg-gray-50 min-w-[150px]">
                                        <div className="flex flex-col gap-2">
                                            {/* Sortable Header */}
                                            <div
                                                className="flex items-center cursor-pointer hover:text-blue-600 transition-colors"
                                                onClick={() => handleSort(col)}
                                            >
                                                <span>{col}</span>
                                                <span className="ml-2 text-gray-400">
                                                    {dataSort.key === col ? (dataSort.direction === 'asc' ? '▲' : '▼') : '⇅'}
                                                </span>
                                            </div>
                                            {/* Filter Input */}
                                            <input
                                                type="text"
                                                placeholder={`Filtrar ${col}...`}
                                                className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-blue-400 outline-none font-normal"
                                                value={dataFilters[col] || ''}
                                                onChange={(e) => handleFilterChange(col, e.target.value)}
                                                onKeyDown={handleRemoteFilter}
                                                title="Pressione Enter para filtrar no banco"
                                            />
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {processedRows.length === 0 ? (
                                <tr>
                                    <td colSpan={columns.length} className="px-6 py-10 text-center text-gray-500">
                                        Nenhum registro encontrado com os filtros atuais.
                                    </td>
                                </tr>
                            ) : (
                                processedRows.map((row, i) => (
                                    <tr key={i} className="hover:bg-blue-50 transition-colors group">
                                        {columns.map((col, colIdx) => {
                                            const cellVal = Array.isArray(row) ? row[colIdx] : row[col];
                                            return (
                                                <td key={colIdx} className="px-6 py-3 whitespace-nowrap text-sm text-gray-700 border-r border-transparent group-hover:border-gray-100 last:border-r-0">
                                                    {formatCell(cellVal)}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="bg-gray-50 px-6 py-2 border-t border-gray-200 text-xs text-gray-500 flex justify-between">
                    <span>Mostrando {processedRows.length} de {rows.length} registros</span>
                    <span>Use os filtros no topo de cada coluna para refinar</span>
                </div>
            </div>
        );
    };

    return (
        <div className={`h-full ${theme.bg} overflow-hidden font-sans`}>

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

            {/* --- CORRECTION MODAL --- */}
            {correctionModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 w-[400px] border-2 border-red-100">
                        <div className="flex items-center gap-2 mb-4 text-red-600">
                            <Lightbulb className="fill-current" />
                            <h2 className="text-lg font-bold">Ensinar a IA</h2>
                        </div>
                        <p className="text-sm text-gray-500 mb-4">Errei alguma coisa? Me ensine o jeito certo!</p>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase">Termo do Usuário (O que você falou)</label>
                                <input
                                    className="w-full border-b-2 border-gray-200 focus:border-red-500 outline-none py-1 font-bold text-gray-800"
                                    placeholder="Ex: base de vendas"
                                    value={correctionData.term}
                                    onChange={e => setCorrectionData({ ...correctionData, term: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase">Significado Real (Técnico)</label>
                                <input
                                    className="w-full border-b-2 border-gray-200 focus:border-red-500 outline-none py-1 font-mono text-blue-600"
                                    placeholder="Ex: TBL_SALES_2024"
                                    value={correctionData.value}
                                    onChange={e => setCorrectionData({ ...correctionData, value: e.target.value })}
                                />
                            </div>
                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <label className="block text-xs font-bold text-gray-500 uppercase">Tipo</label>
                                    <select
                                        className="w-full border-b-2 border-gray-200 py-1 text-sm bg-transparent"
                                        value={correctionData.type}
                                        onChange={e => setCorrectionData({ ...correctionData, type: e.target.value })}
                                    >
                                        <option value="table">Tabela</option>
                                        <option value="column">Coluna</option>
                                        <option value="filter">Valor/Filtro</option>
                                    </select>
                                </div>
                                {correctionData.type === 'column' && (
                                    <div className="flex-1">
                                        <label className="block text-xs font-bold text-gray-500 uppercase">Tabela Pai</label>
                                        <input
                                            className="w-full border-b-2 border-gray-200 py-1 text-sm font-mono"
                                            placeholder="TBL_PAI"
                                            value={correctionData.context}
                                            onChange={e => setCorrectionData({ ...correctionData, context: e.target.value })}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 mt-6">
                            <button onClick={() => setCorrectionModalOpen(false)} className="px-4 py-2 text-gray-500 text-sm hover:underline">Cancelar</button>
                            <button
                                onClick={submitCorrection}
                                disabled={!correctionData.term || !correctionData.value}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg font-bold text-sm hover:bg-red-700 disabled:opacity-50"
                            >
                                Ensinar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <PanelGroup direction="horizontal" className="h-full">
                {/* LEFT: Chat Interface */}
                <Panel defaultSize={25} minSize={20} maxSize={90} className={`flex flex-col border-r ${theme.border} ${theme.sidebar} shadow-sm z-10 custom-scroll`}>
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
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50 code-scroll">
                        {messages.map((msg) => (
                            <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} group hover:scale-[1.01] transition-transform duration-200`}>
                                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${msg.sender === 'user'
                                    ? 'bg-blue-600 text-white rounded-br-none'
                                    : (msg.isSystem ? 'bg-indigo-50 text-indigo-900 border border-indigo-100' : 'bg-white text-gray-800 border border-gray-100 rounded-bl-none')
                                    }`}>
                                    {msg.sender === 'ai' ? (
                                        <>
                                            {msg.isCustom ? msg.content : (
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
                                            )}

                                            {/* FEEDBACK UI */}
                                            {!msg.isSystem && !msg.isCustom && (
                                                <div className="mt-2 pt-2 border-t border-gray-100 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => handleFeedback('like', msg)}
                                                        className={`p-1 rounded hover:bg-green-50 text-gray-400 hover:text-green-600 transition-colors ${likedMessages.has(msg.id) ? 'text-green-600 bg-green-50' : ''}`}
                                                        title="Resposta correta"
                                                    >
                                                        <ThumbsUp size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleFeedback('dislike', msg)}
                                                        className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                                                        title="Ensinar correção"
                                                    >
                                                        <ThumbsDown size={14} />
                                                    </button>
                                                </div>
                                            )}
                                        </>
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
                        <div className="flex items-end gap-2">
                            <textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder={mode === 'ai' ? "Ex: Quero ver os clientes de São Paulo..." : "Comandos: Busque tabelas..., Estrutura de..."}
                                className={`flex-1 border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y shadow-sm ${theme.input} ${theme.border}`}
                                rows={3}
                                style={{ minHeight: '80px', maxHeight: '600px' }}
                            />
                            <button
                                onClick={() => handleSend()}
                                disabled={!input.trim() || loading}
                                className={`p-3 rounded-xl transition-colors mb-0.5 ${input.trim() ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md transform active:scale-95' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                                    <path d="M3.478 2.404a.75.75 0 00-.926.941l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.404z" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </Panel>

                <PanelResizeHandle className="w-2 bg-gray-300 hover:bg-blue-500 transition-colors cursor-col-resize z-50 shadow-sm" />

                <Panel className={`flex flex-col bg-white overflow-hidden relative min-w-0`}>
                    {/* Header */}
                    <div className={`h-14 border-b ${theme.border} flex items-center justify-between px-6 bg-white overflow-hidden flex-shrink-0`}>
                        <h3 className="font-bold text-gray-700 text-sm uppercase tracking-wider flex items-center">
                            <span className="text-lg mr-2">📄</span>
                            {activeView === 'welcome' && 'Início'}
                            {activeView === 'table_results' && 'Resultados da Busca'}
                            {activeView === 'schema_view' && 'Estrutura da Tabela'}
                            {activeView === 'data_view' && 'Dados'}
                            {activeView === 'draft_view' && 'Rascunho'}
                            {activeView === 'column_selection' && 'Seleção de Colunas'}
                            {activeView === 'table_selection' && 'Seleção de Tabela'}
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
                            <div className="w-full h-full overflow-y-auto p-4 custom-scroll">
                                <div className="text-center mb-10 mt-10">
                                    <h1 className="text-4xl font-extrabold text-gray-900 mb-2 tracking-tight">
                                        O que vamos construir hoje?
                                    </h1>
                                    <p className="text-lg text-gray-500">
                                        Escolha um atalho ou digite sua pergunta ao lado.
                                    </p>
                                </div>

                                {/* DYNAMIC HEADLINES (Cards) - Grid Layout for Responsiveness */}
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-6 max-w-[1600px] mx-auto">
                                    {headlines.map((headline) => (
                                        <div
                                            key={headline.id}
                                            onClick={() => handleHeadlineClick(headline)}
                                            className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 cursor-pointer transition-all duration-300 hover:shadow-md hover:-translate-y-1 hover:border-blue-200 group flex flex-col justify-between h-full min-h-[160px]"
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

                        {activeView === 'table_selection' && viewData && (
                            <div className="p-6 bg-white h-full flex flex-col">
                                <h3 className="text-lg font-bold text-gray-800 mb-2">Selecione a Tabela Correta</h3>
                                <p className="text-sm text-gray-500 mb-4">
                                    Não encontrei exatamente o que você pediu. Talvez seja uma destas?
                                </p>

                                {/* Search Input */}
                                <div className="mb-4">
                                    <input
                                        type="text"
                                        placeholder="Filtrar nesta lista..."
                                        value={tableFilter}
                                        onChange={(e) => setTableFilter(e.target.value)}
                                        className={`w-full px-4 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none transition-all ${theme.border} ${theme.input} text-sm`}
                                        autoFocus
                                    />
                                </div>

                                <div className="flex-1 overflow-y-auto custom-scroll pr-2">
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {viewData
                                            .filter(t => t.toLowerCase().includes(tableFilter.toLowerCase()))
                                            .map((t, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => handleSend(`Use a tabela ${t} para atender ao meu pedido anterior`)}
                                                    className="p-3 text-sm rounded-lg border border-gray-200 hover:border-blue-500 hover:bg-blue-50 text-left transition-all flex items-center group"
                                                >
                                                    <span className="w-2 h-2 rounded-full bg-gray-300 group-hover:bg-blue-500 mr-2 transition-colors"></span>
                                                    <div className="font-medium text-gray-700 break-all">{t}</div>
                                                </button>
                                            ))}
                                        {viewData.filter(t => t.toLowerCase().includes(tableFilter.toLowerCase())).length === 0 && (
                                            <div className="col-span-full text-center text-gray-400 py-8">
                                                Nenhuma tabela encontrada com "{tableFilter}".
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <button onClick={() => setActiveView('welcome')} className="mt-4 text-gray-400 text-xs hover:underline self-start">
                                    Cancelar e voltar ao início
                                </button>
                            </div>
                        )}


                        {activeView === 'column_selection' && viewData && (
                            <ColumnSelection
                                viewData={Array.isArray(viewData) ? { columns: viewData.map(c => ({ name: c.COLUMN_NAME, type: 'VARCHAR2' })), tableName: 'TABELA', value: '' } : viewData}
                                onSearch={(query) => handleSend(query)}
                                onCancel={() => setActiveView('welcome')}
                            />
                        )}
                        {activeView === 'agent_report' && viewData && renderRoutineReport()}
                        {activeView === 'data' && viewData && (
                            <div className="flex flex-col h-full bg-white">
                                {/* Header with Close Button */}
                                <div className="p-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center shadow-sm z-20">
                                    <div className="flex items-center gap-2">
                                        <div className="bg-emerald-100 p-2 rounded-lg text-emerald-600">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                                            </svg>
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">
                                                Visualizando Dados: <span className="text-emerald-600">{viewData.tableName || 'Consulta'}</span>
                                            </h3>
                                            <p className="text-[10px] text-gray-400 font-mono">
                                                Modo Foco Ativado. A IA responderá sobre esta tabela.
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleExitDataView}
                                        className="px-3 py-1 bg-white border border-gray-300 text-gray-500 rounded hover:bg-red-50 hover:text-red-500 hover:border-red-200 text-xs font-bold transition-all shadow-sm flex items-center gap-1"
                                    >
                                        <span>Fechar e Limpar Contexto</span>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                                <div className="flex-1 overflow-hidden relative">
                                    {renderDataView()}
                                </div>
                            </div>
                        )}

                    </div>
                </Panel>
            </PanelGroup>
            {/* Admin Dashboard */}
            <AdminModule isVisible={showAdmin} onClose={() => setShowAdmin(false)} />
        </div>
    );
};

export default AiBuilder;
