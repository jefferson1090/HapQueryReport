import React, { useState, useEffect, useRef } from 'react';
import { Search, FileText, CornerDownLeft } from 'lucide-react';

const SpotlightSearch = ({ pagesMap, onNavigate, theme }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef(null);

    const [results, setResults] = useState([]);

    const debounceRef = useRef(null);

    const [searchIndex, setSearchIndex] = useState([]);
    const [isLoadingIndex, setIsLoadingIndex] = useState(false);

    // Initial Load of Search Index
    useEffect(() => {
        if (!isOpen) return;

        // If we haven't loaded the index yet, do it now
        if (searchIndex.length === 0 && !isLoadingIndex) {
            setIsLoadingIndex(true);
            fetch('http://localhost:3001/api/docs/search-index')
                .then(res => res.json())
                .then(data => {
                    if (Array.isArray(data)) setSearchIndex(data);
                    setIsLoadingIndex(false);
                })
                .catch(e => {
                    console.error("Failed to load search index", e);
                    setIsLoadingIndex(false);
                });
        }
    }, [isOpen]);

    useEffect(() => {
        if (!query || query.trim().length === 0) {
            setResults([]);
            return;
        }

        const q = query.toLowerCase();
        // Perform Local Search
        const matches = searchIndex.filter(item => {
            const titleMatch = item.NM_TITLE && item.NM_TITLE.toLowerCase().includes(q);
            const contentMatch = item.SNIPPET && item.SNIPPET.toLowerCase().includes(q);
            return titleMatch || contentMatch;
        }).slice(0, 50); // Limit to 50 results

        setResults(matches);
        setSelectedIndex(0);

    }, [query, searchIndex]);

    useEffect(() => {
        const down = (e) => {
            if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setIsOpen((open) => !open);
            }
            if (e.key === 'Escape') {
                setIsOpen(false);
            }
        };

        document.addEventListener('keydown', down);
        return () => document.removeEventListener('keydown', down);
    }, []);

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
        setQuery('');
        setResults([]);
        setSelectedIndex(0);
    }, [isOpen]);

    const handleSelect = (page) => {
        // onNavigate(page.NM_TITLE); // OLD: Name based

        // NEW: Event based with ID
        window.dispatchEvent(new CustomEvent('hap-doc-open', {
            detail: {
                id: page.ID_NODE,
                bookId: page.ID_BOOK, // We need ID_BOOK in search index!
                query: query
            }
        }));
        setIsOpen(false);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(i => Math.min(i + 1, results.length - 1));
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(i => Math.max(i - 1, 0));
        }
        if (e.key === 'Enter' && results.length > 0) {
            handleSelect(results[selectedIndex]);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/50 backdrop-blur-sm" onClick={() => setIsOpen(false)}>
            <div
                className={`w-full max-w-lg rounded-xl shadow-2xl overflow-hidden border ${theme ? theme.border : 'border-gray-200'} ${theme ? theme.panel : 'bg-white'} transform transition-all`}
                onClick={e => e.stopPropagation()}
            >
                <div className={`flex items-center gap-3 px-4 py-3 border-b ${theme ? theme.border : 'border-gray-200'}`}>
                    <Search className="w-5 h-5 text-gray-400" />
                    <input
                        ref={inputRef}
                        className={`flex-1 bg-transparent outline-none text-sm placeholder-gray-400 ${theme ? theme.text : 'text-gray-800'}`}
                        placeholder="Buscar documentos..."
                        value={query}
                        onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
                        onKeyDown={handleKeyDown}
                    />
                    <div className="text-xs text-gray-400 px-1.5 py-0.5 rounded border border-gray-600/30">ESC</div>
                </div>

                <div className="max-h-[300px] overflow-y-auto">
                    {results.length === 0 && query && (
                        <div className="p-4 text-center text-sm text-gray-500">Nenhum resultado encontrado.</div>
                    )}
                    {results.map((page, index) => (
                        <div
                            key={page.ID_NODE}
                            onClick={() => handleSelect(page)}
                            className={`flex items-center justify-between px-4 py-3 cursor-pointer text-sm transition-colors
                                ${index === selectedIndex ? (theme?.name === 'Modo Escuro' ? 'bg-blue-600/20 text-blue-400' : 'bg-blue-50 text-blue-700') : (theme?.name === 'Modo Escuro' ? 'text-gray-300' : 'text-gray-700')}
                            `}
                            onMouseEnter={() => setSelectedIndex(index)}
                        >
                            <div className="flex flex-col gap-0.5 overflow-hidden">
                                <div className="flex items-center gap-2">
                                    <FileText className="w-4 h-4 opacity-70 flex-shrink-0" />
                                    <span className="font-medium truncate">{page.NM_TITLE}</span>
                                </div>
                                {page.SNIPPET && (
                                    <span className="text-xs opacity-60 truncate ml-6">
                                        ...{page.SNIPPET.replace(/<[^>]*>/g, '').substring(0, 60)}...
                                    </span>
                                )}
                            </div>
                            {index === selectedIndex && <CornerDownLeft className="w-4 h-4 opacity-50 flex-shrink-0" />}
                        </div>
                    ))}
                    {query === '' && (
                        <div className="p-8 text-center opacity-40">
                            <p className="text-xs">Digite para buscar...</p>
                        </div>
                    )}
                </div>
                {/* Index Status Footer */}
                <div className={`px-4 py-2 border-t text-xs flex justify-between ${theme ? theme.border : 'border-gray-200'} ${theme ? theme.text : 'text-gray-500'} opacity-60`}>
                    <span>{searchIndex.length} documentos indexados</span>
                    {isLoadingIndex && <span>Carregando...</span>}
                </div>
            </div>
        </div>
    );
};

export default SpotlightSearch;
