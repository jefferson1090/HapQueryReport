import React, { useState, useEffect, useContext } from 'react';
import {
    Book, FileText, Folder, Plus, ChevronRight, ChevronDown,
    Settings, Search, MoreVertical, Trash2, Edit2, ChevronLeft, X
} from 'lucide-react';
import DocEditor from './DocEditor';
import { ThemeContext } from '../context/ThemeContext';

const DocsModule = () => {
    const { theme } = useContext(ThemeContext);
    const [books, setBooks] = useState([]);
    const [activeBook, setActiveBook] = useState(null);
    const [tree, setTree] = useState([]);
    const [activeNode, setActiveNode] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [sidebarWidth, setSidebarWidth] = useState(300);


    // Modal State
    const [showBookModal, setShowBookModal] = useState(false);
    const [showPageModal, setShowPageModal] = useState(false);
    const [modalInput, setModalInput] = useState({ title: '', desc: '', parentId: null });

    // Load books on mount
    useEffect(() => {
        fetchBooks();
    }, []);

    const fetchBooks = async () => {
        try {
            const res = await fetch('http://localhost:3001/api/docs/books');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (Array.isArray(data)) {
                setBooks(data);
            } else {
                setBooks([]);
            }
        } catch (err) {
            console.error("Failed to load books", err);
            // setBooks([]); // Keep old state if just network fluff, but usually clear it
        }
    };

    const loadBookTree = async (bookId) => {
        setIsLoading(true);
        try {
            const res = await fetch(`http://localhost:3001/api/docs/books/${bookId}/tree`);
            const data = await res.json();
            setTree(data);
            const book = books.find(b => b.ID_BOOK === bookId) || { TITLE: 'Book', ID_BOOK: bookId };
            setActiveBook(book);
            setActiveNode(null); // Reset active node
        } catch (err) {
            console.error("Failed to load tree", err);
        } finally {
            setIsLoading(false);
        }
    };

    // --- Actions ---

    const openCreateBookModal = () => {
        setModalInput({ title: '', desc: '', parentId: null });
        setShowBookModal(true);
    };

    const confirmCreateBook = async () => {
        // DEBUG: Alert to confirm function is called
        // alert("Click confirmed: " + modalInput.title); 
        console.log("Creating book:", modalInput);

        if (!modalInput.title) {
            alert("Por favor, digite um título.");
            return;
        }
        try {
            console.log("Sending request...");
            const res = await fetch('http://localhost:3001/api/docs/books', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: modalInput.title, description: modalInput.desc })
            });
            console.log("Response status:", res.status);

            if (res.ok) {
                const data = await res.json();
                console.log("Success:", data);
                // alert("Livro criado com sucesso!");
                fetchBooks();
                setShowBookModal(false);
            } else {
                const err = await res.json();
                console.error("Server error:", err);
                alert("Erro do Servidor: " + (err.error || res.statusText));
            }
        } catch (e) {
            console.error("Network error:", e);
            alert("Erro de Rede/Código: " + e.message);
        }
    };

    const openCreatePageModal = (parentId = null) => {
        setModalInput({ title: '', desc: '', parentId });
        setShowPageModal(true);
    };

    const confirmCreatePage = async () => {
        if (!activeBook || !modalInput.title) return;
        try {
            const res = await fetch('http://localhost:3001/api/docs/nodes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    bookId: activeBook.ID_BOOK,
                    parentId: modalInput.parentId,
                    title: modalInput.title,
                    type: 'PAGE'
                })
            });
            if (res.ok) {
                const { id } = await res.json();
                loadBookTree(activeBook.ID_BOOK);
                handleSelectNode({ ID_NODE: id, NM_TITLE: modalInput.title, CL_CONTENT: '' });
                setShowPageModal(false);
            }
        } catch (e) {
            alert("Erro ao criar página: " + e.message);
        }
    };

    const handleSelectNode = async (nodeStub) => {
        setIsLoading(true);
        try {
            const res = await fetch(`http://localhost:3001/api/docs/nodes/${nodeStub.ID_NODE}`);
            const fullNode = await res.json();
            setActiveNode(fullNode);
        } catch (e) {
            console.error("Failed to load node", e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveContent = async (html) => {
        if (!activeNode) return;
        try {
            await fetch(`http://localhost:3001/api/docs/nodes/${activeNode.ID_NODE}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: html, title: activeNode.NM_TITLE })
            });
        } catch (e) {
            alert("Erro ao salvar: " + e.message);
        }
    };

    // --- Renderers ---

    const renderTreeNodes = (nodes, level = 0) => {
        return nodes.map(node => (
            <div key={node.ID_NODE}>
                <div
                    className={`flex items-center gap-2 p-1 px-2 rounded cursor-pointer transition-colors ${activeNode?.ID_NODE === node.ID_NODE ? 'bg-blue-600/20 text-blue-500' : `${theme.text} hover:opacity-80`}`}
                    style={{ paddingLeft: `${level * 12 + 8}px` }}
                    onClick={() => handleSelectNode(node)}
                >
                    <FileText size={14} className={activeNode?.ID_NODE === node.ID_NODE ? 'text-blue-500' : 'opacity-70'} />
                    <span className="truncate text-sm">{node.NM_TITLE}</span>
                    <button
                        onClick={(e) => { e.stopPropagation(); openCreatePageModal(node.ID_NODE); }}
                        className="ml-auto opacity-0 hover:opacity-100 group-hover:opacity-100 p-0.5 hover:bg-black/10 rounded"
                        title="Adicionar Sub-página"
                    >
                        <Plus size={12} />
                    </button>
                </div>
                {node.children && node.children.length > 0 && (
                    <div>{renderTreeNodes(node.children, level + 1)}</div>
                )}
            </div>
        ));
    };

    return (
        <div className={`flex h-full ${theme.bg} ${theme.text} overflow-hidden font-sans`}>
            {/* Sidebar */}
            <div
                className={`flex flex-col border-r ${theme.border} ${theme.panel} transition-all duration-300`}
                style={{ width: sidebarWidth }}
            >
                {/* Header */}
                <div className={`p-4 border-b ${theme.border} flex items-center justify-between`}>
                    <h2 className="font-semibold text-sm tracking-wide opacity-70 uppercase">
                        {activeBook ? activeBook.NM_TITLE : 'Biblioteca'}
                    </h2>
                    <div className="flex gap-1">
                        {activeBook ? (
                            <>
                                <button onClick={() => openCreatePageModal()} className={`p-1 hover:bg-black/5 rounded ${theme.accent}`} title="Nova Página Raiz">
                                    <Plus size={16} />
                                </button>
                                <button onClick={() => setActiveBook(null)} className="p-1 hover:bg-black/5 rounded opacity-70" title="Voltar aos Livros">
                                    <ChevronLeft size={16} />
                                </button>
                            </>
                        ) : (
                            <button onClick={openCreateBookModal} className={`p-1 hover:bg-black/5 rounded ${theme.accent}`} title="Novo Livro">
                                <Plus size={16} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Content List */}
                <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
                    {!activeBook ? (
                        <div className="space-y-1">
                            {books.map(book => (
                                <div
                                    key={book.ID_BOOK}
                                    onClick={() => loadBookTree(book.ID_BOOK)}
                                    className={`flex items-center gap-3 p-3 hover:bg-black/5 rounded cursor-pointer group transition-all border border-transparent hover:${theme.border}`}
                                >
                                    <Book size={20} className={theme.accent.split(' ')[0]} />
                                    <div className="flex-1 min-w-0">
                                        <div className={`truncate font-medium text-sm ${theme.text}`}>{book.NM_TITLE}</div>
                                        {book.DS_DESCRIPTION && <div className="truncate text-xs opacity-60">{book.DS_DESCRIPTION}</div>}
                                    </div>
                                    <ChevronRight size={16} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                            ))}
                            {books.length === 0 && (
                                <div className="text-center p-8 opacity-50 text-sm flex flex-col items-center">
                                    <Book size={32} className="mb-2 opacity-20" />
                                    <p>Nenhuma documentação encontrada.</p>
                                    <button onClick={openCreateBookModal} className={`mt-2 ${theme.accent} hover:underline text-xs`}>Criar o primeiro livro</button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-0.5">
                            {tree.length === 0 && (
                                <div className="text-center p-4 opacity-50 text-xs italic">
                                    Livro vazio.
                                    <br />
                                    <button onClick={() => openCreatePageModal()} className={`${theme.accent} hover:underline mt-1`}>Criar primeira página</button>
                                </div>
                            )}
                            {renderTreeNodes(tree)}
                        </div>
                    )}
                </div>
            </div>

            {/* Main Content */}
            <div className={`flex-1 flex flex-col ${theme.bg} overflow-hidden`}>
                {activeNode ? (
                    <DocEditor
                        key={activeNode.ID_NODE}
                        initialContent={activeNode.CL_CONTENT}
                        onSave={handleSaveContent}
                        theme={theme}
                    />
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center opacity-40">
                        {activeBook ? (
                            <>
                                <FileText size={48} className="mb-4" />
                                <p className="text-lg font-medium">Selecione uma página para editar</p>
                            </>
                        ) : (
                            <>
                                <Book size={48} className="mb-4" />
                                <p className="text-lg font-medium">Selecione um Livro</p>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Modals */}
            {(showBookModal || showPageModal) && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className={`${theme.panel} p-6 rounded-lg shadow-xl w-96 border ${theme.border}`}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className={`text-lg font-bold ${theme.text}`}>{showBookModal ? 'Novo Livro' : 'Nova Página'}</h3>
                            <button onClick={() => { setShowBookModal(false); setShowPageModal(false); }} className="opacity-50 hover:opacity-100">
                                <X size={20} />
                            </button>
                        </div>
                        <input
                            type="text"
                            placeholder="Título"
                            className={`w-full p-2 mb-3 border rounded ${theme.input}`}
                            value={modalInput.title}
                            onChange={e => setModalInput({ ...modalInput, title: e.target.value })}
                            autoFocus
                        />
                        {showBookModal && (
                            <textarea
                                placeholder="Descrição (Opcional)"
                                className={`w-full p-2 mb-4 border rounded ${theme.input} h-24 resize-none`}
                                value={modalInput.desc}
                                onChange={e => setModalInput({ ...modalInput, desc: e.target.value })}
                            />
                        )}
                        <div className="flex justify-end gap-2 mt-4">
                            <button
                                onClick={() => { setShowBookModal(false); setShowPageModal(false); }}
                                className={`px-4 py-2 rounded ${theme.secondaryBtn}`}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={showBookModal ? confirmCreateBook : confirmCreatePage}
                                className={`px-4 py-2 rounded ${theme.primaryBtn}`}
                            >
                                Criar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DocsModule;
