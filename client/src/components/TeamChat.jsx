import React, { useState, useEffect, useRef, useContext } from 'react';
import { io } from "socket.io-client";
import { ThemeContext } from '../context/ThemeContext';
import { Send, User, Users, Lock, LogIn, Database, Bell, FileText, Check, X, ChevronRight, ChevronDown, Book, Paperclip } from 'lucide-react';
import { useApi } from '../context/ApiContext';

// Docs Tree Selector Component
const DocsTreeSelector = ({ onShare }) => {
    const [books, setBooks] = useState([]);
    const [expandedBooks, setExpandedBooks] = useState({}); // { bookId: true/false }
    const [bookTrees, setBookTrees] = useState({}); // { bookId: [nodes] }
    const [loading, setLoading] = useState(false);
    const { apiUrl } = useApi();

    useEffect(() => {
        fetchBooks();
    }, []);

    const fetchBooks = async () => {
        try {
            const res = await fetch(`${apiUrl}/api/docs/books`);
            const data = await res.json();
            setBooks(data);
        } catch (e) { console.error("Failed to fetch books", e); }
    };

    const toggleBook = async (bookId) => {
        setExpandedBooks(prev => ({ ...prev, [bookId]: !prev[bookId] }));

        if (!bookTrees[bookId]) {
            // Fetch tree if not already loaded
            try {
                const res = await fetch(`${apiUrl}/api/docs/books/${bookId}/tree`);
                const tree = await res.json();
                setBookTrees(prev => ({ ...prev, [bookId]: tree }));
            } catch (e) { console.error("Failed to fetch tree", e); }
        }
    };

    const renderTree = (nodes, bookId, bookTitle) => {
        return nodes.map(node => (
            <div key={node.ID_NODE} className="ml-4 border-l border-gray-200 pl-2">
                <div className="flex items-center justify-between py-1 group">
                    <div className="flex items-center text-sm text-gray-700">
                        <FileText size={14} className="mr-2 text-gray-400" />
                        <span className="truncate max-w-[150px]">{node.NM_TITLE}</span>
                    </div>
                    <button
                        onClick={() => onShare({ id: node.ID_NODE, title: node.NM_TITLE, bookId, bookTitle })}
                        className="opacity-0 group-hover:opacity-100 px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200 transition-opacity"
                    >
                        Enviar
                    </button>
                </div>
                {node.children && node.children.length > 0 && (
                    <div className="ml-2">
                        {renderTree(node.children, bookId, bookTitle)}
                    </div>
                )}
            </div>
        ));
    };

    return (
        <div className="space-y-2">
            {books.map(book => (
                <div key={book.ID_BOOK} className="border border-gray-100 rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between p-2 bg-gray-50 hover:bg-gray-100 transition-colors">
                        <div
                            className="flex items-center cursor-pointer flex-1"
                            onClick={() => toggleBook(book.ID_BOOK)}
                        >
                            {expandedBooks[book.ID_BOOK] ? <ChevronDown size={16} className="mr-2 text-gray-500" /> : <ChevronRight size={16} className="mr-2 text-gray-500" />}
                            <Book size={16} className="mr-2 text-blue-600" />
                            <span className="font-medium text-sm text-gray-800">{book.NM_TITLE}</span>
                        </div>
                        <button
                            onClick={() => onShare({ id: null, title: book.NM_TITLE, bookId: book.ID_BOOK, bookTitle: book.NM_TITLE, type: 'BOOK' })}
                            className="ml-2 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-bold hover:bg-blue-200"
                            title="Compartilhar Livro Inteiro"
                        >
                            Livro
                        </button>
                    </div>
                    {expandedBooks[book.ID_BOOK] && bookTrees[book.ID_BOOK] && (
                        <div className="p-2 bg-white">
                            {bookTrees[book.ID_BOOK].length === 0 ? (
                                <p className="text-gray-500 text-sm ml-4">Nenhum documento neste livro.</p>
                            ) : (
                                renderTree(bookTrees[book.ID_BOOK], book.ID_BOOK, book.NM_TITLE)
                            )}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

const TeamChat = ({ isVisible, user, socket, savedQueries, setSavedQueries, reminders, setReminders }) => {
    const { theme } = useContext(ThemeContext);
    // user and socket are now props
    const [usersOnline, setUsersOnline] = useState([]); // [{ username, team }]
    const [selectedUser, setSelectedUser] = useState(null); // null = Global, or { username, team }
    const selectedUserRef = useRef(null); // To access in event listeners

    useEffect(() => {
        selectedUserRef.current = selectedUser;
    }, [selectedUser]);
    const [messages, setMessages] = useState([]);
    const [inputMessage, setInputMessage] = useState('');
    const [unreadCounts, setUnreadCounts] = useState({}); // { username: count }

    // Share Modal State
    const [showShareModal, setShowShareModal] = useState(false);
    const [shareType, setShareType] = useState('SQL'); // SQL, REMINDER, DOC
    const { apiUrl } = useApi();

    const messagesEndRef = useRef(null);

    useEffect(() => {
        if (user && socket) {
            // Join is handled by App.jsx or Login.jsx, but we can re-emit to be safe or just listen
            // If socket is passed from App, it might be already connected.

            // Listeners
            const handleUsersUpdate = (users) => setUsersOnline(users);
            const handleMessage = (msg) => {
                setMessages(prev => [...prev, msg]);
                scrollToBottom();

                // Unread Logic
                if (msg.recipient !== 'ALL' && msg.sender !== user.username) {
                    // Private message from someone else
                    const currentSelected = selectedUserRef.current;
                    if (!currentSelected || currentSelected.username !== msg.sender) {
                        setUnreadCounts(prev => ({
                            ...prev,
                            [msg.sender]: (prev[msg.sender] || 0) + 1
                        }));
                    }
                }
            };
            const handleSharedItem = (data) => {
                const msg = {
                    sender: data.sender,
                    content: `Compartilhou um ${data.itemType}`,
                    type: 'SHARED_ITEM',
                    metadata: data,
                    timestamp: new Date()
                };
                setMessages(prev => [...prev, msg]);
                scrollToBottom();
            };

            socket.on('users_update', handleUsersUpdate);
            socket.on('message', handleMessage);
            socket.on('shared_item_received', handleSharedItem);

            // Load history
            loadHistory(user.username);

            return () => {
                socket.off('users_update', handleUsersUpdate);
                socket.off('message', handleMessage);
                socket.off('shared_item_received', handleSharedItem);
            };
        }
    }, [user, socket]);

    useEffect(() => {
        scrollToBottom();
    }, [messages, isVisible]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    const loadHistory = async (username) => {
        try {
            const res = await fetch(`${apiUrl}/api/chat/history?username=${username}`);
            const data = await res.json();
            if (Array.isArray(data)) {
                setMessages(data);
            }
        } catch (e) { console.error("Failed to load history", e); }
    };

    const sendMessage = (e) => {
        e.preventDefault();
        if (!inputMessage.trim() || !socket) return;

        // Detect SQL Code Block
        let type = 'TEXT';
        let content = inputMessage;

        // Simple heuristic: if it contains SELECT, FROM, WHERE, etc.
        if (/SELECT\s+.+\s+FROM/i.test(content) || /CREATE\s+TABLE/i.test(content)) {
            type = 'CODE';
        }

        socket.emit('message', {
            sender: user.username,
            content: content,
            type: type,
            recipient: selectedUser ? selectedUser.username : 'ALL'
        });
        setInputMessage('');
    };

    const handleShare = (item, type) => {
        socket.emit('share_item', {
            sender: user.username,
            recipient: selectedUser ? selectedUser.username : 'ALL',
            itemType: type,
            itemData: item
        });
        setShowShareModal(false);
    };

    const handleAcceptSharedItem = (msg) => {
        const { itemType, itemData } = msg.metadata;

        if (itemType === 'SQL') {
            // itemData: { title, sql }
            // Check if already exists
            const exists = savedQueries.some(q => q.title === itemData.title);
            if (exists) {
                alert('Já existe uma consulta salva com este nome.');
                return;
            }
            const newQuery = { ...itemData, id: Date.now() };
            setSavedQueries(prev => [...prev, newQuery]);
            alert(`Consulta "${itemData.title}" salva com sucesso!`);
        } else if (itemType === 'REMINDER') {
            // itemData: { title, description, date, ... }
            const exists = reminders.some(r => r.title === itemData.title);
            if (exists) {
                if (!confirm(`Já existe um lembrete com o título "${itemData.title}". Deseja adicionar mesmo assim?`)) {
                    return;
                }
            }
            const newReminder = { ...itemData, id: Date.now(), status: 'PENDING', createdAt: new Date().toISOString() };
            setReminders([...reminders, newReminder]);
            alert(`Lembrete "${itemData.title}" adicionado com sucesso!`);
        } else if (itemType === 'DOC') {
            // itemData: { id, title, bookId }
            // Dispatch event to open doc
            const event = new CustomEvent('hap-doc-open', {
                detail: { id: itemData.id, bookId: itemData.bookId }
            });
            window.dispatchEvent(event);
        }
    };

    if (!isVisible) return null;

    return (
        <div className={`flex h-full ${theme.bg} overflow-hidden`}>
            {/* Sidebar - Online Users */}
            <div className={`w-64 border-r border-gray-200 flex flex-col hidden md:flex bg-white`}>
                <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-bold text-gray-700 flex items-center">
                        <Users className="w-5 h-5 mr-2" /> Online ({usersOnline.length})
                    </h3>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    <div
                        onClick={() => setSelectedUser(null)}
                        className={`flex items-center p-2 rounded-lg cursor-pointer transition-colors ${!selectedUser ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'}`}
                    >
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center mr-2">
                            <Users size={16} className="text-blue-600" />
                        </div>
                        <span className="text-sm font-bold text-gray-700">Chat Geral</span>
                    </div>
                    {usersOnline.filter(u => u.username !== user.username).map((u, idx) => (
                        <div
                            key={idx}
                            onClick={() => {
                                setSelectedUser(u);
                                setUnreadCounts(prev => ({ ...prev, [u.username]: 0 }));
                            }}
                            className={`flex items-center p-2 rounded-lg cursor-pointer transition-colors ${selectedUser?.username === u.username ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'}`}
                        >
                            <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                            <div className="flex-1">
                                <div className="flex justify-between items-center">
                                    <span className={`text-sm font-medium text-gray-700 block`}>{u.username}</span>
                                    {unreadCounts[u.username] > 0 && (
                                        <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                                            {unreadCounts[u.username]}
                                        </span>
                                    )}
                                </div>
                                <span className="text-xs text-gray-500">{u.team}</span>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="p-4 border-t border-gray-100 bg-gray-50/50">
                    <div className="flex items-center">
                        <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">
                            {user && user.username ? user.username[0].toUpperCase() : '?'}
                        </div>
                        <div className="ml-2">
                            <p className={`text-sm font-bold text-gray-800`}>{user.username}</p>
                            <p className="text-xs text-gray-500">{user.team}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 flex flex-col">
                {/* Chat Header */}
                <div className="p-3 border-b border-gray-200 bg-white flex items-center justify-between shadow-sm z-10">
                    <div className="flex items-center">
                        {selectedUser ? (
                            <>
                                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center mr-2">
                                    <User size={16} className="text-indigo-600" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-gray-800">{selectedUser.username}</h3>
                                    <p className="text-xs text-gray-500">{selectedUser.team}</p>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center mr-2">
                                    <Users size={16} className="text-blue-600" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-gray-800">Chat Geral</h3>
                                    <p className="text-xs text-gray-500">Todos da equipe</p>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50 code-scroll">
                    {messages.filter(msg => {
                        if (selectedUser) {
                            // Private Chat: Show if (Sender is Me AND Recipient is Selected) OR (Sender is Selected AND Recipient is Me)
                            return (msg.sender === user.username && msg.recipient === selectedUser.username) ||
                                (msg.sender === selectedUser.username && msg.recipient === user.username);
                        } else {
                            // Global Chat: Show if Recipient is ALL
                            return msg.recipient === 'ALL';
                        }
                    }).map((msg, idx) => {
                        const isMe = msg.sender === user.username;
                        return (
                            <div key={idx} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${isMe
                                    ? 'bg-blue-600 text-white rounded-br-none'
                                    : 'bg-white text-gray-800 border border-gray-100 rounded-bl-none'
                                    }`}>
                                    {!isMe && <p className="text-xs font-bold mb-1 opacity-70">{msg.sender}</p>}

                                    {/* Message Content */}
                                    {msg.type === 'CODE' ? (
                                        <pre className="bg-black/20 p-2 rounded text-xs font-mono overflow-x-auto mt-1">
                                            <code>{msg.content}</code>
                                        </pre>
                                    ) : msg.type === 'SHARED_ITEM' ? (
                                        <div className="mt-1">
                                            <div className="flex items-center space-x-2 mb-2">
                                                {msg.metadata.itemType === 'SQL' && <Database size={16} />}
                                                {msg.metadata.itemType === 'REMINDER' && <Bell size={16} />}
                                                {msg.metadata.itemType === 'DOC' && <FileText size={16} />}
                                                <span className="font-semibold">{msg.metadata.itemType} Compartilhado</span>
                                            </div>
                                            <div className="bg-white/10 p-2 rounded mb-2 text-sm">
                                                {msg.metadata.itemType === 'SQL' && (
                                                    <>
                                                        <p className="font-bold">{msg.metadata.itemData.title}</p>
                                                        <pre className="text-xs opacity-70 mt-1 truncate">{msg.metadata.itemData.sql}</pre>
                                                    </>
                                                )}
                                                {msg.metadata.itemType === 'DOC' && (
                                                    <>
                                                        <p className="font-bold">{msg.metadata.itemData.title}</p>
                                                        <p className="text-xs opacity-70 mt-1">{msg.metadata.itemData.bookTitle}</p>
                                                    </>
                                                )}
                                                {msg.metadata.itemType !== 'SQL' && msg.metadata.itemType !== 'DOC' && <p>{JSON.stringify(msg.metadata.itemData)}</p>}
                                            </div>
                                            {!isMe && (
                                                <button
                                                    onClick={() => handleAcceptSharedItem(msg)}
                                                    className="w-full bg-white text-blue-600 py-1 rounded text-xs font-bold hover:bg-gray-100 flex items-center justify-center"
                                                >
                                                    {msg.metadata.itemType === 'DOC' ? (
                                                        <><FileText size={12} className="mr-1" /> Abrir</>
                                                    ) : (
                                                        <><Check size={12} className="mr-1" /> Aceitar</>
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                                    )}

                                    <div className="flex items-center justify-end mt-1 space-x-1 opacity-60">
                                        <p className="text-[10px]">
                                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                        {isMe && <Check size={12} className="text-blue-200" />}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <form onSubmit={sendMessage} className={`p-3 border-t ${theme.border} bg-white flex items-end gap-2`}>
                    <button
                        type="button"
                        onClick={() => setShowShareModal(true)}
                        className="p-3 text-gray-500 hover:text-blue-600 transition-colors mb-0.5"
                        title="Compartilhar..."
                    >
                        <Paperclip size={24} />
                    </button>
                    <textarea
                        value={inputMessage}
                        onChange={(e) => setInputMessage(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                sendMessage(e);
                            }
                        }}
                        placeholder="Digite sua mensagem (SQL é detectado automaticamente)..."
                        className={`flex-1 border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y shadow-sm ${theme.input} ${theme.border}`}
                        rows={1}
                        style={{ minHeight: '50px', maxHeight: '200px' }}
                    />
                    <button
                        type="submit"
                        disabled={!inputMessage.trim()}
                        className={`p-3 rounded-xl transition-colors mb-0.5 ${inputMessage.trim() ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md transform active:scale-95' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
                    >
                        <Send size={24} />
                    </button>
                </form>
            </div>

            {/* Share Modal */}
            {showShareModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className={`w-full max-w-lg p-6 bg-white rounded-2xl shadow-2xl border border-gray-100`}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-bold text-gray-800">Compartilhar Item</h3>
                            <button onClick={() => setShowShareModal(false)} className="text-gray-500 hover:text-red-500">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="flex space-x-4 mb-4 border-b border-gray-100 pb-2">
                            <button
                                onClick={() => setShareType('SQL')}
                                className={`pb-2 px-2 ${shareType === 'SQL' ? 'border-b-2 border-blue-500 font-bold text-blue-600' : 'text-gray-500'}`}
                            >
                                SQL Salvo
                            </button>
                            <button
                                onClick={() => setShareType('REMINDER')}
                                className={`pb-2 px-2 ${shareType === 'REMINDER' ? 'border-b-2 border-blue-500 font-bold text-blue-600' : 'text-gray-500'}`}
                            >
                                Lembretes
                            </button>
                            <button
                                onClick={() => setShareType('DOC')}
                                className={`pb-2 px-2 ${shareType === 'DOC' ? 'border-b-2 border-blue-500 font-bold text-blue-600' : 'text-gray-500'}`}
                            >
                                Docs
                            </button>
                        </div>

                        <div className="max-h-60 overflow-y-auto space-y-2">
                            {shareType === 'SQL' && (
                                savedQueries.length === 0 ? <p className="text-gray-500">Nenhum SQL salvo.</p> :
                                    savedQueries.map((q, idx) => (
                                        <div key={idx} className="flex justify-between items-center p-3 bg-gray-50 rounded-xl hover:bg-gray-100 border border-transparent hover:border-gray-200 transition-all">
                                            <div className="overflow-hidden">
                                                <p className="font-bold text-sm truncate text-gray-800">{q.title}</p>
                                                <p className="text-xs text-gray-500 truncate">{q.sql}</p>
                                            </div>
                                            <button
                                                onClick={() => handleShare(q, 'SQL')}
                                                className="ml-2 px-3 py-1 bg-blue-100 text-blue-700 rounded text-xs font-bold hover:bg-blue-200"
                                            >
                                                Enviar
                                            </button>
                                        </div>
                                    ))
                            )}
                            {shareType === 'REMINDER' && (
                                (!reminders || reminders.length === 0) ? <p className="text-gray-500">Nenhum lembrete.</p> :
                                    reminders.map((r, idx) => (
                                        <div key={idx} className="flex justify-between items-center p-3 bg-gray-50 rounded-xl hover:bg-gray-100 border border-transparent hover:border-gray-200 transition-all">
                                            <div className="overflow-hidden">
                                                <p className="font-bold text-sm truncate text-gray-800">{r.text}</p>
                                                <p className="text-xs text-gray-500">
                                                    {r.date && !isNaN(new Date(r.date)) ? new Date(r.date).toLocaleDateString() : 'Sem data'}
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => handleShare(r, 'REMINDER')}
                                                className="ml-2 px-3 py-1 bg-blue-100 text-blue-700 rounded text-xs font-bold hover:bg-blue-200"
                                            >
                                                Enviar
                                            </button>
                                        </div>
                                    ))
                            )}
                            {shareType === 'DOC' && (
                                <DocsTreeSelector onShare={(item) => handleShare(item, 'DOC')} />
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TeamChat;
