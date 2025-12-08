import React, { useState, useRef, useEffect } from 'react';
import { Send, X, Bot, User, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const ChatWithDocs = ({ isOpen, onClose, context, onInsert, mode = 'overlay' }) => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMsg = input.trim();
        setInput('');
        setMessages(prev => [...prev, { text: userMsg, sender: 'user' }]);
        setIsLoading(true);

        try {
            const history = messages.slice(-10); // Last 10 messages

            // Prepare context if available
            const currentDoc = context ? {
                title: context.NM_TITLE,
                content: context.CL_CONTENT || ''
            } : null;

            const response = await fetch('http://localhost:3001/api/docs/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: userMsg, history, currentContext: currentDoc })
            });

            const data = await response.json();

            if (response.ok) {
                setMessages(prev => [...prev, { text: data.text, sender: 'ai' }]);
            } else {
                throw new Error(data.error || "Erro na resposta do servidor");
            }

        } catch (error) {
            console.error("Chat Error:", error);
            setMessages(prev => [...prev, { text: `Erro: ${error.message}`, sender: 'ai', isError: true }]);
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

    // if (!isOpen) return null; // Removed for animation

    const baseClasses = "bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 flex flex-col transition-all duration-300 ease-in-out z-40";

    // Overlay Mode: Slide in from right
    const overlayClasses = `fixed inset-y-0 right-0 w-96 shadow-2xl transform ${isOpen ? 'translate-x-0' : 'translate-x-full'}`;

    // Sidebar Mode: Expand width and fade in
    const sidebarClasses = `h-full shadow-lg border-l relative overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'w-[400px] opacity-100' : 'w-0 opacity-0 border-none'}`;

    return (
        <div className={`${mode === 'sidebar' ? sidebarClasses : baseClasses + ' ' + overlayClasses}`}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                    <Sparkles size={20} />
                    <h3 className="font-semibold text-lg">Chat Docs</h3>
                </div>
                <button
                    onClick={onClose}
                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-500"
                >
                    <X size={20} />
                </button>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 pb-8 space-y-6 bg-gray-50/50 dark:bg-gray-900/50 scroll-smooth">
                {messages.length === 0 && (
                    <div className="text-center text-gray-400 mt-10 animate-fade-in">
                        <Bot size={48} className="mx-auto mb-2 opacity-20" />
                        <p className="text-sm">Pergunte algo sobre seus documentos!</p>
                        <p className="text-xs mt-1 opacity-70">Ex: "Como configurar o banco?"</p>
                    </div>
                )}

                {messages.map((msg, idx) => (
                    <div
                        key={idx}
                        className={`flex gap-3 animate-slide-up ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                        style={{ animationDelay: `${idx * 0.05}s`, opacity: 0, animationFillMode: 'forwards' }}
                    >
                        {msg.sender === 'ai' && (
                            <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center flex-shrink-0">
                                <Bot size={16} className="text-indigo-600 dark:text-indigo-300" />
                            </div>
                        )}

                        <div
                            className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${msg.sender === 'user'
                                ? 'bg-indigo-600 text-white rounded-br-none'
                                : msg.isError
                                    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 rounded-bl-none'
                                    : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-bl-none'
                                }`}
                        >
                            <div className="prose prose-sm dark:prose-invert max-w-none">
                                <ReactMarkdown>
                                    {msg.text}
                                </ReactMarkdown>
                            </div>
                            {msg.sender === 'ai' && !msg.isError && (
                                <div className="mt-2 flex justify-end">
                                    <button
                                        onClick={() => onInsert(msg.text)}
                                        className="text-xs flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium transition-colors bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded"
                                        title="Inserir no documento"
                                    >
                                        <Sparkles size={12} />
                                        Inserir no Doc
                                    </button>
                                </div>
                            )}
                        </div>

                        {
                            msg.sender === 'user' && (
                                <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                                    <User size={16} className="text-gray-600 dark:text-gray-300" />
                                </div>
                            )
                        }
                    </div>
                ))}

                {isLoading && (
                    <div className="flex gap-3 justify-start">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center flex-shrink-0">
                            <Bot size={16} className="text-indigo-600 dark:text-indigo-300" />
                        </div>
                        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl rounded-bl-none px-4 py-3 shadow-sm flex items-center gap-2">
                            <Loader2 size={16} className="animate-spin text-gray-400" />
                            <span className="text-xs text-gray-400">Lendo documentos...</span>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                <div className="relative">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Digite sua pergunta..."
                        className="w-full pl-4 pr-12 py-3 bg-gray-100 dark:bg-gray-900 border-0 rounded-xl focus:ring-2 focus:ring-indigo-500 resize-none text-sm max-h-32 custom-scrollbar"
                        rows={1}
                        style={{ minHeight: '44px' }}
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || isLoading}
                        className="absolute right-2 bottom-2 p-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white rounded-lg transition-colors"
                    >
                        <Send size={16} />
                    </button>
                </div>
            </div>
        </div >
    );
};

export default ChatWithDocs;
