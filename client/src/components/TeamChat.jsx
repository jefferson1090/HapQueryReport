import React, { useState, useEffect, useRef, useContext } from 'react';
import { ThemeContext } from '../context/ThemeContext';
import { useApi } from '../context/ApiContext';
import ChatSidebar from './chat/ChatSidebar';
import MessageList from './chat/MessageList';
import ChatInput from './chat/ChatInput';
import DocsSelector from './chat/DocsSelector';
import { Cloud, Database, RefreshCw, MoreHorizontal, Share2, X } from 'lucide-react';

const TeamChat = ({ isVisible, user, socket, savedQueries, setSavedQueries, reminders, setReminders }) => {
    const { theme } = useContext(ThemeContext);
    const { apiUrl } = useApi();

    // Core State
    const [messages, setMessages] = useState([]);
    const [usersOnline, setUsersOnline] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [unreadCounts, setUnreadCounts] = useState({});

    // UI State
    const [isSidebarOpen, setIsSidebarOpen] = useState(true); // For mobile responsibility
    const [replyTo, setReplyTo] = useState(null);
    const [showShareMenu, setShowShareMenu] = useState(false);

    // Toast Logic
    const [toast, setToast] = useState(null);
    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    // Connection State
    const [currentBackend, setCurrentBackend] = useState(localStorage.getItem('chat_backend') || 'supabase');
    const [connectionStatus, setConnectionStatus] = useState('CONNECTED');

    // === Socket Logic ===
    useEffect(() => {
        if (!user || !socket) return;

        const handleMessage = (msg) => {
            if (msg.content === '[HEARTBEAT]') return;
            setMessages(prev => {
                // Dedup & Merge (Optimistic -> Real)
                const existingIdx = prev.findIndex(m => m.id === msg.id || (m.metadata?.client_id && m.metadata.client_id === msg.metadata?.client_id));

                if (existingIdx !== -1) {
                    // Update existing (e.g. fill in ID, timestamp, read status)
                    const newArr = [...prev];
                    newArr[existingIdx] = { ...newArr[existingIdx], ...msg };
                    return newArr;
                }
                return [...prev, msg];
            });

            // Unread
            if (msg.recipient !== 'ALL' && msg.sender !== user.username) {
                if (selectedUser?.username !== msg.sender) {
                    setUnreadCounts(prev => ({ ...prev, [msg.sender]: (prev[msg.sender] || 0) + 1 }));
                }
            }
        };

        const handleUserList = (users) => setUsersOnline(users);

        const handleReactionUpdate = (data) => {
            setMessages(prev => prev.map(m => {
                if (m.id === data.messageId) {
                    const existing = m.reactions || [];
                    // Dedup: Check if exact reaction already exists
                    if (existing.some(r => r.user === data.user && r.emoji === data.emoji)) return m;
                    return { ...m, reactions: [...existing, { emoji: data.emoji, user: data.user }] };
                }
                return m;
            }));
        };

        const handleMessageUpdate = (updatedMsg) => {
            setMessages(prev => prev.map(m => {
                if (m.id === updatedMsg.id) {
                    // Merge updates (e.g. read_at)
                    return { ...m, ...updatedMsg };
                }
                return m;
            }));
        };

        socket.on('message', handleMessage);
        socket.on('update_user_list', handleUserList);
        socket.on('message_reaction', handleReactionUpdate);
        socket.on('message_update', handleMessageUpdate);

        // Initial Load
        fetchHistory(selectedUser ? selectedUser.username : 'ALL');

        // ANNOUNCE PRESENCE
        if (socket && user.username) {
            // Send a hidden heartbeat to the 'messages' table so others see me via pollPresence
            const heartbeat = {
                sender: user.username,
                content: '[HEARTBEAT]',
                type: 'SYSTEM',
                recipient: 'ALL',
                metadata: { client_id: Date.now().toString() }
            };
            socket.emit('message', heartbeat);
        }

        return () => {
            socket.off('message', handleMessage);
            socket.off('update_user_list', handleUserList);
            socket.off('message_reaction', handleReactionUpdate);
            socket.off('message_update', handleMessageUpdate);
        };
    }, [user, socket, selectedUser]);

    // === Read Receipts Logic ===
    useEffect(() => {
        if (!socket || !isVisible || !user) return;

        // Find unread messages sent by OTHERS that are meant for ME (or Global)
        const unreadIds = messages
            .filter(m =>
                m.sender !== user.username && // Not my own
                !m.read_at && // Not already read
                (!selectedUser || m.sender === selectedUser.username || m.recipient === user.username)
                // Context: If checking global, we don't mark ALL global as read unless we are looking at them? 
                // For MVP: If I see the message in the list, I mark it as read.
            )
            .map(m => m.id)
            .filter(id => id); // Ensure valid IDs

        if (unreadIds.length > 0) {
            // Debounce or send immediately? 
            // Send immediately for responsiveness
            socket.emit('mark_read', { messageIds: unreadIds, username: user.username });

            // Optimistically update local state to prevent spamming emit
            setMessages(prev => prev.map(m => {
                if (unreadIds.includes(m.id)) {
                    return { ...m, read_at: new Date().toISOString() };
                }
                return m;
            }));
        }
    }, [messages, isVisible, selectedUser, socket, user]);

    // === Helpers ===
    const fetchHistory = async (target) => {
        try {
            // Logic to fetch history based on target (username)
            // Existing API expects ?username=...
            const targetUsername = target === 'ALL' ? user.username : target;
            const res = await fetch(`${apiUrl}/api/chat/history?username=${targetUsername}`); // Basic implementation
            const data = await res.json();
            if (Array.isArray(data)) setMessages(data.filter(m => m.content !== '[HEARTBEAT]'));
        } catch (e) { console.error(e); }
    };

    const handleSend = async (text, replyContext, files = []) => {
        if (!socket) return;

        let attachments = [];

        // 1. Upload Files if present
        if (files && files.length > 0) {
            const uploadPromises = files.map(async (file) => {
                const formData = new FormData();
                formData.append('file', file);

                try {
                    const res = await fetch(`${apiUrl}/api/upload/attachment`, {
                        method: 'POST',
                        body: formData
                    });

                    if (res.ok) {
                        const data = await res.json();
                        // Assume data returns { url: "..." }
                        // Construct attachment object
                        return {
                            name: file.name,
                            type: file.type,
                            url: data.url.startsWith('http') ? data.url : `${apiUrl}${data.url}` // Ensure full path if relative
                        };
                    }
                } catch (error) {
                    console.error("Upload failed for", file.name, error);
                    showToast(`Falha ao enviar arquivo: ${file.name}`, 'error');
                }
                return null;
            });

            const results = await Promise.all(uploadPromises);
            attachments = results.filter(a => a !== null);
        }

        // Return if nothing to send
        if (!text.trim() && attachments.length === 0) return;

        let type = 'TEXT';
        // SQL Detection
        if (/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|WITH)/i.test(text)) type = 'CODE';

        const payload = {
            sender: user.username,
            content: text,
            type,
            recipient: selectedUser ? selectedUser.username : 'ALL',
            metadata: {
                client_id: Date.now().toString(),
                replyTo: replyContext, // Pass reply context
                attachments: attachments // Add attachments
            }
        };

        socket.emit('message', payload);
        setMessages(prev => [...prev, payload]); // Optimistic
        setReplyTo(null);
    };

    const handleReact = (messageId, emoji) => {
        // Optimistic Update
        setMessages(prev => prev.map(m => {
            if (m.id === messageId) {
                const existing = m.reactions || [];
                // Toggle logic or append logic? Let's just append for simplicity in MVP
                return { ...m, reactions: [...existing, { emoji, user: user.username }] };
            }
            return m;
        }));

        // Emit to server (Correcting payload to match server expectation)
        socket.emit('message_reaction', { messageId, emoji, user: user.username });
    };

    const handleShare = (itemType, itemData) => {
        if (!socket) return;

        const recipient = selectedUser ? selectedUser.username : 'ALL';

        // Server Emit ONLY (Removed Optimistic Update to prevent duplicates)
        // Explicitly attach sender for Badge logic so receiver sees "Compartilhado por [Username]"
        const serverPayload = {
            sender: user.username,
            recipient: recipient,
            itemType,
            itemData: { ...itemData, sender: user.username }
        };
        socket.emit('share_item', serverPayload);

        setShowShareMenu(false);
    };



    if (!isVisible) return null;

    // Filter Messages for Current View
    const displayedMessages = messages.filter(msg => {
        if (selectedUser) {
            // Private: Me<->Them
            const s = msg.sender.toLowerCase();
            const r = String(msg.recipient || '').toLowerCase();
            const me = user.username.toLowerCase();
            const them = selectedUser.username.toLowerCase();
            return (s === me && r === them) || (s === them && r === me);
        } else {
            // Global
            return (!msg.recipient || msg.recipient === 'ALL');
        }
    });

    return (
        <div className="flex h-full bg-white overflow-hidden font-sans relative">
            {toast && (
                <div className={`absolute top-4 left-1/2 transform -translate-x-1/2 z-[100] px-4 py-2 rounded shadow-lg text-white text-sm font-bold animate-fade-in-down ${toast.type === 'error' ? 'bg-red-500' : 'bg-green-600'}`}>
                    {toast.msg}
                </div>
            )}
            {/* Use Sidebar Component */}
            <ChatSidebar
                users={usersOnline}
                currentUser={user}
                selectedUser={selectedUser}
                unreadCounts={unreadCounts}
                onSelectUser={(u) => {
                    setSelectedUser(u);
                    if (u) setUnreadCounts(prev => ({ ...prev, [u.username]: 0 }));
                    fetchHistory(u ? u.username : 'ALL'); // Reload history context
                }}
            />

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col min-w-0 bg-[#F5F7FB]">
                {/* Header */}
                <div className="h-16 border-b border-gray-200 bg-white px-4 flex justify-between items-center flex-shrink-0 shadow-sm z-10">
                    <div>
                        <h3 className="font-bold text-gray-800 text-lg">
                            {selectedUser ? selectedUser.username : '# Geral'}
                        </h3>
                        <p className="text-xs text-gray-400">
                            {selectedUser ? selectedUser.team : ' Canal de comunicação de toda a equipe'}
                        </p>
                    </div>

                    <div className="flex items-center space-x-2">
                        <div className="relative">
                            <button
                                onClick={() => setShowShareMenu(!showShareMenu)}
                                className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors" title="Compartilhar"
                            >
                                <Share2 size={20} />
                            </button>
                            {/* Share Menu Popup */}
                            {showShareMenu && (
                                <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-200 p-2 z-50 animate-fade-in-down">
                                    <h4 className="px-2 py-1 text-xs font-bold text-gray-400 uppercase">Compartilhar</h4>
                                    <div className="space-y-1">

                                        {/* Docs Integration */}
                                        <div className="border-b border-gray-100 pb-2 mb-2">
                                            <span className="text-xs font-bold px-2 text-blue-600 block mb-1">Documentação</span>
                                            <DocsSelector onShare={(data) => handleShare(data.type || 'DOC', data)} />
                                        </div>

                                        {/* Saved SQL */}
                                        <div className="border-b border-gray-100 pb-2 mb-2">
                                            <span className="text-xs font-bold px-2 text-indigo-600 block mb-1">SQL Salvo</span>
                                            <div className="max-h-[150px] overflow-y-auto px-1 space-y-1">
                                                {(savedQueries || []).map((q, i) => (
                                                    <button
                                                        key={i}
                                                        onClick={() => handleShare('SQL', q)}
                                                        className="w-full text-left px-2 py-1.5 hover:bg-indigo-50 rounded text-xs text-gray-700 flex items-center justify-between group"
                                                    >
                                                        <span className="truncate flex-1" title={q.name}>{q.name}</span>
                                                        <span className="text-[10px] text-gray-400 opacity-0 group-hover:opacity-100 uppercase">Enviar</span>
                                                    </button>
                                                ))}
                                                {(!savedQueries || savedQueries.length === 0) && <p className="px-2 text-xs text-gray-400 italic">Nenhuma query salva.</p>}
                                            </div>
                                        </div>

                                        {/* Reminders */}
                                        <div>
                                            <span className="text-xs font-bold px-2 text-orange-600 block mb-1">Lembretes</span>
                                            <div className="max-h-[150px] overflow-y-auto px-1 space-y-1">
                                                {(reminders || []).filter(r => r.status !== 'COMPLETED').map((r, i) => (
                                                    <button
                                                        key={i}
                                                        onClick={() => handleShare('REMINDER', r)}
                                                        className="w-full text-left px-2 py-1.5 hover:bg-orange-50 rounded text-xs text-gray-700 flex items-center justify-between group"
                                                    >
                                                        <span className="truncate flex-1" title={r.title}>{r.title}</span>
                                                        <span className="text-[10px] text-gray-400 opacity-0 group-hover:opacity-100 uppercase">Enviar</span>
                                                    </button>
                                                ))}
                                                {(!reminders || reminders.length === 0) && <p className="px-2 text-xs text-gray-400 italic">Nenhum lembrete.</p>}
                                            </div>
                                        </div>

                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Message List */}
                <MessageList
                    messages={displayedMessages}
                    currentUser={user.username}
                    onReact={handleReact}
                    onReply={setReplyTo}
                    onAddSharedItem={(type, data) => {
                        if (type === 'SQL') {
                            if (savedQueries.some(q => q.name === data.name)) {
                                showToast("Query já existe na sua lista.", 'error');
                            } else {
                                setSavedQueries(prev => [...prev, data]);
                                showToast("Query adicionada com sucesso!");
                            }
                        } else if (type === 'REMINDER') {
                            if (reminders.some(r => r.id === data.id)) {
                                showToast("Lembrete já existe ou foi atualizado.", 'error');
                            } else {
                                // 1. Add locally with 'sharedBy'
                                const newItem = { ...data, sharedBy: data.sender || 'Chat' };
                                setReminders(prev => [...prev, newItem]);

                                // 2. Notify Sender / Update Global State
                                // We update the original item to include us in 'sharedWith'
                                if (socket) {
                                    const sharedWith = data.sharedWith || [];
                                    if (!sharedWith.includes(user.username)) {
                                        // FIX: Ensure sharedBy is persisted in the global update, otherwise it reverts to null (Self) for others.
                                        const updatedOriginal = {
                                            ...data,
                                            sharedBy: data.sharedBy || data.sender,
                                            sharedWith: [...sharedWith, user.username]
                                        };
                                        socket.emit('reminder_update', { reminder: updatedOriginal, sender: user.username });
                                    }
                                }
                                showToast("Lembrete adicionado ao quadro!");
                            }
                        }
                    }}
                />

                {/* Input Area */}
                <ChatInput
                    onSend={handleSend}
                    replyTo={replyTo}
                    onCancelReply={() => setReplyTo(null)}
                />
            </div>
        </div>
    );
};

export default TeamChat;
