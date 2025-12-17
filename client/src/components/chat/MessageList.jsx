import React, { useRef, useLayoutEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, CheckCheck, Smile, CornerDownRight, Database } from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';

const ReactionBar = ({ onReact, showPicker, togglerRef }) => {
    return (
        <div className="absolute -top-5 right-2 bg-white shadow-md border border-gray-200 rounded-full px-2 py-0.5 flex space-x-1 opacity-0 group-hover/msg:opacity-100 transition-opacity z-20">
            {['👍', '❤️', '😂', '😮'].map(emoji => (
                <button key={emoji} onClick={() => onReact(emoji)} className="hover:scale-125 transition-transform text-sm">{emoji}</button>
            ))}
            <button ref={togglerRef} onClick={showPicker} className="text-gray-400 hover:text-gray-600">
                <Smile size={14} />
            </button>
        </div>
    );
};

const MessageItem = ({ msg, isMe, previousSameSender, onReact, onReply, onAddSharedItem }) => {
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const pickerRef = useRef(null);

    const isShared = msg.type === 'SHARED_ITEM' && msg.metadata?.itemData;

    return (
        <div className={`group/msg relative flex flex-col ${isMe ? 'items-end' : 'items-start'} ${previousSameSender ? 'mt-1' : 'mt-4'}`}>
            {/* Sender Name (only if not grouped) */}
            {!previousSameSender && !isMe && (
                <span className="text-xs text-gray-400 ml-1 mb-1 font-medium">{msg.sender}</span>
            )}

            <div className={`relative max-w-[80%] ${isShared ? 'w-full md:w-[350px]' : ''}`}>
                <motion.div
                    initial={{ opacity: 0, y: 20, scale: 0.8, rotate: isMe ? -2 : 2 }}
                    animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    className={`px-4 py-3 rounded-2xl text-sm relative shadow-lg
                        ${isMe ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-br-none' : 'bg-white text-gray-800 border border-gray-100 rounded-bl-none'}
                        ${msg.type === 'DELETED' ? 'italic text-opacity-50' : ''}
                    `}
                >
                    {/* Reply Context */}
                    {msg.replyTo && (
                        <div className={`text-xs mb-2 pl-2 border-l-2 ${isMe ? 'border-white/40 text-white/90' : 'border-gray-300 text-gray-500'}`}>
                            <span className="font-bold">{msg.replyTo.sender}</span>: {msg.replyTo.content.substring(0, 30)}...
                        </div>
                    )}

                    {/* Content Logic */}
                    {isShared ? (
                        <div className="flex flex-col gap-2">
                            <span className={`font-bold text-[10px] uppercase tracking-wider flex items-center gap-1 ${isMe ? 'text-blue-100/80' : 'text-indigo-500'}`}>
                                <CornerDownRight size={10} />
                                Compartilhou {msg.metadata.itemType === 'SQL' ? 'Query SQL' : 'Lembrete'}
                            </span>

                            {/* ELEGANT CARD: White bg inside Blue bubble (Me), or Soft Gray inside White bubble (Them) */}
                            <div className={`p-4 rounded-xl shadow-sm border overflow-hidden relative group
                                ${isMe ? 'bg-white text-gray-800 border-transparent' : 'bg-gradient-to-br from-gray-50 to-indigo-50/50 border-indigo-100'}
                            `}>
                                {/* Decorative Accent */}
                                <div className={`absolute top-0 left-0 w-1 h-full ${msg.metadata.itemType === 'SQL' ? 'bg-indigo-500' : 'bg-orange-400'}`}></div>

                                <div className="flex items-start justify-between mb-1 pl-2">
                                    <div className="flex items-center gap-2">
                                        {msg.metadata.itemType === 'SQL' ? (
                                            <div className="p-1.5 bg-indigo-100 text-indigo-700 rounded-lg"><Database size={14} /></div>
                                        ) : (
                                            <div className="p-1.5 bg-orange-100 text-orange-700 rounded-lg"><CheckCheck size={14} /></div>
                                        )}
                                        <h4 className="font-bold text-sm leading-tight">{msg.metadata.itemData.title || msg.metadata.itemData.name || 'Sem Título'}</h4>
                                    </div>
                                </div>
                                <p className="text-xs text-gray-500 pl-2 line-clamp-2 mt-1">{msg.metadata.itemData.description || 'Sem descrição.'}</p>

                                {!isMe && (
                                    <button
                                        onClick={() => onAddSharedItem(msg.metadata.itemType, msg.metadata.itemData)}
                                        className="mt-3 w-full py-2 bg-white border border-indigo-200 text-indigo-600 text-xs font-bold rounded-lg shadow-sm hover:bg-indigo-50 transition-colors uppercase tracking-wide"
                                    >
                                        Adicionar ao Quadro
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : (
                        <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    )}

                    {/* Attachments Display */}
                    {msg.metadata?.attachments && msg.metadata.attachments.length > 0 && (
                        <div className={`mt-3 grid gap-2 ${msg.metadata.attachments.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                            {msg.metadata.attachments.map((att, i) => (
                                att.type?.startsWith('image/') ? (
                                    <div key={i} className="relative group overflow-hidden rounded-xl bg-black/5 border border-black/10 aspect-video shadow-inner">
                                        <img
                                            src={att.url}
                                            alt={att.name}
                                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 cursor-zoom-in"
                                            onClick={() => window.open(att.url, '_blank')}
                                        />
                                    </div>
                                ) : (
                                    <a
                                        key={i}
                                        href={att.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={`flex items-center p-3 rounded-xl border text-xs transition-all hover:-translate-y-0.5
                                            ${isMe ? 'bg-white/20 border-white/30 text-white hover:bg-white/30' : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-white hover:shadow-md'}
                                        `}
                                    >
                                        <div className={`mr-3 p-2 rounded-lg ${isMe ? 'bg-white/90 text-blue-600 shadow-sm' : 'bg-white text-indigo-600 border border-gray-100 shadow-sm'}`}>
                                            <span className="font-bold uppercase text-[10px]">{att.name.split('.').pop()}</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold truncate">{att.name}</p>
                                            <p className={`text-[10px] ${isMe ? 'text-blue-100' : 'text-gray-400'}`}>Clique para baixar</p>
                                        </div>
                                    </a>
                                )
                            ))}
                        </div>
                    )}

                    {/* Metadata (Time + Checks) */}
                    <div className={`text-[10px] mt-1 flex items-center justify-end space-x-1 ${isMe ? 'text-blue-100' : 'text-gray-400'}`}>
                        <span>{(!msg.timestamp || isNaN(new Date(msg.timestamp).getTime())) ? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {isMe && (
                            (msg.read_at && msg.read_at !== 'null') ? <CheckCheck size={12} className="text-blue-200" /> : <Check size={12} />
                        )}
                    </div>
                </motion.div>

                {/* Reactions Display */}
                {msg.reactions && msg.reactions.length > 0 && (
                    <div className={`absolute -bottom-3 ${isMe ? 'right-0' : 'left-0'} flex space-x-1`}>
                        {Object.entries(msg.reactions.reduce((acc, r) => { acc[r.emoji] = (acc[r.emoji] || 0) + 1; return acc; }, {})).map(([emoji, count]) => (
                            <span key={emoji} className="bg-white text-[10px] border border-gray-100 shadow-sm rounded-full px-1.5 py-0.5" title={`${count} reaction(s)`}>
                                {emoji} {count > 1 && count}
                            </span>
                        ))}
                    </div>
                )}

                {/* Actions Hover Bar */}
                <ReactionBar
                    onReact={(emoji) => onReact(msg.id, emoji)}
                    showPicker={() => setShowEmojiPicker(!showEmojiPicker)}
                    togglerRef={pickerRef}
                />

                {/* Reply Button */}
                <button onClick={() => onReply(msg)} className="absolute -top-3 right-24 bg-white shadow-sm border border-gray-200 rounded-full px-2 py-0.5 text-gray-400 hover:text-blue-600 opacity-0 group-hover/msg:opacity-100 transition-opacity z-10" title="Responder">
                    <CornerDownRight size={14} />
                </button>
            </div>

            {showEmojiPicker && (
                <div className="absolute z-50 top-8 right-0 shadow-xl rounded-lg">
                    <EmojiPicker
                        onEmojiClick={(data) => { onReact(msg.id, data.emoji); setShowEmojiPicker(false); }}
                        width={300}
                        height={400}
                    />
                    {/* Backdrop to close */}
                    <div className="fixed inset-0 z-[-1]" onClick={() => setShowEmojiPicker(false)}></div>
                </div>
            )}
        </div>
    );
};

const MessageList = ({ messages, currentUser, onReact, onReply, onAddSharedItem }) => {
    const endRef = useRef(null);

    useLayoutEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    return (
        <div className="flex-1 overflow-y-auto p-4 space-y-1 bg-[#F5F7FB] scrollbar-thin scrollbar-thumb-gray-300">
            {messages.map((msg, i) => {
                const isMe = msg.sender === currentUser;
                const previousMsg = messages[i - 1];
                const previousSameSender = previousMsg && previousMsg.sender === msg.sender && (new Date(msg.timestamp) - new Date(previousMsg.timestamp) < 60000); // 1 min grouping

                return (
                    <MessageItem
                        key={msg.id || i} // Use ID if available
                        msg={msg}
                        isMe={isMe}
                        previousSameSender={previousSameSender}
                        onReact={onReact}
                        onReply={onReply}
                        onAddSharedItem={onAddSharedItem}
                    />
                );
            })}
            <div ref={endRef} />
        </div>
    );
};

export default MessageList;
