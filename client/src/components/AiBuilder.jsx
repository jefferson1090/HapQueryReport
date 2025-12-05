import React, { useState, useEffect, useRef, useContext } from 'react';
import { ThemeContext } from '../context/ThemeContext';

const AiBuilder = () => {
    const { theme } = useContext(ThemeContext);
    const [messages, setMessages] = useState([{ id: 1, sender: 'ai', text: 'Olá! Sou seu assistente de banco de dados. Posso ajudar a criar tabelas, buscar dados ou explicar estruturas.\n\nExperimente:\n- "Crie uma tabela de clientes"\n- "Mostre as tabelas do sistema"', isSystem: true }]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [viewData, setViewData] = useState(null);
    const [activeView, setActiveView] = useState('welcome'); // welcome, table_results, schema_view, data_view, draft_view
    const [mode, setMode] = useState('local'); // 'ai' or 'local'
    const [draftData, setDraftData] = useState(null); // { tableName, columns: [], indices: [], grants: [] }

    // Interactive Flow State
    const [flowStep, setFlowStep] = useState(null); // SEARCH_KEYWORD, CREATE_NAME, CREATE_COLS, etc.
    const [flowParams, setFlowParams] = useState({});

    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleFlowStart = (step, promptText) => {
        setFlowStep(step);
        setFlowParams({});
        setMessages(prev => [...prev, { id: Date.now(), sender: 'ai', text: promptText, isSystem: true }]);
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
                setMessages(prev => [...prev, { id: Date.now(), sender: 'ai', text: `Erro ao criar tabela: ${data.error}` }]);
            } else {
                setMessages(prev => [...prev, { id: Date.now(), sender: 'ai', text: `Sucesso! Tabela ${data.tableName} criada.` }]);
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
        console.log('DEBUG: handleSend textToSend:', textToSend, 'flowStep:', flowStep);
        if (flowStep && !textOverride) {
            if (flowStep === 'SEARCH_KEYWORD') {
                textToSend = `Busque tabelas ${input}`;
                setFlowStep(null);
            }
            else if (flowStep === 'DESCRIBE_NAME') {
                textToSend = `Estrutura da tabela ${input}`;
                setFlowStep(null);
            }
            else if (flowStep === 'STRUCT_NAME') {
                textToSend = `Estrutura da tabela ${input}`;
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
                return; // Wait for next input
            }
            else if (flowStep === 'CREATE_COLS') {
                // Format for Draft Mode: TableName; Columns; Indices; Grants
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
                setMessages(prev => [...prev, { id: Date.now() + 1, sender: 'ai', text: "Erro: " + data.error }]);
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
                    setViewData(data.data);
                } else if (data.action === 'draft_table') {
                    setDraftData(data.data);
                    setActiveView('draft_view');
                }
            }

        } catch (err) {
            console.error(err);
            setLoading(false);
            setMessages(prev => [...prev, { id: Date.now() + 1, sender: 'ai', text: "Erro de conexão: " + err.message }]);
        }
    };

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
        // Handle object structure from backend { tableName, columns }
        const columns = Array.isArray(viewData) ? viewData : (viewData?.columns || []);

        return (
            <div className="w-full h-full overflow-auto">
                {viewData?.tableName && (
                    <div className="bg-gray-50 px-6 py-3 border-b border-gray-200 font-bold text-gray-700 text-sm uppercase tracking-wider sticky top-0 z-10 flex justify-between items-center">
                        <span>Estrutura: {viewData.tableName}</span>
                        {viewData.isView && <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">VIEW</span>}
                    </div>
                )}

                {viewData?.viewDefinition && (
                    <div className="p-4 bg-gray-900 text-gray-100 text-xs font-mono border-b border-gray-700 overflow-x-auto">
                        <div className="mb-2 text-gray-400 uppercase font-bold">Definição SQL (View):</div>
                        <pre>{viewData.viewDefinition}</pre>
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

    const renderDraftView = () => (
        <div className="w-full h-full overflow-auto p-4 bg-gray-50">
            <div className="mb-6 flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <div>
                    <h2 className="text-xl font-bold text-gray-800 flex items-center">
                        <span className="bg-purple-100 text-purple-600 p-2 rounded-lg mr-3 text-lg">✨</span>
                        Novo Rascunho: {draftData.tableName}
                    </h2>
                    <p className="text-xs text-gray-500 mt-1 ml-11">Revise os campos antes de criar.</p>
                </div>
                <div className="space-x-2">
                    <button onClick={() => { setActiveView('welcome'); setDraftData(null); }} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
                    <button onClick={handleConfirmDraft} className="px-6 py-2 text-sm bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 shadow-md transform active:scale-95 transition-all">Confirmar Criação</button>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
                <div className="bg-gray-50 px-6 py-3 border-b border-gray-200 font-bold text-gray-700 text-sm uppercase tracking-wider">
                    Colunas
                </div>
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-white">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nome</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                            <th className="px-6 py-3 text-right"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {draftData.columns.map((col, i) => (
                            <tr key={i} className="hover:bg-gray-50">
                                <td className="px-6 py-3">
                                    <input
                                        value={col.name}
                                        onChange={(e) => handleUpdateDraft('columns', i, 'name', e.target.value)}
                                        className="w-full border-gray-300 rounded-md shadow-sm focus:border-purple-500 focus:ring-purple-500 sm:text-sm"
                                    />
                                </td>
                                <td className="px-6 py-3">
                                    <input
                                        value={col.type}
                                        onChange={(e) => handleUpdateDraft('columns', i, 'type', e.target.value)}
                                        className="w-full border-gray-300 rounded-md shadow-sm focus:border-purple-500 focus:ring-purple-500 sm:text-sm font-mono text-blue-600"
                                    />
                                </td>
                                <td className="px-6 py-3 text-right">
                                    <button onClick={() => {
                                        const newData = { ...draftData };
                                        newData.columns.splice(i, 1);
                                        setDraftData(newData);
                                    }} className="text-red-400 hover:text-red-600">×</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div className="p-3 bg-gray-50 border-t border-gray-200 text-center">
                    <button onClick={() => {
                        const newData = { ...draftData };
                        newData.columns.push({ name: 'NOVA_COLUNA', type: 'VARCHAR2(100)' });
                        setDraftData(newData);
                    }} className="text-sm text-purple-600 font-medium hover:underline">+ Adicionar Coluna</button>
                </div>
            </div>

            {/* Indices Section (Read-only for now or simple list) */}
            <div className="grid grid-cols-2 gap-6">
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                    <h3 className="font-bold text-gray-700 text-sm mb-3">Índices</h3>
                    {draftData.indices.length === 0 ? <p className="text-sm text-gray-400 italic">Nenhum índice definido.</p> : (
                        <div className="flex flex-wrap gap-2">
                            {draftData.indices.map((idx, i) => (
                                <span key={i} className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-md border border-blue-100">{idx}</span>
                            ))}
                        </div>
                    )}
                </div>

                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                    <h3 className="font-bold text-gray-700 text-sm mb-3">Permissões (Grants)</h3>
                    {draftData.grants.length === 0 ? <p className="text-sm text-gray-400 italic">Nenhuma permissão definida.</p> : (
                        <div className="flex flex-wrap gap-2">
                            {draftData.grants.map((grant, i) => (
                                <span key={i} className="px-2 py-1 bg-green-50 text-green-700 text-xs rounded-md border border-green-100">{grant}</span>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    const renderDataView = () => {
        if (!viewData || !viewData.length) return <div className="p-4 text-gray-500">Nenhum dado para exibir.</div>;
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
                                    <td key={col} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{typeof row[col] === 'object' ? JSON.stringify(row[col]) : row[col]}</td>
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

            {/* LEFT: Chat Interface (40%) */}
            <div className={`w-[40%] flex flex-col border-r ${theme.border} ${theme.sidebar} shadow-sm z-10`}>
                {/* Chat Header */}
                <div className={`p-4 border-b ${theme.border} flex items-center justify-between bg-white/50 backdrop-blur-sm`}>
                    <div className="flex items-center space-x-2">
                        <div className={`
                            w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-md transition-all
                            ${mode === 'ai' ? 'bg-gradient-to-tr from-blue-500 to-purple-600' : 'bg-green-600'}
                        `}>
                            {mode === 'ai' ? 'AI' : 'LOC'}
                        </div>
                        <div>
                            <h2 className={`font-bold text-sm ${theme.text}`}>Hap Assistant</h2>
                            <p className="text-[10px] text-gray-500">{mode === 'ai' ? 'Gemini AI Conectado' : 'Modo Offline (Regex)'}</p>
                        </div>
                    </div>

                    {/* Mode Toggle Switch */}
                    <div className="flex items-center bg-gray-200 rounded-full p-1 cursor-pointer" onClick={() => setMode(mode === 'ai' ? 'local' : 'ai')}>
                        <div className={`
                            px-3 py-1 rounded-full text-xs font-bold transition-all duration-300
                            ${mode === 'ai' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}
                        `}>AI</div>
                        <div className={`
                            px-3 py-1 rounded-full text-xs font-bold transition-all duration-300
                            ${mode === 'local' ? 'bg-white text-green-600 shadow-sm' : 'text-gray-500'}
                        `}>Local</div>
                    </div>
                </div>

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50">
                    {messages.map((msg) => (
                        <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${msg.sender === 'user'
                                ? 'bg-blue-600 text-white rounded-br-none'
                                : (msg.isSystem ? 'bg-yellow-50 text-yellow-800 border border-yellow-200' : 'bg-white text-gray-800 border border-gray-100 rounded-bl-none')
                                }`}>
                                {(() => {
                                    // Simple Markdown Formatter
                                    const parts = msg.text.split(/```/);
                                    return parts.map((part, i) => {
                                        if (i % 2 === 1) {
                                            // Code Block
                                            let codeContent = part.trim();
                                            // Remove language identifier if exists (e.g., "sql\n")
                                            const firstLineBreak = codeContent.indexOf('\n');
                                            if (firstLineBreak > -1 && firstLineBreak < 10) {
                                                codeContent = codeContent.substring(firstLineBreak + 1);
                                            }
                                            return (
                                                <pre key={i} className="bg-gray-800 text-gray-100 p-3 rounded-lg my-2 text-xs font-mono overflow-x-auto border border-gray-700 shadow-inner">
                                                    <code>{codeContent}</code>
                                                </pre>
                                            );
                                        } else {
                                            // Regular Text
                                            return <span key={i} className="whitespace-pre-wrap leading-relaxed">{part}</span>;
                                        }
                                    });
                                })()}
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

                {/* Input Area */}
                <div className={`p-3 border-t ${theme.border} bg-white`}>
                    <div className="relative">
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={mode === 'ai' ? "Pergunte qualquer coisa..." : "Comandos: Busque tabelas..., Estrutura de..., Encontre ID..."}
                            className={`w-full border-gray-200 rounded-xl pr-12 pl-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none shadow-sm ${theme.input} ${theme.border}`}
                            rows={1}
                            style={{ minHeight: '44px', maxHeight: '120px' }}
                        />
                        <button
                            onClick={() => handleSend()}
                            disabled={!input.trim() || loading}
                            className={`absolute right-2 bottom-2 p-1.5 rounded-lg transition-colors ${input.trim() ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                }`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                <path d="M3.478 2.404a.75.75 0 00-.926.941l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.404z" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>

            {/* RIGHT: Content / Context Area (60%) */}
            <div className={`flex-1 flex flex-col bg-white overflow-hidden relative border-l border-gray-100`}>

                {/* Right Header */}
                <div className={`h-14 border-b ${theme.border} flex items-center justify-between px-6 bg-white overflow-hidden`}>
                    <h3 className="font-bold text-gray-700 text-sm uppercase tracking-wider flex items-center">
                        <span className="text-lg mr-2">📄</span>
                        {activeView === 'welcome' && 'Bem-vindo'}
                        {activeView === 'table_results' && 'Resultados da Busca'}
                        {activeView === 'schema_view' && 'Estrutura da Tabela'}
                        {activeView === 'data_view' && 'Visualização de Dados'}
                        {activeView === 'draft_view' && 'Rascunho de Tabela'}
                    </h3>
                    <div className="flex space-x-2">
                        {activeView !== 'welcome' && (
                            <button onClick={() => { setActiveView('welcome'); setDraftData(null); }} className="text-xs text-gray-400 hover:text-gray-600">Limpar</button>
                        )}
                    </div>
                </div>

                {/* Right Body */}
                <div className={`flex-1 overflow-hidden relative ${activeView === 'welcome' ? 'flex items-center justify-center bg-gray-50 pattern-grid-lg' : 'bg-white'}`}>

                    {activeView === 'welcome' && (
                        <div className="text-center max-w-lg mx-auto p-6">
                            <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 text-4xl shadow-sm ${mode === 'ai' ? 'bg-blue-50 text-blue-500' : 'bg-green-50 text-green-600'}`}>
                                {mode === 'ai' ? '🤖' : '⚡'}
                            </div>
                            <h2 className="text-2xl font-bold text-gray-800 mb-2">
                                {mode === 'ai' ? 'Hap AI Assistant' : 'Assistente Local'}
                            </h2>
                            <p className="text-sm text-gray-500 mb-8">
                                {mode === 'ai' ? 'Inteligência Artificial conectada para buscas complexas.' : 'Modo offline rápido e seguro. O que deseja fazer?'}
                            </p>

                            {/* QUICK ACTIONS GRID */}
                            <div className="grid grid-cols-2 gap-4 text-left">
                                <button onClick={() => handleFlowStart('SEARCH_KEYWORD', 'Qual nome (ou parte) da tabela você procura?')} className="p-4 bg-white border border-gray-200 rounded-xl hover:border-blue-400 hover:shadow-md transition-all group">
                                    <div className="text-xl mb-2">🔍</div>
                                    <h3 className="font-bold text-gray-700 text-sm group-hover:text-blue-600">Procurar Tabela</h3>
                                    <p className="text-xs text-gray-400 mt-1">Encontrar tabelas por nome</p>
                                </button>

                                <button onClick={() => handleFlowStart('TRIGGER_NAME', 'De qual tabela você quer ver as triggers? (Ou digite "todas")')} className="p-4 bg-white border border-gray-200 rounded-xl hover:border-green-400 hover:shadow-md transition-all group">
                                    <div className="text-xl mb-2">⚡</div>
                                    <h3 className="font-bold text-gray-700 text-sm group-hover:text-green-600">Ver Triggers</h3>
                                    <p className="text-xs text-gray-400 mt-1">Listar gatilhos do banco</p>
                                </button>

                                <button onClick={() => handleFlowStart('CREATE_NAME', 'Qual o nome da nova tabela?')} className="p-4 bg-white border border-gray-200 rounded-xl hover:border-purple-400 hover:shadow-md transition-all group">
                                    <div className="text-xl mb-2">✨</div>
                                    <h3 className="font-bold text-gray-700 text-sm group-hover:text-purple-600">Criar Tabela (Wizard)</h3>
                                    <p className="text-xs text-gray-400 mt-1">Gerar script SQL</p>
                                </button>

                                <button onClick={() => handleFlowStart('STRUCT_NAME', 'Qual o nome da tabela?')} className="p-4 bg-white border border-gray-200 rounded-xl hover:border-orange-400 hover:shadow-md transition-all group">
                                    <div className="text-xl mb-2">📋</div>
                                    <h3 className="font-bold text-gray-700 text-sm group-hover:text-orange-600">Estrutura</h3>
                                    <p className="text-xs text-gray-400 mt-1">Ver colunas e tipos</p>
                                </button>
                            </div>
                        </div>
                    )}

                    {activeView === 'draft_view' && renderDraftView()}
                    {activeView === 'table_results' && viewData && renderTableList()}
                    {activeView === 'schema_view' && viewData && renderSchemaView()}
                    {activeView === 'data_view' && viewData && renderDataView()}

                </div>
            </div>
        </div>
    );
}

export default AiBuilder;
