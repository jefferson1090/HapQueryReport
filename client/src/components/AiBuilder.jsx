import React, { useState, useEffect, useRef, useContext, useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import RemarkGfm from 'remark-gfm';
import { ThumbsUp, ThumbsDown, Check, X, AlertTriangle, Lightbulb } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ThemeContext } from '../context/ThemeContext';
import { useApi } from '../context/ApiContext';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import ColumnSelection from './ColumnSelection';

import AdminModule from './AdminModule';
import ConnectionForm from './ConnectionForm';
import { FixedSizeList as List } from 'react-window';

import AutoSizer from 'react-virtualized-auto-sizer';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

const VirtualRow = React.memo(({ index, style, data }) => {
    const { rows, columnOrder, colWidths, metaData, formatDate, dateColumnIndices, setViewingContent } = data;
    const row = rows[index];

    // Performance Optimization: Check strict equality first
    if (!row) return null;

    return (
        <div
            style={style}
            className={`flex border-b border-gray-100 items-center hover:bg-blue-50/20 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`} // Simplified classes
        >
            {columnOrder.map((colIndex) => {
                const cell = row[colIndex];
                // Always try to format cell value (handles dates automatically via regex)
                // const isDate = dateColumnIndices.has(colIndex); // No longer needed
                const displayVal = formatDate(cell);

                // Only calculate isLarge if cell implies it (length check on string)
                const isLarge = cell != null && String(cell).length > 80;

                return (
                    <div
                        key={colIndex}
                        className="px-4 py-2 whitespace-nowrap text-sm text-gray-700 flex-shrink-0 border-r border-gray-100 last:border-0 flex items-center justify-between group/cell h-full"
                        style={{ width: colWidths[colIndex] || 150 }}
                    >
                        <div className="overflow-hidden text-ellipsis w-full truncate">
                            {cell === null ? <span className="text-gray-300 italic">null</span> : displayVal}
                        </div>
                        {isLarge && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setViewingContent({
                                        title: metaData[colIndex].name,
                                        content: String(cell)
                                    });
                                }}
                                className="ml-2 p-1 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded opacity-0 group-hover/cell:opacity-100 transition-opacity"
                                title="Ver conteúdo completo"
                            >
                                <span className="text-xs">👁️</span>
                            </button>
                        )}
                    </div>
                );
            })}
        </div>
    );
});

const AiBuilder = React.forwardRef(({ isVisible, connection }, ref) => {
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
    const [menuState, setMenuState] = useState('root');
    const [paginationParams, setPaginationParams] = useState({ offset: 0, hasMore: true });
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    // Data Grid State (Filter & Sort)
    const [dataSort, setDataSort] = useState({ key: null, direction: 'asc' });
    const [dataFilters, setDataFilters] = useState({});

    // Missing Items State
    const [missingItems, setMissingItems] = useState({});
    const [isMissingItemsModalOpen, setIsMissingItemsModalOpen] = useState(false);

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

    // Selected Card State (for Dynamic Carga)
    // Selected Card State (for Dynamic Carga)
    // Removed duplicate state from parent

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

    // Reset State Logic on Connection Change
    const startScreenRef = useRef(null);

    useEffect(() => {
        if (connection) {
            console.log('[AiBuilder] Connection changed. Preserving state as per user request.');
            // setMenuState('root');
            // Delegate reset to StartScreen via ref
            // if (startScreenRef.current) {
            //    startScreenRef.current.reset();
            // }
        }
    }, [connection]);

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
        let text = headline.prompt;

        // If it's a template with placeholders, just set input
        if (text.includes('[') || text.includes('{')) {
            if (headline.type === 'template') text = text.replace('[TEMA]', '');
            setInput(text);
        } else {
            // Static prompt (e.g. "Buscar uma tabela") -> Auto Send to trigger AI flow
            setInput(text);
            handleSend(text);
        }
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
                    type: 'clarification',
                    data: data.data
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
                    setActiveView('data');
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

        // --- FILTER & SORT LOGIC (Memoized) ---
        const processedRows = useMemo(() => {
            if (!viewData) return [];
            let rows = [];
            let columns = [];

            if (viewData.metaData && viewData.rows) {
                columns = viewData.metaData.map(m => m.name);
                rows = viewData.rows;
            } else if (Array.isArray(viewData) && viewData.length > 0) {
                rows = viewData;
                columns = Object.keys(rows[0]);
            } else {
                return [];
            }

            // 1. Filter
            let filtered = rows.filter(row => {
                return columns.every((col, colIdx) => {
                    const filterVal = dataFilters[col] ? dataFilters[col].toLowerCase() : '';
                    if (!filterVal) return true;

                    const cellVal = Array.isArray(row) ? row[colIdx] : row[col];
                    const strVal = cellVal === null || cellVal === undefined ? '' : String(cellVal).toLowerCase();
                    return strVal.includes(filterVal);
                });
            });

            // 2. Sort
            if (dataSort.key) {
                const colIdx = columns.indexOf(dataSort.key);
                filtered.sort((a, b) => {
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

            return filtered;
        }, [viewData, dataFilters, dataSort]);

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
                    .map(([col, val]) => `${col} = "${val}"`)
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

        if (!viewData || !viewData.rows) return <div className="p-4 text-gray-400">Nenhum dado para exibir.</div>;

        const isTruncated = viewData.rows.length >= 500;

        return (
            <div className="flex flex-col h-full bg-white relative">
                {/* TRUNCATION BANNER */}
                {isTruncated && (
                    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex justify-between items-center animate-in fade-in slide-in-from-top-2">
                        <div className="flex items-center gap-2 text-amber-800 text-xs font-semibold">
                            <span className="bg-amber-100 p-1 rounded">⚠️</span>
                            <span>Exibindo os primeiros 500 registros (Limite de Segurança)</span>
                        </div>
                        <button
                            onClick={() => {
                                if (viewData.sql) {
                                    window.dispatchEvent(new CustomEvent('hap-run-sql', { detail: { query: viewData.sql } }));
                                } else {
                                    alert("SQL original não disponível.");
                                }
                            }}
                            className="bg-amber-100 hover:bg-amber-200 text-amber-900 px-3 py-1 rounded text-xs font-bold transition-colors flex items-center gap-1 border border-amber-200"
                        >
                            <span>⚡ Ver Tudo no Editor SQL</span>
                        </button>
                    </div>
                )}

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
                <div className="bg-gray-50 px-4 py-3 border-t border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-3">
                    <span className="text-xs text-gray-500 font-medium">
                        Mostrando {processedRows.length} registros
                        {isTruncated && <span className="text-amber-600 ml-1">(Parcial)</span>}
                    </span>

                    <div className="flex items-center gap-2">
                        {/* Open SQL Button */}
                        <button
                            onClick={() => {
                                if (viewData.sql) {
                                    window.dispatchEvent(new CustomEvent('hap-run-sql', { detail: { query: viewData.sql } }));
                                } else {
                                    alert("SQL original indisponível.");
                                }
                            }}
                            className="bg-white hover:bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border border-gray-300 shadow-sm flex items-center gap-1.5"
                            title="Abrir no Editor SQL para análise avançada"
                        >
                            <span>⚡ Abrir SQL</span>
                        </button>

                        {/* Load More Button */}
                        {processedRows.length >= 50 && (
                            <button
                                onClick={() => handleSend(`Carregar mais 500 registros a partir do registro ${rows.length}`)}
                                className="bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border border-blue-200 shadow-sm flex items-center gap-1.5"
                            >
                                <span>⬇️ Carregar +500</span>
                            </button>
                        )}

                        {/* Load ALL Button */}
                        <button
                            onClick={() => {
                                if (confirm("Isso pode travar sua tela se a tabela for muito grande. Deseja carregar SEM LIMITES?")) {
                                    handleSend(`Executar a query original SEM LIMITES (limit: 'all') para trazer todos os dados.`);
                                }
                            }}
                            className="bg-red-50 hover:bg-red-100 text-red-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border border-red-200 shadow-sm flex items-center gap-1.5"
                            title="Cuidado: Pode ser lento"
                        >
                            <span>⚠️ Carregar TUDO</span>
                        </button>
                    </div>
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
                                            {msg.isCustom ? (
                                                msg.content
                                            ) : (
                                                /* OLD BLOCK TAIL IGNORED FOR NOW */
                                                <>
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

                                                    {/* SUGGESTIONS */}
                                                    {msg.options && msg.options.length > 0 && (
                                                        <div className="mt-3 pt-2 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                            {msg.options.map((opt, i) => (
                                                                <button
                                                                    key={i}
                                                                    onClick={() => handleSend(opt)}
                                                                    className="px-3 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800 rounded-lg text-xs font-medium transition-colors text-left flex items-center gap-2"
                                                                >
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0"></span>
                                                                    <span className="truncate">{opt}</span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </>
                                                /* ) : msg.content || ( */
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
                            <span className="text-lg mr-2">{menuState !== 'carga_result' && '📄'}</span>
                            {activeView === 'welcome' && menuState !== 'carga_result' && 'Início'}
                            {menuState === 'carga_result' && 'Extração da Carga'}
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
                            <StartScreen
                                ref={startScreenRef}
                                menuState={menuState}
                                setMenuState={setMenuState}
                                onAction={(action) => {
                                    if (action.type === 'chat') {
                                        setInput(action.prompt);
                                        // Auto focus 50ms later handled by effect, but we can try immediate
                                        setTimeout(() => {
                                            const box = document.querySelector('textarea');
                                            if (box) box.focus();
                                        }, 100);
                                    } else if (action.type === 'send') {
                                        handleSend(action.prompt);
                                    } else if (action.type === 'flow') {
                                        // Specific flows like Create Table
                                        if (action.flow === 'create_table') {
                                            handleFlowStart('CREATE_NAME', 'Para criar a tabela, diga o nome da tabela e o nome dos campos (Ex: tabela de usuario, nome texto tamanho 10)?');
                                        }
                                    }
                                }}
                            />
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
        </div >
    );
});

// --- NEW START SCREEN COMPONENT ---
// Separated for clarity and state management of animations


const StartScreen = React.forwardRef(({ onAction, menuState, setMenuState }, ref) => {
    const { apiUrl } = useApi();
    const searchLockRef = useRef(false);

    /**
     * Dedicated handler for Manual Execution Button.
     * Ensures NO event objects or arguments are passed to the core logic.
     * Also guarantees the loadingRef is reset if we force a new execution.
     */
    const handleManualExecute = (e) => {
        if (e && e.preventDefault) e.preventDefault();
        console.log('[DEBUG] Button Clicked (StartScreen Scope)');

        if (!cargaValue && activeFilters.length === 0) {
            console.error('[DEBUG] CargaValue is empty and no filters!');
            alert('Falha: Selecione uma operadora ou adicione um filtro.');
            return;
        }

        // Hard Reset
        searchLockRef.current = false;
        setExecutionLoading(false);

        console.log('[DEBUG] Locks reset. Triggering query...');

        // Force UI update to show we are trying
        setMenuState('carga_result');

        // Delay to allow UI render
        setTimeout(() => {
            handleCargaExecute(false).then(() => {
                console.log('[DEBUG] Query Triggered Successfully');
            }).catch(err => {
                console.error('[DEBUG] Query Trigger Failed:', err);
                alert('Erro ao iniciar consulta: ' + err.message);
            });
        }, 50);
    };

    // --- STATE DECLARATIONS (Consolidated) ---

    // Core Execution State
    const [cargaValue, setCargaValue] = useState('');
    const [executionLoading, setExecutionLoading] = useState(false);
    const [executionResult, setExecutionResult] = useState(null);
    const [exportTableName, setExportTableName] = useState('');
    const [selectedCard, setSelectedCard] = useState(null); // Added correct state location
    const [isMaximized, setIsMaximized] = useState(false);

    // UI/View State
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
    const [colWidths, setColWidths] = useState([]);
    const [columnOrder, setColumnOrder] = useState([]);

    const [viewingContent, setViewingContent] = useState(null);
    const [showFilters, setShowFilters] = useState(false);
    const [showFilterModal, setShowFilterModal] = useState(false);
    const [draggedColIndex, setDraggedColIndex] = useState(null);
    const [isCargaListMode, setIsCargaListMode] = useState(false);

    // Filter Logic State
    const [activeFilters, setActiveFilters] = useState([]);
    const [isManualOperator, setIsManualOperator] = useState(false);
    const [operatorList, setOperatorList] = useState([]);
    const [dataFilters, setDataFilters] = useState({});
    const [dataSort, setDataSort] = useState({});
    const [tableColumns, setTableColumns] = useState([]);
    const [filtersLoading, setFiltersLoading] = useState(false);
    const [fieldEquivalences, setFieldEquivalences] = useState({}); // { FIELD_NAME: [{value, label}] }

    // List Modal State
    const [listModalOpen, setListModalOpen] = useState(false);
    const [listModalTarget, setListModalTarget] = useState(null);
    const [listText, setListText] = useState('');

    // Missing Items Analysis State
    const [missingItems, setMissingItems] = useState({});
    const [isMissingItemsModalOpen, setIsMissingItemsModalOpen] = useState(false);

    // Smart Export State
    const [exportModalOpen, setExportModalOpen] = useState(false);
    const [exportType, setExportType] = useState('xlsx'); // 'xlsx' | 'csv'
    const [exportPhase, setExportPhase] = useState('choice'); // 'choice' | 'selection'
    const [exportColumns, setExportColumns] = useState([]); // [{ id, label, isSelected }]
    const [exportSearchTerm, setExportSearchTerm] = useState('');

    // Custom Carga Cards State
    const [customCargaCards, setCustomCargaCards] = useState(() => {
        try {
            const saved = localStorage.getItem('hap_carga_custom_cards');
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            console.error("Failed to load custom cards", e);
            return [];
        }
    });
    const [isAddCardModalOpen, setIsAddCardModalOpen] = useState(false);
    const [addCardStep, setAddCardStep] = useState('search'); // 'search' | 'name'
    const [submittingCard, setSubmittingCard] = useState(false);
    const [editingCardId, setEditingCardId] = useState(null);

    // New Card Data
    const [newCardTable, setNewCardTable] = useState(null); // { owner, table_name }
    const [newCardName, setNewCardName] = useState('');
    const [newCardType, setNewCardType] = useState('value');


    // Table Search State
    const [availableTables, setAvailableTables] = useState([]);
    const [tablesLoading, setTablesLoading] = useState(false);
    const [tableSearchTerm, setTableSearchTerm] = useState('');

    // Persistence Effect
    useEffect(() => {
        localStorage.setItem('hap_carga_custom_cards', JSON.stringify(customCargaCards));
    }, [customCargaCards]);

    // --- PAGINATION STATE ---
    const [paginationParams, setPaginationParams] = useState({ offset: 0, limit: 1000, hasMore: true });
    const [totalRecords, setTotalRecords] = useState(0);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    // --- REFS ---
    const headerRef = useRef(null);
    const lastMetaDataRef = useRef(null);
    const scrollContainerRef = useRef(null);
    const autoScrollFrame = useRef(null);
    const scrollSpeedRef = useRef(0);
    const listInputRef = useRef(null);


    // --- SQL IMPORT STATE (SIGO Workflow) ---
    const [sqlMode, setSqlMode] = useState(false);
    const [parsedSqlData, setParsedSqlData] = useState(null); // { columns: [], originalSql: '' }
    const [isParsingSql, setIsParsingSql] = useState(false);
    const fileInputRef = useRef(null);

    React.useImperativeHandle(ref, () => ({
        reset: () => {
            console.log('[StartScreen] Resetting internal state');
            setExecutionResult(null);
            setCargaValue('');
            setIsManualOperator(false);
            setOperatorList([]);
            setSqlMode(false);
            setParsedSqlData(null);
            // fetchOperatorList(); 
        }
    }));

    // --- SQL PARSING HANDLER ---
    const handleSqlFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsParsingSql(true); // Start loading immediately

        try {
            const text = await file.text();

            // Send to Backend Parser
            const response = await fetch(`${apiUrl}/api/parse-sql`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sqlContent: text })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Erro ao processar SQL');
            }

            const data = await response.json();

            // Artificial Delay for user experience
            setTimeout(() => {
                setParsedSqlData(data);

                // --- APPLY EQUIVALENCES FROM PARSER ---
                if (data && data.columns) {
                    const newEquivalences = { ...fieldEquivalences };
                    const uiColumns = data.columns.map(c => ({
                        name: c.name,
                        type: 'VARCHAR2'
                    }));
                    setTableColumns(uiColumns);

                    data.columns.forEach(col => {
                        if (col.options && col.options.length > 0) {
                            newEquivalences[col.name] = col.options;
                        }
                    });
                    setFieldEquivalences(newEquivalences);
                }

                // NAVIGATE TO FILTER SCREEN
                setSqlMode(true);
                fetchSigoOperators();

                setMenuState('carga_input');
                setIsParsingSql(false); // Stop loading

            }, 2000); // 2 seconds delay for "Preparando..."

        } catch (err) {
            console.error('SQL Parse Error:', err);
            alert('Erro ao ler arquivo SQL: ' + err.message);
            setIsParsingSql(false);
            setSqlMode(false);
        } finally {
            e.target.value = ''; // Reset input
        }
    };


    const handleSigoPresetClick = async () => {
        setIsParsingSql(true);
        setParsedSqlData(null);
        setSqlMode(true);

        try {
            // Use T2212_SQL directly
            const response = await fetch(`${apiUrl}/api/parse-sql`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sqlContent: T2212_SQL })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Erro ao processar SQL');
            }

            const data = await response.json();

            setTimeout(() => {
                setParsedSqlData(data);

                // --- APPLY EQUIVALENCES FROM PARSER ---
                if (data && data.columns) {
                    const newEquivalences = { ...fieldEquivalences };

                    // Also populate tableColumns for the UI dropdowns
                    const uiColumns = data.columns.map(c => ({
                        name: c.name,
                        type: 'VARCHAR2' // Default to string for SQL mode as we can't be sure
                    }));
                    setTableColumns(uiColumns);

                    data.columns.forEach(col => {
                        if (col.options && col.options.length > 0) {
                            newEquivalences[col.name] = col.options;
                        }
                    });
                    setFieldEquivalences(newEquivalences);
                }

                setIsParsingSql(false);
                setMenuState('carga_input'); // Navigate to filters
                fetchSigoOperators();
            }, 1000);

        } catch (err) {
            console.error('SQL Parse Error:', err);
            alert('Erro ao processar SQL T2212: ' + err.message);
            setIsParsingSql(false);
            setSqlMode(false);
        }
    };

    const fetchSigoOperators = async () => {
        // Special query for SIGO operators
        // "Select cd_empresa_plano, nm_operadora From incorpora.tb_ope_operadora order by cd_operadora desc"
        // I'll reuse the generic query endpoint
        try {
            const sql = "Select cd_empresa_plano as id, nm_operadora as name From incorpora.tb_ope_operadora order by cd_operadora desc";
            const response = await fetch(`${apiUrl}/api/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sql, params: [] })
            });

            if (response.ok) {
                const data = await response.json();
                // Mapper
                const ops = data.rows.map(r => ({ id: r[0], name: r[1] })); // [0] ID, [1] NAME
                setOperatorList(ops);
            }
        } catch (err) {
            console.error("Failed to fetch SIGO operators", err);
        }
    };


    // Helper: Format Date
    // Helper: Format Date (Universal like SqlRunner)
    const formatDate = useCallback((val) => {
        if (val === null || val === undefined) return '';
        if (typeof val !== 'string') return val;

        const isoDateRegex = /^\d{4}-\d{2}-\d{2}/;
        if (isoDateRegex.test(val)) {
            const d = new Date(val);
            if (!isNaN(d.getTime())) {
                const day = String(d.getDate()).padStart(2, '0');
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const year = d.getFullYear();
                const hours = String(d.getHours()).padStart(2, '0');
                const minutes = String(d.getMinutes()).padStart(2, '0');
                const seconds = String(d.getSeconds()).padStart(2, '0');

                if (hours === '00' && minutes === '00' && seconds === '00') {
                    return `${day}/${month}/${year}`;
                }
                return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
            }
        }
        return val;
    }, []);

    // Helper: Format Date
    // Pre-calculate date column indices for O(1) lookup in VirtualRow
    const dateColumnIndices = useMemo(() => {
        if (!executionResult?.metaData) return new Set();
        const indices = new Set();
        executionResult.metaData.forEach((col, idx) => {
            if (col.type === 'DATE' || col.type?.includes('TIMESTAMP')) {
                indices.add(idx);
            }
        });
        return indices;
    }, [executionResult?.metaData]);

    const sortedRows = useMemo(() => {
        if (!executionResult?.rows) return [];
        if (sortConfig.key === null) return executionResult.rows;

        // Clone to avoid mutating original
        return [...executionResult.rows].sort((a, b) => {
            const valA = a[sortConfig.key];
            const valB = b[sortConfig.key];

            if (valA === valB) return 0;
            if (valA === null || valA === undefined) return 1;
            if (valB === null || valB === undefined) return -1;

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [executionResult, sortConfig]);

    const itemData = useMemo(() => ({
        rows: sortedRows,
        columnOrder,
        colWidths,
        metaData: executionResult?.metaData || [],
        dateColumnIndices, // Pass Set instead of function
        formatDate, // Keep function for non-date specifics if needed, but we use logic below
        setViewingContent
    }), [sortedRows, columnOrder, colWidths, executionResult?.metaData, dateColumnIndices, formatDate]);

    // Helper: Calculate Column Widths
    const getColumnWidths = (metaData, rows) => {
        if (!metaData || !rows) return [];
        const widths = metaData.map(col => {
            let maxLen = col.name.length;
            // Check first 50 rows
            const checkRows = rows.slice(0, 50);
            checkRows.forEach(row => {
                const cellVal = row[metaData.indexOf(col)];
                const len = cellVal ? String(cellVal).length : 4;
                if (len > maxLen) maxLen = len;
            });
            // clamp
            return Math.min(Math.max(maxLen * 10, 100), 400);
        });
        return widths;
    };




    // Effect: Update Column Widths and Order on new result
    useEffect(() => {
        if (executionResult?.rows && executionResult?.metaData) {
            const widths = getColumnWidths(executionResult.metaData, executionResult.rows);
            setColWidths(widths);

            // Initialize column order if needed
            // Only reset if length differs or empty, to preserve reordering if data serves same schema?
            // But usually new execution = new schema.
            // Let's use a simple check: if we switched queries, reset.
            // We can check against lastMetaDataRef if we want strict schema check (implemented in removed code),
            // but for now simple initialization is better than nothing.

            const newMeta = executionResult.metaData;
            const oldMeta = lastMetaDataRef.current;
            let schemeChanged = true;

            if (oldMeta && oldMeta.length === newMeta.length) {
                const allMatch = newMeta.every((col, i) => col.name === oldMeta[i].name);
                if (allMatch) schemeChanged = false;
            }

            if (schemeChanged || columnOrder.length === 0) {
                setColumnOrder(newMeta.map((_, i) => i));
                lastMetaDataRef.current = newMeta;
            }
        }
    }, [executionResult]);

    // Drag and Drop State


    const performAutoScroll = () => {
        if (scrollSpeedRef.current !== 0 && scrollContainerRef.current) {
            scrollContainerRef.current.scrollLeft += scrollSpeedRef.current;
        }
        autoScrollFrame.current = requestAnimationFrame(performAutoScroll);
    };

    const startAutoScroll = () => {
        if (!autoScrollFrame.current) {
            autoScrollFrame.current = requestAnimationFrame(performAutoScroll);
        }
    };

    const stopAutoScroll = () => {
        if (autoScrollFrame.current) {
            cancelAnimationFrame(autoScrollFrame.current);
            autoScrollFrame.current = null;
        }
        scrollSpeedRef.current = 0;
    };

    const handleDragStart = (e, index) => {
        setDraggedColIndex(index);
        e.dataTransfer.effectAllowed = 'move';
        startAutoScroll();
    };

    const handleDragEnd = () => {
        stopAutoScroll();
        setDraggedColIndex(null);
    };

    // Scroll Sync Listener
    const handleOuterRef = (element) => {
        scrollContainerRef.current = element;
        if (element) {
            element.addEventListener('scroll', (e) => {
                if (headerRef.current) {
                    headerRef.current.scrollLeft = e.target.scrollLeft;
                }
            });
        }
    };

    // --- EXPORT LOGIC ---
    const getFormattedTimestamp = () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
    };

    const formatValueForExport = (val) => {
        if (val === null || val === undefined) return '';
        if (typeof val !== 'string') return val;
        // Reuse strict date logic
        const isoDateRegex = /^\d{4}-\d{2}-\d{2}/;
        if (isoDateRegex.test(val)) {
            const date = new Date(val);
            if (!isNaN(date.getTime())) {
                const day = String(date.getDate()).padStart(2, '0');
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const year = date.getFullYear();
                const hours = String(date.getHours()).padStart(2, '0');
                const minutes = String(date.getMinutes()).padStart(2, '0');
                const seconds = String(date.getSeconds()).padStart(2, '0');

                if (hours === '00' && minutes === '00' && seconds === '00') {
                    return `${day}/${month}/${year}`;
                }
                return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
            }
        }
        return val;
    };

    const performNativeSave = async (filename, content, type) => {
        if (window.electronAPI && window.electronAPI.saveFile) {
            const savedPath = await window.electronAPI.saveFile({ filename, content, type });
            if (savedPath) {
                // Optional toast logic here if we had toast access, but alert is fine for now or no-op
                window.electronAPI.showItemInFolder(savedPath);
            }
        } else {
            let blob;
            if (type === 'xlsx') {
                const binary = atob(content);
                const array = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
                blob = new Blob([array], { type: 'application/octet-stream' });
            } else {
                blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
            }
            saveAs(blob, filename); // Ensure file-saver is imported or available
        }
    };



    // --- EXPORT HANDLING WRAPPER ---
    const handleExport = (type) => {
        handleExportRequest(type);
    };

    const executeExport = async (type, columnsOverride = null) => {
        if (!executionResult || !executionResult.rows || executionResult.rows.length === 0) return alert("Sem dados para exportar.");

        // Filename Logic: Extracao_[suffix]
        // Try to get table name from exportTableName or assume generic
        let suffix = "Carga";
        if (exportTableName) {
            const parts = exportTableName.split('_ope_');
            if (parts.length > 1) {
                suffix = parts[1];
            } else {
                suffix = exportTableName;
            }
        }

        const filename = `Extracao_${suffix}_${getFormattedTimestamp()}.${type}`;

        setTimeout(async () => {
            try {
                // Determine columns to export
                let activeColIndices = [];
                let header = [];

                if (columnsOverride) {
                    // Use user selection
                    activeColIndices = columnsOverride.filter(c => c.isSelected).map(c => c.id);
                    header = columnsOverride.filter(c => c.isSelected).map(c => c.label);
                } else {
                    // Use current view
                    activeColIndices = columnOrder; // This respects reordering in view? Yes, columnOrder is indices.
                    header = columnOrder.map(idx => executionResult.metaData[idx].name);
                }

                if (activeColIndices.length === 0) {
                    alert("Selecione pelo menos um campo para exportar.");
                    return;
                }

                let rowsToExport = [...executionResult.rows];

                // 1. Filter (if any applied) - reusing dataFilters logic
                // NOTE: logic duplicated from render, ideally should be shared but acceptable for now
                if (Object.keys(dataFilters).length > 0) {
                    rowsToExport = rowsToExport.filter(row => {
                        return executionResult.metaData.every((col, colIdx) => {
                            const filterVal = dataFilters[col.name] ? dataFilters[col.name].toLowerCase() : '';
                            if (!filterVal || filterVal === '') return true;
                            const cellVal = row[colIdx];
                            return String(cellVal || '').toLowerCase().includes(filterVal);
                        });
                    });
                }

                // 2. Sort
                if (dataSort.key) {
                    const colIdx = executionResult.metaData.findIndex(m => m.name === dataSort.key);
                    rowsToExport.sort((a, b) => {
                        const valA = a[colIdx];
                        const valB = b[colIdx];
                        if (valA === valB) return 0;
                        if (valA === null || valA === undefined) return 1;
                        if (valB === null || valB === undefined) return -1;
                        const numA = Number(valA);
                        const numB = Number(valB);
                        if (!isNaN(numA) && !isNaN(numB)) {
                            return dataSort.direction === 'asc' ? numA - numB : numB - numA;
                        }
                        return dataSort.direction === 'asc'
                            ? String(valA).localeCompare(String(valB))
                            : String(valB).localeCompare(String(valA));
                    });
                }

                // 3. Format
                const formattedRows = rowsToExport.map(row => {
                    return activeColIndices.map(colIdx => formatValueForExport(row[colIdx]));
                });

                const data = [header, ...formattedRows];
                let contentToSend;

                if (type === 'xlsx') {
                    const wb = XLSX.utils.book_new();
                    const ws = XLSX.utils.aoa_to_sheet(data);
                    XLSX.utils.book_append_sheet(wb, ws, "Extração");
                    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                    const bytes = new Uint8Array(wbout);
                    let binary = '';
                    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
                    contentToSend = window.btoa(binary);
                } else if (type === 'csv') {
                    const ws = XLSX.utils.aoa_to_sheet(data);
                    contentToSend = XLSX.utils.sheet_to_csv(ws);
                }

                await performNativeSave(filename, contentToSend, type);
                setExportModalOpen(false); // Close modal on success
            } catch (err) {
                alert("Erro ao exportar: " + err.message);
            }
        }, 100);
    };

    const handleExportRequest = (type) => {
        if (!executionResult || !executionResult.rows || executionResult.rows.length === 0) return alert("Sem dados para exportar.");

        setExportType(type);
        setExportPhase('choice');

        // Initialize export columns using ALL metaData to ensure no fields are missing
        const initCols = executionResult.metaData.map((col, idx) => ({
            id: idx,
            label: col.name,
            isSelected: true // Default to all selected
        }));
        setExportColumns(initCols);
        setExportModalOpen(true);
    };

    // Smart Export Logic
    const toggleColumnExport = (id) => {
        setExportColumns(prev => prev.map(c =>
            c.id === id ? { ...c, isSelected: !c.isSelected } : c
        ));
    };

    const toggleSelectAll = () => {
        setExportColumns(prev => {
            const allSelected = prev.every(c => c.isSelected);
            return prev.map(c => ({ ...c, isSelected: !allSelected }));
        });
    };

    const handleExportDragStart = (e, index) => {
        e.dataTransfer.setData('currIdx', index);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleExportDrop = (e, targetIndex) => {
        e.preventDefault();
        const startIdx = parseInt(e.dataTransfer.getData('currIdx'));
        if (isNaN(startIdx) || startIdx === targetIndex) return;

        setExportColumns(prev => {
            const next = [...prev];
            const moved = next[startIdx];
            next.splice(startIdx, 1);
            next.splice(targetIndex, 0, moved);
            return next;
        });
    };

    const handleDragOver = (e, index) => {
        e.preventDefault(); // Allow dropping
        e.dataTransfer.dropEffect = 'move';

        if (scrollContainerRef.current) {
            const container = scrollContainerRef.current;
            const { left, right } = container.getBoundingClientRect();
            const x = e.clientX;
            const buffer = 150;
            const maxSpeed = 25;

            if (x < left + buffer) {
                const intensity = (left + buffer - x) / buffer; // 0 to 1
                scrollSpeedRef.current = -maxSpeed * intensity;
            } else if (x > right - buffer) {
                const intensity = (x - (right - buffer)) / buffer; // 0 to 1
                scrollSpeedRef.current = maxSpeed * intensity;
            } else {
                scrollSpeedRef.current = 0;
            }
        }
    };

    const handleDrop = (e, targetIndex) => {
        e.preventDefault();
        stopAutoScroll();
        if (draggedColIndex === null || draggedColIndex === targetIndex) return;

        const newOrder = [...columnOrder];
        const movedCol = newOrder[draggedColIndex];

        // Remove from old pos
        newOrder.splice(draggedColIndex, 1);
        // Insert at new pos
        newOrder.splice(targetIndex, 0, movedCol);

        setColumnOrder(newOrder);
        setDraggedColIndex(null);
    };

    // List Modal State


    const openListModal = (filterId, currentValue) => {
        setListModalTarget(filterId);
        setListText(currentValue ? currentValue.split(',').map(s => s.trim().replace(/'/g, '')).join('\n') : '');
        setListModalOpen(true);
    };

    const handleListSave = (e) => {
        if (e && e.preventDefault) e.preventDefault();
        console.log('[DEBUG] Saving List...');

        if (!listModalTarget) {
            console.error('[DEBUG] No target for list save.');
            return;
        }

        try {
            const inputVal = listInputRef.current ? listInputRef.current.value : '';
            console.log('[DEBUG] Input length:', inputVal.length);

            const rawValues = inputVal.split(/[\n,;]+/);
            const cleanValues = rawValues.map(v => v.trim()).filter(v => v.length > 0);

            // Deduplicate
            const uniqueValues = [...new Set(cleanValues)];
            console.log('[DEBUG] Clean items:', uniqueValues.length);

            const joined = uniqueValues.join(',');

            // Determine if target is a filter ID or Main Carga
            if (listModalTarget === 'MAIN_CARGA') {
                setCargaValue(joined);
            } else {
                // Update Active Filters
                if (uniqueValues.length > 0) {
                    setActiveFilters(prev => prev.map(f =>
                        f.id === listModalTarget
                            ? { ...f, value: joined, operator: 'list' }
                            : f
                    ));
                }
            }
            setListModalOpen(false);
            console.log('[DEBUG] List saved and modal closed.');

        } catch (err) {
            console.error('[DEBUG] List Save Error:', err);
            alert('Erro ao salvar lista: ' + err.message);
        }
    };


    // Resize Logic
    const handleColumnResize = (index, newWidth) => {
        setColWidths(prev => {
            const next = [...prev];
            next[index] = Math.max(50, newWidth); // Min width 50px
            return next;
        });
    };

    const autoResizeColumn = (index) => {
        if (!executionResult) return;
        const col = executionResult.metaData[index];
        const rows = executionResult.rows;
        let maxLen = col.name.length;
        // Scan more rows for double click - maybe 100
        rows.slice(0, 100).forEach(row => {
            const cellVal = row[index];
            const len = cellVal ? String(cellVal).length : 0;
            if (len > maxLen) maxLen = len;
        });
        const newWidth = Math.min(Math.max(maxLen * 12, 100), 600); // 12px per char approximation
        handleColumnResize(index, newWidth);
    };

    const handleResizeStop = (e, direction, ref, d) => {
        setSidebarWidth(width => width + d.width);
    };

    const handleDeleteCard = (cardId) => {
        if (window.confirm('Tem certeza que deseja excluir este card personalizado?')) {
            const updatedCards = customCargaCards.filter(c => c.id !== cardId);
            setCustomCargaCards(updatedCards);
        }
    };

    const handleEditCard = (card) => {
        setEditingCardId(card.id);
        setNewCardName(card.title);
        // Mock table object for the UI
        setNewCardTable({
            full_name: card.tableName,
            table_name: card.tableName.split('.').pop(),
            owner: card.tableName.split('.')[0]
        });
        setAddCardStep('name'); // Directly to name/confirm step
        setIsAddCardModalOpen(true);
    };

    const handleAddCard = () => {
        if (addCardStep === 'search') return;
        if (!newCardName.trim()) return alert("O nome do card é obrigatório.");

        if (editingCardId) {
            // Update existing card
            const updatedCards = customCargaCards.map(c => {
                if (c.id === editingCardId) {
                    return {
                        ...c,
                        title: newCardName,
                        tableName: newCardTable.full_name
                    };
                }
                return c;
            });
            setCustomCargaCards(updatedCards);
        } else {
            // Create new card
            const newCard = {
                id: `custom_${Date.now()}`,
                title: newCardName,
                tableName: newCardTable.full_name,
                icon: '📄', // Default icon
                target: 'carga_input',
                isCustom: true
            };
            setCustomCargaCards([...customCargaCards, newCard]);
        }

        setIsAddCardModalOpen(false);
        // Reset state
        setEditingCardId(null);
        setNewCardName('');
        setNewCardTable(null);
        setAddCardStep('search');
    };

    // --- RENDER HELPERS ---
    const handleMD = (e, index) => {
        startResize(index, e);
    };

    const startResize = (index, e) => {
        // Handle Double Click on Resizer
        if (e.detail === 2) {
            e.preventDefault();
            e.stopPropagation();
            autoResizeColumn(index);
            return;
        }

        e.preventDefault();
        e.stopPropagation(); // Prevent sorting if implemented
        const startX = e.clientX;
        const startWidth = colWidths[index] || 150;

        const onMouseMove = (moveEvent) => {
            requestAnimationFrame(() => {
                const currentWidth = startWidth + (moveEvent.clientX - startX);
                handleColumnResize(index, currentWidth);
            });
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    const CARDS = [
        { id: 'find_table', title: 'Localizar Tabela', icon: '🔍', prompt: 'Buscar tabela', type: 'chat', isNew: false },
        { id: 'structure', title: 'Exibir Estrutura', icon: '🏗️', prompt: 'Estrutura da tabela [NOME]', type: 'chat', isNew: false },
        { id: 'create', title: 'Criar Tabela', icon: '✨', prompt: '', type: 'flow', flow: 'create_table', isNew: false },
        { id: 'find_records', title: 'Localizar Registros', icon: '📋', prompt: 'Localizar registros na tabela [NOME]', type: 'chat', isNew: false },
        { id: 'extraction', title: 'Extração', icon: '📦', isActive: true, isNew: true, createdAt: 1766321562779 } // Timestamp roughly now
    ];

    const EXTRACTION_OPTS = [
        { id: 'ext_carga', title: 'CARGA', icon: '📥', prompt: 'Quero realizar uma carga de dados (Extração)', type: 'navigate', target: 'extraction_carga' },
        { id: 'ext_sigo', title: 'SIGO', icon: '🚀', prompt: 'Extração SIGO', type: 'navigate', target: 'sigo_menu' }
    ];

    const T2212_SQL = `
SELECT 
       CD_EMPRESA_PLANO,
       CD_EMPRESA_CONVENIADA,
       CD_CONTRATO_MIGRADO,
       e.nm_pessoa_razao_social,
       NU_CGC_CPF, 
       nm_complemento, 
       e.fl_status,
       DECODE(FL_STATUS, 
              0, 'REGISTRADO', 
              1, 'PENDENTE', 
              2, 'ATIVO', 
              3, 'SUSPENSO', 
              4, 'CANCELADO') DS_SITUACAO,
       e.cd_modelo_corte,
       e.ds_endereco_eletronico,
       FL_TIPO_CONTRATO,
       DECODE(FL_TIPO_CONTRATO_EMP, 
              1, 'INDIVIDUAL/FAMILIAR', 
              3, 'ADESAO C/PATROCINIO', 
              4, 'ADESAO S/PATROCINIO', 
              5, 'COLETIVO C/PATROCINIO', 
              6, 'COLETIVO S/PATROCINIO') DS_TIPO_CONTRATO,
       FL_NATUREZA_EMPRESA,
       DECODE(FL_NATUREZA_EMPRESA, 
              0, 'NORMAL-PRE', 
              1, 'SINDICATO', 
              2, 'ASSOCIACAO', 
              3, 'COOPERATIVA', 
              4, 'GRUPO', 
              5, 'NORMAL-POS', 
              6, 'SIMPLES', 
              7, 'EMPRESA DO GOVERNO', 
              8, 'EMP.IND.VINC.COLET', 
              9, 'PEQ/MICRO EMPRESA') DS_TIPO_EMPRESA,
       dt_cadastramento, 
       dt_referencia_carencia,
       DT_CANCELAMENTO,
       e.cd_cancelamento,
       CD_EMPRESA_CONTROLE_UTILIZACAO,
       CD_EMPRESA_COBRANCA, 
       NVL(
           (SELECT v.cd_empresa_odonto 
            FROM tb_vcc_empresa v 
            WHERE v.cd_empresa_saude = e.cd_empresa_conveniada),
           (SELECT v.cd_empresa_saude 
            FROM tb_vcc_empresa v 
            WHERE v.cd_empresa_odonto = e.cd_empresa_conveniada)
          ) EMP_RELAC,
       CD_FILIAL, 
       CD_CARTEIRA_COBRANCA, 
       (SELECT DS_CARTEIRA 
        FROM TB_CARTEIRA_BANCO 
        WHERE CD_CARTEIRA= e.CD_CARTEIRA_COBRANCA) DS_CARTEIRA_COBRANCA,
       FL_TIPO_CONTRATO_EMP,
       DECODE(FL_TIPO_CONTRATO_EMP, 
              1, 'INDIVIDUAL/FAMILIAR', 
              3, 'ADESAO C/PATROCINIO', 
              4, 'ADESAO S/PATROCINIO', 
              5, 'COLETIVO C/PATROCINIO', 
              6, 'COLETIVO S/PATROCINIO') FL_TIPO_CONTRATO_EMP,
       FL_ENVIA_SIB,
       FL_TIPO_EMPRESA,
       DECODE(FL_TIPO_EMPRESA, 
              1, 'PRE-PAGAMENTO', 
              2, 'CONGENERE',
              3, 'C OPERACIONAL', 
              4, 'ABRANGE',
              5, 'CONG REP FIXO', 
              6, 'ADM CARTEIRA',
              7, 'EMP PARTICULAR', 
              8, 'SAUDE SIMPLES') DS_TIPO_EMPRESA,
       CD_CANAL_VENDA,
       DECODE(CD_CANAL_VENDA, 
              1, 'PIM  (individ/3-29 vidas)', 
              2, 'MPE (30-99 vidas)',
              3, 'MIDDLE (100-299 vidas)', 
              4, 'CORPORATE (acima de 300 vidas)',
              5, 'PROJ.ESPECIAL', 
              7, 'ADMINISTRADORA',
              8, 'LICITACAO', 
              9, 'CONVENCAO') DS_CANAL_VENDA,
       DT_DIA_PAGAMENTO,
       FL_TIPO_FATURAMENTO,
       DECODE(FL_TIPO_FATURAMENTO, 
              1, 'PRE PAGAMENTO', 
              2, 'POS PAGAMENTO') DS_TIPO_FATURAMENTO,
       CD_FORMA_PAGAMENTO,
       (SELECT DS_FORMA_PAGAMENTO 
        FROM TB_FORMA_PAGAMENTO 
        WHERE CD_FORMA_PAGAMENTO = e.CD_FORMA_PAGAMENTO) DS_FORMA_PAGAMENTO,
       CD_PLANO,
       (SELECT p.nm_plano 
        FROM tb_plano p 
        WHERE p.cd_plano = e.cd_plano) nm_plano,
       CD_TABELA,
       CD_TABELA_INATIVO,
       DT_VALIDADE_CONTRATO,
       (SELECT c.dt_validade_contrato 
        FROM incorpora.tb_ope_contrato_coletivo c 
        WHERE c.cd_operadora IN ('16','21') 
          AND c.cd_contrato = e.cd_contrato_migrado 
          AND ROWNUM = 1) DT_VALIDADE_CONTRATO_OPE,
       NU_EMPREGADO_CONVENIO,
       DT_DIA_COBERTURA,
       CD_EMPRESA_AGRUPADOR_AFASTADOS, 
       DT_DIA_LIMITE,				
				nvl((select l.dia_limite_acesso from tb_emp_limite_acesso_contra l 
			         Where l.cd_empresa_conveniada = e.cd_empresa_conveniada),
          (select TB_CONTROLE_INTERNET.DIA_LIMITE_ACESSO 
                  from
                  TB_CONTROLE_INTERNET,
                  tb_acesso_internet
                   where  
                      tb_acesso_internet.cd_pessoa =  e.cd_pessoa 
                  and tb_acesso_internet.cd_acesso = TB_CONTROLE_INTERNET.cd_acesso
                  and TB_CONTROLE_INTERNET.cd_servico = 7
                  and tb_acesso_internet.cd_tipo_acesso = 5)
          ) DIA_LIMITE_ACESSO,
        CD_MODALIDADE_PAG,
(select FL_CAD_FUT from TB_DIA_COBERTURA_EMP d where d.cd_empresa_conveniada = e.cd_empresa_conveniada) FL_CAD_FUT, 
(select FL_PRECO_FAMILIAR from TB_EMP_CONVENIADA_SAUDE_FLAGS s where e.cd_empresa_conveniada = s.cd_empresa_conveniada) FL_PRECO_FAMILIAR,
(select DT_DIA_FATURAMENTO from TB_EMP_CONVENIADA_SAUDE_FLAGS s where e.cd_empresa_conveniada = s.cd_empresa_conveniada) DT_DIA_FATURAMENTO,
(select d.qt_meses_faturamento from tb_emp_conveniada_saude_flags d where d.cd_empresa_conveniada = e.cd_empresa_conveniada) Mes_Faturamento, 
(select d.fl_gera_previa from tb_emp_conveniada_saude_flags d where d.cd_empresa_conveniada = e.cd_empresa_conveniada) fl_gera_previa,
(select d.dt_dia_geracao_previa from tb_emp_conveniada_saude_flags d where d.cd_empresa_conveniada = e.cd_empresa_conveniada) Val_Previa,
(select d.nu_dias_validade_previa from tb_emp_conveniada_saude_flags d where d.cd_empresa_conveniada = e.cd_empresa_conveniada) Dia_Previa,
(select d.qt_meses_previa from tb_emp_conveniada_saude_flags d where d.cd_empresa_conveniada = e.cd_empresa_conveniada) Mes_Previa,
nvl((Select l.dia_limite_acesso From tb_emp_limite_acesso_contra l Where e.cd_empresa_conveniada = l.cd_empresa_conveniada)
     ,( SELECT TB_CONTROLE_INTERNET.DIA_LIMITE_ACESSO
                  FROM TB_CONTROLE_INTERNET
                  JOIN tb_acesso_internet
                    ON tb_acesso_internet.cd_acesso = TB_CONTROLE_INTERNET.cd_acesso
                  WHERE tb_acesso_internet.cd_pessoa = e.cd_pessoa
                    AND TB_CONTROLE_INTERNET.cd_servico = 7
                    AND tb_acesso_internet.cd_tipo_acesso = 5
    )) dt_corte
From vw_empresa_conveniada_cad e
`;

    const CARGA_OPTS = [
        { id: 'contrato_coletivo', title: 'Contrato Coletivo', icon: '👥', target: 'carga_input' },
    ];

    const OPERATOR_LABELS = {
        'equals': 'Igual a',
        'contains': 'Contém',
        'starts_with': 'Começa com',
        'ends_with': 'Termina com',
        'greater_than': 'Maior que',
        'less_than': 'Menor que',
        'greater_equal': 'Maior ou Igual',
        'less_equal': 'Menor ou Igual',
        'between': 'Entre',
        'between_date': 'Entre Datas',
        'list': 'Lista'
    };

    const isRecent = (timestamp) => {
        if (!timestamp) return false;
        const diff = Date.now() - timestamp;
        return diff < (15 * 24 * 60 * 60 * 1000); // 15 days
    };

    const handleCardClick = (card) => {
        if (card.id === 'extraction') {
            setMenuState('extraction');
        } else {
            onAction(card);
        }
    };






    useEffect(() => {
        if (!executionResult) {
            setMissingItems({});
            return;
        }

        const verifyMissingItems = async () => {
            const missing = {};
            let hasMissing = false;
            const table = selectedCard?.tableName || 'incorpora.tb_ope_contrato_coletivo';

            // 1. Check Main Carga (cd_operadora)
            if (menuState === 'carga_result' && cargaValue && cargaValue.includes(',')) {
                const inputList = cargaValue.split(',').map(v => v.trim()).filter(v => v !== '');
                const uniqueInput = [...new Set(inputList)];

                if (uniqueInput.length > 0) {
                    try {
                        const col = 'cd_operadora';
                        const res = await fetch(`${apiUrl}/api/verify-missing`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ tableName: table, columnName: col, values: uniqueInput })
                        });
                        const data = await res.json();

                        if (data.missingItems && data.missingItems.length > 0) {
                            missing[col] = data.missingItems;
                            hasMissing = true;
                        }
                    } catch (err) {
                        console.error("Error verifying main carga items:", err);
                    }
                }
            }

            // 2. Check Active List Filters
            for (const filter of activeFilters) {
                if (filter.operator === 'list' && filter.value) {
                    const inputList = filter.value.split(',').map(v => v.trim()).filter(v => v !== '');
                    const uniqueInput = [...new Set(inputList)];

                    if (uniqueInput.length === 0) continue;

                    try {
                        const col = filter.column;
                        const res = await fetch(`${apiUrl}/api/verify-missing`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ tableName: table, columnName: col, values: uniqueInput })
                        });
                        const data = await res.json();

                        if (data.missingItems && data.missingItems.length > 0) {
                            missing[col] = data.missingItems;
                            hasMissing = true;
                        }
                    } catch (err) {
                        console.error(`Error verifying list for ${filter.column}:`, err);
                    }
                }
            }

            if (hasMissing) {
                setMissingItems(missing);
            } else {
                setMissingItems({});
            }
        };

        // Debounce or just run? Run once when executionResult updates (implies search finished)
        // Check if loading to avoid pre-emptive empty check?
        // executionLoading is false when result arrives.
        if (!executionLoading) {
            verifyMissingItems();
        }

    }, [executionResult, activeFilters, cargaValue, executionLoading, menuState, selectedCard, tableColumns]);

    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });

        // Server-side sort trigger
        // We need to wait for state update or pass config explicitly.
        // Since setSortConfig is async, we can't call handleCargaExecute immediately with new state unless we refactor.
        // Better: Use useEffect to trigger reload when sortConfig changes? 
        // No, that might trigger loop on initial mount. 
        // Let's rely on the user clicking "Search" again? No, inconvenient.
        // Correct approach: Pass the new sort config to execute, or use a Ref.
        // Simplest for now: Use a useEffect that listens to sortConfig BUT only if we are in 'carga_result' mode.
    };

    // Effect to trigger search on Sort Change (if already showing results)
    useEffect(() => {
        if (menuState === 'carga_result' && cargaValue) {
            // Only re-execute if we are already seeing results and sort changes
            // We use a ref to track if it's a real sort change? 
            // Validating if executionResult exists is enough to know we have data, 
            // but we shouldn't depend on it triggering the effect.
            handleCargaExecute(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sortConfig]);

    useEffect(() => {
        // Prefetch operators
        fetchOperators();
    }, []);

    const fetchOperators = async () => {
        try {
            const response = await fetch('http://localhost:3001/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sql: "Select cd_operadora, nm_operadora From incorpora.tb_ope_operadora order by cd_operadora desc"
                })
            });
            const data = await response.json();
            if (data.rows) {
                // Map to object { id, name }
                const formatted = data.rows.map(row => ({
                    id: row[0],
                    name: row[1]
                }));
                setOperatorList(formatted);
            }
        } catch (e) {
            console.error("Failed to fetch operators", e);
        }
    };

    // { title, content }


    const fetchTableColumns = async (specificTable) => {
        // In SQL Mode (SIGO/Import), columns are static from the parser.
        // Don't fetch unless we are explicitly switching tables for some reason.
        if (sqlMode && !specificTable) {
            console.log("Skipping column fetch in SQL Mode");
            return;
        }

        const targetTable = specificTable || exportTableName || 'incorpora.tb_ope_contrato_coletivo';

        // Always fetch if a specific table is requested, ignoring current cache if distinct? 
        // For simplicity, just force fetch.
        setFiltersLoading(true);
        // Clear previous columns potentially to avoid mix
        setTableColumns([]);

        try {
            const res = await fetch(`${apiUrl}/api/columns/${targetTable}`);
            const data = await res.json();
            if (Array.isArray(data)) {
                // Normalize Oracle data ({ COLUMN_NAME, DATA_TYPE }) to frontend ({ name, type })
                const formatted = data.map(c => ({
                    name: c.COLUMN_NAME,
                    type: c.DATA_TYPE
                }));
                setTableColumns(formatted);
            }
        } catch (error) {
            console.error("Error fetching columns:", error);
        } finally {
            setFiltersLoading(false);
        }
    };

    const fetchAvailableTables = async () => {
        setTablesLoading(true);
        try {
            const response = await fetch(`${apiUrl}/api/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sql: `
                        SELECT owner, table_name 
                        FROM all_tables 
                        WHERE owner = 'INCORPORA' 
                           OR (owner = 'HUMASTER' AND table_name LIKE 'TT_%')
                        ORDER BY table_name ASC
                    `
                })
            });
            const data = await response.json();

            if (data.rows) {
                const formatted = data.rows.map(row => ({
                    owner: row[0],
                    table_name: row[1],
                    full_name: `${row[0]}.${row[1]}`
                }));
                setAvailableTables(formatted);
            }
        } catch (e) {
            console.error("Failed to fetch tables", e);
        } finally {
            setTablesLoading(false);
        }
    };

    const toggleFilters = () => {
        if (!showFilters) {
            fetchTableColumns();
        }
        setShowFilters(!showFilters);
    };

    const addFilterRow = () => {
        setActiveFilters([...activeFilters, { id: Date.now(), column: '', operator: '=', value: '', value2: '', logic: 'AND' }]);
    };

    const removeFilterRow = (id) => {
        setActiveFilters(activeFilters.filter(f => f.id !== id));
    };

    const formatDateInput = (value) => {
        // Remove non-digits
        const v = value.replace(/\D/g, '');
        if (v.length <= 2) return v;
        if (v.length <= 4) return `${v.slice(0, 2)}/${v.slice(2)}`;
        return `${v.slice(0, 2)}/${v.slice(2, 4)}/${v.slice(4, 8)}`;
    };

    const handleFilterValueChange = (id, field, value, colType) => {
        let finalValue = value;
        if (colType && (colType === 'DATE' || colType.includes('TIMESTAMP'))) {
            finalValue = formatDateInput(value);
        }
        updateFilterResults(id, field, finalValue);
    };

    const updateFilterResults = (id, field, value) => {
        if (field === 'column') {
            const col = tableColumns.find(c => c.name === value);
            let defaultOp = 'equals';
            if (col) {
                // User requested 'equals' as default for everything
                defaultOp = 'equals';
            }
            // Reset operator and value when column changes
            setActiveFilters(activeFilters.map(f => f.id === id ? { ...f, column: value, operator: defaultOp, value: '', value2: '' } : f));
        } else {
            setActiveFilters(activeFilters.map(f => f.id === id ? { ...f, [field]: value } : f));
        }
    };

    const handleExtractionClick = (opt) => {
        if (opt.type === 'navigate') {
            setMenuState(opt.target);
            if (opt.target === 'carga_input') {
                setSelectedCard(opt);
                // Reset context for new card
                setCargaValue('');
                setActiveFilters([]);
                setExecutionResult(null);
            }
        } else {
            onAction(opt);
        }
    };



    const getOperatorsForType = (type) => {
        if (!type) return [];
        const t = type.toUpperCase();
        if (t.includes('NUMBER') || t.includes('FLOAT') || t.includes('INTEGER')) {
            return [
                { value: 'equals', label: 'Igual' },
                { value: 'greater_than', label: 'Maior que' },
                { value: 'less_equal', label: 'Menor ou igual' },
                { value: 'between', label: 'Entre faixa' },
                { value: 'list', label: 'Lista' }
            ];
        } else if (t.includes('DATE') || t.includes('TIMESTAMP')) {
            return [
                { value: 'equals', label: 'Igual' },
                { value: 'greater_than', label: 'Maior que' },
                { value: 'less_equal', label: 'Menor ou igual' },
                { value: 'between', label: 'Entre datas' }
            ];
        } else {
            return [
                { value: 'equals', label: 'Igual' },
                { value: 'contains', label: 'Contém' },
                { value: 'starts_with', label: 'Iniciado com' },
                { value: 'ends_with', label: 'Terminado com' },
                { value: 'list', label: 'Lista' }
            ];
        }
    };

    const handleCargaExecute = async (isLoadMoreArg = false) => {
        const isLoadMore = isLoadMoreArg === true;
        // Allow if we have value OR active filters (for SQL Mode mainly)
        if (!cargaValue && activeFilters.length === 0) return;

        // Lock check using Ref to prevent double-firing from scroll events
        // Only enforce lock for "Load More" to prevent scroll bounce.
        // Manual execution (button click) should always be allowed to proceed (and effectively reset/restart).
        if (isLoadMore && searchLockRef.current) return;

        searchLockRef.current = true;

        // Identify Context
        const currentTable = selectedCard?.tableName || 'incorpora.tb_ope_contrato_coletivo';
        const isIncorpora = currentTable.toLowerCase().includes('incorpora');

        // Set table name for export context
        setExportTableName(currentTable);

        console.log('[CARGA] Starting execution. LoadMore:', isLoadMore, 'Table:', currentTable);

        if (!isLoadMore) {
            setExecutionResult(null);
            setExecutionLoading(true);
            setTotalRecords(0);
            setMenuState('carga_result');
            setShowFilters(false);
            // Reset pagination
            setPaginationParams({ offset: 0, hasMore: true });
        } else {
            setIsLoadingMore(true);
        }

        try {
            // 1. Build Base SQL
            // Use DISTINCT to prevent duplicate rows from inflating the count, as requested by user.
            let baseSql = `SELECT DISTINCT * FROM ${currentTable}`;
            if (sqlMode && parsedSqlData?.originalSql) {
                // SIGO WORKFLOW: Use imported SQL as the "Table" (Subquery)
                // We wrap it to apply Where clauses externally
                // Remove semicolon if present
                const cleanImported = (parsedSqlData.cleanedSql || parsedSqlData.originalSql).trim().replace(/;$/, '');
                baseSql = `SELECT * FROM (\n${cleanImported}\n) ImportedTable`;
            }

            let whereClauses = [];

            // Main Operator Filter (Legacy/Specific to Incorpora)
            if ((isIncorpora || sqlMode) && cargaValue) { // Allow for SIGO too
                // For SIGO, "cd_operadora" might not exist or be different.
                // The user said: "Select cd_empresa_plano, nm_operadora..." and "use the value of cd_empresa_plano to filter by the field cd_empresa_plano"

                const targetField = sqlMode ? 'CD_EMPRESA_PLANO' : 'cd_operadora';

                if (cargaValue.includes(',')) {
                    const listVals = cargaValue.split(',').map(v => v.trim()).filter(v => v !== '');
                    const uniqueList = [...new Set(listVals)];

                    if (uniqueList.length > 1000) {
                        // Tuple Logic for Main Carga > 1000
                        const tuples = uniqueList.map(v => `('${v.replace(/'/g, "''")}', '0')`).join(',');
                        whereClauses.push(`(${targetField}, '0') IN (${tuples})`);
                    } else {
                        // Standard
                        const ops = uniqueList.map(v => `'${v.replace(/'/g, "''")}'`).join(',');
                        whereClauses.push(`${targetField} IN (${ops})`);
                    }
                } else {
                    whereClauses.push(`${targetField} = '${cargaValue.replace(/'/g, "''")}'`);
                }
            }

            // Additional Filters
            if (activeFilters.length > 0) {
                // ... (Keep existing filter builder logic - reused implicitly if copied or just referenced)
                // Since I am replacing the whole function block, I need to include the filter logic.
                // To keep it clean, I will assume the previous code block for filters was standard.
                // RE-INSERTING FILTER LOGIC FOR CORRECTNESS:
                activeFilters.forEach(filter => {
                    if (filter.column && filter.value) {
                        const col = filter.column;
                        const rawVal = filter.value;

                        const colObj = tableColumns.find(c => c.name === filter.column);
                        const colType = colObj ? colObj.type : 'VARCHAR2';
                        const isNum = ['NUMBER', 'FLOAT', 'INTEGER'].some(t => colType?.includes(t));
                        const isDate = ['DATE', 'TIMESTAMP'].some(t => colType?.includes(t));

                        switch (filter.operator) {
                            case 'list':
                                // Split by comma
                                const listVals = rawVal.split(',').map(v => v.trim()).filter(v => v !== '');
                                const uniqueList = [...new Set(listVals)];
                                if (uniqueList.length > 0) {
                                    if (uniqueList.length > 1000) {
                                        // "Tuple IN" optimization for large lists (Single block, no ORs)
                                        // Bypasses ORA-01795 by comparing tuples: (col, dummy) IN ((val, dummy)...)
                                        if (isNum) {
                                            // Numeric: (col, 0)
                                            const tuples = uniqueList.map(v => `(${v},0)`).join(',');
                                            whereClauses.push(`(${col}, 0) IN (${tuples})`);
                                        } else {
                                            // Text: (col, '0') - Quotes required for values
                                            const tuples = uniqueList.map(v => `('${v.replace(/'/g, "''")}', '0')`).join(',');
                                            whereClauses.push(`(${col}, '0') IN (${tuples})`);
                                        }
                                    } else {
                                        // Standard IN for smaller lists (Cleaner SQL)
                                        if (isNum) {
                                            whereClauses.push(`${col} IN (${uniqueList.join(',')})`);
                                        } else {
                                            const quoted = uniqueList.map(v => `'${v.replace(/'/g, "''")}'`).join(',');
                                            whereClauses.push(`${col} IN (${quoted})`);
                                        }
                                    }
                                }
                                break;
                            case 'equals':
                                if (isNum) whereClauses.push(`${col} = ${rawVal}`);
                                else if (isDate) whereClauses.push(`${col} = TO_DATE('${rawVal}', 'DD/MM/YYYY')`);
                                else whereClauses.push(`${col} = '${rawVal.replace(/'/g, "''")}'`);
                                break;
                            case 'greater_than':
                                if (isNum) whereClauses.push(`${col} > ${rawVal}`);
                                else if (isDate) whereClauses.push(`${col} > TO_DATE('${rawVal}', 'DD/MM/YYYY')`);
                                else whereClauses.push(`${col} > '${rawVal.replace(/'/g, "''")}'`);
                                break;
                            case 'less_equal':
                                if (isNum) whereClauses.push(`${col} <= ${rawVal}`);
                                else if (isDate) whereClauses.push(`${col} <= TO_DATE('${rawVal}', 'DD/MM/YYYY')`);
                                else whereClauses.push(`${col} <= '${rawVal.replace(/'/g, "''")}'`);
                                break;
                            case 'between':
                                const val2 = filter.value2 || '';
                                if (isNum) whereClauses.push(`${col} BETWEEN ${rawVal} AND ${val2}`);
                                else if (isDate) whereClauses.push(`${col} BETWEEN TO_DATE('${rawVal}', 'DD/MM/YYYY') AND TO_DATE('${val2}', 'DD/MM/YYYY')`);
                                else whereClauses.push(`${col} BETWEEN '${rawVal.replace(/'/g, "''")}' AND '${val2.replace(/'/g, "''")}'`);
                                break;
                            case 'contains':
                                whereClauses.push(`UPPER(${col}) LIKE UPPER('%${rawVal.replace(/'/g, "''")}%')`);
                                break;
                            case 'starts_with':
                                whereClauses.push(`UPPER(${col}) LIKE UPPER('${rawVal.replace(/'/g, "''")}%')`);
                                break;
                            case 'ends_with':
                                whereClauses.push(`UPPER(${col}) LIKE UPPER('%${rawVal.replace(/'/g, "''")}')`);
                                break;
                            default:
                                whereClauses.push(`${col} = '${rawVal.replace(/'/g, "''")}'`);
                        }
                    }
                });
            }

            if (whereClauses.length > 0) {
                baseSql += ` WHERE ${whereClauses.join(' AND ')}`;
            }

            // --- OPTIMIZATION: PARALLEL EXECUTION ---

            // 2. Launch Count Query (Async - Don't Await)
            // Only runs on first load (not "Load More")
            // 2. Launch Count Query (Async - Don't Await)
            // Only runs on first load (not "Load More")
            if (!isLoadMore) {
                // Reverting to standard COUNT(*) as requested by user.
                // Since baseSql uses SELECT DISTINCT *, this counts unique rows.
                const countSql = `SELECT COUNT(*) as TOTAL FROM (${baseSql})`;

                // Fire and Forget (but handle state update)
                fetch(`${apiUrl}/api/query`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sql: countSql })
                })
                    .then(res => res.json())
                    .then(countData => {
                        if (countData.rows && countData.rows[0]) {
                            // Check if we are still on the same query context?
                            // Ideally yes, but for now simple check: if we are viewing results.
                            // Ideally we should use a ref to track cancellation, but this is a huge improvement already.
                            setTotalRecords(countData.rows[0][0]);
                        }
                    })
                    .catch(e => console.error("Count Query Failed", e));
            }

            // 3. Prepare Data Query (Sort + Pagination)
            let orderClause = '';

            // Only force ORDER BY if user requested sort OR if we are paging deep
            // If it's the first page (offset 0) and no sort, we want RAW speed (Heap Scan)
            const isFirstPage = (!isLoadMore && paginationParams.offset === 0) || (isLoadMore && paginationParams.offset === 0);
            // Actually paginationParams.offset is the *current* offset for the *request*. 
            // isLoadMore=false means offset reset to 0.
            const effectiveOffset = isLoadMore ? paginationParams.offset : 0;

            if (sortConfig.key) {
                orderClause = ` ORDER BY ${sortConfig.key} ${sortConfig.direction === 'asc' ? 'ASC' : 'DESC'}, 1 ASC`;
                // orderClause += `, ROWID`; // Stability - REMOVED for DISTINCT compatibility
            } else {
                // Default order required for stable pagination (DISTINCT compatible)
                orderClause = ` ORDER BY 1 ASC`;
            }

            baseSql += orderClause;

            // 4. Await Data Query with Pagination Params
            const PAGE_SIZE = 50;
            const currentOffset = isLoadMore ? paginationParams.offset : 0;

            console.log('[CARGA] Fetching Data Params:', { limit: PAGE_SIZE, offset: currentOffset });

            const fetchPromise = fetch(`${apiUrl}/api/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sql: baseSql,
                    limit: PAGE_SIZE,
                    offset: currentOffset
                })
            });

            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Timeout: A consulta demorou muito para responder (> 30s). Verifique sua conexão ou tente filtros mais específicos.")), 30000)
            );

            const response = await Promise.race([fetchPromise, timeoutPromise]);
            const data = await response.json();

            // Handle connection errors
            if (data.error && (data.error.includes('ORA-12154') || data.error.includes('ORA-12541') || data.error.includes('NJS-500'))) {
                setMenuState('connection_required');
                setExecutionLoading(false);
                setIsLoadingMore(false);
                console.error("[CARGA] Connection Error:", data.error);
                return;
            }

            if (data.error) {
                console.error("[CARGA] Server Error:", data.error);
                setExecutionResult({ error: data.error });
            } else {
                const rowsReturned = data.rows ? data.rows.length : 0;
                const hasMore = rowsReturned === PAGE_SIZE;

                setPaginationParams(prev => ({
                    ...prev,
                    offset: isLoadMore ? (prev.offset + rowsReturned) : rowsReturned,
                    hasMore: hasMore
                }));

                if (isLoadMore) {
                    setExecutionResult(prev => {
                        if (!prev || !prev.rows) return prev;
                        return {
                            ...prev,
                            rows: [...prev.rows, ...data.rows]
                        };
                    });
                } else {
                    setExecutionResult(data);
                }
            }

        } catch (error) {
            console.error("[CARGA] Execution Exception (Catch):", error);
            setExecutionResult({ error: error.message || "Erro desconhecido na execução." });
        } finally {
            console.log("[CARGA] Finally Block - Stopping Loading");
            setExecutionLoading(false);
            setIsLoadingMore(false);
            searchLockRef.current = false;
        }
    };

    /**
     * Dedicated Execution Handler
     * Bypasses strict locks for manual triggers and ensures UI feedback.
     */
    const executeFreshQuery = (e) => {
        if (e && e.preventDefault) e.preventDefault();
        console.log(" >>> MANUAL EXECUTE CLICKED <<< ");

        // Hard Reset Locks
        loadingRef.current = false;
        setExecutionLoading(false);

        // Immediate UI Feedback
        setMenuState('carga_result');

        // Call Logic
        setTimeout(() => handleCargaExecute(false), 0);
    };

    const handleConnectionSuccess = () => {
        // Retry execution automatically
        handleCargaExecute();
    };



    const handleNewQuery = () => {
        setMenuState('carga_input');
        setExecutionResult(null);
    };

    return (
        <div className="w-full h-full overflow-y-auto p-4 custom-scroll relative flex flex-col">
            {/* GLOBAL LOADING OVERLAY FOR SQL PARSING */}
            {isParsingSql && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-white rounded-3xl p-10 flex flex-col items-center gap-6 shadow-2xl"
                    >
                        <div className="relative w-20 h-20">
                            <div className="absolute inset-0 border-4 border-gray-100 rounded-full"></div>
                            <div className="absolute inset-0 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                            <div className="absolute inset-0 flex items-center justify-center font-bold text-xs text-blue-600">SQL</div>
                        </div>
                        <div className="text-center">
                            <h3 className="text-2xl font-extrabold text-gray-800 mb-2">Preparando estrutura...</h3>
                            <p className="text-gray-500 font-medium animate-pulse">Aguarde, processando filtros.</p>
                        </div>
                    </motion.div>
                </div>
            )}

            {menuState !== 'carga_result' && (
                <div className="text-center mb-10 mt-10 flex-shrink-0">
                    <h1 className="text-4xl font-extrabold text-gray-900 mb-2 tracking-tight">
                        Extração de Dados
                    </h1>
                    <p className="text-lg text-gray-500">
                        {menuState === 'root' && 'Escolha um atalho ou digite sua pergunta ao lado.'}
                        {menuState === 'extraction' && 'Selecione o tipo de extração.'}
                        {menuState === 'extraction_carga' && 'Qual tipo de carga deseja realizar?'}
                        {menuState === 'sigo_menu' && 'Selecione o relatório SIGO'}
                        {menuState === 'carga_input' && 'Informe os parâmetros para a carga.'}
                        {menuState === 'connection_required' && 'Conexão Necessária'}
                    </p>
                </div>
            )}

            <div className={`mx-auto w-full transition-all duration-300 ${menuState === 'carga_result' ? 'h-full max-w-full px-4' : 'max-w-[1200px] min-h-[400px] relative'}`}>
                <AnimatePresence mode="wait">
                    {menuState === 'root' && (
                        <motion.div
                            key="root-grid"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
                            transition={{ duration: 0.3 }}
                            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-6"
                        >
                            {/* Sort Newest First */}
                            {CARDS.sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0)).map((card) => (
                                <motion.div
                                    key={card.id}
                                    layoutId={`card-${card.id}`}
                                    onClick={() => handleCardClick(card)}
                                    className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 cursor-pointer hover:shadow-lg hover:border-blue-300 group flex flex-col justify-between h-[180px] relative overflow-hidden"
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                >
                                    {isRecent(card.createdAt) && (
                                        <div className="absolute top-3 right-3 bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded-full animate-pulse shadow-sm">
                                            NOVO
                                        </div>
                                    )}
                                    <div className="text-4xl mb-4 group-hover:scale-110 transition-transform duration-300 origin-left">
                                        {card.icon}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-800 text-xl mb-1 group-hover:text-blue-600 transition-colors">
                                            {card.title}
                                        </h3>
                                        <p className="text-sm text-gray-400">
                                            {card.prompt ? `"${card.prompt}"` : 'Ação rápida'}
                                        </p>
                                    </div>
                                    {/* Decorative bg element */}
                                    <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-gray-50 rounded-full group-hover:bg-blue-50 transition-colors z-[-1]"></div>
                                </motion.div>
                            ))}
                        </motion.div>
                    )}

                    {menuState === 'extraction' && (
                        <motion.div
                            key="extraction-grid"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex flex-col items-center"
                        >
                            <motion.button
                                onClick={() => setMenuState('root')}
                                className="mb-8 self-start text-gray-400 hover:text-gray-600 flex items-center gap-2 text-sm font-bold uppercase tracking-wider"
                                initial={{ x: -20, opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                            >
                                ← Voltar
                            </motion.button>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-2xl">
                                {EXTRACTION_OPTS.map((opt, i) => (
                                    <motion.div
                                        key={opt.id}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.1 }}
                                        onClick={() => handleExtractionClick(opt)}
                                        className="bg-gradient-to-br from-white to-gray-50 p-8 rounded-3xl shadow-lg border border-gray-100 cursor-pointer hover:shadow-2xl hover:border-purple-300 group text-center relative overflow-hidden"
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                    >
                                        <div className="text-6xl mb-6 transform group-hover:scale-110 transition-transform duration-300">{opt.icon}</div>
                                        <h3 className="text-2xl font-bold text-gray-800 mb-2 group-hover:text-purple-600">{opt.title}</h3>
                                        <p className="text-gray-500 text-sm">Clique para iniciar</p>

                                        {/* Animation effect for 'entering' */}
                                        <div className="absolute inset-0 bg-blue-500 opacity-0 group-hover:opacity-5 transition-opacity duration-500"></div>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>

                    )}

                    {/* CARGA MENU (Contrato Coletivo etc) */}

                    {menuState === 'sigo_menu' && (
                        <motion.div
                            key="sigo-menu"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="flex flex-col w-full h-full items-center justify-center relative overflow-hidden"
                        >
                            {/* Decorative Background Elements */}
                            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                                <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-100/50 rounded-full blur-3xl opacity-60"></div>
                                <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-100/50 rounded-full blur-3xl opacity-60"></div>
                            </div>

                            <div className="relative z-10 w-full max-w-5xl flex flex-col gap-8">

                                {/* Header Section */}
                                <div className="flex items-center justify-between px-6">
                                    <motion.button
                                        onClick={() => setMenuState('extraction')}
                                        whileHover={{ x: -4 }}
                                        className="group flex items-center justify-center w-10 h-10 text-gray-500 hover:text-gray-800 transition-colors bg-white/50 backdrop-blur-sm rounded-full border border-gray-200 hover:border-gray-300 shadow-sm"
                                        title="Voltar"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
                                    </motion.button>

                                    <div className="text-right">
                                    </div>
                                </div>

                                {/* Cards Container */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">

                                    {/* T2212 Card - Standard Design */}
                                    <motion.div
                                        onClick={handleSigoPresetClick}
                                        className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 cursor-pointer hover:shadow-md hover:border-blue-400 group flex flex-col items-center justify-center h-[160px] relative overflow-hidden transition-all"
                                        whileHover={{ scale: 1.05 }}
                                    >
                                        <div className="text-4xl mb-3">📑</div>
                                        <h3 className="font-bold text-gray-700 text-lg text-center px-2">Relatório T2212</h3>
                                        <p className="text-xs text-gray-400 mt-1 max-w-full truncate px-4">Análise de Contratos</p>
                                    </motion.div>

                                    {/* Import SQL Card - Standard Design */}
                                    <motion.div
                                        onClick={(e) => {
                                            if (fileInputRef.current) {
                                                fileInputRef.current.click();
                                            }
                                        }}
                                        className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 cursor-pointer hover:shadow-md hover:border-blue-400 group flex flex-col items-center justify-center h-[160px] relative overflow-hidden transition-all"
                                        whileHover={{ scale: 1.05 }}
                                    >
                                        <div className="text-4xl mb-3">📤</div>
                                        <h3 className="font-bold text-gray-700 text-lg text-center px-2">Importar SQL</h3>
                                        <p className="text-xs text-gray-400 mt-1 max-w-full truncate px-4">Carregar Script .sql</p>

                                        <input
                                            type="file"
                                            ref={fileInputRef}
                                            accept=".sql"
                                            className="hidden"
                                            onChange={handleSqlFileUpload}
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    </motion.div>

                                </div>
                            </div>
                        </motion.div>
                    )}

                    {menuState === 'extraction_carga' && (
                        <motion.div
                            key="carga-grid"
                            initial={{ opacity: 0, x: 50 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -50 }}
                            className="flex flex-col items-center"
                        >
                            <motion.button
                                onClick={() => setMenuState('extraction')}
                                className="mb-8 self-start text-gray-400 hover:text-gray-600 flex items-center gap-2 text-sm font-bold uppercase tracking-wider"
                                initial={{ x: -20, opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                            >
                                ← Voltar
                            </motion.button>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-4xl">
                                {/* Hidden Input for SIGO moved to sigo_menu */}

                                {[...CARGA_OPTS, ...customCargaCards].map((opt, i) => (
                                    <motion.div
                                        key={opt.id}
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        onClick={() => {
                                            if (opt.target === 'carga_input') {
                                                setSelectedCard(opt);
                                                let targetTable = 'incorpora.tb_ope_contrato_coletivo';

                                                // If it's a custom card, we need to set the context table
                                                if (opt.tableName) {
                                                    targetTable = opt.tableName;
                                                }

                                                setExportTableName(targetTable);

                                                // Trigger Column Fetch Immediately
                                                fetchTableColumns(targetTable);

                                                // Reset state for new entry
                                                setCargaValue('');
                                                setExecutionResult(null);
                                                setMenuState('carga_input');
                                            }
                                        }}
                                        className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 cursor-pointer hover:shadow-md hover:border-green-300 group flex flex-col items-center justify-center h-[160px] relative overflow-hidden transition-all"
                                        whileHover={{ scale: 1.05 }}
                                    >
                                        {/* Kebab/Action Menu for Custom Cards */}
                                        {opt.isCustom && (
                                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1" onClick={(e) => e.stopPropagation()}>
                                                <button onClick={() => handleEditCard(opt)} className="p-1 hover:bg-blue-50 text-gray-400 hover:text-blue-500 rounded-full transition-colors" title="Editar Card">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                                </button>
                                                <button onClick={() => handleDeleteCard(opt.id)} className="p-1 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-full transition-colors" title="Excluir Card">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                                </button>
                                            </div>
                                        )}

                                        <div className="text-4xl mb-3">{opt.icon}</div>
                                        <h3 className="font-bold text-gray-700 text-lg text-center px-2">{opt.title}</h3>
                                        {opt.tableName && <p className="text-xs text-gray-400 mt-1 max-w-full truncate px-4" title={opt.tableName}>{opt.tableName}</p>}
                                    </motion.div>
                                ))}

                                {/* Add New Card Button */}
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    onClick={() => {
                                        setAddCardStep('search');
                                        setNewCardTable(null);
                                        setNewCardName('');
                                        fetchAvailableTables();
                                        setIsAddCardModalOpen(true);
                                    }}
                                    className="bg-gray-50 border-2 border-dashed border-gray-300 p-6 rounded-2xl cursor-pointer hover:border-blue-400 hover:bg-blue-50 group flex flex-col items-center justify-center h-[160px] transition-all"
                                    whileHover={{ scale: 1.05 }}
                                >
                                    <div className="w-12 h-12 rounded-full bg-white border border-gray-200 flex items-center justify-center mb-3 group-hover:border-blue-400 font-bold text-gray-400 group-hover:text-blue-500 text-2xl transition-colors">
                                        +
                                    </div>
                                    <h3 className="font-bold text-gray-500 text-lg text-center group-hover:text-blue-600">Incluir Tabela</h3>
                                </motion.div>
                            </div>
                        </motion.div>
                    )}

                    {/* CARGA INPUT FORM */}
                    {/* CARGA INPUT FORM - REDESIGNED */}
                    {/* CARGA INPUT FORM */}
                    {/* CARGA INPUT FORM - REDESIGNED */}
                    {(menuState === 'carga_input') && (
                        <motion.div
                            key="carga-input"
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: -10 }}
                            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                            className="flex flex-col items-center w-full min-h-[700px]"
                        >
                            {/* Loading Overlay for SQL Parsing */}
                            {isParsingSql && (
                                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                                    <div className="bg-white rounded-3xl p-8 flex flex-col items-center gap-6 shadow-2xl animate-bounce-in">
                                        <div className="relative">
                                            <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
                                            <div className="absolute inset-0 flex items-center justify-center font-bold text-xs text-blue-600">SQL</div>
                                        </div>
                                        <div className="text-center">
                                            <h3 className="text-xl font-bold text-gray-800">Lendo conteúdo...</h3>
                                            <p className="text-sm text-gray-500 mt-1">Preparando a ferramenta</p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="w-full max-w-6xl bg-white/90 backdrop-blur-2xl rounded-[2.5rem] shadow-2xl border border-white/50 overflow-hidden ring-1 ring-black/5 flex flex-col h-[85vh] max-h-[900px] min-h-[600px]">

                                {/* Header Moderno */}
                                <div className="px-10 py-8 border-b border-gray-100/50 flex justify-between items-center bg-gradient-to-b from-white to-gray-50/30 flex-shrink-0">
                                    <div className="flex items-center gap-6">
                                        <motion.button
                                            whileHover={{ x: -2, backgroundColor: '#EFF6FF' }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={() => {
                                                if (sqlMode) {
                                                    setMenuState('sigo_menu');
                                                    // Do NOT reset SQL mode here, so user can choose another preset or go back again
                                                } else {
                                                    setMenuState('extraction_carga');
                                                }

                                                if (sqlMode && !parsedSqlData) {
                                                    // Only reset if we really are bailing out completely? 
                                                    // Actually, if we go back to sigo_menu, we might want to keep the mode?
                                                    // Let's keep it simple: Go back to menu.
                                                }
                                            }}
                                            className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:text-blue-600 hover:border-blue-200 transition-colors bg-white shadow-sm"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
                                        </motion.button>
                                        <div>
                                            <h2 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-gray-900 to-gray-600 tracking-tight flex items-center gap-3">
                                                {sqlMode ? 'Filtro do SQL' : 'Filtro de Carga'}
                                            </h2>
                                            <p className="text-sm text-gray-400 font-medium mt-1">Configure os parâmetros para processar sua carga</p>
                                        </div>
                                    </div>

                                    {/* Steps / Status (Decorative) */}
                                    <div className="flex items-center gap-2">
                                        <div className="flex flex-col items-end">
                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Tabela Alvo</span>
                                            <span className="text-sm font-bold text-blue-900 font-mono bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                                                {(selectedCard?.tableName || '...').split('.').pop()}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex-1 p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 overflow-hidden">

                                    {/* LEFT COL: OPERATOR SELECTION */}
                                    <div className="lg:col-span-4 flex flex-col h-full gap-4 min-h-0">

                                        {/* Search Bar */}
                                        <div className="relative group flex-shrink-0">
                                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                                <svg className="h-5 w-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                            </div>
                                            <input
                                                type="text"
                                                placeholder="Filtrar operadoras..."
                                                className="w-full pl-11 pr-4 py-3 bg-gray-50 border-none rounded-2xl text-sm font-semibold text-gray-700 outline-none ring-1 ring-gray-100 focus:ring-2 focus:ring-blue-500/30 focus:bg-white transition-all placeholder-gray-400 shadow-inner"
                                                onChange={(e) => {
                                                    const term = e.target.value.toLowerCase();
                                                    const items = document.querySelectorAll('.operator-item');
                                                    items.forEach(item => {
                                                        const text = item.textContent.toLowerCase();
                                                        item.style.display = text.includes(term) ? 'flex' : 'none';
                                                    });
                                                }}
                                            />
                                        </div>

                                        {/* List Container */}
                                        <div className="flex-1 bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col min-h-0">
                                            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">

                                                {/* Button: All Operators */}
                                                <motion.button
                                                    whileHover={{ scale: 1.02, backgroundColor: cargaValue === '%' ? '#2563EB' : '#F8FAFC' }}
                                                    whileTap={{ scale: 0.98 }}
                                                    onClick={() => {
                                                        setCargaValue('%');
                                                        setIsManualOperator(false);
                                                    }}
                                                    className={`w-full group operator-item p-4 rounded-2xl flex items-center gap-4 transition-all border ${cargaValue === '%' ? 'bg-blue-600 border-blue-500 shadow-lg shadow-blue-500/20' : 'bg-white border-transparent hover:border-gray-200'}`}
                                                >
                                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl shadow-sm transition-colors ${cargaValue === '%' ? 'bg-white text-blue-600' : 'bg-gradient-to-br from-gray-100 to-gray-200 text-gray-400 group-hover:from-blue-100 group-hover:to-blue-50 group-hover:text-blue-500'}`}>
                                                        ∞
                                                    </div>
                                                    <div className="flex-1 text-left">
                                                        <span className={`block text-sm font-bold ${cargaValue === '%' ? 'text-white' : 'text-gray-700 group-hover:text-gray-900'}`}>TODAS AS OPERADORAS</span>
                                                        <span className={`text-[10px] font-semibold tracking-wide ${cargaValue === '%' ? 'text-blue-200' : 'text-gray-400'}`}>CARGA COMPLETA</span>
                                                    </div>
                                                    {cargaValue === '%' && <motion.div layoutId="active-dot" className="w-2 h-2 rounded-full bg-white" />}
                                                </motion.button>

                                                <div className="my-2 border-t border-gray-100 mx-2"></div>

                                                {/* Operator List */}
                                                {operatorList.map(op => {
                                                    const currentId = String(op.id);
                                                    const selectedIds = cargaValue ? cargaValue.split(',').map(s => s.trim()) : [];
                                                    const isSelected = selectedIds.includes(currentId);

                                                    return (
                                                        <motion.button
                                                            key={op.id}
                                                            layout
                                                            onClick={() => {
                                                                let newIds;
                                                                if (isSelected) {
                                                                    newIds = selectedIds.filter(id => id !== currentId);
                                                                } else {
                                                                    // If '%' was selected, clear it first
                                                                    const validIds = selectedIds.filter(id => id !== '%');
                                                                    newIds = [...validIds, currentId];
                                                                }
                                                                setCargaValue(newIds.join(', '));
                                                                setIsManualOperator(false);
                                                            }}
                                                            className={`w-full group operator-item p-3 rounded-2xl flex items-center gap-3 transition-all border relative overflow-hidden ${isSelected ? 'bg-indigo-50 border-indigo-200 shadow-md ring-1 ring-indigo-200' : 'bg-white border-transparent hover:bg-gray-50'}`}
                                                        >
                                                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-xs font-mono transition-colors ${isSelected ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500 group-hover:bg-white group-hover:shadow-sm'}`}>
                                                                {op.id}
                                                            </div>
                                                            <div className="flex-1 text-left z-10">
                                                                <span className={`block text-sm font-bold truncate transition-colors ${isSelected ? 'text-indigo-900' : 'text-gray-600 group-hover:text-gray-900'}`}>{op.name}</span>
                                                            </div>
                                                            {isSelected && (
                                                                <motion.div
                                                                    layoutId={`active-indicator-${op.id}`} // Unique layoutId
                                                                    className="absolute inset-y-0 left-0 w-1 bg-indigo-600 rounded-l-2xl"
                                                                />
                                                            )}
                                                        </motion.button>
                                                    );
                                                })}
                                            </div>

                                            {/* Manual Switch */}
                                            <div className="p-4 bg-gray-50 border-t border-gray-100 flex-shrink-0">
                                                <button
                                                    onClick={() => {
                                                        setIsManualOperator(!isManualOperator);
                                                        setCargaValue('');
                                                    }}
                                                    className={`w-full py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 border ${isManualOperator ? 'bg-gray-900 text-white border-gray-800 shadow-lg' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700'}`}
                                                >
                                                    {isManualOperator ? (
                                                        <><span>📋</span> Voltar para Lista Visual</>
                                                    ) : (
                                                        <><span>⌨️</span> Outras Operadoras</>
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* RIGHT COL: CONFIG & EXECUTE */}
                                    <div className="lg:col-span-8 flex flex-col h-full gap-6 min-h-0">

                                        {/* MANUAL INPUT AREA */}
                                        <AnimatePresence>
                                            {isManualOperator && (
                                                <motion.div
                                                    initial={{ opacity: 0, height: 0 }}
                                                    animate={{ opacity: 1, height: 'auto' }}
                                                    exit={{ opacity: 0, height: 0 }}
                                                    className="bg-gray-900 rounded-3xl p-6 shadow-inner relative overflow-hidden flex-shrink-0"
                                                >
                                                    <div className="flex justify-between items-center mb-3">
                                                        <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Editor de IDs</label>
                                                        <span className="text-[10px] bg-gray-800 text-gray-300 px-2 py-1 rounded font-mono">Separar por vírgula</span>
                                                    </div>
                                                    <textarea
                                                        placeholder="Cole os códigos aqui..."
                                                        className="w-full h-32 bg-transparent border-none text-emerald-400 font-mono text-sm focus:ring-0 placeholder-gray-700 resize-none leading-relaxed"
                                                        value={cargaValue}
                                                        onChange={(e) => setCargaValue(e.target.value)}
                                                        spellCheck="false"
                                                    />
                                                </motion.div>
                                            )}
                                        </AnimatePresence>

                                        {/* FILTERS PANEL */}
                                        <div className="flex-1 bg-white rounded-[2rem] border border-gray-100 shadow-sm flex flex-col overflow-hidden relative min-h-0">
                                            {/* Decorative header blob */}
                                            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-blue-50 to-transparent rounded-bl-full opacity-50 pointer-events-none"></div>

                                            <div className="p-6 border-b border-gray-50 flex justify-between items-center bg-white/50 backdrop-blur-sm z-10 flex-shrink-0">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
                                                    </div>
                                                    <h4 className="text-sm font-bold text-gray-800">Filtros Avançados</h4>
                                                </div>
                                                <motion.button
                                                    whileHover={{ scale: 1.05 }}
                                                    whileTap={{ scale: 0.95 }}
                                                    onClick={addFilterRow}
                                                    className="text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-full transition-all flex items-center gap-1"
                                                >
                                                    <span>+</span> Adicionar Regra
                                                </motion.button>
                                            </div>

                                            <div className="flex-1 p-6 overflow-y-auto custom-scrollbar space-y-4 bg-gray-50/30">
                                                <AnimatePresence>
                                                    {activeFilters.length === 0 ? (
                                                        <motion.div
                                                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                                            className="h-full flex flex-col items-center justify-center text-gray-300 gap-4"
                                                        >
                                                            <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center border-2 border-dashed border-gray-200">
                                                                <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                                                            </div>
                                                            <p className="text-sm font-medium">Nenhum filtro aplicado</p>
                                                        </motion.div>
                                                    ) : (
                                                        activeFilters.map((filter) => (
                                                            <motion.div
                                                                key={filter.id}
                                                                layout
                                                                initial={{ opacity: 0, x: -20 }}
                                                                animate={{ opacity: 1, x: 0 }}
                                                                exit={{ opacity: 0, x: 20 }}
                                                                className="flex items-center gap-3 p-2 bg-white rounded-2xl border border-gray-100 shadow-sm group hover:shadow-md transition-all"
                                                            >
                                                                <div className="w-1 h-10 bg-gray-100 rounded-full group-hover:bg-blue-400 transition-colors"></div>

                                                                {/* Grid Layout for inputs */}
                                                                <div className="flex-1 grid grid-cols-12 gap-3 items-center">

                                                                    {/* Column */}
                                                                    <div className="col-span-4">
                                                                        <select
                                                                            value={filter.column}
                                                                            onChange={(e) => updateFilterResults(filter.id, 'column', e.target.value)}
                                                                            className="w-full bg-gray-50 border-none rounded-xl px-3 py-2 text-xs font-bold text-gray-700 outline-none ring-1 ring-transparent focus:ring-blue-100 focus:bg-white transition-all cursor-pointer hover:bg-gray-100"
                                                                        >
                                                                            <option value="">Selecione o campo...</option>
                                                                            {/* Conditional Columns: SIGO vs Standard */}
                                                                            {sqlMode && parsedSqlData?.columns ? (
                                                                                parsedSqlData.columns.map(col => (
                                                                                    <option key={col.name} value={col.name}>{col.name}</option>
                                                                                ))
                                                                            ) : (
                                                                                tableColumns.map(col => (
                                                                                    <option key={col.name} value={col.name}>{col.name}</option>
                                                                                ))
                                                                            )}
                                                                        </select>
                                                                    </div>

                                                                    {/* Operator */}
                                                                    <div className="col-span-3">
                                                                        <select
                                                                            value={filter.operator}
                                                                            onChange={(e) => updateFilterResults(filter.id, 'operator', e.target.value)}
                                                                            className="w-full bg-gray-50 border-none rounded-xl px-3 py-2 text-xs font-bold text-blue-600 outline-none ring-1 ring-transparent focus:ring-blue-100 focus:bg-white transition-all cursor-pointer uppercase tracking-tight text-center"
                                                                        >
                                                                            {(() => {
                                                                                const colObj = tableColumns.find(c => c.name === filter.column);
                                                                                const ops = getOperatorsForType(colObj?.type);
                                                                                return ops.map(op => (
                                                                                    <option key={op.value} value={op.value}>{op.label}</option>
                                                                                ));
                                                                            })()}
                                                                        </select>
                                                                    </div>

                                                                    {/* Value */}
                                                                    <div className="col-span-5">
                                                                        {filter.operator === 'list' ? (
                                                                            <button
                                                                                onClick={() => openListModal(filter.id, filter.value)}
                                                                                className="w-full py-2 px-4 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition-colors border border-indigo-100 border-dashed flex items-center justify-between"
                                                                            >
                                                                                <span>{filter.value ? `${filter.value.split(',').length} ITEMS` : 'VAZIO'}</span>
                                                                                <span className="text-[10px] opacity-60">EDITAR</span>
                                                                            </button>
                                                                        ) : filter.operator === 'between' ? (
                                                                            <div className="flex gap-2">
                                                                                <input
                                                                                    type="text"
                                                                                    placeholder="De"
                                                                                    className="w-full bg-gray-50 border-none rounded-xl px-3 py-2 text-xs font-medium focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                                                                                    value={filter.value}
                                                                                    onChange={(e) => handleFilterValueChange(filter.id, 'value', e.target.value)}
                                                                                />
                                                                                <input
                                                                                    type="text"
                                                                                    placeholder="Até"
                                                                                    className="w-full bg-gray-50 border-none rounded-xl px-3 py-2 text-xs font-medium focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                                                                                    value={filter.value2 || ''}
                                                                                    onChange={(e) => handleFilterValueChange(filter.id, 'value2', e.target.value)}
                                                                                />
                                                                            </div>
                                                                        ) : (
                                                                            <input
                                                                                type="text"
                                                                                placeholder="Valor..."
                                                                                className="w-full bg-gray-50 border-none rounded-xl px-3 py-2 text-xs font-medium focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                                                                                value={filter.value}
                                                                                onChange={(e) => handleFilterValueChange(filter.id, 'value', e.target.value)}
                                                                            />
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {/* Delete */}
                                                                <button
                                                                    onClick={() => removeFilterRow(filter.id)}
                                                                    className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
                                                                >
                                                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                                                </button>
                                                            </motion.div>
                                                        ))
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        </div>

                                        {/* Action Button */}
                                        <div className="flex-shrink-0">
                                            <button
                                                onClick={handleManualExecute}
                                                disabled={(!cargaValue && activeFilters.length === 0) || executionLoading}
                                                className="w-full py-5 rounded-2xl relative overflow-hidden group disabled:opacity-50 disabled:grayscale transition-all hover:scale-[1.01] active:scale-[0.99] shadow-xl hover:shadow-2xl hover:shadow-indigo-500/30"
                                            >
                                                <div className="absolute inset-0 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 group-hover:bg-size-200 transition-all duration-500"></div>
                                                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out skew-y-12"></div>

                                                <div className="relative z-10 flex items-center justify-center gap-3 text-white font-black text-lg tracking-wide uppercase">
                                                    {executionLoading ? (
                                                        <>
                                                            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                            </svg>
                                                            <span>Processando...</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <span className="text-xl group-hover:scale-125 transition-transform duration-300">⚡</span>
                                                            <span>Executar Extração</span>
                                                        </>
                                                    )}
                                                </div>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* CARGA RESULTS VIEW */}
                    {menuState === 'carga_result' && (
                        <motion.div
                            key="carga-result"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="flex flex-col w-full h-full"
                        >
                            <div className="p-4 bg-white border-b border-gray-200 flex justify-between items-center shadow-sm sticky top-0 z-30">
                                <div className="flex items-center gap-4">
                                    <button
                                        onClick={() => setMenuState('carga_input')}
                                        className="text-gray-400 hover:text-gray-600 flex items-center gap-2 text-xs font-bold uppercase tracking-wider transition-colors bg-gray-50 px-3 py-2 rounded-lg hover:bg-gray-100"
                                    >
                                        ← Voltar
                                    </button>

                                    <div>
                                        <h2 className="text-lg font-black text-gray-800 tracking-tight flex items-center gap-2">
                                            {selectedCard?.title || 'Resultado da Carga'}
                                        </h2>
                                        <div className="flex items-center gap-3 text-xs">
                                            <span className="text-gray-400 font-mono" title={exportTableName}>{exportTableName}</span>
                                            {totalRecords > 0 && (
                                                <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">
                                                    {totalRecords.toLocaleString()} registros
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    {/* Missing Items Alert */}
                                    {Object.keys(missingItems).length > 0 && (
                                        <button
                                            onClick={() => setIsMissingItemsModalOpen(true)}
                                            className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors animate-pulse"
                                        >
                                            <span className="text-lg">⚠️</span>
                                            <span className="font-bold text-xs">{Object.values(missingItems).flat().length} Ausentes</span>
                                        </button>
                                    )}

                                    <button
                                        onClick={toggleFilters}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all shadow-sm border ${showFilters ? 'bg-blue-600 text-white border-blue-600 shadow-blue-200' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
                                        Filtros
                                        {activeFilters.length > 0 && <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full ${showFilters ? 'bg-white text-blue-600' : 'bg-blue-100 text-blue-600'}`}>{activeFilters.length}</span>}
                                    </button>

                                    <div className="h-6 w-px bg-gray-200 mx-1"></div>

                                    {/* Export Buttons */}
                                    <button
                                        onClick={() => handleExport('xlsx')}
                                        disabled={executionLoading || !executionResult || executionResult.error}
                                        className="px-3 py-2 bg-white border border-gray-200 rounded-xl hover:border-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 transition-all shadow-sm flex items-center gap-2 text-xs font-bold text-gray-600 disabled:opacity-50 disabled:grayscale group"
                                        title="Exportar Excel"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600 group-hover:scale-110 transition-transform"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="8" y1="13" x2="16" y2="13"></line><line x1="8" y1="17" x2="16" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                                        Excel
                                    </button>
                                    <button
                                        onClick={() => handleExport('csv')}
                                        disabled={executionLoading || !executionResult || executionResult.error}
                                        className="px-3 py-2 bg-white border border-gray-200 rounded-xl hover:border-blue-500 hover:text-blue-700 hover:bg-blue-50 transition-all shadow-sm flex items-center gap-2 text-xs font-bold text-gray-600 disabled:opacity-50 disabled:grayscale group"
                                        title="Exportar CSV"
                                    >
                                        <span className="text-sm group-hover:scale-110 transition-transform">📄</span> CSV
                                    </button>
                                </div>
                            </div>

                            {/* Filters Drawer (In-place) */}
                            <AnimatePresence>
                                {showFilters && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="bg-gray-50 border-b border-gray-200 overflow-hidden"
                                    >
                                        <div className="p-4 bg-gray-50">
                                            <div className="flex justify-between items-center mb-4">
                                                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Editar Filtros Ativos</h4>
                                                <button onClick={toggleFilters} className="text-xs text-blue-600 hover:underline">Fechar Sem Aplicar</button>
                                            </div>

                                            <div className="space-y-3 mb-4">
                                                {activeFilters.map((filter) => (
                                                    <div key={filter.id} className="flex gap-2 items-center bg-white p-2 rounded-lg border border-gray-200 shadow-sm animate-in fade-in slide-in-from-left-2">
                                                        {/* Column Select */}
                                                        <select
                                                            value={filter.column}
                                                            onChange={(e) => handleFilterValueChange(filter.id, 'column', e.target.value)}
                                                            className="flex-1 p-2 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:bg-white transition-colors outline-none focus:ring-2 focus:ring-blue-100"
                                                        >
                                                            <option value="">Campo...</option>
                                                            {tableColumns.map(c => (
                                                                <option key={c.name} value={c.name}>{c.name}</option>
                                                            ))}
                                                        </select>

                                                        {/* Operator Select */}
                                                        <select
                                                            value={filter.operator}
                                                            onChange={(e) => handleFilterValueChange(filter.id, 'operator', e.target.value)}
                                                            className="w-[110px] p-2 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:bg-white transition-colors outline-none focus:ring-2 focus:ring-blue-100 uppercase font-bold text-gray-600"
                                                        >
                                                            {(() => {
                                                                const colObj = tableColumns.find(c => c.name === filter.column);
                                                                const ops = getOperatorsForType(colObj?.type);
                                                                return ops.map(op => (
                                                                    <option key={op.value} value={op.value}>{op.label}</option>
                                                                ));
                                                            })()}
                                                        </select>

                                                        {/* Value Input */}
                                                        {/* Value Input */}
                                                        <div className="flex-1">
                                                            {filter.operator === 'between' || filter.operator === 'between_date' ? (
                                                                <div className="flex gap-1">
                                                                    <input
                                                                        type={filter.operator.includes('date') ? 'text' : 'text'}
                                                                        value={filter.value}
                                                                        onChange={(e) => handleFilterValueChange(filter.id, 'value', e.target.value, filter.operator.includes('date') ? 'DATE' : 'VARCHAR')}
                                                                        className="w-full p-2 text-xs border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-100"
                                                                        placeholder={(() => {
                                                                            const colType = tableColumns.find(c => c.name === filter.column)?.type?.toUpperCase();
                                                                            return colType?.includes('DATE') ? "DD/MM/YYYY" : "Início";
                                                                        })()}
                                                                    />
                                                                    <input
                                                                        type={filter.operator.includes('date') ? 'text' : 'text'}
                                                                        value={filter.value2 || ''}
                                                                        onChange={(e) => handleFilterValueChange(filter.id, 'value2', e.target.value, filter.operator.includes('date') ? 'DATE' : 'VARCHAR')}
                                                                        className="w-full p-2 text-xs border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-100"
                                                                        placeholder={(() => {
                                                                            const colType = tableColumns.find(c => c.name === filter.column)?.type?.toUpperCase();
                                                                            return colType?.includes('DATE') ? "DD/MM/YYYY" : "Fim";
                                                                        })()}
                                                                    />
                                                                </div>
                                                            ) : filter.operator === 'list' ? (
                                                                <button
                                                                    onClick={() => {
                                                                        // Logic to edit list. We need to identify WHICH filter we are editing.
                                                                        // Since setListModalOpen just opens the modal, we need to bind the save action to this specific filter ID.
                                                                        // For now, let's assume we load the current value into state and open modal.
                                                                        setListText(filter.value);
                                                                        setListModalOpen(true);
                                                                        // We need a way to know we are editing THIS filter when saving.
                                                                        // Maybe set a state 'editingFilterId'
                                                                        // But I don't want to add new state if possible. 
                                                                        // Let's use a ref or just updating listText acts as "buffer" but we need to write back.
                                                                        // Wait, handleListSave uses 'activeFilters' logic? 
                                                                        // Let's check handleListSave. It probably adds a NEW filter or updates?
                                                                        // Logic: setEditingFilterId(filter.id);
                                                                    }}
                                                                    className="w-full p-2 text-xs border border-gray-200 rounded-lg bg-yellow-50 text-yellow-700 hover:bg-yellow-100 transition-colors text-left flex justify-between px-3 items-center"
                                                                >
                                                                    <span className="font-bold">
                                                                        {filter.value ? filter.value.split(',').filter(x => x.trim()).length : 0} Itens
                                                                    </span>
                                                                    <span className="text-[10px] uppercase tracking-wider opacity-70">Editar Lista</span>
                                                                </button>
                                                            ) : null}
                                                            {/* Single Input */}
                                                            {filter.operator !== 'list' && filter.operator !== 'between' && (
                                                                <input
                                                                    type="text"
                                                                    value={filter.value}
                                                                    onChange={(e) => handleFilterValueChange(filter.id, 'value', e.target.value)}
                                                                    className="w-full p-2 text-xs border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-100"
                                                                    placeholder={(() => {
                                                                        const colType = tableColumns.find(c => c.name === filter.column)?.type?.toUpperCase();
                                                                        if (colType?.includes('DATE')) return "DD/MM/YYYY";
                                                                        return "Valor...";
                                                                    })()}
                                                                />
                                                            )}
                                                        </div>

                                                        {/* Remove Button */}
                                                        <button
                                                            onClick={() => removeFilterRow(filter.id)}
                                                            className="p-2 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"
                                                            title="Remover filtro"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                                                <button
                                                    onClick={addFilterRow}
                                                    className="flex items-center gap-2 text-xs font-bold text-blue-600 hover:bg-blue-50 px-3 py-2 rounded-lg transition-colors"
                                                >
                                                    <span className="text-lg">+</span> Adicionar Filtro
                                                </button>

                                                <button
                                                    onClick={() => {
                                                        // Close drawer
                                                        // Execute search
                                                        setShowFilters(false);
                                                        handleCargaExecute(false);
                                                    }}
                                                    className="px-6 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-200 transition-all flex items-center gap-2"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                                    Aplicar
                                                </button>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Loading State */}
                            {executionLoading && !executionResult && (
                                <div className="flex-1 flex flex-col items-center justify-center gap-4 text-blue-600 animate-in fade-in zoom-in duration-300">
                                    <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                                    <div className="text-center">
                                        <p className="text-lg font-bold">Processando consulta...</p>
                                        <p className="text-sm text-blue-400">Isso pode levar alguns segundos dependendo do volume de dados.</p>
                                    </div>
                                </div>
                            )}

                            {/* Error State */}
                            {executionResult && executionResult.error && (
                                <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <div className="w-24 h-24 bg-red-50 rounded-full flex items-center justify-center shadow-inner">
                                        <span className="text-4xl">⚠️</span>
                                    </div>
                                    <div className="text-center max-w-lg">
                                        <h3 className="text-xl font-black text-gray-800 mb-2">Ops! Algo deu errado.</h3>
                                        <p className="text-gray-500 bg-red-50 p-4 rounded-xl border border-red-100 font-mono text-xs text-left overflow-auto max-h-40">
                                            {executionResult.error}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => handleCargaExecute()}
                                        className="px-8 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 hover:shadow-lg hover:shadow-red-200 transition-all active:scale-95"
                                    >
                                        Tentar Novamente
                                    </button>
                                </div>
                            )}

                            {executionResult && !executionResult.error && executionResult.metaData && (
                                <div className="flex-1 flex flex-col overflow-hidden">
                                    {/* Header Row */}
                                    <div
                                        className="flex bg-gray-100 border-b border-gray-200 sticky top-0 z-20 overflow-hidden"
                                        ref={headerRef}
                                    >
                                        {columnOrder.map((colIdx) => {
                                            const col = executionResult.metaData[colIdx];
                                            return (
                                                <div
                                                    key={colIdx}
                                                    className={`flex-shrink-0 p-2 text-[10px] font-bold uppercase tracking-wider relative group border-r border-gray-200 last:border-r-0 h-10 flex items-center cursor-pointer hover:bg-gray-200 transition-colors ${sortConfig.key === col.name ? 'text-blue-600 bg-blue-50' : 'text-gray-500'}`}
                                                    style={{ width: colWidths[colIdx] }}
                                                    onClick={() => handleSort(col.name)}
                                                    title="Clique para ordenar"
                                                >
                                                    <div className="truncate flex-1 pr-4 flex items-center gap-1">
                                                        {col.name}
                                                        {sortConfig.key === col.name && (
                                                            <span>{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>
                                                        )}
                                                    </div>
                                                    <div
                                                        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize opacity-0 group-hover:opacity-100 hover:bg-blue-400 bg-gray-300 transition-all z-30"
                                                        onMouseDown={(e) => handleMD(e, colIdx)}
                                                        onClick={(e) => e.stopPropagation()}
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {/* Rows content */}
                                    <div className="flex-1 overflow-auto custom-scroll p-0" onScroll={(e) => {
                                        if (headerRef.current) headerRef.current.scrollLeft = e.target.scrollLeft;
                                        const { scrollTop, scrollHeight, clientHeight } = e.target;
                                        if (scrollTop + clientHeight >= scrollHeight - 300 && !isLoadingMore && paginationParams.hasMore) {
                                            handleCargaExecute(true);
                                        }
                                    }}>
                                        <div className="inline-block min-w-full">
                                            {executionResult.rows.map((row, rIdx) => (
                                                <div key={rIdx} className="flex border-b border-gray-50 hover:bg-blue-50/30 transition-colors group">
                                                    {columnOrder.map((colIdx) => (
                                                        <div
                                                            key={`${rIdx}-${colIdx}`}
                                                            className="flex-shrink-0 p-2 text-xs text-gray-600 border-r border-gray-50 last:border-r-0 truncate"
                                                            style={{ width: colWidths[colIdx] }}
                                                            onClick={() => {
                                                                const val = row[colIdx];
                                                                if (val && String(val).length > 20) {
                                                                    setViewingContent({ title: executionResult.metaData[colIdx].name, content: String(val) });
                                                                }
                                                            }}
                                                        >
                                                            {formatDate(row[colIdx])}
                                                        </div>
                                                    ))}
                                                </div>
                                            ))}

                                            {isLoadingMore && (
                                                <div className="p-4 flex justify-center bg-gray-50/80">
                                                    <div className="flex items-center gap-2 text-blue-600 font-bold text-xs">
                                                        <div className="w-3 h-3 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin"></div>
                                                        Carregando mais resultados...
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {menuState === 'connection_required' && (
                        <motion.div
                            key="connection-required"
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -30 }}
                            className="flex flex-col items-center w-full max-w-xl mx-auto"
                        >
                            <div className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100 w-full text-center">
                                <h3 className="text-2xl font-bold text-gray-800 mb-4">Conexão Necessária</h3>
                                <p className="text-gray-500 mb-6">
                                    Para continuar, por favor, conecte-se ao banco de dados.
                                </p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div >
            {/* Content Inspection Modal */}
            < AnimatePresence >
                {viewingContent && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
                        onClick={() => setViewingContent(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.9, y: 20 }}
                            className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                                <h3 className="font-bold text-gray-700 flex items-center gap-2">
                                    <span>📄</span>
                                    {viewingContent.title}
                                </h3>
                                <button
                                    onClick={() => setViewingContent(null)}
                                    className="p-2 hover:bg-gray-200 rounded-full transition-colors"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                </button>
                            </div>
                            <div className="p-6 overflow-y-auto whitespace-pre-wrap font-mono text-sm text-gray-800 bg-white">
                                {viewingContent.content}
                            </div>
                            <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
                                <button
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
                                    onClick={() => {
                                        navigator.clipboard.writeText(viewingContent.content);
                                        // Optional toast
                                    }}
                                >
                                    Copiar Conteúdo
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence >

            {/* Missing Items Modal */}
            < AnimatePresence >
                {isMissingItemsModalOpen && (
                    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]"
                        >
                            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-amber-50">
                                <div className="flex items-center gap-2 text-amber-800">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                                    <h3 className="font-bold text-lg">Itens Não Encontrados</h3>
                                </div>
                                <button
                                    onClick={() => setIsMissingItemsModalOpen(false)}
                                    className="p-1 hover:bg-amber-100 rounded-full text-amber-800 transition-colors"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                </button>
                            </div>

                            <div className="p-6 overflow-y-auto custom-scroll">
                                <p className="text-sm text-gray-500 mb-4">
                                    Os seguintes itens foram solicitados nos filtros ("Lista"), mas <strong>não foram encontrados</strong> nos resultados da consulta:
                                </p>

                                <div className="space-y-4">
                                    {Object.entries(missingItems).map(([column, items]) => (
                                        <div key={column} className="border border-amber-100 rounded-xl overflow-hidden">
                                            <div className="bg-amber-50/50 px-4 py-2 border-b border-amber-100 flex justify-between items-center">
                                                <span className="font-bold text-sm text-gray-700">{column}</span>
                                                <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium">
                                                    {items.length} itens ausentes
                                                </span>
                                            </div>
                                            <div className="p-3 bg-white max-h-[150px] overflow-y-auto custom-scroll">
                                                <div className="flex flex-wrap gap-2">
                                                    {items.map((item, idx) => (
                                                        <span key={idx} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded border border-gray-200 font-mono">
                                                            {item}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                                <button
                                    onClick={() => setIsMissingItemsModalOpen(false)}
                                    className="px-4 py-2 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
                                >
                                    Fechar
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence >

            {/* List Input Modal */}
            < AnimatePresence >
                {listModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
                        onClick={() => setListModalOpen(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.9, y: 20 }}
                            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                                <div>
                                    <h3 className="font-bold text-gray-700 flex items-center gap-2">
                                        <span>📝</span>
                                        Inserir Lista de Valores
                                    </h3>
                                    <p className="text-xs text-gray-500 mt-1">Cole os valores separados por quebra de linha, vírgula ou ponto e vírgula.</p>
                                </div>
                                <button
                                    onClick={() => setListModalOpen(false)}
                                    className="p-2 hover:bg-gray-200 rounded-full transition-colors"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                </button>
                            </div>
                            <div className="p-0">
                                <textarea
                                    defaultValue={listText}
                                    ref={listInputRef}
                                    className="w-full h-64 p-4 outline-none text-sm font-mono resize-none focus:bg-blue-50/10 transition-colors"
                                    placeholder={`Exemplo:\nVALOR1\nVALOR2\nVALOR3`}
                                    autoFocus
                                    maxLength={500000} // ~50k items of 10 chars
                                />
                            </div>
                            <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                                <button
                                    onClick={() => setListModalOpen(false)}
                                    className="px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors text-sm font-medium"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleListSave}
                                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm shadow-lg shadow-blue-200"
                                >
                                    Confirmar Lista
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence >

            <AnimatePresence>
                {exportModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
                        onClick={() => setExportModalOpen(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 10 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 10 }}
                            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                                <div>
                                    <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                        <span className="text-2xl">{exportType === 'xlsx' ? '📊' : '📄'}</span>
                                        Exportar para {exportType === 'xlsx' ? 'Excel' : 'CSV'}
                                    </h3>
                                    <p className="text-sm text-gray-500 mt-1">Como você deseja baixar seus dados?</p>
                                </div>
                                <button onClick={() => setExportModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                </button>
                            </div>

                            <div className="p-6 space-y-4">
                                {/* Option 1: Complete */}
                                <button
                                    onClick={() => executeExport(exportType)}
                                    className="w-full flex items-center p-4 border-2 border-transparent bg-blue-50 hover:border-blue-500 hover:bg-blue-100 rounded-xl transition-all group text-left"
                                >
                                    <div className="w-12 h-12 bg-blue-200 text-blue-700 rounded-full flex items-center justify-center text-xl mr-4 group-hover:scale-110 transition-transform">
                                        🚀
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-blue-900">Exportação Completa</h4>
                                        <p className="text-xs text-blue-700 mt-1">Baixar todas as colunas visíveis instantaneamente.</p>
                                    </div>
                                </button>

                                {/* Option 2: Custom */}
                                <motion.button
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => setExportPhase('selection')}
                                    className="w-full flex items-center p-4 border-2 border-gray-100 hover:border-gray-300 hover:bg-gray-50 rounded-xl transition-all group text-left"
                                >
                                    <div className="w-12 h-12 bg-gray-100 text-gray-500 rounded-full flex items-center justify-center text-xl mr-4 group-hover:scale-110 transition-transform">
                                        ⚙️
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-gray-700">Personalizar Colunas</h4>
                                        <p className="text-xs text-gray-500 mt-1">Escolher exatamente quais campos incluir no arquivo.</p>
                                    </div>
                                </motion.button>
                            </div>

                            {/* Render Custom Column Selection if phase is selection */}
                            {exportPhase === 'selection' && (
                                <div className="fixed inset-0 bg-white z-10 flex flex-col animate-in slide-in-from-right duration-300">
                                    <div className="p-4 border-b border-gray-100 flex items-center gap-3 bg-gray-50">
                                        <button onClick={() => setExportPhase('choice')} className="text-gray-500 hover:text-gray-800 font-bold text-sm">← Voltar</button>
                                        <h3 className="font-bold text-gray-800">Selecionar Colunas</h3>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-4 custom-scroll">
                                        <div className="mb-4 sticky top-0 bg-white z-10 pb-2 border-b border-gray-100">
                                            <input
                                                type="text"
                                                placeholder="Buscar coluna..."
                                                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                                value={exportSearchTerm}
                                                onChange={(e) => setExportSearchTerm(e.target.value)}
                                                autoFocus
                                            />
                                        </div>
                                        <div className="flex justify-between items-center mb-2 px-1">
                                            <button onClick={toggleSelectAll} className="text-xs font-bold text-blue-600 hover:underline">Inverter Seleção</button>
                                            <span className="text-xs text-gray-400">
                                                {exportColumns.filter(c => c.isSelected).length} selecionados
                                            </span>
                                        </div>
                                        <div className="space-y-1">
                                            {exportColumns
                                                .filter(col => col.label.toLowerCase().includes(exportSearchTerm.toLowerCase()))
                                                .map((col, idx) => (
                                                    <div
                                                        key={col.id}
                                                        onClick={() => toggleColumnExport(col.id)}
                                                        className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${col.isSelected ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50 border border-transparent'}`}
                                                        draggable
                                                        onDragStart={(e) => handleExportDragStart(e, idx)}
                                                        onDragOver={(e) => handleDragOver(e, idx)} // Reuse logic
                                                        onDrop={(e) => handleExportDrop(e, idx)}
                                                    >
                                                        <div className={`w-5 h-5 rounded border flex items-center justify-center ${col.isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-300 bg-white'}`}>
                                                            {col.isSelected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                                                        </div>
                                                        <span className={`text-sm ${col.isSelected ? 'font-bold text-blue-900' : 'text-gray-500'}`}>{col.label}</span>
                                                        <span className="ml-auto text-gray-300 text-xs">⋮⋮</span>
                                                    </div>
                                                ))}
                                        </div>
                                    </div>
                                    <div className="p-4 border-t border-gray-100 flex justify-end">
                                        <button
                                            onClick={() => executeExport(exportType, exportColumns)}
                                            className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold shadow-lg hover:bg-emerald-700 transition-all"
                                        >
                                            Baixar Arquivo Personalizado
                                        </button>
                                    </div>
                                </div>
                            )}

                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Add Card Modal */}
            <AnimatePresence>
                {isAddCardModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
                        onClick={() => setIsAddCardModalOpen(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.9, y: 20 }}
                            className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                                <div>
                                    <h3 className="font-bold text-gray-700 flex items-center gap-2">
                                        <span>{editingCardId ? '✏️' : '➕'}</span>
                                        {editingCardId ? 'Editar Cartão' : 'Adicionar Cartão'}
                                    </h3>
                                    <p className="text-xs text-gray-500 mt-1">
                                        {addCardStep === 'search' ? 'Busque e selecione uma tabela do banco de dados.' : 'Defina um nome e tipo para o seu novo cartão.'}
                                    </p>
                                </div>
                                <button
                                    onClick={() => setIsAddCardModalOpen(false)}
                                    className="p-2 hover:bg-gray-200 rounded-full transition-colors"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                </button>
                            </div>

                            <div className="p-4 overflow-y-auto max-h-[60vh]">
                                {addCardStep === 'search' ? (
                                    <div className="space-y-4">
                                        <div className="relative">
                                            <input
                                                type="text"
                                                className="w-full p-3 bg-gray-100 border-none rounded-xl focus:ring-2 focus:ring-blue-500 text-sm pl-10"
                                                placeholder="Buscar tabela (ex: TB_OPE...)"
                                                value={tableSearchTerm}
                                                onChange={(e) => setTableSearchTerm(e.target.value)}
                                                autoFocus
                                            />
                                            <div className="absolute left-3 top-3 text-gray-400">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            {tablesLoading ? (
                                                <div className="py-10 text-center">
                                                    <div className="w-8 h-8 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin mx-auto mb-2"></div>
                                                    <p className="text-sm text-gray-500">Carregando tabelas...</p>
                                                </div>
                                            ) : availableTables.length === 0 ? (
                                                <div className="py-10 text-center text-gray-400 text-sm">
                                                    Nenhuma tabela encontrada.
                                                </div>
                                            ) : (
                                                availableTables
                                                    .filter(t => t.full_name.toLowerCase().includes(tableSearchTerm.toLowerCase()))
                                                    .slice(0, 50)
                                                    .map(table => (
                                                        <div
                                                            key={table.full_name}
                                                            onClick={() => {
                                                                setNewCardTable(table);
                                                                setNewCardName(table.table_name);
                                                                setAddCardStep('name');
                                                            }}
                                                            className="p-3 bg-white border border-gray-100 rounded-xl hover:border-blue-300 hover:shadow-sm cursor-pointer transition-all flex justify-between items-center group"
                                                        >
                                                            <div className="flex flex-col">
                                                                <span className="font-bold text-gray-700 group-hover:text-blue-600">{table.table_name}</span>
                                                                <span className="text-[10px] text-gray-400 uppercase tracking-widest">{table.owner}</span>
                                                            </div>
                                                            <span className="text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">Selecionar →</span>
                                                        </div>
                                                    ))
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 flex items-center gap-3">
                                            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-xl shadow-sm border border-blue-100">📋</div>
                                            <div>
                                                <p className="text-[10px] text-blue-500 font-bold uppercase tracking-widest leading-none mb-1">Tabela Selecionada</p>
                                                <p className="text-blue-900 font-bold text-sm leading-none">{newCardTable?.full_name}</p>
                                            </div>
                                            <button
                                                onClick={() => setAddCardStep('search')}
                                                className="ml-auto p-1.5 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-bold"
                                            >
                                                Trocar
                                            </button>
                                        </div>

                                        <div>
                                            <label htmlFor="cardName" className="block text-sm font-bold text-gray-700 mb-1 pl-1">Nome de Exibição</label>
                                            <input
                                                type="text"
                                                id="cardName"
                                                className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm"
                                                placeholder="Como aparecerá no menu..."
                                                value={newCardName}
                                                onChange={(e) => setNewCardName(e.target.value)}
                                            />
                                        </div>

                                        <div>
                                            <label htmlFor="cardType" className="block text-sm font-bold text-gray-700 mb-1 pl-1">Tipo de Cartão</label>
                                            <select
                                                id="cardType"
                                                className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                                                value={newCardType}
                                                onChange={(e) => setNewCardType(e.target.value)}
                                            >
                                                <option value="value">Extração de Dados</option>
                                                <option value="chart">Gráfico Operacional</option>
                                                <option value="table">Relatório Dinâmico</option>
                                            </select>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                                <button
                                    onClick={() => setIsAddCardModalOpen(false)}
                                    className="px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors text-sm font-medium"
                                >
                                    Cancelar
                                </button>
                                {addCardStep === 'name' && (
                                    <button
                                        onClick={handleAddCard}
                                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm shadow-lg shadow-blue-200"
                                    >
                                        {editingCardId ? 'Salvar Alterações' : 'Adicionar Cartão'}
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div >
    );
});

export default AiBuilder;
