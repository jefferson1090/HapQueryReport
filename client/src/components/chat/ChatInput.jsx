import React, { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, Smile } from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';

const ChatInput = ({ onSend, onTyping, replyTo, onCancelReply }) => {
    const [text, setText] = useState('');
    const [showEmoji, setShowEmoji] = useState(false);
    const textareaRef = useRef(null);

    const [files, setFiles] = useState([]);
    const fileInputRef = useRef(null);

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleSend = () => {
        if (!text.trim() && files.length === 0) return;
        onSend(text, replyTo, files);
        setText('');
        setFiles([]);
        if (onCancelReply) onCancelReply();

        // Reset height
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
    };

    const handleChange = (e) => {
        setText(e.target.value);
        if (onTyping) onTyping();

        // Auto-resize
        e.target.style.height = 'auto';
        e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`;
    };

    const handleFileSelect = (e) => {
        if (e.target.files) {
            const newFiles = Array.from(e.target.files);
            setFiles(prev => [...prev, ...newFiles]);
        }
    };

    const removeFile = (index) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    return (
        <div className="p-4 bg-white border-t border-gray-200 relative">
            {replyTo && (
                <div className="flex items-center justify-between bg-gray-50 p-2 rounded-t-lg border-b border-gray-200 mb-2 text-xs text-gray-500">
                    <span>Respondendo a <b>{replyTo.sender}</b>: "{replyTo.content.substring(0, 50)}..."</span>
                    <button onClick={onCancelReply} className="hover:text-red-500">✕</button>
                </div>
            )}

            {/* File Previews */}
            {files.length > 0 && (
                <div className="flex space-x-2 mb-2 overflow-x-auto pb-2 scrollbar-thin">
                    {files.map((f, i) => (
                        <div key={i} className="relative flex-shrink-0 w-16 h-16 bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-center group">
                            {f.type.startsWith('image/') ? (
                                <img src={URL.createObjectURL(f)} className="w-full h-full object-cover rounded-lg" />
                            ) : (
                                <div className="text-[10px] text-gray-500 text-center break-all p-1">{f.name.substring(0, 10)}...</div>
                            )}
                            <button
                                onClick={() => removeFile(i)}
                                className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] invisible group-hover:visible"
                            >
                                ✕
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {showEmoji && (
                <div className="absolute bottom-20 right-4 z-50">
                    <EmojiPicker onEmojiClick={(d) => setText(prev => prev + d.emoji)} />
                    <div className="fixed inset-0 z-[-1]" onClick={() => setShowEmoji(false)}></div>
                </div>
            )}

            <div className="flex items-end bg-gray-50 rounded-xl border border-gray-200 focus-within:ring-2 focus-within:ring-blue-100 transition-shadow">
                <button
                    onClick={() => fileInputRef.current?.click()}
                    className="p-3 text-gray-400 hover:text-gray-600 transition-colors"
                >
                    <Paperclip size={20} />
                </button>
                <input
                    type="file"
                    multiple
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                />

                <textarea
                    ref={textareaRef}
                    className="flex-1 bg-transparent border-none focus:ring-0 p-3 max-h-[150px] resize-none text-sm text-gray-800"
                    placeholder="Digite sua mensagem..."
                    rows={1}
                    value={text}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                />

                <button
                    onClick={() => setShowEmoji(!showEmoji)}
                    className="p-3 text-gray-400 hover:text-yellow-500 transition-colors"
                >
                    <Smile size={20} />
                </button>

                <button
                    onClick={handleSend}
                    disabled={!text.trim()}
                    className="p-3 m-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors shadow-sm"
                >
                    <Send size={18} />
                </button>
            </div>

            <div className="text-[10px] text-gray-400 mt-1 text-right">
                Enter para enviar, Shift+Enter para quebra de linha
            </div>
        </div>
    );
};

export default ChatInput;
