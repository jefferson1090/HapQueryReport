import React, { useState, useEffect, useRef, useContext } from 'react';
import { useApi } from '../context/ApiContext'; // Assume we have this or use props
// --- Helpers ---
const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
};

import { ThemeContext } from '../context/ThemeContext';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDroppable } from '@dnd-kit/core';
import {
    Share2, MessageSquare, Paperclip, ChevronDown, ChevronUp,
    MoreHorizontal, Calendar, Clock, Plus, X, Send, Image as ImageIcon, File, FileText, Cloud, RefreshCw,
    Bold, Italic, List, Code, Trash2, Users, ListOrdered, CheckSquare, Strikethrough
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// --- Constants & Config ---
const COLUMNS = {
    PENDING: { id: 'PENDING', title: 'Em Definição', color: 'bg-slate-50', headerColor: 'border-l-4 border-slate-300', badgeInfo: { bg: 'bg-slate-100', text: 'text-slate-600' } },
    IN_PROGRESS: { id: 'IN_PROGRESS', title: 'Homologação', color: 'bg-blue-50/50', headerColor: 'border-l-4 border-blue-400', badgeInfo: { bg: 'bg-blue-50', text: 'text-blue-600' } },
    VALIDATION: { id: 'VALIDATION', title: 'Validação', color: 'bg-indigo-50/50', headerColor: 'border-l-4 border-indigo-400', badgeInfo: { bg: 'bg-indigo-50', text: 'text-indigo-600' } },
    OVERDUE: { id: 'OVERDUE', title: 'Atrasado', color: 'bg-red-50/50', headerColor: 'border-l-4 border-red-400', badgeInfo: { bg: 'bg-red-50', text: 'text-red-600' } },
    COMPLETED: { id: 'COMPLETED', title: 'Concluído', color: 'bg-emerald-50/50', headerColor: 'border-l-4 border-emerald-400', badgeInfo: { bg: 'bg-emerald-50', text: 'text-emerald-600' } }
};

// --- Helpers ---
// Simple Business Day Calculator (Mon-Fri)
const calculateBusinessDays = (startDate, endDate) => {
    let count = 0;
    const curDate = new Date(startDate.getTime());
    const end = new Date(endDate.getTime());

    // Normalize time to midnight to calculate pure days
    curDate.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    // Determine direction
    const increment = curDate <= end ? 1 : -1;

    while (curDate.getTime() !== end.getTime()) {
        const day = curDate.getDay();
        if (day !== 0 && day !== 6) count++;
        curDate.setDate(curDate.getDate() + increment);
    }

    // Include last day if moving forward? Usually difference does not include start day but includes end day?
    // Let's assume standard "Difference in Days". 
    // If same day, 0. 
    // If direction is negative, we return negative count.
    return increment === 1 ? count : -count;
};

// --- Helper Components ---

const StatusBadge = ({ status }) => {
    const col = COLUMNS[status] || COLUMNS.PENDING;
    return (
        <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${col.badgeInfo.bg} ${col.badgeInfo.text}`}>
            {col.title}
        </span>
    );
};

// --- Card Component (Draggable) ---
const KanbanCard = ({ reminder, onClick, onEdit, onMove, onDelete, currentUser }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: reminder.id, data: { ...reminder } });

    const [isExpanded, setIsExpanded] = useState(false);

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : 1,
        position: 'relative',
        zIndex: isDragging ? 999 : 1,
    };

    // Prevent drag when interacting with interactive elements
    const handleAction = (e, callback) => {
        e.stopPropagation();
        callback();
    };

    // Calculate stats
    const commentCount = (reminder.activity || []).filter(a => a.type === 'COMMENT').length;
    const attachmentCount = (reminder.attachments || []).length;

    // Quick calculate overdue
    const isOverdue = reminder.endDate && new Date(reminder.endDate) < new Date() && reminder.status !== 'COMPLETED';

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="mb-3 outline-none group">
            <motion.div
                layout
                initial={{ borderRadius: 8 }}
                className={`bg-white rounded-xl shadow-sm border border-slate-200 hover:shadow-md hover:border-blue-200 transition-all duration-200 overflow-hidden group ${isOverdue ? 'ring-1 ring-red-100 bg-red-50/10' : ''}`}
                onClick={() => onClick(reminder)}
            >
                {/* Header (Always Visible) */}
                <div className="p-4">
                    <div className="flex justify-between items-start mb-3">
                        <StatusBadge status={reminder.status} />
                        <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onPointerDown={(e) => { e.stopPropagation(); }} onMouseDown={(e) => { e.stopPropagation(); }} onClick={(e) => handleAction(e, () => setIsExpanded(!isExpanded))} className="p-1 hover:bg-blue-50 rounded text-slate-400 hover:text-blue-500 transition-colors">
                                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                        </div>
                    </div>

                    <h4 className="font-bold text-slate-800 text-sm leading-snug mb-3 tracking-tight">{reminder.title}</h4>

                    {/* Meta Row */}
                    <div className="flex items-center text-xs text-gray-400 space-x-3">
                        {/* Day Counter Logic */}
                        <div className={`flex items-center font-bold px-1.5 py-0.5 rounded text-[10px] ${reminder.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                            (reminder.endDate && new Date(reminder.endDate) < new Date()) ? 'bg-red-100 text-red-700' :
                                'bg-gray-100 text-gray-600'
                            }`}>
                            <Calendar size={10} className="mr-1" />
                            {(() => {
                                const now = new Date();
                                const start = new Date(reminder.createdAt);
                                const end = reminder.endDate ? new Date(reminder.endDate) : null;
                                const completedAt = reminder.updatedAt && reminder.status === 'COMPLETED' ? new Date(reminder.updatedAt) : null;

                                if (reminder.status === 'COMPLETED') {
                                    // Logic: Paused count. 
                                    // If Card had Deadline: Result = Deadline - CompletionDate (Did we finish 2 days early? 3 days late?)
                                    // If Card NO Deadline: Result = CompletionDate - CreatedAt (Duration)
                                    if (end) {
                                        const diff = calculateBusinessDays(completedAt || now, end);
                                        // If diff > 0: Finished Early (Remaining days existed). 
                                        // If diff < 0: Finished Late.
                                        return diff >= 0 ? `${diff}d adiantado` : `${Math.abs(diff)}d atraso`;
                                    } else {
                                        const totalDays = calculateBusinessDays(start, completedAt || now);
                                        return `${totalDays}d duração`;
                                    }
                                } else {
                                    // Active Logic
                                    // If Deadline: Days Until Deadline (from Now)
                                    // If No Deadline: Days Since Created (from CreatedAt)
                                    if (end) {
                                        const diff = calculateBusinessDays(now, end);
                                        return diff >= 0 ? `${diff}d restantes` : `${Math.abs(diff)}d atrasados`;
                                    } else {
                                        const diff = calculateBusinessDays(start, now);
                                        return `${diff}d desde início`;
                                    }
                                }
                            })()}
                        </div>

                        {reminder.endDate && (
                            <span className={`flex items-center ${isOverdue ? 'text-red-500 font-medium' : ''}`}>
                                <Clock size={12} className="mr-1" />
                                {new Date(reminder.endDate).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })}
                            </span>
                        )}
                        {(commentCount > 0 || attachmentCount > 0) && (
                            <div className="flex items-center space-x-2">
                                {commentCount > 0 && <span className="flex items-center hover:text-gray-600"><MessageSquare size={12} className="mr-1" /> {commentCount}</span>}
                                {attachmentCount > 0 && <span className="flex items-center hover:text-gray-600"><Paperclip size={12} className="mr-1" /> {attachmentCount}</span>}
                            </div>
                        )}
                    </div>
                </div>

                {/* Expanded Content (Details) */}
                <AnimatePresence>
                    {isExpanded && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="bg-gray-50 px-3 pb-3 border-t border-gray-100 text-xs"
                        >
                            <div className="pt-2 space-y-2">
                                {reminder.description && (
                                    <div className="text-sm text-gray-600 mb-3">
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm]}
                                            components={{
                                                ol: ({ node, ...props }) => <ol className="list-decimal pl-5 !mb-0" {...props} />,
                                                ul: ({ node, ...props }) => <ul className="list-disc pl-5 !mb-0" {...props} />,
                                                li: ({ node, ...props }) => <li className="!m-0 !pl-1 !leading-tight" {...props} />,
                                                p: ({ node, ...props }) => <p className="!m-0 inline !leading-tight" {...props} />,
                                                code({ node, inline, className, children, ...props }) {
                                                    const match = /language-(\w+)/.exec(className || '');
                                                    const isSql = match && match[1] === 'sql';

                                                    if (!inline && match) {
                                                        return (
                                                            <div className="rounded-md overflow-hidden my-2 border border-gray-700 shadow-sm bg-[#282c34] text-gray-300">
                                                                <div className="flex items-center justify-between px-3 py-1.5 bg-[#21252b] border-b border-gray-700 text-xs select-none">
                                                                    <span className="font-mono text-xs">{match[1]}</span>
                                                                    {isSql && (
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                const sql = String(children).replace(/\n$/, '');
                                                                                if (sql) window.dispatchEvent(new CustomEvent('hap-run-sql', { detail: { query: sql } }));
                                                                            }}
                                                                            className="flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white text-[10px] px-2 py-0.5 rounded shadow-sm transition-colors cursor-pointer"
                                                                        >
                                                                            <span className="text-xs">▶</span> Run
                                                                        </button>
                                                                    )}
                                                                </div>
                                                                <code className={`${className} block p-3 font-mono text-xs`} {...props}>{children}</code>
                                                            </div>
                                                        );
                                                    }
                                                    return <code className={`${className} bg-gray-200 text-red-500 rounded px-1 py-0.5 text-xs font-mono`} {...props}>{children}</code>;
                                                }
                                            }}
                                        >
                                            {reminder.description}
                                        </ReactMarkdown>
                                    </div>
                                )}

                                <div className="flex items-center justify-between pt-2">
                                    <div className="flex -space-x-2">
                                        <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] border-2 border-white ring-1 ring-gray-100">
                                            {reminder.sharedBy ? reminder.sharedBy.charAt(0).toUpperCase() : 'Eu'}
                                        </div>
                                    </div>
                                    <span className="text-[10px] text-gray-400">
                                        Criado em {new Date(reminder.createdAt).toLocaleDateString()}
                                    </span>
                                </div>

                                {/* Shared Badges (Context Aware) */}
                                {(reminder.sharedBy || (reminder.sharedWith && reminder.sharedWith.length > 0)) && (
                                    <div className="flex flex-col space-y-1 mt-2 p-1.5 bg-blue-50/50 rounded border border-blue-100/50">
                                        {/* Logic: Mutually Exclusive Badges */}

                                        {/* 1. Shared BY Others (I am the recipient) */}
                                        {/* Logic: If sharedBy exists and it is NOT me, then someone shared it with me. */}
                                        {(reminder.sharedBy && String(reminder.sharedBy).toLowerCase() !== String(currentUser).toLowerCase()) ? (
                                            <div className="flex items-center text-[10px] text-blue-800">
                                                <Share2 size={10} className="mr-1 text-blue-500" />
                                                Compartilhado por <strong className="ml-1">{reminder.sharedBy}</strong>
                                            </div>
                                        ) : (
                                            /* 2. Shared BY Me (I am the sender) OR sharedBy is null (created locally) but has recipients */
                                            (reminder.sharedWith && reminder.sharedWith.length > 0) && (
                                                <div className="flex items-center text-[10px] text-green-700">
                                                    <Users size={10} className="mr-1 text-green-500" />
                                                    Acompanhando com:
                                                    {reminder.sharedWith.length <= 2 ? (
                                                        <span className="ml-1 font-semibold">
                                                            {reminder.sharedWith.map(u => (u.username || u)).join(", ")}
                                                        </span>
                                                    ) : (
                                                        <div className="flex -space-x-1 ml-1.5">
                                                            {reminder.sharedWith.slice(0, 3).map((u, i) => (
                                                                <div key={i} className="w-4 h-4 rounded-full bg-green-200 border border-white flex items-center justify-center text-[8px] font-bold text-green-800" title={u.username || u}>
                                                                    {(u.username || u).charAt(0).toUpperCase()}
                                                                </div>
                                                            ))}
                                                            {reminder.sharedWith.length > 3 && (
                                                                <div className="w-4 h-4 rounded-full bg-gray-100 border border-white flex items-center justify-center text-[8px] text-gray-500">+{reminder.sharedWith.length - 3}</div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        )}
                                    </div>
                                )}

                                {/* Mini Actions */}
                                <div className="flex space-x-2 mt-2 pt-2 border-t border-gray-200/50">
                                    {reminder.status !== 'COMPLETED' && (
                                        <>
                                            <button
                                                onClick={(e) => handleAction(e, () => onMove(reminder.id, 'COMPLETED'))}
                                                className="flex-1 py-1.5 bg-green-50 text-green-600 rounded hover:bg-green-100 flex items-center justify-center font-medium transition-colors"
                                            >
                                                Concluir
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    console.log("Delete Button Clicked for:", reminder.id);
                                                    handleAction(e, () => {
                                                        console.log("Dispatching onDelete");
                                                        onDelete(reminder.id);
                                                    });
                                                }}
                                                className="py-1.5 px-3 bg-red-50 text-red-500 rounded hover:bg-red-100 flex items-center justify-center transition-colors"
                                                title="Excluir"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                            {/* RISK OF DELAY BUTTON */}
                                            <button
                                                onClick={(e) => handleAction(e, () => onEdit({ ...reminder, riskOfDelay: !reminder.riskOfDelay }))} // Simplified toggle for MVP
                                                className={`ml-2 px-3 py-1.5 rounded flex items-center justify-center font-medium transition-colors ${reminder.riskOfDelay ? 'bg-red-100 text-red-600 ring-1 ring-red-300' : 'bg-orange-50 text-orange-600 hover:bg-orange-100'}`}
                                                title={reminder.riskOfDelay ? "Remover Risco" : "Sinalizar Risco de Atraso"}
                                            >
                                                {reminder.riskOfDelay ? '⚠ Risco!' : '⚠ Atraso?'}
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </div>
    );
};

// --- Column Component ---
const KanbanColumn = ({ id, title, reminders, headerColor, onClickCard, onEdit, onMove, onDelete, currentUser }) => {
    const { setNodeRef } = useDroppable({ id });

    return (
        <div className="flex flex-col h-full min-w-[300px] w-[300px] md:w-1/4 bg-gray-100/50 rounded-xl mx-2 first:ml-0 overflow-hidden border border-gray-200/60">
            {/* Header */}
            <div className={`p-3 bg-white border-b border-gray-200 flex justify-between items-center shadow-sm sticky top-0 z-10 ${headerColor}`}>
                <h3 className="font-bold text-gray-700 text-sm flex items-center">
                    {title}
                    <span className="ml-2 bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full text-xs">{reminders.length}</span>
                </h3>
            </div>

            {/* Drop Zone */}
            <div ref={setNodeRef} className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-gray-300">
                <SortableContext items={reminders.map(r => r.id)} strategy={verticalListSortingStrategy}>
                    {reminders.map(reminder => (
                        <KanbanCard
                            key={reminder.id}
                            reminder={reminder}
                            onClick={onClickCard}
                            onEdit={onEdit}
                            onMove={onMove}
                            onDelete={onDelete}
                            currentUser={currentUser}
                        />
                    ))}
                </SortableContext>
                {reminders.length === 0 && (
                    <div className="h-32 flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-200 rounded-lg m-1">
                        <span className="text-sm">Vazio</span>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- Activity Feed Item ---
const ActivityItem = ({ item, index, onExpandImage, onReplaceAttachment }) => {
    const isComment = item.type === 'COMMENT';

    return (
        <div className="flex space-x-3 text-sm">
            <div className="flex-shrink-0 mt-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ring-2 ring-white
                    ${isComment ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}
                `}>
                    {item.user ? item.user.charAt(0).toUpperCase() : '?'}
                </div>
            </div>
            <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-900 text-xs">{item.user}</span>
                    <span className="text-[10px] text-gray-400">{new Date(item.createdAt).toLocaleString()}</span>
                </div>
                {isComment ? (
                    <div className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm text-gray-700">
                        <div className="prose prose-sm max-w-none text-gray-700">
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                    ol: ({ node, ...props }) => <ol className="list-decimal pl-5 mb-2 space-y-1" {...props} />,
                                    ul: ({ node, ...props }) => <ul className="list-disc pl-5 mb-2 space-y-1" {...props} />,
                                    code({ node, inline, className, children, ...props }) {
                                        const match = /language-(\w+)/.exec(className || '');
                                        const isSql = match && match[1] === 'sql';

                                        if (!inline && match) {
                                            return (
                                                <div className="rounded-md overflow-hidden my-2 border border-blue-100 shadow-sm bg-[#282c34] text-gray-300">
                                                    <div className="flex items-center justify-between px-3 py-1.5 bg-[#21252b] border-b border-gray-700 text-xs select-none">
                                                        <span className="font-mono text-xs">{match[1]}</span>
                                                        {isSql && (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    const sql = String(children).replace(/\n$/, '');
                                                                    if (sql) window.dispatchEvent(new CustomEvent('hap-run-sql', { detail: { query: sql } }));
                                                                }}
                                                                className="flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white text-[10px] px-2 py-0.5 rounded shadow-sm transition-colors cursor-pointer"
                                                            >
                                                                <span className="text-xs">▶</span> Run
                                                            </button>
                                                        )}
                                                    </div>
                                                    <code className={`${className} block p-3 font-mono text-xs`} {...props}>{children}</code>
                                                </div>
                                            );
                                        }
                                        return <code className={`${className} bg-gray-200 text-red-500 rounded px-1 py-0.5 text-xs font-mono`} {...props}>{children}</code>;
                                    }
                                }}
                            >
                                {item.text}
                            </ReactMarkdown>
                        </div>
                        {item.attachments && item.attachments.length > 0 && (
                            <div className="mt-3 space-y-2">
                                {item.attachments.map((att, attIdx) => (
                                    <div key={attIdx}>
                                        {att.type?.startsWith('image') ? (
                                            <div className="relative group inline-block">
                                                <img
                                                    src={att.url}
                                                    alt={att.name}
                                                    onClick={() => onExpandImage(att.url)}
                                                    className="rounded-lg border border-gray-200 cursor-zoom-in w-32 h-24 object-cover hover:opacity-90 transition-opacity"
                                                />
                                                {/* Replace Button (Top Right) */}
                                                <label className="absolute top-1 right-1 bg-white/90 hover:bg-white text-gray-700 p-1.5 rounded-full shadow-sm cursor-pointer transition-all hover:scale-105 opacity-0 group-hover:opacity-100" title="Substituir imagem">
                                                    <RefreshCw size={12} />
                                                    <input type="file" className="hidden" onChange={(e) => onReplaceAttachment(index, attIdx, e)} />
                                                </label>
                                            </div>
                                        ) : (
                                            <div className="flex items-center p-2 bg-gray-50 rounded border border-gray-200 hover:bg-gray-100 transition-colors group relative">
                                                <a href={att.url} target="_blank" rel="noopener noreferrer" className="flex items-center flex-1 min-w-0">
                                                    <File size={16} className="text-gray-500 mr-2 flex-shrink-0" />
                                                    <span className="text-xs font-medium text-gray-700 truncate">{att.name}</span>
                                                </a>
                                                {/* Replace Button */}
                                                <label className="ml-2 bg-white/90 hover:bg-white text-gray-700 p-1 rounded-full shadow-sm cursor-pointer transition-all hover:scale-105 opacity-0 group-hover:opacity-100" title="Substituir arquivo">
                                                    <RefreshCw size={12} />
                                                    <input type="file" className="hidden" onChange={(e) => onReplaceAttachment(index, attIdx, e)} />
                                                </label>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <p className="text-xs text-gray-500 italic flex items-center">
                        <span className="w-1.5 h-1.5 bg-gray-300 rounded-full mr-2"></span>
                        {item.text}
                    </p>
                )}
            </div>
        </div>
    );
};

// --- Main Component ---
const Reminders = ({ isVisible, reminders, setReminders, socket, user }) => {
    // Hooks & State
    const [isSyncing, setIsSyncing] = useState(false); // Fix: Add missing state
    const [activeId, setActiveId] = useState(null);
    const [detailModal, setDetailModal] = useState(null); // The rich detail modal
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [formData, setFormData] = useState({ title: '', status: 'PENDING', description: '', endDate: '', attachments: [] });

    // Edit Title State
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editTitleText, setEditTitleText] = useState('');

    // Edit Description State
    const [isEditingDesc, setIsEditingDesc] = useState(false);
    const [editDescText, setEditDescText] = useState('');

    // Edit Date State
    const [isEditingDate, setIsEditingDate] = useState(false);

    // Comment Input State
    const [commentText, setCommentText] = useState('');
    const [commentFiles, setCommentFiles] = useState([]);

    // GLOBAL Image Expansion State (Lightbox)
    const [expandedGlobalImage, setExpandedGlobalImage] = useState(null);

    // Sidebar Resizing
    const [sidebarWidth, setSidebarWidth] = useState(400);
    const isResizing = useRef(false);

    // Auto-Overdue Check (Every Minute)
    useEffect(() => {
        const checkOverdue = () => {
            const now = new Date();
            let updates = [];

            reminders.forEach(r => {
                // Criteria: Not Completed, Not Already Overdue, Has EndDate, EndDate < Now
                if (r.status !== 'COMPLETED' && r.status !== 'OVERDUE' && r.status !== 'ATRASADO' && r.endDate) {
                    // Check if strictly past?
                    // EndDate usually meant "By end of day"? 
                    // Current logic saves T12:00:00. 
                    // If Now > EndDate, it's overdue.
                    const end = new Date(r.endDate);
                    // Add buffer? Maybe end of that day?
                    // Let's assume strict deadline for now.
                    // Actually, if saved as T12:00 and now is T13:00 on same day, is it overdue?
                    // Usually "Due Date" means "Any time on that day".
                    // So we should check if Now > End of Day (23:59:59).
                    // Or simple comparison for MVP. User said "Caso o card esteja realmente em atraso".
                    // Let's be strict: If Date < Today DO (Ignoring time?).
                    // If Today is 20th. Due is 19th. Overdue.
                    // If Today is 20th. Due is 20th. NOT Overdue (until tomorrow).

                    const todayObs = new Date();
                    todayObs.setHours(0, 0, 0, 0);
                    const dueObs = new Date(end);
                    dueObs.setHours(0, 0, 0, 0);

                    if (todayObs > dueObs) {
                        updates.push(r.id);
                    }
                }
            });

            if (updates.length > 0) {
                console.log("Auto-Moving to Overdue:", updates);
                updates.forEach(id => handleMove(id, 'OVERDUE'));
            }
        };

        const interval = setInterval(checkOverdue, 60000); // Check every minute
        checkOverdue(); // Run immediately on mount too

        return () => clearInterval(interval);
    }, [reminders]); // Dependency on reminders to check fresh state

    useEffect(() => {
        const resize = (e) => {
            if (isResizing.current) {
                // Resize logic: Mouse moving left increases width (since handle is on left of panel)
                // Width = PreviousWidth + (PreviousMouseX - CurrentMouseX)?
                // Actually, handle is between Left(Main) and Right(Sidebar).
                // Initial Handle X.
                // Simpler: Sidebar is on the Right.
                // Mouse moves Left -> Sidebar Grows.
                // Mouse moves Right -> Sidebar Shrinks.
                // Delta = StartX - CurrentX ?
                // Let's use movementX.
                // e.movementX > 0 (Right) -> Shrink (Handle moves right, sidebar gets smaller? Width is from Right edge?)
                // NO, the layout is Flex Row. Left Panel (Flex-1) | Handle | Right Panel (Width).
                // If I move Handle to Right -> Left Panel grows, Right Panel shrinks.
                // So e.movementX > 0 -> Width DECREASES.
                // e.movementX < 0 -> Width INCREASES.
                setSidebarWidth(prev => {
                    const newWidth = prev - e.movementX;
                    if (newWidth < 300) return 300;
                    if (newWidth > 800) return 800;
                    return newWidth;
                });
            }
        };

        const stopResizing = () => {
            isResizing.current = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        window.addEventListener('mousemove', resize);
        window.addEventListener('mouseup', stopResizing);
        return () => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        };
    }, []);

    const startResizing = (e) => {
        isResizing.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault(); // Prevent text selection start
    };

    // Use prop user or fallback
    const currentUser = user ? user.username : (JSON.parse(localStorage.getItem('chat_user') || '{}').username || 'Eu');

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    // Helpers
    const getRemindersByStatus = (status) => reminders.filter(r => r.status === status);

    const saveReminder = (newData) => {
        if (!newData.title || newData.title.trim() === '') {
            alert('O título é obrigatório!');
            return false;
        }
        setIsSyncing(true); // Start Sync Indicator
        // Check if updating or creating
        const exists = reminders.some(r => r.id === newData.id);
        let updatedList;
        let finalItem;

        if (exists) {
            // Detect Risk Change for Notification
            const original = reminders.find(r => r.id === newData.id);
            const riskChanged = original && original.riskOfDelay !== newData.riskOfDelay;
            // const statusChanged = original && original.status !== newData.status;

            finalItem = { ...original, ...newData, updatedAt: new Date().toISOString() };
            updatedList = reminders.map(r => r.id === newData.id ? finalItem : r);

            // Socket Emit
            if (socket) {
                socket.emit('reminder_update', { reminder: finalItem, sender: currentUser });

                // Risk Notification Logic
                if (riskChanged && newData.riskOfDelay) {
                    const recipient = original.sharedBy || 'ALL';
                    if (recipient !== currentUser) {
                        socket.emit('message', {
                            sender: 'Sistema',
                            content: `⚠️ **${currentUser}** sinalizou risco de atraso em: **${original.title}**`,
                            type: 'SYSTEM',
                            recipient: recipient,
                            metadata: { type: 'ALERT' }
                        });
                    }
                }
            }
        } else {
            // Create New
            // FIX: sharedBy is NULL initially. Only set when explicitly shared.
            finalItem = { ...newData, createdAt: new Date().toISOString(), sharedBy: null, status: newData.status || 'PENDING' };
            updatedList = [...reminders, finalItem];
            // Do NOT emit creation globaly, only when shared via Chat.
        }

        setReminders(updatedList);
        return true;
    };

    const handleMove = (id, newStatus) => {
        const item = reminders.find(r => r.id === id);
        if (!item || item.status === newStatus) return;

        // Optimistic update
        const updated = reminders.map(r => {
            if (r.id === id) {
                // Add activity
                const newActivity = {
                    type: 'ACTION',
                    text: `Moveu de ${COLUMNS[r.status].title} para ${COLUMNS[newStatus].title}`,
                    user: currentUser,
                    createdAt: new Date().toISOString()
                };
                const updatedItem = { ...r, status: newStatus, activity: [newActivity, ...(r.activity || [])], updatedAt: new Date().toISOString() };

                // Emit Socket Update
                // Emit Socket Update
                if (socket) {
                    setIsSyncing(true);
                    socket.emit('reminder_update', { reminder: updatedItem, sender: currentUser });
                    setTimeout(() => setIsSyncing(false), 800);
                }

                return updatedItem;
            }
            return r;
        });
        setReminders(updated);
    };

    const handleDelete = (id) => {
        console.log("handleDelete called for ID:", id);
        if (confirm("Tem certeza que deseja excluir?")) {
            setReminders(reminders.filter(r => r.id !== id));
            setDetailModal(null);
            if (socket) {
                // Emit delete event to server/peers
                socket.emit('reminder_delete', { id, sender: currentUser });
            }
        }
    };

    const handleSaveTitle = () => {
        if (!detailModal) return;
        const updated = { ...detailModal, title: editTitleText };
        saveReminder(updated);
        setDetailModal(updated);
        setIsEditingTitle(false);
    };

    // Description Save
    const handleSaveDescription = () => {
        if (!detailModal) return;
        const updated = { ...detailModal, description: editDescText };
        saveReminder(updated);
        setDetailModal(updated);
        setIsEditingDesc(false);
    };

    // Add Attachment to Card (via Description area)
    const handleAddCardAttachment = (e) => {
        const files = Array.from(e.target.files).map(f => ({ name: f.name, url: URL.createObjectURL(f), type: f.type }));
        const updated = { ...detailModal, attachments: [...(detailModal.attachments || []), ...files] };
        saveReminder(updated);
        setDetailModal(updated);
    };

    // Replace Attachment (Description)
    const handleReplaceAttachment = (index, e) => {
        const file = e.target.files[0];
        if (!file) return;
        const newAtt = { name: file.name, url: URL.createObjectURL(file), type: file.type };
        const newAttachments = [...detailModal.attachments];
        newAttachments[index] = newAtt;
        const updated = { ...detailModal, attachments: newAttachments };
        saveReminder(updated);
        setDetailModal(updated);
    };

    // Replace Attachment (Comments)
    const handleReplaceCommentAttachment = (activityIndex, attachmentIndex, e) => {
        const file = e.target.files[0];
        if (!file || !detailModal) return;

        const newAtt = { name: file.name, url: URL.createObjectURL(file), type: file.type };

        // Deep copy activity
        const newActivity = [...detailModal.activity];
        const targetItem = { ...newActivity[activityIndex] };
        const newAttachments = [...(targetItem.attachments || [])];

        // Update attachment
        newAttachments[attachmentIndex] = newAtt;
        targetItem.attachments = newAttachments;

        // Add "Edited" note or just update logic? 
        // For simplicity, we just update the record in place, maybe appending an edit timestamp could be good but let's stick to simple replacement
        newActivity[activityIndex] = targetItem;

        const updated = { ...detailModal, activity: newActivity };
        saveReminder(updated);
        setDetailModal(updated);
    };

    // Update Date
    const handleUpdateDate = (date) => {
        const updated = { ...detailModal, endDate: date };
        saveReminder(updated);
        setDetailModal(updated);
        setIsEditingDate(false);
    };

    // Drag Handlers
    const handleDragStart = (event) => setActiveId(event.active.id);
    const handleDragEnd = (event) => {
        const { active, over } = event;
        setActiveId(null);
        if (!over) return;

        const activeId = active.id;
        const overId = over.id;

        // Find drop column
        let newStatus = null;
        if (COLUMNS[overId]) newStatus = overId;
        else {
            const overItem = reminders.find(r => r.id === overId);
            if (overItem) newStatus = overItem.status;
        }

        if (newStatus) handleMove(active.id, newStatus);
    };

    // --- Rich Text & DND Logic ---
    const insertMarkdown = (symbol, textareaId, setter, currentVal, mode = 'wrap') => {
        const textarea = document.getElementById(textareaId);
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = currentVal;
        const before = text.substring(0, start);
        const selection = text.substring(start, end);
        const after = text.substring(end);

        let newText = '';
        let cursorOffset = 0;

        if (mode === 'wrap') {
            newText = `${before}${symbol}${selection}${symbol}${after}`;
            cursorOffset = symbol.length;
        } else if (mode === 'list' || mode === 'ordered' || mode === 'checklist') {
            // Check if we need a newline prefix using Regex for robustness (Start of line or file)
            const isAtStart = /(?:^|\n)[ \t]*$/.test(before);
            const prefix = isAtStart ? '' : '\n';

            if (mode === 'list') {
                newText = `${before}${prefix}- ${selection}${after}`;
                cursorOffset = prefix.length + 2;
            } else if (mode === 'ordered') {
                newText = `${before}${prefix}1. ${selection}${after}`;
                cursorOffset = prefix.length + 3;
            } else if (mode === 'checklist') {
                newText = `${before}${prefix}- [ ] ${selection}${after}`;
                cursorOffset = prefix.length + 6;
            }
        } else if (mode === 'block') {
            // User requested similar to Docs module: Just a code block
            // FIX: Default to 'sql' to ensure Run button appears
            newText = `${before}\n\`\`\`sql\n${selection}\n\`\`\`\n${after}`;
            // If selection was empty, cursor should be inside the block
            cursorOffset = selection.length === 0 ? 8 : 7; // 8 = \n```sql\n| 
            if (selection.length === 0) {
                // Adjust logic to place cursor inside
                newText = `${before}\n\`\`\`sql\n\n\`\`\`\n${after}`;
                cursorOffset = 8; // \n + ```sql + \n
            } else {
                cursorOffset = 8;
            }
        }

        setter(newText);

        // Restore focus/cursor next tick
        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + cursorOffset, end + cursorOffset);
        }, 0);
    };

    const renderToolbar = (id, setter, val) => (
        <div className="flex space-x-1 mb-2 border-b border-gray-100 pb-2">
            <button onMouseDown={(e) => e.preventDefault()} onClick={() => insertMarkdown('**', id, setter, val)} className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700 transition-colors" title="Negrito"><Bold size={14} /></button>
            <button onMouseDown={(e) => e.preventDefault()} onClick={() => insertMarkdown('*', id, setter, val)} className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700 transition-colors" title="Itálico"><Italic size={14} /></button>
            <button onMouseDown={(e) => e.preventDefault()} onClick={() => insertMarkdown('~~', id, setter, val)} className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700 transition-colors" title="Tachado"><Strikethrough size={14} /></button>
            <div className="w-px h-4 bg-gray-200 mx-1 self-center"></div>
            <button onMouseDown={(e) => e.preventDefault()} onClick={() => insertMarkdown('', id, setter, val, 'list')} className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700 transition-colors" title="Lista de Pontos"><List size={14} /></button>
            <button onMouseDown={(e) => e.preventDefault()} onClick={() => insertMarkdown('', id, setter, val, 'ordered')} className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700 transition-colors" title="Lista Numérica"><ListOrdered size={14} /></button>
            <button onMouseDown={(e) => e.preventDefault()} onClick={() => insertMarkdown('', id, setter, val, 'checklist')} className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700 transition-colors" title="Lista de Tarefas"><CheckSquare size={14} /></button>
            <div className="w-px h-4 bg-gray-200 mx-1 self-center"></div>
            <button onMouseDown={(e) => e.preventDefault()} onClick={() => insertMarkdown('', id, setter, val, 'block')} className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700 transition-colors" title="Bloco de Código"><Code size={14} /></button>
        </div>
    );

    // Drag & Drop File Handler (for Modal)
    const handleModalDrop = async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const droppedFiles = Array.from(e.dataTransfer.files);
        if (droppedFiles.length > 0) {
            try {
                const processed = await Promise.all(droppedFiles.map(async f => ({
                    name: f.name,
                    url: await fileToBase64(f),
                    type: f.type
                })));

                // Determine context: Create Mode or Edit Mode
                if (showCreateModal) {
                    setFormData(prev => ({ ...prev, attachments: [...(prev.attachments || []), ...processed] }));
                } else {
                    // In edit mode (Detail), assume adding to comment files for now, as direct attachment to card structure requires DB change?
                    // Or if we have a state for 'new attachments yet to be saved'?
                    // For simplicity, add to Comment Files if Detail is open
                    setCommentFiles(prev => [...prev, ...processed]);
                }
            } catch (err) { console.error(err); }
        }
    };

    const handleCreateFileSelect = async (e) => {
        const selectedFiles = Array.from(e.target.files);
        try {
            const processed = await Promise.all(selectedFiles.map(async f => ({
                name: f.name,
                url: await fileToBase64(f),
                type: f.type
            })));
            setFormData(prev => ({ ...prev, attachments: [...(prev.attachments || []), ...processed] }));
        } catch (error) {
            console.error("Error converting files:", error);
            alert("Erro ao processar anexos.");
        }
    };

    // Comment Logic
    const handleAddComment = () => {
        if ((!commentText.trim() && commentFiles.length === 0) || !detailModal) return;

        const newComment = {
            type: 'COMMENT',
            text: commentText,
            user: currentUser,
            attachments: commentFiles, // In real app, these would remain URL objects after upload
            createdAt: new Date().toISOString()
        };

        const updatedReminder = {
            ...detailModal,
            activity: [newComment, ...(detailModal.activity || [])]
        };

        saveReminder(updatedReminder);
        setDetailModal(updatedReminder); // Update modal view
        setCommentText('');
        setCommentFiles([]);
    };

    // File Upload (Base64 for Socket Sync)
    const handleCommentFileSelect = async (e) => {
        const selectedFiles = Array.from(e.target.files);
        try {
            const processed = await Promise.all(selectedFiles.map(async f => ({
                name: f.name,
                url: await fileToBase64(f), // Convert to Base64 for syncing
                type: f.type
            })));
            setCommentFiles([...commentFiles, ...processed]);
        } catch (error) {
            console.error("Error converting files:", error);
            alert("Erro ao processar anexos.");
        }
    };

    // Init edit text when opening modal or editing
    useEffect(() => {
        if (detailModal) {
            setEditDescText(detailModal.description || '');
            setEditTitleText(detailModal.title || '');
        }
    }, [detailModal]);

    // --- Socket & Sync Logic ---
    useEffect(() => {
        if (!socket) return;

        const handleReminderUpdate = (data) => {
            // data might be { reminder: ... } or just the reminder depending on emit
            let updated = data.reminder || data;

            // FIX: If update comes from another user (Owner), and sharedBy is null in payload (because Owner viewed it as Self),
            // we must enforce sharedBy = Sender so Recipient knows who owns it.
            const sender = data.sender;
            if (sender && sender !== currentUser) {
                if (!updated.sharedBy) {
                    updated = { ...updated, sharedBy: sender };
                }
            }

            setReminders(prev => {
                const exists = prev.find(r => r.id === updated.id);
                if (exists) {
                    return prev.map(r => r.id === updated.id ? updated : r);
                } else {
                    // Only add if explicitly intended (e.g. self-update) or if we want to support auto-add (which user dislikes).
                    // User Request: Do NOT auto-add. Recipient must click 'Add' in Chat.
                    // So if it doesn't exist, we IGNORE it.
                    // EXCEPTION: If *I* am the one who triggered the update (e.g. via another tab), I should see it?
                    // But 'updated' comes from socket. If I am the sender, I already have it in my optimistic state/local state.
                    // If sharedWith includes me... 
                    return prev;
                }
            });
        };

        socket.on('reminder_update', handleReminderUpdate);
        return () => {
            socket.off('reminder_update', handleReminderUpdate);
        };
    }, [socket]);

    if (!isVisible) return null;

    return (
        <div className="h-full flex flex-col bg-[#F4F5F7] overflow-hidden font-sans relative">
            {/* Toolbar */}
            <div className="px-6 py-4 flex justify-between items-center bg-white border-b border-gray-200">
                <div>
                    <h1 className="text-xl font-bold text-gray-800 flex items-center">
                        Lembretes
                        <span className="ml-2 bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-xs">Board</span>
                        {isSyncing && (
                            <span className="ml-3 flex items-center text-xs text-green-600 font-medium animate-pulse">
                                <RefreshCw size={12} className="mr-1 animate-spin" /> Sincronizando...
                            </span>
                        )}
                    </h1>
                </div>
                <button
                    onClick={() => { setFormData({ id: Date.now(), title: '', status: 'PENDING', activity: [] }); setShowCreateModal(true); }}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium flex items-center shadow-sm transition-colors"
                >
                    <Plus size={18} className="mr-1" /> Nova Tarefa
                </button>
            </div>

            {/* Board Canvas */}
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
            >
                <div className="flex-1 overflow-x-auto overflow-y-hidden p-6">
                    <div className="flex h-full min-w-max space-x-4">
                        {Object.values(COLUMNS).map(col => (
                            <KanbanColumn
                                key={col.id}
                                {...col}
                                reminders={getRemindersByStatus(col.id)}
                                onClickCard={setDetailModal}
                                onMove={handleMove}
                                currentUser={currentUser}
                                onDelete={handleDelete}
                            />
                        ))}

                    </div>
                </div>
                <DragOverlay>
                    {activeId ? (
                        <div className="opacity-90 rotate-2 cursor-grabbing w-[300px]">
                            {/* Simplified preview */}
                            <div className="bg-white p-4 rounded-lg shadow-xl border border-indigo-300">
                                <h4 className="font-bold text-gray-800">{reminders.find(r => r.id === activeId)?.title}</h4>
                            </div>
                        </div>
                    ) : null}
                </DragOverlay>
            </DndContext>

            {/* Detail/Edit Modal */}
            <AnimatePresence>
                {(detailModal || showCreateModal) && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
                        onClick={() => { setDetailModal(null); setShowCreateModal(false); setIsEditingDesc(false); setIsEditingDate(false); }}
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 20 }}
                            // WIDER MODAL (max-w-6xl) - FIX: Added max-h-[90vh] to force scroll within modal, enabling sticky header
                            className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden my-4"
                            onClick={e => e.stopPropagation()}
                            onDrop={handleModalDrop}
                            onDragOver={e => e.preventDefault()}
                        >
                            {/* Modal Header Image Decoration (Optional) */}
                            <div className="h-2 bg-gradient-to-r from-indigo-50 to-purple-50 w-full"></div>

                            {/* Modal Content - Two Columns */}
                            <div className="flex-1 flex overflow-hidden">
                                {/* Left: Details (Expanded width) */}
                                <div className="flex-1 p-8 overflow-y-auto border-r border-gray-100 scrollbar-thin">
                                    {showCreateModal ? (
                                        <div className="space-y-6 max-w-2xl mx-auto">
                                            <h2 className="text-3xl font-bold text-gray-800">Nova Tarefa</h2>
                                            <input
                                                className="w-full text-xl font-medium border-b-2 border-gray-200 focus:border-indigo-500 outline-none py-2 bg-transparent"
                                                placeholder="O que precisa ser feito?"
                                                value={formData.title}
                                                onChange={e => setFormData({ ...formData, title: e.target.value })}
                                                autoFocus
                                            />
                                            <div className="grid grid-cols-2 gap-6">
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Status</label>
                                                    <div className="relative">
                                                        <select
                                                            className="w-full p-3 bg-gray-50 rounded-lg border border-gray-200 appearance-none font-medium text-gray-700"
                                                            value={formData.status}
                                                            onChange={e => setFormData({ ...formData, status: e.target.value })}
                                                        >
                                                            {Object.values(COLUMNS).map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                                                        </select>
                                                        <ChevronDown size={16} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Prazo</label>
                                                    <input
                                                        type="date"
                                                        className="w-full p-3 bg-gray-50 rounded-lg border border-gray-200 font-medium text-gray-700"
                                                        value={formData.endDate}
                                                        onChange={e => setFormData({ ...formData, endDate: e.target.value })}
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Descrição</label>
                                                {renderToolbar('desc-create-textarea', (val) => setFormData({ ...formData, description: val }), formData.description)}
                                                <textarea
                                                    id="desc-create-textarea"
                                                    className="w-full p-4 bg-gray-50 rounded-lg border border-gray-200 h-48 resize-none focus:ring-2 focus:ring-indigo-100 outline-none shadow-inner"
                                                    placeholder="Adicione detalhes, checklists, links..."
                                                    value={formData.description}
                                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                                />
                                                {formData.description && (
                                                    <div className="mt-2 p-3 bg-gray-50/50 rounded-lg border border-gray-100 text-sm text-gray-600 whitespace-pre-wrap">
                                                        <div className="text-[10px] text-gray-400 font-bold uppercase mb-1">Pré-visualização:</div>
                                                        <ReactMarkdown
                                                            remarkPlugins={[remarkGfm]}
                                                            components={{
                                                                ol: ({ node, ...props }) => <ol className="list-decimal pl-5 mb-2 space-y-1" {...props} />,
                                                                ul: ({ node, ...props }) => <ul className="list-disc pl-5 mb-2 space-y-1" {...props} />,
                                                                code({ node, inline, className, children, ...props }) {
                                                                    const match = /language-(\w+)/.exec(className || '');
                                                                    const isSql = match && match[1] === 'sql';

                                                                    if (!inline && match) {
                                                                        return (
                                                                            <div className="rounded-md overflow-hidden my-2 border border-gray-700 shadow-sm bg-[#282c34] text-gray-300">
                                                                                <div className="flex items-center justify-between px-3 py-1.5 bg-[#21252b] border-b border-gray-700 text-xs select-none">
                                                                                    <span className="font-mono text-xs">{match[1]}</span>
                                                                                    {isSql && (
                                                                                        <button
                                                                                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                                                                            className="flex items-center gap-1 bg-green-600/50 cursor-not-allowed text-white text-[10px] px-2 py-0.5 rounded shadow-sm opacity-70"
                                                                                            title="O botão Run estará ativo após salvar"
                                                                                        >
                                                                                            <span className="text-xs">▶</span> Run
                                                                                        </button>
                                                                                    )}
                                                                                </div>
                                                                                <code className={`${className} block p-3 font-mono text-xs`} {...props}>{children}</code>
                                                                            </div>
                                                                        );
                                                                    }
                                                                    return <code className={`${className} bg-gray-200 text-red-500 rounded px-1 py-0.5 text-xs font-mono`} {...props}>{children}</code>;
                                                                }
                                                            }}
                                                        >
                                                            {formData.description}
                                                        </ReactMarkdown>
                                                    </div>
                                                )}
                                                {/* Attachments for New Card */}
                                                <div className="mt-4">
                                                    <div className="flex items-center space-x-2 mb-2">
                                                        <label className="cursor-pointer flex items-center space-x-2 text-sm font-bold text-gray-500 hover:text-indigo-600 transition-colors bg-gray-50 hover:bg-gray-100 px-3 py-1.5 rounded-lg border border-gray-200">
                                                            <Paperclip size={16} />
                                                            <span>Anexar Arquivos</span>
                                                            <input type="file" className="hidden" multiple onChange={handleCreateFileSelect} />
                                                        </label>
                                                        <span className="text-xs text-gray-400">(Ou arraste arquivos para cá)</span>
                                                    </div>

                                                    {/* Previews */}
                                                    {formData.attachments && formData.attachments.length > 0 && (
                                                        <div className="grid grid-cols-4 gap-2">
                                                            {formData.attachments.map((att, i) => (
                                                                <div key={i} className="relative group rounded-lg overflow-hidden border border-gray-200 aspect-square">
                                                                    {att.type?.startsWith('image') ? (
                                                                        <img src={att.url} alt={att.name} className="w-full h-full object-cover" />
                                                                    ) : (
                                                                        <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400">
                                                                            <File size={20} />
                                                                        </div>
                                                                    )}
                                                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                                        <button
                                                                            onClick={() => setFormData(prev => ({ ...prev, attachments: prev.attachments.filter((_, idx) => idx !== i) }))}
                                                                            className="p-1 bg-red-500 rounded-full text-white hover:bg-red-600"
                                                                        >
                                                                            <X size={12} />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-8">
                                            {/* Title & Header (Sticky) */}
                                            <div className="flex items-start justify-between sticky top-0 z-20 bg-white pt-2 pb-4 border-b border-transparent transition-colors">
                                                <div className="flex items-center space-x-4 flex-1">
                                                    {/* Big Icon/Indicator */}
                                                    <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 flex-shrink-0">
                                                        <FileText size={24} />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        {isEditingTitle ? (
                                                            <div className="flex items-center space-x-2">
                                                                <input
                                                                    className="w-full text-2xl font-bold text-gray-800 border-b-2 border-indigo-500 focus:outline-none bg-transparent"
                                                                    value={editTitleText}
                                                                    onChange={e => setEditTitleText(e.target.value)}
                                                                    autoFocus
                                                                    onBlur={handleSaveTitle}
                                                                    onKeyDown={e => e.key === 'Enter' && handleSaveTitle()}
                                                                />
                                                            </div>
                                                        ) : (
                                                            <h2
                                                                className="text-2xl font-bold text-gray-800 leading-tight cursor-text hover:bg-gray-50 rounded px-1 -ml-1 transition-colors truncate"
                                                                onClick={() => setIsEditingTitle(true)}
                                                                title="Clique para editar"
                                                            >
                                                                {detailModal.title}
                                                            </h2>
                                                        )}
                                                        <p className="text-sm text-gray-400 mt-1 flex items-center">
                                                            na lista <span className="font-medium text-gray-600 underline decoration-dotted mx-1">{COLUMNS[detailModal.status].title}</span>

                                                            {/* DETAIL HEADER BADGE (Unified Logic) */}
                                                            {(detailModal.sharedBy || (detailModal.sharedWith && detailModal.sharedWith.length > 0)) && (
                                                                <span className="ml-2 flex items-center px-2 py-0.5 rounded bg-gray-100 border border-gray-200 text-xs">
                                                                    {(detailModal.sharedBy && String(detailModal.sharedBy).toLowerCase() !== String(currentUser).toLowerCase()) ? (
                                                                        <div className="flex items-center text-blue-800">
                                                                            <Share2 size={10} className="mr-1 text-blue-500" />
                                                                            Compartilhado por <strong className="ml-1">{detailModal.sharedBy}</strong>
                                                                        </div>
                                                                    ) : (
                                                                        (detailModal.sharedWith && detailModal.sharedWith.length > 0) && (
                                                                            <div className="flex items-center text-green-700">
                                                                                <Users size={10} className="mr-1 text-green-500" />
                                                                                Acompanhando com:
                                                                                {detailModal.sharedWith.length <= 2 ? (
                                                                                    <span className="ml-1 font-semibold">
                                                                                        {detailModal.sharedWith.map(u => (u.username || u)).join(", ")}
                                                                                    </span>
                                                                                ) : (
                                                                                    <div className="flex -space-x-1 ml-1.5">
                                                                                        {detailModal.sharedWith.slice(0, 3).map((u, i) => (
                                                                                            <div key={i} className="w-4 h-4 rounded-full bg-green-200 border border-white flex items-center justify-center text-[8px] font-bold text-green-800" title={u.username || u}>
                                                                                                {(u.username || u).charAt(0).toUpperCase()}
                                                                                            </div>
                                                                                        ))}
                                                                                        {detailModal.sharedWith.length > 3 && (
                                                                                            <div className="w-4 h-4 rounded-full bg-gray-100 border border-white flex items-center justify-center text-[8px] text-gray-500">+{detailModal.sharedWith.length - 3}</div>
                                                                                        )}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        )
                                                                    )}
                                                                </span>
                                                            )}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Toggle Edit Date */}
                                            <div className="flex items-center space-x-2">
                                                {isEditingDate ? (
                                                    <input
                                                        type="date"
                                                        className="p-2 border border-blue-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                                                        value={detailModal.endDate ? detailModal.endDate.split('T')[0] : ''}
                                                        onChange={e => {
                                                            // Fix TZ issue: Append T12:00:00 to insure it stays in the correct day
                                                            const safeDate = e.target.value ? `${e.target.value}T12:00:00` : '';
                                                            handleUpdateDate(safeDate);
                                                        }}
                                                        autoFocus
                                                        onBlur={() => setIsEditingDate(false)}
                                                    />
                                                ) : (
                                                    <div
                                                        className={`flex items-center p-3 rounded-lg border w-fit cursor-pointer transition-all hover:shadow-md active:scale-95 select-none
                                                            ${detailModal.endDate ? 'bg-blue-50/50 border-blue-100 text-blue-800' : 'bg-gray-50 border-gray-200 text-gray-400 hover:text-gray-600'}
                                                        `}
                                                        onClick={() => setIsEditingDate(true)}
                                                    >
                                                        <Calendar size={18} className="mr-2 opacity-80" />
                                                        <div className="flex flex-col">
                                                            <span className="text-[10px] font-bold uppercase opacity-60">{detailModal.endDate ? 'Prazo' : 'Definir Prazo'}</span>
                                                            <span className="font-semibold text-sm">{detailModal.endDate ? new Date(detailModal.endDate).toLocaleDateString() : 'Sem data'}</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Description Section */}
                                            <div className="group">
                                                <div className="flex items-center justify-between mb-2">
                                                    <h4 className="flex items-center text-sm font-bold text-gray-700"><FileText size={16} className="mr-2" /> Descrição</h4>
                                                    {!isEditingDesc && (
                                                        <button onClick={() => setIsEditingDesc(true)} className="text-xs text-blue-600 hover:underline bg-blue-50 px-2 py-1 rounded">Editar</button>
                                                    )}
                                                </div>

                                                {isEditingDesc ? (
                                                    <div className="space-y-2">
                                                        {renderToolbar('desc-edit-textarea', setEditDescText, editDescText)}
                                                        <textarea
                                                            id="desc-edit-textarea"
                                                            className="w-full p-3 bg-white border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-100 outline-none min-h-[120px] shadow-inner text-gray-700 font-medium"
                                                            value={editDescText}
                                                            onChange={e => setEditDescText(e.target.value)}
                                                            autoFocus
                                                        />
                                                        <div className="flex justify-end space-x-2">
                                                            <button onClick={() => setIsEditingDesc(false)} className="text-sm text-gray-400 hover:text-gray-600 px-3 py-1">Cancelar</button>
                                                            <button onClick={() => setIsEditingDesc(false)} className="text-sm text-gray-400 hover:text-gray-600 px-3 py-1">Cancelar</button>
                                                            <button onClick={handleSaveDescription} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium shadow-sm hover:bg-blue-700">Salvar</button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div
                                                        className="text-gray-600 bg-gray-50/50 p-3 rounded-lg border border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors text-sm"
                                                        onClick={() => setIsEditingDesc(true)}
                                                        title="Clique para editar"
                                                    >
                                                        {detailModal.description ? (
                                                            <ReactMarkdown
                                                                remarkPlugins={[remarkGfm]}
                                                                components={{
                                                                    ol: ({ node, ...props }) => <ol className="list-decimal pl-5 !mb-0" {...props} />,
                                                                    ul: ({ node, ...props }) => <ul className="list-disc pl-5 !mb-0" {...props} />,
                                                                    li: ({ node, ...props }) => <li className="!m-0 !pl-1 !leading-tight text-gray-600" {...props} />,
                                                                    p: ({ node, ...props }) => <p className="!m-0 inline !leading-tight" {...props} />,
                                                                    code({ node, inline, className, children, ...props }) {
                                                                        const match = /language-(\w+)/.exec(className || '');
                                                                        const isSql = match && match[1] === 'sql';

                                                                        if (!inline && match) {
                                                                            return (
                                                                                <div className="rounded-md overflow-hidden my-2 border border-blue-100 shadow-sm bg-[#282c34] text-gray-300">
                                                                                    <div className="flex items-center justify-between px-3 py-1.5 bg-[#21252b] border-b border-gray-700 text-xs select-none">
                                                                                        <span className="font-mono text-xs">{match[1]}</span>
                                                                                        {isSql && (
                                                                                            <button
                                                                                                onClick={(e) => {
                                                                                                    e.stopPropagation();
                                                                                                    const sql = String(children).replace(/\n$/, '');
                                                                                                    if (sql) window.dispatchEvent(new CustomEvent('hap-run-sql', { detail: { query: sql } }));
                                                                                                }}
                                                                                                className="flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white text-[10px] px-2 py-0.5 rounded shadow-sm transition-colors cursor-pointer"
                                                                                            >
                                                                                                <span className="text-xs">▶</span> Run
                                                                                            </button>
                                                                                        )}
                                                                                    </div>
                                                                                    <code className={`${className} block p-3 font-mono text-xs`} {...props}>{children}</code>
                                                                                </div>
                                                                            );
                                                                        }
                                                                        return <code className={`${className} bg-gray-200 text-red-500 rounded px-1 py-0.5 text-xs font-mono`} {...props}>{children}</code>;
                                                                    }
                                                                }}
                                                            >
                                                                {detailModal.description}
                                                            </ReactMarkdown>
                                                        ) : (
                                                            <span className="text-gray-400 italic">Nenhuma descrição. Clique para adicionar detalhes...</span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Attachments Section */}
                                            <div>
                                                <div className="flex items-center justify-between mb-3">
                                                    <h4 className="flex items-center text-sm font-bold text-gray-700"><Paperclip size={16} className="mr-2" /> Anexos</h4>
                                                    <label className="cursor-pointer text-xs text-gray-500 hover:text-gray-800 bg-gray-100 px-2 py-1 rounded transition-colors flex items-center">
                                                        <Plus size={12} className="mr-1" /> Adicionar
                                                        <input type="file" className="hidden" multiple onChange={handleAddCardAttachment} />
                                                    </label>
                                                </div>

                                                {(detailModal.attachments && detailModal.attachments.length > 0) ? (
                                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                                        {detailModal.attachments.map((att, i) => (
                                                            <div key={i} className="group relative border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow bg-white">
                                                                {att.type?.startsWith('image') ? (
                                                                    <div className="relative aspect-video bg-gray-100 flex items-center justify-center overflow-hidden">
                                                                        <img
                                                                            src={att.url}
                                                                            alt={att.name}
                                                                            onClick={() => setExpandedGlobalImage(att.url)}
                                                                            className="w-full h-full object-cover cursor-zoom-in hover:opacity-95 transition-opacity"
                                                                        />
                                                                        {/* Replace Button (Top Right) */}
                                                                        <label className="absolute top-2 right-2 bg-white/90 hover:bg-white text-gray-700 p-1.5 rounded-full shadow-sm cursor-pointer transition-all hover:scale-105" title="Substituir imagem">
                                                                            <RefreshCw size={14} />
                                                                            <input type="file" className="hidden" onChange={(e) => handleReplaceAttachment(i, e)} />
                                                                        </label>
                                                                    </div>
                                                                ) : (
                                                                    <div className="relative aspect-video bg-gray-50 flex items-center justify-center group-hover:bg-gray-100 transition-colors">
                                                                        <File size={32} className="text-gray-400" />
                                                                        {/* Replace Button */}
                                                                        <label className="absolute top-2 right-2 bg-white/90 hover:bg-white text-gray-700 p-1.5 rounded-full shadow-sm cursor-pointer transition-all hover:scale-105" title="Substituir arquivo">
                                                                            <RefreshCw size={14} />
                                                                            <input type="file" className="hidden" onChange={(e) => handleReplaceAttachment(i, e)} />
                                                                        </label>
                                                                    </div>
                                                                )}
                                                                <div className="p-2">
                                                                    <p className="text-xs font-bold text-gray-700 truncate" title={att.name}>{att.name}</p>
                                                                    <p className="text-[10px] text-gray-400 uppercase">{att.type?.split('/')[1] || 'FILE'}</p>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg p-4 text-center">Nenhum anexo.</div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Right: Activity/Sidebar (Resizable) */}
                                <div
                                    className="w-1 cursor-col-resize bg-gray-100 hover:bg-blue-400 transition-colors flex items-center justify-center group z-10"
                                    onMouseDown={startResizing}
                                >
                                    <div className="w-0.5 h-8 bg-gray-300 group-hover:bg-white rounded-full"></div>
                                </div>

                                <div
                                    className="bg-gray-50/80 flex flex-col border-l border-gray-200 backdrop-blur-sm transition-none"
                                    style={{ width: sidebarWidth, minWidth: 300 }}
                                >
                                    {showCreateModal ? (
                                        <div className="p-8 flex flex-col justify-between h-full bg-white">
                                            <div className="space-y-4">
                                                <div className="bg-gradient-to-br from-indigo-50 to-purple-50 p-6 rounded-xl border border-indigo-100">
                                                    <h4 className="font-bold text-indigo-900 mb-2 flex items-center"><Cloud size={18} className="mr-2" /> Dica Pro</h4>
                                                    <p className="text-sm text-indigo-700 leading-relaxed">
                                                        Grandes projetos começam com pequenos passos. Quebre sua tarefa em partes menores na descrição!
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="space-y-3 mt-auto">
                                                <button onClick={() => { if (saveReminder(formData)) setShowCreateModal(false); }} className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transform hover:-translate-y-0.5 transition-all">
                                                    Criar Tarefa
                                                </button>
                                                <button onClick={() => setShowCreateModal(false)} className="w-full py-3 text-gray-500 font-medium hover:bg-gray-100 rounded-xl transition-colors">
                                                    Cancelar
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="p-4 border-b border-gray-100 bg-white/50 backdrop-blur-md sticky top-0 z-10 flex justify-between items-center">
                                                <h3 className="font-bold text-gray-700 flex items-center"><MessageSquare size={16} className="mr-2 text-indigo-500" /> Atividade</h3>
                                                <StatusBadge status={detailModal.status} />
                                            </div>

                                            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                                                {(detailModal.activity || []).map((item, idx) => (
                                                    <ActivityItem
                                                        key={idx}
                                                        item={item}
                                                        index={idx}
                                                        onExpandImage={setExpandedGlobalImage}
                                                        onReplaceAttachment={handleReplaceCommentAttachment}
                                                    />
                                                ))}
                                                {(!detailModal.activity || detailModal.activity.length === 0) && (
                                                    <div className="text-center py-10">
                                                        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-2 text-gray-300">
                                                            <MessageSquare size={20} />
                                                        </div>
                                                        <p className="text-gray-400 text-sm">Sem atividades ainda.</p>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="p-4 bg-white border-t border-gray-200">
                                                {/* Comment Input */}
                                                {renderToolbar('comment-textarea', setCommentText, commentText)}
                                                <div className="relative">
                                                    <textarea
                                                        id="comment-textarea"
                                                        className="w-full p-3 bg-gray-50 rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-100 outline-none resize-none min-h-[80px]"
                                                        placeholder="Escreva um comentário..."
                                                        value={commentText}
                                                        onChange={e => setCommentText(e.target.value)}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                                e.preventDefault();
                                                                handleAddComment();
                                                            }
                                                        }}
                                                    />
                                                    <div className="flex justify-between items-center px-2 pb-2">
                                                        <div className="flex items-center space-x-2">
                                                            <label className="cursor-pointer p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-indigo-500 transition-colors tooltip" title="Anexar arquivo">
                                                                <Paperclip size={18} />
                                                                <input type="file" className="hidden" multiple onChange={handleCommentFileSelect} />
                                                            </label>
                                                            {commentFiles.length > 0 && (
                                                                <div className="flex -space-x-2">
                                                                    {commentFiles.map((f, i) => (
                                                                        <div key={i} className="w-6 h-6 rounded-full bg-blue-100 border-2 border-white flex items-center justify-center text-[8px] overflow-hidden" title={f.name}>
                                                                            {f.type.startsWith('image') ? <img src={f.url} className="w-full h-full object-cover" /> : <File size={10} />}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <button
                                                            onClick={handleAddComment}
                                                            disabled={!commentText.trim() && commentFiles.length === 0}
                                                            className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-100 disabled:text-gray-300 disabled:cursor-not-allowed transition-all transform active:scale-95 shadow-sm"
                                                        >
                                                            <Send size={16} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Actions Footer */}
                                            <div className="p-4 pt-2 bg-white flex justify-between items-center">
                                                <button onClick={() => handleDelete(detailModal.id)} className="text-gray-400 hover:text-red-600 text-xs font-semibold px-2 py-1 transition-colors">EXCLUIR TAREFA</button>
                                                <button onClick={() => setDetailModal(null)} className="text-gray-500 hover:bg-gray-100 px-4 py-2 rounded-lg text-sm font-bold transition-colors">Fechar</button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </motion.div>

                        {/* GLOBAL Image Expanded Portal */}
                        <AnimatePresence>
                            {expandedGlobalImage && (
                                <motion.div
                                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-md p-4"
                                    onClick={(e) => { e.stopPropagation(); setExpandedGlobalImage(null); }}
                                >
                                    <div className="relative max-w-full max-h-full flex items-center justify-center">
                                        <img
                                            src={expandedGlobalImage}
                                            className="max-w-full max-h-[95vh] object-contain rounded-lg shadow-2xl pointer-events-auto"
                                            onClick={e => e.stopPropagation()} // Prevent close when clicking image itself
                                        />
                                        <button onClick={() => setExpandedGlobalImage(null)} className="absolute -top-12 -right-4 md:top-4 md:right-4 text-white hover:text-gray-300 p-2">
                                            <X size={32} />
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default Reminders;
