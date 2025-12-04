import React, { useState, useEffect, useContext, useRef } from 'react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { ThemeContext } from '../App';
import CodeMirror from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';
import PropTypes from 'prop-types';

// Custom AutoSizer to avoid build issues with the library
const AutoSizer = ({ children }) => {
    const ref = useRef(null);
    const [size, setSize] = useState({ width: 0, height: 0 });

    useEffect(() => {
        if (!ref.current) return;
        const observer = new ResizeObserver(entries => {
            for (let entry of entries) {
                // Use contentRect for precise dimensions
                const { width, height } = entry.contentRect;
                setSize({ width, height });
            }
        });
        observer.observe(ref.current);
        return () => observer.disconnect();
    }, []);

    return (
        <div ref={ref} style={{ width: '100%', height: '100%' }}>
            {size.width > 0 && size.height > 0 && children(size)}
        </div>
    );
};

AutoSizer.propTypes = {
    children: PropTypes.func.isRequired
};

// Custom VirtualList to replace react-window
const VirtualList = ({ height, width, itemCount, itemSize, minWidth, header, headerHeight = 40, children }) => {
    const [scrollTop, setScrollTop] = useState(0);
    const containerRef = useRef(null);

    const handleScroll = (e) => {
        setScrollTop(e.target.scrollTop);
    };

    const totalHeight = itemCount * itemSize;
    const overscan = 5; // Render extra items to prevent flickering

    // Adjust start/end index calculations to account for header height
    const effectiveScrollTop = Math.max(0, scrollTop - headerHeight);

    const startIndex = Math.max(0, Math.floor(effectiveScrollTop / itemSize) - overscan);
    const endIndex = Math.min(
        itemCount - 1,
        Math.floor((effectiveScrollTop + height) / itemSize) + overscan
    );

    const items = [];
    for (let i = startIndex; i <= endIndex; i++) {
        items.push(
            children({
                index: i,
                style: {
                    position: 'absolute',
                    top: i * itemSize + headerHeight, // Offset by header height
                    left: 0,
                    width: '100%',
                    height: itemSize,
                },
            })
        );
    }

    return (
        <div
            ref={containerRef}
            onScroll={handleScroll}
            style={{ height, width, overflow: 'auto', position: 'relative', willChange: 'transform' }}
        >
            <div style={{ height: totalHeight + headerHeight, position: 'relative', width: '100%', minWidth: minWidth || '100%' }}>
                {/* Sticky Header */}
                <div style={{ position: 'sticky', top: 0, zIndex: 10, height: headerHeight, width: '100%' }}>
                    {header}
                </div>
                {items}
            </div>
        </div>
    );
};

VirtualList.propTypes = {
    height: PropTypes.number.isRequired,
    width: PropTypes.number.isRequired,
    itemCount: PropTypes.number.isRequired,
    itemSize: PropTypes.number.isRequired,
    minWidth: PropTypes.number,
    header: PropTypes.node,
    headerHeight: PropTypes.number,
    children: PropTypes.func.isRequired
};

function SqlRunner({ isVisible, tabs, setTabs, activeTabId, setActiveTabId, savedQueries, setSavedQueries }) {
    const { theme } = useContext(ThemeContext);

    // Internal state for things that don't need to persist across unmounts
    const viewRef = useRef(null);
    const containerRef = useRef(null);
    const [toast, setToast] = useState(null);

    // Focus Strategy: Robust focus handling
    useEffect(() => {
        const focusEditor = () => {
            if (viewRef.current) {
                viewRef.current.focus();
            }
        };

        // 1. Focus on mount with a small delay
        const timer = setTimeout(() => {
            focusEditor();
        }, 100);

        // 2. Focus when window regains focus (fixes the "alt-tab" issue)
        const handleWindowFocus = () => {
            focusEditor();
        };
        window.addEventListener('focus', handleWindowFocus);

        return () => {
            clearTimeout(timer);
            window.removeEventListener('focus', handleWindowFocus);
        };
    }, []); // Run once on mount

    // Toast Helper
    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    // Helper to get active tab
    const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

    // Helper to update active tab
    const updateActiveTab = (updates) => {
        setTabs(tabs.map(t => t.id === activeTabId ? { ...t, ...updates } : t));
    };

    const [isExporting, setIsExporting] = useState(false);
    const [limit, setLimit] = useState(1000);
    const [queryName, setQueryName] = useState('');
    const [showSaveInput, setShowSaveInput] = useState(false);
    const [showSidebar, setShowSidebar] = useState(true);
    const [activeSidebarTab, setActiveSidebarTab] = useState('saved'); // 'saved' or 'schema'

    // Schema Browser State
    const [schemaSearch, setSchemaSearch] = useState('');
    const [schemaTables, setSchemaTables] = useState([]);
    const [expandedTable, setExpandedTable] = useState(null);
    const [tableColumns, setTableColumns] = useState([]);
    const [loadingSchema, setLoadingSchema] = useState(false);
    const [schemaData, setSchemaData] = useState({}); // For autocomplete

    // Column Management State
    const [visibleColumns, setVisibleColumns] = useState({});
    const [columnOrder, setColumnOrder] = useState([]);
    const [columnFilters, setColumnFilters] = useState({});
    const [showColumnMenu, setShowColumnMenu] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [serverSideFilter, setServerSideFilter] = useState(false);
    const [draggingCol, setDraggingCol] = useState(null);

    // Initialize column state when results change
    useEffect(() => {
        if (activeTab.results && activeTab.results.metaData) {
            const initialVisible = {};
            const initialOrder = activeTab.results.metaData.map(m => m.name);
            activeTab.results.metaData.forEach(m => initialVisible[m.name] = true);

            setVisibleColumns(initialVisible);
            setColumnOrder(initialOrder);
            setColumnFilters({});
        }
    }, [activeTab.results]);

    const fetchSchemaTables = async (search = '') => {
        setLoadingSchema(true);
        try {
            const res = await fetch(`http://localhost:3001/api/tables?search=${encodeURIComponent(search)}`);
            const data = await res.json();
            setSchemaTables(data);

            const newSchema = { ...schemaData };
            data.forEach(t => {
                if (!newSchema[t]) newSchema[t] = [];
            });
            setSchemaData(newSchema);

        } catch (err) {
            console.error("Failed to fetch schema tables", err);
        } finally {
            setLoadingSchema(false);
        }
    };

    const handleExpandTable = async (tableName) => {
        if (expandedTable === tableName) {
            setExpandedTable(null);
            setTableColumns([]);
            return;
        }
        setExpandedTable(tableName);
        try {
            const res = await fetch(`http://localhost:3001/api/columns/${encodeURIComponent(tableName)}`);
            const data = await res.json();
            setTableColumns(data);

            setSchemaData(prev => ({
                ...prev,
                [tableName]: data.map(c => c.name)
            }));
        } catch (err) {
            console.error("Failed to fetch columns", err);
        }
    };

    const insertTextAtCursor = (text) => {
        updateActiveTab({ sqlContent: activeTab.sqlContent + ' ' + text });
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        updateActiveTab({ loading: true });
        try {
            const res = await fetch('http://localhost:3001/api/upload/sql', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);

            updateActiveTab({ sqlContent: data.sql, loading: false });
            setQueryName(file.name.replace(/\.sql$/i, ''));
        } catch (err) {
            updateActiveTab({ error: err.message, loading: false });
        }
    };

    const executeQuery = async () => {
        updateActiveTab({ loading: true, error: null });
        try {
            const cleanSql = activeTab.sqlContent.trim().replace(/;$/, '');

            const res = await fetch('http://localhost:3001/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sql: cleanSql,
                    limit: limit,
                    filter: serverSideFilter ? columnFilters : null
                })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            updateActiveTab({ results: data, loading: false });

            // Fetch total count in background
            fetch('http://localhost:3001/api/query/count', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sql: cleanSql })
            })
                .then(res => res.json())
                .then(countData => {
                    if (countData.count !== undefined) {
                        updateActiveTab({ totalRecords: countData.count });
                    }
                })
                .catch(err => console.error("Failed to fetch count", err));

        } catch (err) {
            updateActiveTab({ error: err.message, loading: false });
        }
    };

    const saveQuery = () => {
        if (!queryName) {
            alert("Por favor, insira um nome para a query.");
            return;
        }
        const newQuery = { id: Date.now(), name: queryName, sql: activeTab.sqlContent };
        const updatedQueries = [...savedQueries, newQuery];
        setSavedQueries(updatedQueries);
        setShowSaveInput(false);
        setQueryName('');
    };

    const deleteQuery = (id) => {
        if (window.confirm("Tem certeza que deseja excluir esta query?")) {
            const updatedQueries = savedQueries.filter(q => q.id !== id);
            setSavedQueries(updatedQueries);
        }
    };

    const loadQuery = (query) => {
        updateActiveTab({ sqlContent: query.sql });
        setQueryName(query.name);
    };

    // --- Tab Management ---
    const addTab = () => {
        const newId = Date.now();
        const newTab = { id: newId, title: `Query ${tabs.length + 1}`, sqlContent: '', results: null, error: null, loading: false };
        setTabs([...tabs, newTab]);
        setActiveTabId(newId);
    };

    const closeTab = (e, id) => {
        e.stopPropagation();
        if (tabs.length === 1) {
            // Don't close the last tab, just clear it
            setTabs([{ ...tabs[0], sqlContent: '', results: null, error: null }]);
            return;
        }
        const newTabs = tabs.filter(t => t.id !== id);
        setTabs(newTabs);
        if (activeTabId === id) {
            setActiveTabId(newTabs[newTabs.length - 1].id);
        }
    };

    // --- Filtering Logic ---
    const getFilteredRows = () => {
        if (!activeTab.results) return [];

        const hasFilters = Object.values(columnFilters).some(val => val && val.trim() !== '');
        if (!hasFilters || serverSideFilter) return activeTab.results.rows;

        return activeTab.results.rows.filter(row => {
            return columnOrder.every((colName, idx) => {
                const filterVal = columnFilters[colName];
                if (!filterVal) return true;

                const originalIdx = activeTab.results.metaData.findIndex(m => m.name === colName);
                const cellValue = String(row[originalIdx] || '').toLowerCase();
                return cellValue.includes(filterVal.toLowerCase());
            });
        });
    };

    const filteredRows = getFilteredRows();

    const downloadStreamExport = async () => {
        setIsExporting(true);
        try {
            const cleanSql = activeTab.sqlContent.trim().replace(/;$/, '');
            const res = await fetch('http://localhost:3001/api/export/csv', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sql: cleanSql,
                    filter: serverSideFilter ? columnFilters : null
                })
            });

            if (!res.ok) throw new Error("Erro na exportação");

            const blob = await res.blob();
            saveAs(blob, `export_${Date.now()}.csv`);
            showToast("Download concluído!");
        } catch (err) {
            console.error(err);
            showToast("Erro ao exportar: " + err.message, 'error');
        } finally {
            setIsExporting(false);
        }
    };

    const exportData = async (type) => {
        if (!activeTab.results || !activeTab.results.rows || activeTab.results.rows.length === 0) {
            alert("Não há dados para exportar.");
            return;
        }

        const needsFetchAll = (limit !== 'all' && activeTab.results.rows.length >= limit) || serverSideFilter;

        if (needsFetchAll) {
            const confirmFetchAll = window.confirm(`A visualização atual está limitada ou filtrada. Deseja exportar TODAS as linhas correspondentes?`);
            if (confirmFetchAll) {
                // Export ALL (Server Side)
                if (type === 'csv') {
                    downloadStreamExport();
                    return;
                } else if (type === 'xlsx') {
                    // Check total records if available
                    if (activeTab.totalRecords > 100000) {
                        if (window.confirm("Para grandes volumes (>100k), a exportação em Excel pode falhar ou ser lenta. Recomendamos CSV. Deseja exportar em CSV?")) {
                            downloadStreamExport();
                            return;
                        }
                    }
                    if (activeTab.totalRecords > 1000000) {
                        alert("Atenção: O Excel suporta no máximo 1 milhão de linhas. A exportação pode falhar. Recomendamos fortemente o uso de CSV.");
                    }

                    // Fallback to fetching all JSON for Excel (Legacy method)
                    // This might crash for > 1M, but we warned them.
                    setIsExporting(true);
                    try {
                        const cleanSql = activeTab.sqlContent.trim().replace(/;$/, '');
                        const res = await fetch('http://localhost:3001/api/query', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                sql: cleanSql,
                                limit: 'all',
                                filter: serverSideFilter ? columnFilters : null
                            })
                        });
                        const data = await res.json();
                        if (data.error) throw new Error(data.error);

                        // Generate Excel
                        const header = data.metaData.map(m => m.name);
                        const rows = [header, ...data.rows];
                        const wb = XLSX.utils.book_new();
                        const ws = XLSX.utils.aoa_to_sheet(rows);
                        XLSX.utils.book_append_sheet(wb, ws, "Results");
                        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                        const blob = new Blob([wbout], { type: 'application/octet-stream' });
                        saveAs(blob, `export_${Date.now()}.xlsx`);
                        showToast("Download concluído!");
                    } catch (err) {
                        alert("Falha ao buscar todos os dados: " + err.message);
                    } finally {
                        setIsExporting(false);
                    }
                    return;
                }
            }
        }

        // Export only what's visible (Client Side)
        setIsExporting(true);
        setTimeout(() => {
            try {
                const header = activeTab.results.metaData.map(m => m.name);
                const data = [header, ...filteredRows];
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                const filename = `sql_export_${timestamp}`;

                if (type === 'xlsx') {
                    const wb = XLSX.utils.book_new();
                    const ws = XLSX.utils.aoa_to_sheet(data);
                    XLSX.utils.book_append_sheet(wb, ws, "Results");
                    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                    const blob = new Blob([wbout], { type: 'application/octet-stream' });
                    saveAs(blob, `${filename}.xlsx`);
                } else if (type === 'csv') {
                    const ws = XLSX.utils.aoa_to_sheet(data);
                    const csvOutput = XLSX.utils.sheet_to_csv(ws);
                    const blob = new Blob([csvOutput], { type: 'text/csv;charset=utf-8' });
                    saveAs(blob, `${filename}.csv`);
                } else if (type === 'txt') {
                    const txtContent = data.map(row => row.join('\t')).join('\n');
                    const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
                    saveAs(blob, `${filename}.txt`);
                }
                showToast("Download concluído com sucesso!");
            } catch (err) {
                console.error("Export Error:", err);
                showToast("Falha ao exportar: " + err.message, 'error');
            } finally {
                setIsExporting(false);
            }
        }, 100);
    };

    // --- Column Drag & Drop ---
    const handleDragStart = (e, colName) => {
        setDraggingCol(colName);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e, targetCol) => {
        e.preventDefault();
        if (!draggingCol || draggingCol === targetCol) return;

        const newOrder = [...columnOrder];
        const dragIdx = newOrder.indexOf(draggingCol);
        const targetIdx = newOrder.indexOf(targetCol);

        newOrder.splice(dragIdx, 1);
        newOrder.splice(targetIdx, 0, draggingCol);

        setColumnOrder(newOrder);
    };

    const handleDragEnd = () => {
        setDraggingCol(null);
    };

    // --- Virtualized Row Renderer ---
    const Row = ({ index, style }) => {
        const row = filteredRows[index];
        return (
            <div style={style} className={`flex divide-x ${theme.border} ${index % 2 === 0 ? theme.panel : 'bg-opacity-50 ' + theme.bg} hover:bg-blue-50 transition-colors`}>
                {columnOrder.map(colName => {
                    if (!visibleColumns[colName]) return null;
                    const originalIdx = activeTab.results.metaData.findIndex(m => m.name === colName);
                    return (
                        <div key={colName} className={`px-6 py-2 whitespace-nowrap text-sm ${theme.sidebarText} flex-1 overflow-hidden text-ellipsis`} style={{ minWidth: '150px' }}>
                            {row[originalIdx]}
                        </div>
                    );
                })}
            </div>
        );
    };

    // Container click handler to ensure focus
    const handleContainerClick = () => {
        if (viewRef.current && !viewRef.current.hasFocus) {
            viewRef.current.focus();
        }
    };

    return (
        <div className={`space-y-4 relative h-full flex flex-col ${theme.bg}`}>
            {/* Toast Notification */}
            {toast && (
                <div className={`fixed bottom-4 right-4 px-6 py-3 rounded shadow-lg z-50 animate-fade-in-up text-white font-medium ${toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>
                    {toast.message}
                </div>
            )}

            {/* Loading Overlay for Export */}
            {isExporting && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
                    <div className="bg-white p-6 rounded-lg shadow-xl flex flex-col items-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#f37021] mb-4"></div>
                        <p className="text-gray-700 font-semibold">Exportando dados...</p>
                        <p className="text-sm text-gray-500">Por favor, aguarde.</p>
                    </div>
                </div>
            )}

            <div className="flex gap-4 h-full overflow-hidden">
                {/* Main Editor Area */}
                <div className="flex-1 space-y-2 flex flex-col overflow-hidden">

                    {/* Tabs Header */}
                    <div className="flex items-center space-x-1 overflow-x-auto border-b border-gray-200 pb-1">
                        {tabs.map(tab => (
                            <div
                                key={tab.id}
                                onClick={() => setActiveTabId(tab.id)}
                                className={`group flex items-center px-3 py-1.5 text-xs font-medium rounded-t-lg cursor-pointer border-t border-l border-r ${activeTabId === tab.id
                                    ? 'bg-white text-blue-600 border-gray-200 relative top-[1px]'
                                    : 'bg-gray-100 text-gray-500 hover:bg-gray-50 border-transparent'
                                    }`}
                            >
                                <span className="mr-2 max-w-[100px] truncate">{tab.title}</span>
                                <button
                                    onClick={(e) => closeTab(e, tab.id)}
                                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500"
                                >
                                    ✕
                                </button>
                            </div>
                        ))}
                        <button
                            onClick={addTab}
                            className="px-2 py-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                            title="Nova Aba"
                        >
                            +
                        </button>
                    </div>

                    <div className={`p-3 rounded border shadow-sm flex justify-between items-center ${theme.panel} ${theme.border}`}>
                        <div>
                            <h3 className={`font-bold ${theme.sidebarText}`}>Editor SQL</h3>
                        </div>
                        <div className="flex items-center space-x-3">
                            {activeTab.totalRecords !== undefined && (
                                <span className="text-xs font-medium text-gray-500 mr-2">
                                    Total: {activeTab.totalRecords.toLocaleString()} registros
                                </span>
                            )}
                            <button
                                onClick={() => setShowSidebar(!showSidebar)}
                                className={`text-xs px-3 py-1.5 rounded border transition-colors ${showSidebar ? `${theme.primaryBtn}` : `${theme.secondaryBtn}`}`}
                                title={showSidebar ? "Ocultar Lateral" : "Mostrar Lateral"}
                            >
                                {showSidebar ? 'Ocultar Lateral' : 'Mostrar Lateral'}
                            </button>
                            <input
                                type="file"
                                accept=".sql"
                                onChange={handleFileUpload}
                                className="text-xs text-gray-500 file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition-colors"
                            />
                        </div>
                    </div>

                    <div className="flex-none">
                        <div ref={containerRef} onClick={handleContainerClick} className={`border rounded overflow-hidden ${theme.border} cursor-text`}>
                            <CodeMirror
                                value={activeTab.sqlContent}
                                height="200px"
                                extensions={[sql({ schema: schemaData })]}
                                onChange={(value) => updateActiveTab({ sqlContent: value })}
                                theme={theme.name === 'Modo Escuro' || theme.name === 'Dracula' ? 'dark' : 'light'}
                                className="text-sm"
                                autoFocus={true}
                                onCreateEditor={(view) => {
                                    viewRef.current = view;
                                }}
                            />
                        </div>
                        <div className={`mt-2 flex items-center justify-between p-2 rounded border ${theme.panel} ${theme.border}`}>
                            <div className="flex items-center space-x-3">
                                <button
                                    onClick={executeQuery}
                                    disabled={!activeTab.sqlContent || activeTab.loading}
                                    className={`py-2 px-6 rounded-lg shadow-md transition-all font-semibold flex items-center disabled:opacity-50 ${theme.primaryBtn}`}
                                >
                                    {activeTab.loading ? (
                                        <>
                                            <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></span>
                                            Executando...
                                        </>
                                    ) : (
                                        <>
                                            <span className="mr-2">▶</span> Executar
                                        </>
                                    )}
                                </button>

                                <div className={`flex items-center space-x-2 border-l pl-3 ${theme.border}`}>
                                    <span className={`text-sm font-medium ${theme.sidebarText}`}>Limite:</span>
                                    <select
                                        value={limit}
                                        onChange={(e) => setLimit(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                                        className={`border rounded p-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none ${theme.input} ${theme.border}`}
                                    >
                                        <option value={100}>100 linhas</option>
                                        <option value={500}>500 linhas</option>
                                        <option value={1000}>1000 linhas</option>
                                        <option value={5000}>5000 linhas</option>
                                        <option value="all">Todas (Cuidado)</option>
                                    </select>
                                </div>
                            </div>

                            <div className="flex items-center space-x-2">
                                {showSaveInput ? (
                                    <div className="flex items-center space-x-2 animate-fade-in">
                                        <input
                                            type="text"
                                            value={queryName}
                                            onChange={(e) => setQueryName(e.target.value)}
                                            placeholder="Nome da Query"
                                            className={`border rounded p-1.5 text-sm focus:ring-2 focus:ring-[#f37021] outline-none ${theme.input} ${theme.border}`}
                                            autoFocus
                                        />
                                        <button onClick={saveQuery} className="text-green-600 hover:bg-green-50 p-1.5 rounded" title="Confirmar">✅</button>
                                        <button onClick={() => setShowSaveInput(false)} className="text-red-600 hover:bg-red-50 p-1.5 rounded" title="Cancelar">❌</button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => setShowSaveInput(true)}
                                        disabled={!activeTab.sqlContent}
                                        className={`px-3 py-2 rounded transition-colors text-sm font-medium flex items-center disabled:opacity-50 ${theme.secondaryBtn}`}
                                    >
                                        <span className="mr-1">💾</span> Salvar Query
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {activeTab.error && (
                        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded shadow-sm">
                            <p className="text-red-700 font-medium">Erro ao executar query:</p>
                            <p className="text-sm text-red-600 mt-1">{activeTab.error}</p>
                        </div>
                    )}

                    {activeTab.results && (
                        <div className={`rounded-lg shadow-md border flex-1 flex flex-col overflow-hidden min-h-0 ${theme.panel} ${theme.border}`}>
                            <div className={`p-3 border-b flex justify-between items-center ${theme.header}`}>
                                <div className="flex items-center space-x-4">
                                    <h3 className={`text-sm font-bold ${theme.sidebarText}`}>
                                        Resultados ({filteredRows.length} linhas {limit !== 'all' && activeTab.results.rows.length >= limit ? '(Limitado)' : ''})
                                    </h3>

                                    {/* Column Controls */}
                                    <div className="relative">
                                        <button
                                            onClick={() => setShowColumnMenu(!showColumnMenu)}
                                            className={`text-xs px-2 py-1 rounded border flex items-center ${theme.secondaryBtn} ${theme.border}`}
                                        >
                                            👁️ Colunas
                                        </button>
                                        {showColumnMenu && (
                                            <div className={`absolute top-full left-0 mt-1 w-48 border rounded shadow-lg z-20 max-h-60 overflow-y-auto p-2 ${theme.panel} ${theme.border}`}>
                                                <div className="text-xs font-bold text-gray-500 mb-2 uppercase">Exibir/Ocultar</div>
                                                {columnOrder.map(col => (
                                                    <label key={col} className="flex items-center space-x-2 mb-1 cursor-pointer hover:bg-gray-50 p-1 rounded">
                                                        <input
                                                            type="checkbox"
                                                            checked={visibleColumns[col]}
                                                            onChange={(e) => setVisibleColumns({ ...visibleColumns, [col]: e.target.checked })}
                                                            className="rounded text-blue-600 focus:ring-blue-500"
                                                        />
                                                        <span className={`text-sm truncate ${theme.sidebarText}`}>{col}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <button
                                        onClick={() => setShowFilters(!showFilters)}
                                        className={`text-xs px-2 py-1 rounded border flex items-center ${showFilters ? `${theme.primaryBtn}` : `${theme.secondaryBtn} ${theme.border}`}`}
                                    >
                                        🔍 Filtros
                                    </button>

                                    {showFilters && (
                                        <label className="flex items-center space-x-1 cursor-pointer select-none" title="Filtrar em todo o banco de dados (ignora limite)">
                                            <input
                                                type="checkbox"
                                                checked={serverSideFilter}
                                                onChange={(e) => setServerSideFilter(e.target.checked)}
                                                className="rounded text-blue-600 focus:ring-blue-500 h-3 w-3"
                                            />
                                            <span className={`text-[10px] font-medium ${theme.sidebarText}`}>Filtrar Tudo (Servidor)</span>
                                        </label>
                                    )}
                                </div>

                                <div className="flex space-x-2">
                                    <button onClick={() => exportData('csv')} className={`text-xs border px-3 py-1.5 rounded transition-colors font-medium flex items-center ${theme.secondaryBtn} ${theme.border}`}>
                                        <span className="mr-1">📄</span> CSV
                                    </button>
                                    <button onClick={() => exportData('xlsx')} className={`text-xs px-3 py-1.5 rounded shadow-sm transition-colors font-medium flex items-center ${theme.primaryBtn}`}>
                                        <span className="mr-1">📊</span> Excel
                                    </button>
                                    <button onClick={() => exportData('txt')} className={`text-xs border px-3 py-1.5 rounded transition-colors font-medium flex items-center ${theme.secondaryBtn} ${theme.border}`}>
                                        <span className="mr-1">📝</span> TXT
                                    </button>
                                </div>
                            </div>

                            <div className="flex-1 w-full relative overflow-hidden">
                                <AutoSizer>
                                    {({ height, width }) => {
                                        const visibleCount = columnOrder.filter(c => visibleColumns[c]).length;
                                        const totalMinWidth = visibleCount * 150; // 150px per column

                                        // Prepare Header Row
                                        const headerRow = (
                                            <div className={`flex divide-x ${theme.border} ${theme.tableHeader} border-b font-bold text-xs uppercase tracking-wider h-full items-center bg-gray-50`}>
                                                {columnOrder.map(colName => visibleColumns[colName] && (
                                                    <div
                                                        key={colName}
                                                        draggable
                                                        onDragStart={(e) => handleDragStart(e, colName)}
                                                        onDragOver={(e) => handleDragOver(e, colName)}
                                                        onDragEnd={handleDragEnd}
                                                        className={`px-6 py-3 flex-1 overflow-hidden text-ellipsis whitespace-nowrap cursor-move transition-colors ${draggingCol === colName ? 'opacity-50 bg-blue-50' : ''}`}
                                                        style={{ minWidth: '150px' }}
                                                    >
                                                        <div className="flex flex-col space-y-2">
                                                            <span>{colName}</span>
                                                            {showFilters && (
                                                                <input
                                                                    type="text"
                                                                    placeholder={serverSideFilter ? "Filtrar (Enter)..." : "Filtrar..."}
                                                                    value={columnFilters[colName] || ''}
                                                                    onChange={(e) => setColumnFilters({ ...columnFilters, [colName]: e.target.value })}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter' && serverSideFilter) {
                                                                            executeQuery();
                                                                        }
                                                                    }}
                                                                    className={`w-full text-xs p-1 border rounded font-normal normal-case ${theme.input} ${theme.border} ${serverSideFilter ? 'border-blue-400 bg-blue-50' : ''}`}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    title={serverSideFilter ? "Pressione Enter para buscar no servidor" : "Filtragem local"}
                                                                />
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        );

                                        return (
                                            <VirtualList
                                                height={height}
                                                width={width}
                                                itemCount={filteredRows.length}
                                                itemSize={40}
                                                minWidth={totalMinWidth}
                                                header={headerRow}
                                                headerHeight={showFilters ? 80 : 45} // Adjust height if filters are shown
                                            >
                                                {Row}
                                            </VirtualList>
                                        );
                                    }}
                                </AutoSizer>
                            </div>
                        </div>
                    )}
                </div>

                {/* Sidebar (Saved Queries & Schema) */}
                {showSidebar && (
                    <div className={`w-64 border-l flex flex-col shadow-sm transition-all duration-300 ${theme.panel} ${theme.border} overflow-hidden`}>
                        <div className={`flex border-b ${theme.border}`}>
                            <button
                                onClick={() => setActiveSidebarTab('saved')}
                                className={`flex-1 py-2 text-xs font-bold uppercase ${activeSidebarTab === 'saved' ? `border-b-2 border-blue-500 ${theme.accent}` : 'text-gray-400'}`}
                            >
                                Salvas
                            </button>
                            <button
                                onClick={() => setActiveSidebarTab('schema')}
                                className={`flex-1 py-2 text-xs font-bold uppercase ${activeSidebarTab === 'schema' ? `border-b-2 border-blue-500 ${theme.accent}` : 'text-gray-400'}`}
                            >
                                Schema
                            </button>
                            <button onClick={() => setShowSidebar(false)} className="px-3 text-gray-400 hover:text-gray-600">✕</button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-2 space-y-2">
                            {activeSidebarTab === 'saved' ? (
                                <>
                                    {savedQueries.length === 0 && (
                                        <p className="text-gray-400 text-xs text-center italic mt-4">Nenhuma query salva.</p>
                                    )}
                                    {savedQueries.map(q => (
                                        <div key={q.id} className={`group p-3 rounded border transition-all cursor-pointer relative ${theme.border} hover:border-blue-300 hover:bg-blue-50`} onClick={() => loadQuery(q)}>
                                            <div className={`font-medium text-sm truncate pr-6 ${theme.text}`}>{q.name}</div>
                                            <div className="text-xs text-gray-400 truncate mt-1">{q.sql.substring(0, 30)}...</div>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); deleteQuery(q.id); }}
                                                className="absolute top-2 right-2 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                                title="Excluir"
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    ))}
                                </>
                            ) : (
                                <div className={`${theme.bg} p-2 border-t space-y-1 flex flex-col h-full`}>
                                    {/* Search Controls */}
                                    <div className="flex space-x-2 mb-2">
                                        <input
                                            type="text"
                                            placeholder="Buscar tabelas..."
                                            value={schemaSearch}
                                            onChange={(e) => setSchemaSearch(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && fetchSchemaTables(schemaSearch)}
                                            className={`w-full text-xs p-1.5 rounded border outline-none ${theme.input} ${theme.border}`}
                                        />
                                        <button
                                            onClick={() => fetchSchemaTables(schemaSearch)}
                                            disabled={loadingSchema}
                                            className={`px-3 py-1 text-xs rounded font-medium transition-colors ${theme.primaryBtn} disabled:opacity-50`}
                                        >
                                            {loadingSchema ? '...' : '🔍'}
                                        </button>
                                    </div>

                                    {/* Table List */}
                                    <div className="flex-1 overflow-y-auto space-y-1">
                                        {schemaTables.length === 0 && !loadingSchema && (
                                            <div className="text-[10px] text-gray-400 italic text-center mt-4">
                                                Use a busca para encontrar tabelas.
                                            </div>
                                        )}

                                        {schemaTables.map(tableName => (
                                            <div key={tableName} className={`rounded border ${theme.border} overflow-hidden`}>
                                                <div
                                                    onClick={() => handleExpandTable(tableName)}
                                                    className={`px-2 py-1.5 text-xs font-medium cursor-pointer flex justify-between items-center hover:bg-opacity-50 ${expandedTable === tableName ? 'bg-blue-50 text-blue-700' : theme.sidebarText} ${theme.tableRowHover}`}
                                                >
                                                    <span className="truncate" title={tableName}>{tableName}</span>
                                                    <span className="text-[10px] opacity-50">{expandedTable === tableName ? '▼' : '▶'}</span>
                                                </div>

                                                {expandedTable === tableName && (
                                                    <div className={`p-1 pl-3 border-t ${theme.border} bg-opacity-30 ${theme.bg}`}>
                                                        {(schemaData[tableName] || []).length === 0 ? (
                                                            <div className="text-[10px] text-gray-400 italic px-2">Carregando colunas...</div>
                                                        ) : (
                                                            <>
                                                                {(schemaData[tableName] || []).map(col => (
                                                                    <div
                                                                        key={col}
                                                                        className={`text-[10px] ${theme.text} flex justify-between group cursor-pointer hover:text-blue-600 py-0.5 px-1 rounded hover:bg-gray-100`}
                                                                        title="Clique duplo para inserir"
                                                                        onDoubleClick={() => insertTextAtCursor(col)}
                                                                    >
                                                                        <span>{col}</span>
                                                                    </div>
                                                                ))}
                                                                <div className="pt-1 mt-1 border-t border-dashed border-gray-200">
                                                                    <button
                                                                        onClick={() => insertTextAtCursor(`SELECT * FROM ${tableName}`)}
                                                                        className="w-full text-[10px] bg-blue-50 text-blue-600 rounded py-0.5 hover:bg-blue-100 transition-colors"
                                                                    >
                                                                        Gerar SELECT
                                                                    </button>
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

SqlRunner.propTypes = {
    isVisible: PropTypes.bool,
    tabs: PropTypes.array.isRequired,
    setTabs: PropTypes.func.isRequired,
    activeTabId: PropTypes.number.isRequired,
    setActiveTabId: PropTypes.func.isRequired,
    savedQueries: PropTypes.array.isRequired,
    setSavedQueries: PropTypes.func.isRequired
};

export default SqlRunner;
