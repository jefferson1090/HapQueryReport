import React, { useState, useEffect, useContext, useMemo } from 'react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay,
    defaultDropAnimationSideEffects
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
    Book, FileText, Plus, ChevronRight, ChevronDown,
    Trash2, Edit2, GripVertical, X, Check, PanelLeftClose, PanelLeftOpen, MessageSquare
} from 'lucide-react';
import DocEditor from './DocEditor';
import SpotlightSearch from './SpotlightSearch';
import ChatWithDocs from './ChatWithDocs'; // New Import
import { ThemeContext } from '../context/ThemeContext';
import { marked } from 'marked';

// --- Components ---

const SortableNode = ({ node, isActive, onSelect, onToggleExpand, onAddPage, onRename, onDelete, depth = 0, theme }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: node.ID_NODE, data: { type: 'PAGE', node } });

    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
        marginLeft: `${depth * 12}px`
    };

    const [isHovered, setIsHovered] = useState(false);
    const [editName, setEditName] = useState(node.NM_TITLE);

    // Inline rename state is managed by parent usually, but let's check props
    const isRenaming = node.isRenaming;

    if (isDragging) {
        return (
            <div ref={setNodeRef} style={style} className={`p-2 opacity-30 ${theme.border} border border-dashed rounded bg-gray-100`}>
                {node.NM_TITLE}
            </div>
        );
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`group flex items-center gap-2 p-1.5 rounded cursor-pointer transition-colors ${isActive ? 'bg-blue-600/10 text-blue-600' : `hover:bg-black/5 ${theme.text}`}`}
            onClick={() => onSelect(node)}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onDoubleClick={() => onRename(node)}
        >
            <div {...attributes} {...listeners} className="cursor-grab opacity-0 group-hover:opacity-40 hover:opacity-100">
                <GripVertical size={14} />
            </div>

            <FileText size={16} className={isActive ? 'text-blue-500' : 'opacity-60'} />

            {isRenaming ? (
                <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={() => onRename(node, editName, true)} // Confirm
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') onRename(node, editName, true);
                        if (e.key === 'Escape') onRename(node, null, false); // Cancel
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className={`flex-1 min-w-0 bg-white border ${theme.border} rounded px-1 text-sm h-6`}
                />
            ) : (
                <span className="truncate text-sm flex-1 select-none">{node.NM_TITLE}</span>
            )}

            {isHovered && !isRenaming && (
                <div className="flex items-center opacity-60">
                    <button
                        onClick={(e) => { e.stopPropagation(); onRename(node); }}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="p-1 hover:bg-black/10 rounded"
                        title="Renomear"
                    >
                        <Edit2 size={12} />
                    </button>
                    <button
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log("Delete clicked for", node.ID_NODE);
                            onDelete(node);
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="p-1 hover:bg-red-100 text-red-500 rounded"
                        title="Excluir"
                    >
                        <Trash2 size={12} />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onAddPage(node.ID_BOOK, node.ID_NODE); }}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="p-1 hover:bg-black/10 rounded"
                        title="Adicionar Sub-página"
                    >
                        <Plus size={12} />
                    </button>
                </div>
            )}
        </div>
    );
};

const BookItem = ({ book, pages, expanded, onToggle, onAddPage, activeId, onSelectPage, onRenamePage, onDeletePage, onRenameBook, onDeleteBook, theme }) => {
    return (
        <div className="mb-1">
            <div
                className={`flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-black/5 group ${theme.text}`}
                onClick={() => onToggle(book.ID_BOOK)}
            >
                {expanded ? <ChevronDown size={14} className="opacity-50" /> : <ChevronRight size={14} className="opacity-50" />}
                <Book size={16} className="text-blue-600/80" />
                <span className="font-semibold text-sm flex-1">{book.NM_TITLE}</span>

                <button
                    onClick={(e) => { e.stopPropagation(); onAddPage(book.ID_BOOK); }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-blue-100 text-blue-600 rounded"
                    title="Nova Página"
                >
                    <Plus size={14} />
                </button>
                <button
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (confirm('Excluir este livro?')) onDeleteBook(book);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 text-red-500 rounded"
                    title="Excluir Livro"
                >
                    <Trash2 size={14} />
                </button>
            </div>

            {expanded && (
                <div className="pl-2 mt-0.5 space-y-0.5 min-h-[5px]">
                    <SortableContext
                        id={`book-${book.ID_BOOK}`}
                        items={pages.map(p => p.ID_NODE)}
                        strategy={verticalListSortingStrategy}
                    >
                        {pages.map(page => (
                            <SortableNode
                                key={page.ID_NODE}
                                node={page}
                                isActive={activeId === page.ID_NODE}
                                onSelect={onSelectPage}
                                onRename={onRenamePage}
                                onDelete={onDeletePage}
                                theme={theme}
                                depth={page.depth || 0}
                            />
                        ))}
                    </SortableContext>
                    {/* Inline Creator Placeholder */}
                    {book.isCreating && (
                        <div className="flex items-center gap-2 p-1.5 pl-8">
                            <FileText size={16} className="opacity-40" />
                            <input
                                autoFocus
                                placeholder="Nova página..."
                                className={`flex-1 min-w-0 bg-transparent border-b ${theme.border} text-sm focus:outline-none`}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') onAddPage(book.ID_BOOK, e.target.value);
                                    if (e.key === 'Escape') onAddPage(book.ID_BOOK, null); // Cancel
                                }}
                                onBlur={(e) => {
                                    if (e.target.value.trim()) onAddPage(book.ID_BOOK, e.target.value);
                                    else onAddPage(book.ID_BOOK, null);
                                }}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const DocsModule = ({ pendingDoc, onDocHandled, user }) => {
    const { theme } = useContext(ThemeContext);
    const [books, setBooks] = useState([]);
    const [pagesMap, setPagesMap] = useState({}); // { [bookId]: [pages...] }
    const [expandedBooks, setExpandedBooks] = useState(new Set());
    const [activeNode, setActiveNode] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [draggingId, setDraggingId] = useState(null);

    const [isCreatingBook, setIsCreatingBook] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    const [highlightQuery, setHighlightQuery] = useState('');

    // Chat Toggle
    const [isChatOpen, setIsChatOpen] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    // Load Books
    useEffect(() => {
        fetchBooks();
    }, [user?.username]);

    // Handle Pending Doc (Deep Link / Share)
    useEffect(() => {
        const handlePending = async () => {
            if (pendingDoc && pendingDoc.id) {
                const { id, bookId, query } = pendingDoc;
                console.log("[DocsModule] Handling pending doc:", pendingDoc);

                // 1. Ensure book is loaded
                if (!pagesMap[bookId]) {
                    await loadBookTree(bookId);
                }

                // 2. Expand book in sidebar
                if (!expandedBooks.has(bookId)) {
                    toggleBook(bookId);
                }

                // 3. Select Node
                // Ensure ID is string for consistency if needed, but API likely handles it.
                // We fetch the full node details
                await handleSelectNode({ ID_NODE: id });

                // 4. Set Highlight
                if (query) setHighlightQuery(query);

                // Clear pending
                if (onDocHandled) onDocHandled();
            }
        };

        handlePending();
    }, [pendingDoc, pagesMap, expandedBooks]); // Re-run when pendingDoc changes or dependencies are ready

    const fetchBooks = async () => {
        try {
            const headers = {};
            if (user?.username) headers['x-username'] = user.username;

            const res = await fetch('http://localhost:3001/api/docs/books', { headers });
            const data = await res.json();
            setBooks(data);
        } catch (e) { console.error(e); }
    };

    const loadBookTree = async (bookId) => {
        try {
            console.log(`[DocsModule] Loading tree for book ${bookId}...`);
            const res = await fetch(`http://localhost:3001/api/docs/books/${bookId}/tree?t=${Date.now()}`);
            const data = await res.json();
            console.log(`[DocsModule] Tree data for ${bookId}:`, data);

            const flatten = (nodes, depth = 0) => {
                let flat = [];
                for (const n of nodes) {
                    flat.push({ ...n, depth, ID_NODE: String(n.ID_NODE) }); // Ensure ID is string and add depth
                    if (n.children) flat = flat.concat(flatten(n.children, depth + 1));
                }
                return flat;
            }
            const flatPages = flatten(data);
            console.log(`[DocsModule] Flattened pages for ${bookId}:`, flatPages);

            setPagesMap(prev => ({ ...prev, [bookId]: flatPages }));
        } catch (e) {
            console.error(`[DocsModule] Error loading book ${bookId}:`, e);
        }
    };

    const toggleBook = (bookId) => {
        const next = new Set(expandedBooks);
        if (next.has(bookId)) {
            next.delete(bookId);
        } else {
            next.add(bookId);
            if (!pagesMap[bookId]) {
                loadBookTree(bookId);
            }
        }
        setExpandedBooks(next);
    };

    // --- Actions ---

    // Ref for editor to support imperative saving
    const editorRef = React.useRef(null);

    const handleSavePage = async (pageId, content) => {
        try {
            // Fixed correct endpoint
            await fetch(`http://localhost:3001/api/docs/nodes/${pageId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(user?.username ? { 'x-username': user.username } : {})
                },
                body: JSON.stringify({ content })
            });
            // Update local state to avoid stale content on re-select
            setActiveNode(prev => prev && prev.ID_NODE === pageId ? { ...prev, CL_CONTENT: content } : prev);
        } catch (e) { console.error("Auto-save failed:", e); }
    };

    const handleSelectNode = async (node) => {
        console.log(`[DocsModule] Selecting Node: ${node.ID_NODE} (${node.NM_TITLE})`);

        // Auto-save current if different
        if (activeNode && activeNode.ID_NODE !== node.ID_NODE && editorRef.current) {
            const currentContent = editorRef.current.getHTML();
            console.log(`[DocsModule] Auto-saving previous node ${activeNode.ID_NODE} before switch. Content Len: ${currentContent?.length}`);
            handleSavePage(activeNode.ID_NODE, currentContent);
        }

        setActiveNode(node);

        // Fetch fresh content
        try {
            const res = await fetch(`http://localhost:3001/api/docs/nodes/${node.ID_NODE}`);
            const fullNode = await res.json();
            setActiveNode(fullNode);
        } catch (e) { console.error(e); }
    };

    const handleAddPage = async (bookId, title) => {
        if (typeof title === 'string') {
            // Confirming
            setBooks(prev => prev.map(b => b.ID_BOOK === bookId ? { ...b, isCreating: false } : b));

            if (!title || !title.trim()) return;

            try {
                const res = await fetch('http://localhost:3001/api/docs/nodes', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(user?.username ? { 'x-username': user.username } : {})
                    },
                    body: JSON.stringify({
                        bookId: bookId,
                        parentId: null, // Always root of book for now
                        title: title,
                        type: 'PAGE'
                    })
                });
                if (res.ok) {
                    const { id } = await res.json();
                    loadBookTree(bookId);
                    setActiveNode({ ID_NODE: id, NM_TITLE: title, CL_CONTENT: '' });
                }
            } catch (e) { alert(e.message); }
        } else {
            // Starting
            setBooks(prev => prev.map(b => b.ID_BOOK === bookId ? { ...b, isCreating: true } : b));
            if (!expandedBooks.has(bookId)) toggleBook(bookId);
        }
    };

    const handleRename = async (node, newName, isConfirm) => {
        if (isConfirm) {
            const bookId = node.ID_BOOK;
            // Optimistic update or revert
            setPagesMap(prev => ({
                ...prev,
                [bookId]: prev[bookId].map(p => {
                    if (p.ID_NODE === node.ID_NODE) {
                        const updated = { ...p, isRenaming: false };
                        // Only update title if valid new name provided
                        if (newName && newName.trim()) updated.NM_TITLE = newName;
                        return updated;
                    }
                    return p;
                })
            }));

            if (newName && newName.trim() && newName !== node.NM_TITLE) {
                try {
                    await fetch(`http://localhost:3001/api/docs/nodes/${node.ID_NODE}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ title: newName })
                    });
                } catch (e) { console.error(e); }
            }
        } else {
            // Starting
            const bookId = node.ID_BOOK;
            setPagesMap(prev => ({
                ...prev,
                [bookId]: prev[bookId].map(p => p.ID_NODE === node.ID_NODE ? { ...p, isRenaming: true } : p)
            }));
        }
    };

    const handleDelete = async (node) => {
        if (!confirm(`Excluir página "${node.NM_TITLE}"?`)) return;
        try {
            const res = await fetch(`http://localhost:3001/api/docs/nodes/${node.ID_NODE}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                console.log("Delete success, reloading tree for", node.ID_BOOK);
                await loadBookTree(node.ID_BOOK);
            } else {
                const err = await res.json();
                alert(`Erro ao excluir: ${err.error || res.statusText}`);
            }
        } catch (e) { alert(e.message); }
    };

    const handleDeleteBook = async (book) => {
        try {
            const res = await fetch(`http://localhost:3001/api/docs/books/${book.ID_BOOK}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                fetchBooks(); // Reload book list
            } else {
                const err = await res.json();
                console.error("Delete book failed:", err);
                alert(`Erro ao excluir livro: ${err.error || res.statusText}`);
            }
        } catch (e) { alert(e.message); }
    };

    const handleDragStart = (event) => {
        setDraggingId(event.active.id);
    };

    const handleDragOver = (event) => {
        const { active, over } = event;
        if (!over) return;
    };

    const handleDragEnd = async (event) => {
        const { active, over } = event;
        setDraggingId(null);

        if (!over) return;
        if (active.id === over.id) return;

        // Identify Source Book and Target Book
        let activeBookId = null;
        let activePage = null;

        // Find active node info
        for (const [bid, pages] of Object.entries(pagesMap)) {
            const found = pages.find(p => p.ID_NODE === active.id);
            if (found) { activeBookId = Number(bid); activePage = found; break; }
        }

        // Identify Target
        let overBookId = null;
        let overIndex = -1;

        // Check if over is a helper container ID "book-123"
        if (String(over.id).startsWith('book-')) {
            overBookId = Number(String(over.id).replace('book-', ''));
            overIndex = pagesMap[overBookId]?.length || 0;
        } else {
            // Dropped over another page
            for (const [bid, pages] of Object.entries(pagesMap)) {
                const idx = pages.findIndex(p => p.ID_NODE === over.id);
                if (idx !== -1) {
                    overBookId = Number(bid);
                    overIndex = idx;
                    break;
                }
            }
        }

        if (!activePage || !overBookId) return;

        // Update Backend
        try {
            await fetch('http://localhost:3001/api/docs/nodes/move', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nodeId: activePage.ID_NODE,
                    targetBookId: overBookId,
                    targetParentId: null, // Flat hierarchy for now
                    newIndex: overIndex
                })
            });

            // Reload trees involved
            loadBookTree(activeBookId);
            if (activeBookId !== overBookId) loadBookTree(overBookId);

        } catch (e) { console.error(e); }
    };

    const handleAddBookStart = () => {
        setIsCreatingBook(true);
    };

    const handleAddBookConfirm = async (title) => {
        setIsCreatingBook(false);
        if (!title || !title.trim()) return;

        try {
            const res = await fetch('http://localhost:3001/api/docs/books', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(user?.username ? { 'x-username': user.username } : {})
                },
                body: JSON.stringify({ title, description: '' })
            });
            if (res.ok) {
                fetchBooks();
            }
        } catch (e) { alert(e.message); }
    };

    const handleWikiNavigate = (pageName) => {
        let foundNode = null;
        for (const [bid, pages] of Object.entries(pagesMap)) {
            const match = pages.find(p => p.NM_TITLE.toLowerCase() === pageName.toLowerCase());
            if (match) {
                foundNode = match;
                break;
            }
        }

        if (foundNode) {
            handleSelectNode(foundNode);
        } else {
            alert(`Página "[${pageName}]" não encontrada nos livros carregados.`);
        }
    };

    return (
        <div className={`flex h-full ${theme.bg} ${theme.text} overflow-hidden font-sans relative`}>
            {/* Spotlight Search (Ctrl/Cmd + K) */}
            <SpotlightSearch pagesMap={pagesMap} onNavigate={handleWikiNavigate} theme={theme} />

            {/* Global Chat Overlay */}
            {/* Spotlight Search (Ctrl/Cmd + K) */}
            <SpotlightSearch pagesMap={pagesMap} onNavigate={handleWikiNavigate} theme={theme} />

            {/* Sidebar - Always Rendered for Animation */}
            <div className={`flex flex-col border-r ${theme.border} ${theme.panel} transition-all duration-500 ease-in-out relative print:hidden ${isSidebarOpen ? 'w-72 opacity-100 translate-x-0' : 'w-0 opacity-0 -translate-x-10 overflow-hidden border-none'}`}>
                <div className={`p-4 border-b ${theme.border} flex items-center justify-between whitespace-nowrap overflow-hidden`}>
                    <h2 className="font-semibold text-sm tracking-wide opacity-70 uppercase">Biblioteca</h2>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={handleAddBookStart}
                            className={`p-1 hover:bg-black/5 rounded ${theme.accent}`}
                            title="Novo Livro"
                        >
                            <Plus size={16} />
                        </button>
                        {/* CHAT TOGGLE BUTTON */}
                        <button
                            onClick={() => setIsChatOpen(true)}
                            className={`p-1 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/40 rounded transition-colors`}
                            title="Chat com Documentos"
                        >
                            <MessageSquare size={16} />
                        </button>
                        <button
                            onClick={() => setIsSidebarOpen(false)}
                            className={`p-1 hover:bg-black/5 rounded opacity-60 hover:opacity-100 transition-all duration-300 transform hover:rotate-90`}
                            title="Fechar Lateral"
                        >
                            <PanelLeftClose size={16} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2 scrollbar-thin whitespace-nowrap">
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragStart={handleDragStart}
                        onDragOver={handleDragOver}
                        onDragEnd={handleDragEnd}
                    >
                        {/* Inline Book Creator */}
                        {isCreatingBook && (
                            <div className="p-2 mb-1 border rounded bg-white shadow-sm flex items-center gap-2">
                                <Book size={16} className="text-blue-600/80" />
                                <input
                                    autoFocus
                                    placeholder="Nome do livro..."
                                    className={`flex-1 min-w-0 bg-transparent text-sm focus:outline-none ${theme.text}`}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleAddBookConfirm(e.target.value);
                                        if (e.key === 'Escape') setIsCreatingBook(false);
                                    }}
                                    onBlur={(e) => {
                                        if (e.target.value.trim()) handleAddBookConfirm(e.target.value);
                                        else setIsCreatingBook(false);
                                    }}
                                />
                            </div>
                        )}

                        {books.map(book => (
                            <BookItem
                                key={book.ID_BOOK}
                                book={book}
                                pages={pagesMap[book.ID_BOOK] || []}
                                expanded={expandedBooks.has(book.ID_BOOK)}
                                onToggle={toggleBook}
                                onAddPage={handleAddPage}
                                activeId={activeNode?.ID_NODE}
                                onSelectPage={handleSelectNode}
                                onRenamePage={handleRename}
                                onDeletePage={handleDelete}
                                onDeleteBook={handleDeleteBook}
                                theme={theme}
                            />
                        ))}
                        <DragOverlay>
                            {draggingId ? (
                                <div className={`p-2 bg-white shadow-lg border rounded ${theme.text}`}>
                                    Moving Item...
                                </div>
                            ) : null}
                        </DragOverlay>
                    </DndContext>
                </div>
            </div>

            {/* Main Content */}
            <div className={`flex-1 flex flex-col ${theme.bg} overflow-hidden relative`}>

                {/* Open Library Button */}
                <button
                    onClick={() => setIsSidebarOpen(true)}
                    className={`absolute top-20 left-4 z-30 p-2 rounded-lg shadow-sm border ${theme.border} ${theme.panel} hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-300 transform print:hidden hover:rotate-90 ${isSidebarOpen ? 'scale-0 opacity-0 pointer-events-none -translate-x-10' : 'scale-100 opacity-100 translate-x-0'}`}
                    title="Abrir Biblioteca"
                >
                    <PanelLeftOpen size={20} className="text-gray-500" />
                </button>

                {/* Chat Toggle Button */}
                <button
                    onClick={() => setIsChatOpen(prev => !prev)}
                    className={`absolute bottom-6 right-6 z-40 p-3 rounded-full shadow-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-all duration-300 transform hover:scale-105 print:hidden ${isChatOpen ? 'scale-0 rotate-90 opacity-0 pointer-events-none' : 'scale-100 rotate-0 opacity-100'}`}
                    title="Hap IA Docs"
                >
                    <MessageSquare size={24} />
                </button>

                {
                    activeNode && activeNode.CL_CONTENT !== undefined ? (
                        <DocEditor
                            key={activeNode.ID_NODE}
                            ref={editorRef}
                            initialContent={activeNode.CL_CONTENT}
                            onSave={(content) => handleSavePage(activeNode.ID_NODE, content)}
                            theme={theme}
                            onNavigate={handleWikiNavigate}
                            highlight={highlightQuery}
                        />
                    ) : activeNode ? (
                        <div className="flex-1 flex flex-col items-center justify-center opacity-40">
                            {/* Loading state for individual page */}
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mb-4"></div>
                            <p>Carregando...</p>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center opacity-40">
                            <Book size={48} className="mb-4" />
                            <p className="text-lg font-medium">Selecione uma página para editar</p>
                        </div>
                    )
                }
            </div >

            {/* Split View Chat - Always Rendered for Animation */}
            < ChatWithDocs
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                context={activeNode}
                mode="sidebar"
                onInsert={async (text) => {
                    if (editorRef.current) {
                        try {
                            const html = await marked.parse(text);
                            editorRef.current.insertContent(html);
                        } catch (e) {
                            console.error("Markdown parse error:", e);
                            editorRef.current.insertContent(text); // Fallback
                        }
                    } else {
                        alert("Abra um documento para inserir o texto!");
                    }
                }}
            />
        </div >
    );
};

export default DocsModule;
