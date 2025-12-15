import React, { useState, useEffect } from 'react';
import { Book, ChevronDown, ChevronRight, FileText } from 'lucide-react';
import { useApi } from '../../context/ApiContext';

const DocsSelector = ({ onShare }) => {
    const [books, setBooks] = useState([]);
    const [expandedBooks, setExpandedBooks] = useState({});
    const [bookTrees, setBookTrees] = useState({});
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
            try {
                const res = await fetch(`${apiUrl}/api/docs/books/${bookId}/tree`);
                const tree = await res.json();
                setBookTrees(prev => ({ ...prev, [bookId]: tree }));
            } catch (e) { console.error("Failed to fetch tree", e); }
        }
    };

    const renderTree = (nodes, bookId, bookTitle) => {
        return nodes.map(node => (
            <div key={node.ID_NODE} className="ml-4 border-l border-gray-200 pl-2 text-xs">
                <div className="flex items-center justify-between py-1 group/node">
                    <div className="flex items-center text-gray-700">
                        <FileText size={12} className="mr-2 text-gray-400" />
                        <span className="truncate max-w-[150px]">{node.NM_TITLE}</span>
                    </div>
                    <button
                        onClick={() => onShare({ id: node.ID_NODE, title: node.NM_TITLE, bookId, bookTitle })}
                        className="opacity-0 group-hover/node:opacity-100 px-2 py-0.5 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-opacity"
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
        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
            {books.map(book => (
                <div key={book.ID_BOOK} className="border border-gray-100 rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between p-2 bg-gray-50 hover:bg-gray-100 transition-colors">
                        <div
                            className="flex items-center cursor-pointer flex-1"
                            onClick={() => toggleBook(book.ID_BOOK)}
                        >
                            {expandedBooks[book.ID_BOOK] ? <ChevronDown size={14} className="mr-2 text-gray-500" /> : <ChevronRight size={14} className="mr-2 text-gray-500" />}
                            <Book size={14} className="mr-2 text-blue-600" />
                            <span className="font-medium text-xs text-gray-800">{book.NM_TITLE}</span>
                        </div>
                        <button
                            onClick={() => onShare({ id: null, title: book.NM_TITLE, bookId: book.ID_BOOK, bookTitle: book.NM_TITLE, type: 'BOOK' })}
                            className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-bold hover:bg-blue-200"
                        >
                            Livro
                        </button>
                    </div>
                    {expandedBooks[book.ID_BOOK] && bookTrees[book.ID_BOOK] && (
                        <div className="p-2 bg-white">
                            {bookTrees[book.ID_BOOK].length === 0 ? (
                                <p className="text-gray-500 text-xs ml-4">Vazio</p>
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

export default DocsSelector;
