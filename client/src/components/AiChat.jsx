import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import { useApi } from '../context/ApiContext';
import { useTheme } from '../context/ThemeContext'; // Assuming ThemeContext exists
import { Loader2, Plus, MessageSquare, Trash2, Send, ChevronRight, ChevronLeft, X, Bot } from 'lucide-react';

const AiChat = ({ isVisible, onClose }) => {
    const { apiUrl } = useApi();
    const { theme } = useTheme(); // 'light' or 'dark'

    // Stateless Messages (No Sessions)
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [aiStatus, setAiStatus] = useState({ success: true }); // Optimistic default

    const bottomRef = useRef(null);
    const textareaRef = useRef(null);

    // --- Scroll to Bottom ---
    const scrollToBottom = () => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useLayoutEffect(() => {
        scrollToBottom();
    }, [messages, isLoading]);

    // Handle External Triggers (Legacy Actions)
    useEffect(() => {
        const handleTrigger = (e) => {
            const { text, autoSend } = e.detail;
            if (text) {
                if (autoSend) {
                    // Direct send
                    handleSend(text);
                } else {
                    setInput(text);
                    if (textareaRef.current) {
                        textareaRef.current.focus();
                        textareaRef.current.setSelectionRange(text.length, text.length);
                    }
                }
            }
        };
        window.addEventListener('hap-trigger-chat-input', handleTrigger);
        return () => window.removeEventListener('hap-trigger-chat-input', handleTrigger);
    }, []);

    // Check AI Status on Mount
    useEffect(() => {
        const checkStatus = async () => {
            try {
                const res = await fetch(`${apiUrl}/api/ai/status`);
                const data = await res.json();
                setAiStatus(data);
                if (!data.success) {
                    setMessages(prev => [...prev, {
                        role: 'assistant',
                        content: `⚠️ **Atenção:** A conexão com a IA parece estar offline.\n\n**Erro:** ${data.message || 'Chave API inválida ou rede indisponível.'}\n\nVerifique as configurações.`,
                        isError: true
                    }]);
                }
            } catch (e) {
                console.error("Failed to check AI status:", e);
                setAiStatus({ success: false, message: "Erro de conexão com servidor" });
            }
        };
        checkStatus();
    }, [apiUrl]);

    const handleSend = async (textOverride = null) => {
        const text = typeof textOverride === 'string' ? textOverride : input;

        if (!text.trim() || isLoading) return;
        setInput('');

        // Reset textarea height
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }

        // 1. Optimistic UI: Add User Message (Only if not a system command)
        if (!text.startsWith('[SYSTEM_')) {
            const tempUserMsg = { role: 'user', content: text, timestamp: new Date().toISOString() };
            setMessages(prev => [...prev, tempUserMsg]);
        }
        setIsLoading(true);

        try {
            // 2. Call Legacy AI Brain (Stateless/Context Window)
            // Use legacy endpoint structure if possible, or adapt V3 to look legacy
            // The user wants "the brain that was trained". 
            // Assuming this maps to /api/ai/chat which uses aiService.processMessage
            const res = await fetch(`${apiUrl}/api/ai/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: text, // Legacy endpoint expects 'prompt' often, or 'message'
                    message: text, // Send both to be safe depending on backend version
                    history: messages.map(m => ({ role: m.role, content: m.content })), // Send simplified history
                    mode: 'chat'
                })
            });

            if (!res.ok) throw new Error('Falha na resposta da IA');
            const data = await res.json();

            // 3. Process Actions & Format Data
            let aiContent = data.text || data.answer || data.message || (typeof data === 'string' ? data : JSON.stringify(data));

            if (data.action === 'list_tables' && Array.isArray(data.data)) {
                const tables = data.data;
                if (tables.length > 0) {
                    // Trigger visual display in AiBuilder with mapped data
                    const mappedTables = tables.map(t => ({
                        ...t,
                        table_name: t.name,
                        full_name: t.full_name || (t.owner ? `${t.owner}.${t.name}` : t.name),
                        owner: t.owner || 'N/A'
                    }));

                    setTimeout(() => {
                        window.dispatchEvent(new CustomEvent('hap-show-search-results', {
                            detail: { tables: mappedTables }
                        }));
                    }, 100);

                    // Add a brief message instead of the full table
                    aiContent += "\n\nOpções encontradas exibidas na tela ao lado. 👀";
                }
            } else if (data.action === 'table_selection' && Array.isArray(data.data)) {
                const tables = data.data;
                if (tables.length > 0) {
                    // Trigger visual display for table selection
                    const mappedTables = tables.map(t => ({
                        name: t.includes('.') ? t.split('.')[1] : t,
                        table_name: t.includes('.') ? t.split('.')[1] : t,
                        full_name: t,
                        owner: t.includes('.') ? t.split('.')[0] : 'SUGESTÃO',
                        comments: 'Você quis dizer esta tabela?'
                    }));

                    setTimeout(() => {
                        window.dispatchEvent(new CustomEvent('hap-show-search-results', {
                            detail: { tables: mappedTables }
                        }));
                    }, 100);

                    aiContent += "\n\nEncontrei algumas opções parecidas. Selecione uma ao lado. 👉";
                }
            } else if (data.action === 'table_selection_v2' && Array.isArray(data.data)) {
                setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('hap-show-smart-resolver', {
                        detail: { type: 'table', data: data.data, contextText: data.text, searchTerm: data.searchTerm }
                    }));
                }, 100);
                aiContent = data.text || "Selecione a tabela desejada na tela principal... 🖥️";

            } else if (data.action === 'column_selection_v2' && Array.isArray(data.data)) {
                setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('hap-show-smart-resolver', {
                        detail: { type: 'column', data: data.data, contextText: data.text, searchTerm: data.searchTerm }
                    }));
                }, 100);
                aiContent = data.text || "Selecione a coluna desejada na tela principal... 🖥️";
            } else if (data.action === 'describe_table' && data.data) {

                const { tableName, columns } = data.data;

                // Dispatch Logic
                setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('hap-show-schema', {
                        detail: { data: { tableName, columns } }
                    }));
                }, 100);

                let colMd = `\n\n### Estrutura de ${tableName}\n| Coluna | Tipo | Comentário |\n|---|---|---|\n`;
                if (Array.isArray(columns)) {
                    columns.forEach(c => {
                        colMd += `| ${c.name} | ${c.dataType} | ${c.comments || '-'} |\n`;
                    });
                }
                aiContent += colMd;
                aiContent += "\n\nVisualização detalhada aberta ao lado. 👉";

            } else if ((data.action === 'show_data' || data.action === 'find_record') && data.data) {
                // Dispatch Logic for Data View
                setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('hap-show-data', {
                        detail: { data: data.data }
                    }));
                }, 100);
                aiContent += "\n\nExibindo dados na grid interativa. 📊";

            } else if (data.action === 'draft_table' && data.data) {
                // Dispatch for Draft View
                setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('hap-draft-table', {
                        detail: { data: data.data }
                    }));
                }, 100);
                aiContent += "\n\nAbrindo editor de criação de tabela. 📝";
            }

            // 4. Update UI with AI Response
            setMessages(prev => [...prev, { role: 'assistant', content: aiContent, timestamp: new Date().toISOString() }]);

        } catch (e) {
            console.error("Chat Error:", e);
            setMessages(prev => [...prev, { role: 'assistant', content: `**Erro:** ${e.message}`, isError: true }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // Render Logic
    const renderMessage = (msg, i) => (
        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-600 to-blue-600 flex items-center justify-center text-white text-xs font-bold shadow-sm mr-3 flex-shrink-0 mt-1">
                    AI
                </div>
            )}
            <div className={`max-w-[85%] rounded-2xl p-5 shadow-sm text-sm leading-relaxed ${msg.role === 'user'
                ? 'bg-blue-600 text-white rounded-br-sm'
                : 'bg-white text-gray-800 border border-gray-100 rounded-bl-sm'
                }`}>
                {msg.role === 'user' ? (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                ) : (
                    <div className="markdown-body">
                        <ReactMarkdown
                            children={msg.content}
                            remarkPlugins={[remarkGfm]}
                            components={{
                                code({ node, inline, className, children, ...props }) {
                                    const match = /language-(\w+)/.exec(className || '')
                                    return !inline && match ? (
                                        <SyntaxHighlighter
                                            children={String(children).replace(/\n$/, '')}
                                            style={atomDark}
                                            language={match[1]}
                                            PreTag="div"
                                            {...props}
                                        />
                                    ) : (
                                        <code className={className} {...props}>
                                            {children}
                                        </code>
                                    )
                                }
                            }}
                        />
                    </div>
                )}
                {msg.isError && <div className="text-red-500 text-xs mt-2 font-bold">Falha no envio</div>}
            </div>
            {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs font-bold ml-3 flex-shrink-0 mt-1">
                    VC
                </div>
            )}
        </div>
    );

    const handleInputResize = (e) => {
        const target = e.target;
        target.style.height = 'auto'; // Reset
        target.style.height = `${Math.min(target.scrollHeight, 150)}px`;
        setInput(target.value);
    };

    return (
        <div className="flex h-full bg-white transition-colors duration-200 font-sans">
            {/* NO SIDEBAR - Removed as per user request */}

            {/* Main Chat Area - Legacy Layout */}
            <div className="flex-1 flex flex-col relative h-full bg-gray-50/30">
                {/* Legacy Header */}
                <div className="h-16 border-b border-gray-100 bg-white flex items-center justify-between px-6 shadow-sm z-10">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-purple-600 to-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
                            AI
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-800 text-base leading-tight">Hap AI</h3>
                            <button className="text-xs text-gray-400 hover:text-purple-600 transition-colors flex items-center gap-1" title={aiStatus?.message || "Verificando..."}>
                                <span className={`w-1.5 h-1.5 rounded-full ${aiStatus?.success ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                {aiStatus?.success ? 'Online' : 'Offline'} • Ver Habilidades
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Toggle Simulation */}
                        <div className="flex items-center bg-gray-100 rounded-full p-1 cursor-not-allowed opacity-70" title="Modo Automático (Em breve)">
                            <span className="px-3 py-1 rounded-full bg-white text-purple-700 shadow-sm text-xs font-bold">AI</span>
                            <span className="px-3 py-1 text-gray-400 text-xs font-bold">Off</span>
                        </div>

                        {onClose && (
                            <button onClick={onClose} className="p-2 text-gray-400 hover:text-red-500 rounded-full hover:bg-gray-100">
                                <X size={20} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth" id="chat-container">
                    {messages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4 opacity-50">
                            <Bot size={48} strokeWidth={1} />
                            <p>Como posso ajudar você hoje?</p>
                        </div>
                    ) : (
                        <div className="max-w-4xl mx-auto space-y-6">
                            {messages.map((msg, i) => renderMessage(msg, i))}
                            {isLoading && (
                                <div className="flex justify-start">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-600 to-blue-600 flex items-center justify-center text-white text-xs font-bold shadow-sm mr-3 flex-shrink-0">AI</div>
                                    <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-sm p-4 shadow-sm flex items-center gap-3">
                                        <Loader2 className="animate-spin text-purple-600" size={18} />
                                        <span className="text-gray-500 text-xs font-medium">Processando...</span>
                                    </div>
                                </div>
                            )}
                            <div ref={bottomRef} />
                        </div>
                    )}
                </div>

                {/* Legacy Input Area */}
                <div className="p-4 bg-white border-t border-gray-100 z-10">
                    <div className="max-w-4xl mx-auto relative group">
                        <textarea
                            ref={textareaRef}
                            value={input}
                            onChange={handleInputResize}
                            onKeyDown={handleKeyDown}
                            placeholder="Ex: Quero ver os clientes de São Paulo..."
                            className="w-full bg-white border-2 border-gray-200 rounded-2xl py-4 pl-6 pr-14 focus:outline-none focus:border-amber-400 focus:ring-0 resize-none max-h-[150px] min-h-[60px] transition-all shadow-sm text-gray-600 placeholder-gray-400 text-sm"
                            rows={1}
                        />
                        <button
                            onClick={handleSend}
                            disabled={!input.trim() || isLoading}
                            className="absolute right-3 bottom-3 p-2 bg-gray-100 hover:bg-purple-600 text-gray-400 hover:text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                            <Send size={20} />
                        </button>
                    </div>
                    <div className="max-w-4xl mx-auto mt-2 text-center">
                        <span className="text-[10px] text-gray-300">Hap AI Security Protected</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AiChat;
