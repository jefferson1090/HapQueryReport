import { format } from 'sql-formatter';
import React, { useState, useEffect, useContext, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import * as XLSX from 'xlsx';
import { ThemeContext } from '../context/ThemeContext';
import { useApi } from '../context/ApiContext';
import PropTypes from 'prop-types';
import { saveAs } from 'file-saver';
import CodeMirror from '@uiw/react-codemirror';
import { sql, PLSQL } from '@codemirror/lang-sql';
import { autocompletion } from '@codemirror/autocomplete';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { PanelRightClose, PanelRightOpen, Share2, Play, Square, Download, FolderOpen, Save, Trash2, Plus, X, Search, Database, MessageSquare, Zap } from 'lucide-react';
import AutoSizer from 'react-virtualized-auto-sizer';
import { FixedSizeList as VirtualList } from 'react-window';
import ErrorBoundary from './ErrorBoundary';
import { motion, AnimatePresence } from 'framer-motion';

// --- Standalone Row Component (Prevent Re-creation) ---
const SqlRunnerRow = ({ index, style, data }) => {
    const { rows, columnOrder, visibleColumns, theme, metaData, columnWidths } = data;
    const row = rows[index];

    // Strict Guard
    if (!row) return <div style={style} />;

    const formatCellValue = (val) => {
        if (val === null || val === undefined) return ''; // Null/Empty as blank
        if (typeof val !== 'string') return val;

        // Date Handling (ISO or standard DB formats)
        // Regex for typical dates: YYYY-MM-DD with optional time
        const isoDateRegex = /^\d{4}-\d{2}-\d{2}/;
        if (isoDateRegex.test(val)) {
            const date = new Date(val);
            if (!isNaN(date.getTime())) {
                // Adjust for timezone offset if needed, but usually we render as is or local
                // Using manual formatting to ensure DD/MM/YYYY HH:mm:ss without commas/AM/PM
                const day = String(date.getDate()).padStart(2, '0');
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const year = date.getFullYear();
                const hours = String(date.getHours()).padStart(2, '0');
                const minutes = String(date.getMinutes()).padStart(2, '0');
                const seconds = String(date.getSeconds()).padStart(2, '0');

                if (hours === '00' && minutes === '00' && seconds === '00') {
                    return `${day}/${month}/${year}`;
                }
                return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
            }
        }
        return val;
    };

    return (
        <div style={style} className={`flex divide-x divide-gray-100 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-blue-50/80 transition-colors group`}>
            {columnOrder.map(colName => {
                if (!visibleColumns[colName]) return null;
                const originalIdx = metaData ? metaData.findIndex(m => m.name === colName) : -1;
                const width = (columnWidths && columnWidths[colName]) || 150;
                const val = row[originalIdx];
                const displayVal = formatCellValue(val);

                return (
                    <div
                        key={colName}
                        className="px-3 py-2 text-sm text-gray-600 overflow-hidden text-ellipsis whitespace-nowrap transition-colors"
                        style={{ width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px` }}
                        title={String(val || '')}
                    >
                        {val === null ? <span className="text-gray-300 italic">null</span> : displayVal}
                    </div>
                );
            })}
        </div>
    );
};

const SqlRunner = ({ isVisible, tabs, setTabs, activeTabId, setActiveTabId, savedQueries, setSavedQueries, onDisconnect, connection }) => {
    const { theme } = useContext(ThemeContext);
    const { apiUrl } = useApi();
    const [toast, setToast] = useState(null);

    // Derived State
    const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

    // Local State
    const [limit, setLimit] = useState(100);
    const [queryName, setQueryName] = useState('');
    const [showSaveInput, setShowSaveInput] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [showSidebar, setShowSidebar] = useState(true);
    const [activeSidebarTab, setActiveSidebarTab] = useState('saved');
    const [aiChatHistory, setAiChatHistory] = useState([]);
    const [aiChatInput, setAiChatInput] = useState('');
    const [aiLoading, setAiLoading] = useState(false);
    const [columnWidths, setColumnWidths] = useState({});

    // Refs
    // SCROLL SYNC: Reference to the Header Container
    const headerContainerRef = useRef(null);
    const viewRef = useRef(null);
    const containerRef = useRef(null);
    const listOuterRef = useRef(null); // Ref for the virtual list container (outer element)

    const showToast = (message, type = 'success', duration = 3000) => {
        setToast({ message, type });
        setTimeout(() => setToast(null), duration);
    };

    const updateActiveTab = (updates) => {
        setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, ...updates } : t));
    };

    // Schema
    const [schemaSearch, setSchemaSearch] = useState('');
    const [schemaTables, setSchemaTables] = useState([]);
    const [expandedTable, setExpandedTable] = useState(null);
    const [tableColumns, setTableColumns] = useState([]);
    const [loadingSchema, setLoadingSchema] = useState(false);
    const [schemaData, setSchemaData] = useState({});

    // Column Management State
    const [visibleColumns, setVisibleColumns] = useState({});
    const [columnOrder, setColumnOrder] = useState([]);
    const [columnFilters, setColumnFilters] = useState({});
    const [showFilters, setShowFilters] = useState(false);
    const [serverSideFilter, setServerSideFilter] = useState(false);
    const [draggingCol, setDraggingCol] = useState(null);

    // --- Auto Column Width Calculation ---
    const calculateColumnWidths = (results) => {
        if (!results || !results.metaData || !results.rows) return {};
        const widths = {};
        const MAX_WIDTH = 400;
        const MIN_WIDTH = 100;
        const CHAR_WIDTH = 8;

        results.metaData.forEach((col, idx) => {
            let maxLen = col.name.length;
            const sampleRows = (results.rows || []).slice(0, 50); // Sample 50 for speed
            sampleRows.forEach(row => {
                if (!row) return;
                const val = row[idx];
                if (val !== null && val !== undefined) {
                    const strLen = String(val).length;
                    if (strLen > maxLen) maxLen = strLen;
                }
            });
            const calculated = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, maxLen * CHAR_WIDTH + 30));
            widths[col.name] = calculated;
        });
        return widths;
    };

    const handleDoubleClickResizer = (colName) => {
        if (!activeTab.results) return;
        const colIdx = activeTab.results.metaData.findIndex(m => m.name === colName);
        if (colIdx === -1) return;

        let maxLen = colName.length;
        (activeTab.results.rows || []).forEach(row => {
            if (!row) return;
            const val = row[colIdx];
            if (val !== null && val !== undefined) {
                const strLen = String(val).length;
                if (strLen > maxLen) maxLen = strLen;
            }
        });

        const CHAR_WIDTH = 8;
        const calculated = Math.min(800, Math.max(100, maxLen * CHAR_WIDTH + 30));
        setColumnWidths(prev => ({ ...prev, [colName]: calculated }));
    };

    // Initialize column state when results change
    useEffect(() => {
        if (activeTab.results && activeTab.results.metaData) {
            const initialVisible = {};
            const initialOrder = activeTab.results.metaData.map(m => m.name);
            activeTab.results.metaData.forEach(m => initialVisible[m.name] = true);

            setVisibleColumns(initialVisible);
            setColumnOrder(initialOrder);

            // Auto Calculate Widths
            const autoWidths = calculateColumnWidths(activeTab.results);
            setColumnWidths(autoWidths);
        }
    }, [activeTab.results]);

    const fetchSchemaTables = async (search = '') => {
        setLoadingSchema(true);
        try {
            const res = await fetch(`${apiUrl}/api/tables?search=${encodeURIComponent(search)}`);
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
            const res = await fetch(`${apiUrl}/api/columns/${encodeURIComponent(tableName)}`);
            const data = await res.json();
            setTableColumns(data);
            setSchemaData(prev => ({ ...prev, [tableName]: data.map(c => c.name) }));
        } catch (err) {
            console.error("Failed to fetch columns", err);
        }
    };

    const insertTextAtCursor = (text) => {
        updateActiveTab({ sqlContent: activeTab.sqlContent + ' ' + text });
        if (viewRef.current) viewRef.current.focus();
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        updateActiveTab({ loading: true });
        try {
            const res = await fetch(`${apiUrl}/api/upload/sql`, { method: 'POST', body: formData });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            updateActiveTab({ sqlContent: data.sql, loading: false });
            setQueryName(file.name.replace(/\.sql$/i, ''));
        } catch (err) {
            updateActiveTab({ error: err.message, loading: false });
        }
    };

    const abortControllerRef = useRef(null);
    const handleCancelQuery = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
            updateActiveTab({ loading: false, error: "Execução cancelada pelo usuário." });
            showToast("Execução cancelada.", "info");
        }
    };

    const executeQuery = async () => {
        updateActiveTab({ loading: true, error: null, results: null, totalRecords: undefined });
        if (abortControllerRef.current) abortControllerRef.current.abort();
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        try {
            const cleanSql = activeTab.sqlContent.trim().replace(/;+\s*$/, '');
            const res = await fetch('http://127.0.0.1:3001/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sql: cleanSql, limit: limit, filter: serverSideFilter ? columnFilters : null }),
                signal
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);

            const normalizedData = {
                ...data,
                rows: Array.isArray(data.rows) ? data.rows : [],
                metaData: Array.isArray(data.metaData) ? data.metaData : []
            };

            if (data.rowsAffected !== undefined) {
                showToast(`Sucesso. Linhas afetadas: ${data.rowsAffected}`);
            } else if (!data.rows && !data.metaData) {
                showToast("Comando executado com sucesso.");
            }

            updateActiveTab({ results: normalizedData, loading: false });

            // Fetch Total Count
            try {
                const countRes = await fetch('http://127.0.0.1:3001/api/query/count', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sql: cleanSql }),
                    signal
                });
                const countData = await countRes.json();
                if (countData.count !== undefined) updateActiveTab({ totalRecords: countData.count });
            } catch (countErr) {
                // ignore
            }

        } catch (err) {
            if (err.name !== 'AbortError') updateActiveTab({ error: err.message, loading: false });
        } finally {
            abortControllerRef.current = null;
        }
    };

    const saveQuery = () => {
        if (!queryName) return alert("Por favor, insira um nome para a query.");
        const newQuery = { id: Date.now(), name: queryName, title: queryName, sql: activeTab.sqlContent };
        setSavedQueries([...savedQueries, newQuery]);
        setShowSaveInput(false);
        setQueryName('');
        showToast("Query salva!");
    };

    const deleteQuery = (id) => {
        if (window.confirm("Tem certeza que deseja excluir esta query?")) {
            setSavedQueries(savedQueries.filter(q => q.id !== id));
        }
    };

    const loadQuery = (query) => {
        updateActiveTab({ sqlContent: query.sql });
        setQueryName(query.name);
    };

    const addTab = () => {
        const newId = Date.now();
        setTabs([...tabs, { id: newId, title: `Query ${tabs.length + 1}`, sqlContent: '', results: null }]);
        setActiveTabId(newId);
    };

    const closeTab = (e, id) => {
        e.stopPropagation();
        if (tabs.length === 1) return setTabs([{ ...tabs[0], sqlContent: '', results: null, error: null }]);
        const newTabs = tabs.filter(t => t.id !== id);
        setTabs(newTabs);
        if (activeTabId === id) setActiveTabId(newTabs[newTabs.length - 1].id);
    };

    const getFilteredRows = () => {
        if (!activeTab.results) return [];
        const filters = columnFilters || {};
        let hasFilters = false;
        for (const key in filters) {
            if (Object.prototype.hasOwnProperty.call(filters, key) && filters[key] && String(filters[key]).trim() !== '') {
                hasFilters = true;
                break;
            }
        }
        if (!hasFilters || serverSideFilter) return activeTab.results.rows || [];

        return (activeTab.results.rows || []).filter(row => {
            return columnOrder.every((colName, idx) => {
                const filterVal = filters[colName];
                if (!filterVal) return true;
                if (!activeTab.results.metaData) return true;
                const originalIdx = activeTab.results.metaData.findIndex(m => m.name === colName);
                if (originalIdx === -1) return true;
                const cellValue = String(row[originalIdx] || '').toLowerCase();
                return cellValue.includes(String(filterVal).toLowerCase());
            });
        });
    };

    const filteredRows = getFilteredRows();

    const downloadStreamExport = async () => {
        showToast("Iniciando download CSV...", "info", 2000);
        try {
            const cleanSql = activeTab.sqlContent.trim().replace(/;$/, '');
            const res = await fetch(`${apiUrl}/api/export/csv`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sql: cleanSql, filter: serverSideFilter ? columnFilters : null })
            });
            if (!res.ok) throw new Error("Erro na exportação");
            const blob = await res.blob();
            saveAs(blob, `export_${Date.now()}.csv`);
            showToast("Download concluído!");
        } catch (err) {
            showToast("Erro: " + err.message, 'error');
        }
    };

    const performNativeSave = async (filename, content, type) => {
        if (window.electronAPI && window.electronAPI.saveFile) {
            const savedPath = await window.electronAPI.saveFile({ filename, content, type });
            if (savedPath) {
                showToast("Arquivo salvo!");
                window.electronAPI.showItemInFolder(savedPath);
            }
        } else {
            let blob;
            if (type === 'xlsx') {
                const binary = atob(content);
                const array = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
                blob = new Blob([array], { type: 'application/octet-stream' });
            } else {
                blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
            }
            saveAs(blob, filename);
            showToast("Download concluído!");
        }
    };

    const exportData = async (type) => {
        if (!activeTab.results || !activeTab.results.rows || activeTab.results.rows.length === 0) return alert("Sem dados.");

        showToast("Gerando arquivo...", "info", 0);
        setTimeout(async () => {
            try {
                const header = activeTab.results.metaData.map(m => m.name);
                const data = [header, ...filteredRows];
                const filename = `export_${Date.now()}.${type}`;
                let contentToSend;

                if (type === 'xlsx') {
                    const wb = XLSX.utils.book_new();
                    const ws = XLSX.utils.aoa_to_sheet(data);
                    XLSX.utils.book_append_sheet(wb, ws, "Results");
                    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                    const bytes = new Uint8Array(wbout);
                    let binary = '';
                    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
                    contentToSend = window.btoa(binary);
                } else if (type === 'csv') {
                    const ws = XLSX.utils.aoa_to_sheet(data);
                    contentToSend = XLSX.utils.sheet_to_csv(ws);
                }
                await performNativeSave(filename, contentToSend, type);
            } catch (err) {
                showToast("Falha: " + err.message, 'error');
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

    const handleDragEnd = () => setDraggingCol(null);

    // --- AI & Formatter Logic ---
    const handleFormat = () => {
        try {
            const formatted = format(activeTab.sqlContent, { language: 'plsql', keywordCase: 'upper', linesBetweenQueries: 2 });
            updateActiveTab({ sqlContent: formatted });
        } catch (e) {
            showToast("Erro ao formatar", "error");
        }
    };

    const handleAiChatSubmit = async (e) => {
        if (e) e.preventDefault();
        if (!aiChatInput.trim()) return;
        const userMsg = { role: 'user', content: aiChatInput };
        setAiChatHistory(prev => [userMsg, ...prev]);
        setAiChatInput('');
        setAiLoading(true);
        try {
            const schemaContext = Object.keys(schemaData || {}).reduce((acc, table) => {
                if (schemaData && schemaData[table]) acc[table] = schemaData[table];
                return acc;
            }, {});
            const res = await fetch(`${apiUrl}/api/ai/sql/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: userMsg.content, schemaContext })
            });
            const data = await res.json();
            setAiChatHistory(prev => [{ role: 'assistant', content: data.text }, ...prev]);
        } catch (err) {
            setAiChatHistory(prev => [{ role: 'assistant', content: "Erro na comunicação." }, ...prev]);
        } finally {
            setAiLoading(false);
        }
    };

    const handleFixError = async () => {
        if (!activeTab.error) return;
        setAiLoading(true);
        try {
            const res = await fetch(`${apiUrl}/api/ai/sql/fix`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sql: activeTab.sqlContent, error: activeTab.error })
            });
            const data = await res.json();
            const sqlMatch = data.text.match(/```sql\s*([\s\S]*?)\s*```/);
            if (sqlMatch && sqlMatch[1]) {
                updateActiveTab({ sqlContent: sqlMatch[1].trim() });
                showToast("SQL Corrigido!", "success");
            }
            setActiveSidebarTab('chat');
            setAiChatHistory(prev => [{ role: 'system', content: `**Sugestão de Correção:**\n\n${data.text}` }, ...prev]);
        } catch (err) {
            showToast("Falha ao corrigir", "error");
        } finally {
            setAiLoading(false);
        }
    };

    const handleExplainSql = async () => {
        if (!activeTab.sqlContent) return;
        setAiLoading(true);
        try {
            const res = await fetch(`${apiUrl}/api/ai/sql/explain`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sql: activeTab.sqlContent })
            });
            const data = await res.json();
            setActiveSidebarTab('chat');
            setAiChatHistory(prev => [{ role: 'system', content: `**Explicação:**\n\n${data.text}` }, ...prev]);
        } catch (err) {
            showToast("Erro", "error");
        } finally {
            setAiLoading(false);
        }
    };

    const handleOptimizeSql = async () => {
        if (!activeTab.sqlContent) return;
        setAiLoading(true);
        try {
            const res = await fetch(`${apiUrl}/api/ai/sql/optimize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sql: activeTab.sqlContent })
            });
            const data = await res.json();
            let optimizedSql = data.text;
            const sqlMatch = data.text.match(/```sql\n([\s\S]+?)\n```/);
            if (sqlMatch && sqlMatch[1]) optimizedSql = sqlMatch[1];
            updateActiveTab({ sqlContent: optimizedSql });
            showToast("SQL Otimizado!", "success");
        } catch (err) {
            showToast("Erro", "error");
        } finally {
            setAiLoading(false);
        }
    };

    // SCROLL SYNCHRONIZATION HANDLER
    const handleScroll = (event) => {
        if (headerContainerRef.current) {
            headerContainerRef.current.scrollLeft = event.currentTarget.scrollLeft;
        }
    };

    // Attach native scroll listener to listOuterRef when available
    useEffect(() => {
        const el = listOuterRef.current;
        if (el) {
            el.addEventListener('scroll', handleScroll);
            return () => el.removeEventListener('scroll', handleScroll);
        }
    }, [listOuterRef.current, activeTab.results]); // Re-attach if results change causing re-render

    return (
        <ErrorBoundary>
            <div className={`space-y-4 relative h-full flex flex-col bg-gray-50/50`}>
                {toast && (
                    <div className={`fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-xl z-[9999] animate-bounce-up text-white font-bold flex items-center ${toast.type === 'error' ? 'bg-red-500' : 'bg-emerald-500'}`}>
                        {toast.type === 'error' ? '🚫' : '✅'} <span className="ml-2">{toast.message}</span>
                    </div>
                )}

                {/* Loading Overlay */}
                {isExporting && (
                    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center backdrop-blur-sm">
                        <div className="bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center">
                            <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-500 border-t-transparent mb-4"></div>
                            <p className="text-gray-800 font-bold text-lg">Exportando dados...</p>
                        </div>
                    </div>
                )}

                {/* Sidebar Toggle */}
                <button
                    onClick={() => setShowSidebar(!showSidebar)}
                    className="absolute top-2 right-2 z-50 p-2 rounded-lg bg-white shadow-sm border border-gray-200 hover:bg-gray-50 text-gray-600 transition-all hover:scale-105"
                    title={showSidebar ? "Ocultar Menu" : "Expandir Menu"}
                >
                    {showSidebar ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
                </button>

                <PanelGroup direction="horizontal" className="h-full">
                    <Panel defaultSize={80} minSize={30} className="flex flex-col h-full overflow-hidden">
                        <div className="flex flex-col h-full">
                            {/* ---------- TABS ---------- */}
                            <div className="flex items-center bg-gray-100 border-b border-gray-200 px-2 pt-2 gap-1 overflow-x-auto no-scrollbar">
                                {tabs.map(tab => (
                                    <div
                                        key={tab.id}
                                        onClick={() => setActiveTabId(tab.id)}
                                        className={`
                                            group relative flex items-center px-4 py-2 text-xs font-semibold rounded-t-lg cursor-pointer transition-all select-none min-w-[120px] max-w-[200px]
                                            ${activeTabId === tab.id
                                                ? 'bg-white text-blue-600 border-t-2 border-t-blue-500 shadow-sm'
                                                : 'bg-gray-200/50 text-gray-500 hover:bg-gray-200 hover:text-gray-700'
                                            }
                                        `}
                                    >
                                        <span className="truncate flex-1 mr-2">{tab.title}</span>
                                        <button
                                            onClick={(e) => closeTab(e, tab.id)}
                                            className={`p-0.5 rounded-full hover:bg-red-100 hover:text-red-500 transition-opacity ${activeTabId === tab.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                ))}
                                <button
                                    onClick={addTab}
                                    className="p-1.5 ml-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                    title="Nova Query"
                                >
                                    <Plus size={16} />
                                </button>

                                <div className="flex-1"></div>

                                {/* Connection Button */}
                                <button
                                    onClick={onDisconnect}
                                    className="flex items-center gap-1 px-3 py-1 mb-1 mr-1 text-xs font-bold text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Trocar Conexão / Desconectar"
                                >
                                    <Database size={14} />
                                    <span className="truncate max-w-[150px]">{connection?.user}</span>
                                    <span className="ml-1 opacity-50">Disconnect</span>
                                </button>
                            </div>

                            <PanelGroup direction="vertical" className="flex-1">
                                {/* ---------- EDITOR ---------- */}
                                <Panel defaultSize={45} minSize={20} className="flex flex-col bg-white">
                                    <div className="flex-1 relative font-mono text-sm min-h-0" onClick={() => viewRef.current?.focus()}>
                                        {isVisible && (
                                            <CodeMirror
                                                value={activeTab.sqlContent}
                                                height="100%"
                                                extensions={[
                                                    sql({ schema: {}, dialect: PLSQL, upperCaseKeywords: true }),
                                                    autocompletion({ override: [/* ... simplified for now, keep existing logic if needed ... */] })
                                                ]}
                                                onChange={(value) => updateActiveTab({ sqlContent: value })}
                                                theme="light"
                                                className="h-full"
                                                onCreateEditor={(view) => { viewRef.current = view; }}
                                            />
                                        )}
                                    </div>

                                    {/* ---------- TOOLBAR ---------- */}
                                    <div className="flex-none px-4 py-3 bg-white border-t border-gray-100 flex items-center justify-between shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-10">
                                        <div className="flex items-center gap-3">
                                            <button
                                                onClick={executeQuery}
                                                disabled={!activeTab.sqlContent || activeTab.loading}
                                                className={`
                                                    flex items-center px-5 py-2 rounded-lg font-bold text-white shadow-lg shadow-indigo-200 transform transition-all active:scale-95
                                                    ${activeTab.loading ? 'bg-indigo-400 cursor-wait' : 'bg-indigo-600 hover:bg-indigo-700 hover:-translate-y-0.5'}
                                                `}
                                            >
                                                {activeTab.loading ? (
                                                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></span>
                                                ) : (
                                                    <Play size={16} className="mr-2 fill-current" />
                                                )}
                                                {activeTab.loading ? 'Executando...' : 'Executar'}
                                            </button>

                                            {activeTab.loading && (
                                                <button onClick={handleCancelQuery} className="text-red-500 hover:bg-red-50 px-3 py-2 rounded-lg font-medium text-xs flex items-center transition-colors">
                                                    <Square size={12} className="mr-1 fill-current" /> Cancelar
                                                </button>
                                            )}

                                            <div className="h-6 w-px bg-gray-200 mx-1"></div>

                                            <select
                                                value={limit}
                                                onChange={(e) => setLimit(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                                                className="bg-gray-50 border border-gray-200 text-gray-700 text-xs rounded-lg px-2 py-2 outline-none focus:ring-2 focus:ring-indigo-100 font-medium"
                                            >
                                                <option value={100}>100 linhas</option>
                                                <option value={500}>500 linhas</option>
                                                <option value={1000}>1000 linhas</option>
                                                <option value="all">Todas</option>
                                            </select>

                                            {activeTab.totalRecords !== undefined && (
                                                <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-1 rounded">
                                                    {activeTab.totalRecords.toLocaleString()} registros
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <div className="flex bg-gray-100 p-1 rounded-lg">
                                                <button onClick={handleFormat} className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-white rounded-md transition-all" title="Formatar SQL">
                                                    <span className="font-mono text-xs font-bold">{'{}'}</span>
                                                </button>
                                                <button onClick={handleExplainSql} className="p-1.5 text-gray-500 hover:text-purple-600 hover:bg-white rounded-md transition-all" title="Explicar (IA)">
                                                    <MessageSquare size={14} />
                                                </button>
                                                <button onClick={handleOptimizeSql} className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-white rounded-md transition-all" title="Otimizar (IA)">
                                                    <Zap size={14} />
                                                </button>
                                            </div>

                                            <div className="h-6 w-px bg-gray-200 mx-1"></div>

                                            {showSaveInput ? (
                                                <div className="flex items-center bg-gray-50 rounded-lg p-1 border border-indigo-100 animate-in fade-in slide-in-from-right-4">
                                                    <input
                                                        autoFocus
                                                        value={queryName}
                                                        onChange={e => setQueryName(e.target.value)}
                                                        placeholder="Nome..."
                                                        className="bg-transparent text-xs w-32 px-2 outline-none"
                                                        onKeyDown={e => e.key === 'Enter' && saveQuery()}
                                                    />
                                                    <button onClick={saveQuery} className="text-green-600 hover:bg-green-100 p-1 rounded"><Save size={14} /></button>
                                                    <button onClick={() => setShowSaveInput(false)} className="text-red-500 hover:bg-red-100 p-1 rounded"><X size={14} /></button>
                                                </div>
                                            ) : (
                                                <button onClick={() => setShowSaveInput(true)} className="flex items-center px-3 py-2 text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg text-xs font-bold transition-colors">
                                                    <Save size={14} className="mr-1.5" /> Salvar
                                                </button>
                                            )}

                                            <label className="flex items-center px-3 py-2 text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg text-xs font-bold transition-colors cursor-pointer">
                                                <FolderOpen size={14} className="mr-1.5" /> Abrir
                                                <input type="file" accept=".sql" onChange={handleFileUpload} className="hidden" />
                                            </label>
                                        </div>
                                    </div>
                                </Panel>

                                <PanelResizeHandle className="h-1.5 bg-gray-50 hover:bg-indigo-400 transition-colors cursor-row-resize border-y border-gray-200 flex justify-center items-center group">
                                    <div className="w-10 h-1 rounded-full bg-gray-300 group-hover:bg-indigo-200"></div>
                                </PanelResizeHandle>

                                {/* ---------- RESULTS ---------- */}
                                <Panel defaultSize={55} minSize={20} className="flex flex-col bg-white">
                                    {activeTab.error && (
                                        <div className="bg-red-50 border-b border-red-100 p-4 flex items-start gap-3">
                                            <div className="bg-red-100 text-red-600 p-2 rounded-lg flex-shrink-0"><X size={20} /></div>
                                            <div className="flex-1">
                                                <h4 className="font-bold text-red-800 text-sm">Erro na execução</h4>
                                                <p className="text-red-700 text-xs font-mono mt-1 whitespace-pre-wrap leading-relaxed">{activeTab.error}</p>
                                                {!activeTab.error.includes("cancelada") && (
                                                    <button onClick={handleFixError} disabled={aiLoading} className="mt-3 text-xs bg-white border border-red-200 text-red-600 px-3 py-1.5 rounded-md font-bold hover:bg-red-50 transition-colors flex items-center w-fit shadow-sm">
                                                        ✨ Corrigir com IA
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {activeTab.results ? (
                                        <div className="flex-1 flex flex-col min-h-0">
                                            {/* Results Header */}
                                            <div className="px-4 py-2 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                                                <div className="flex items-center space-x-4">
                                                    <h3 className="text-[10px] font-black tracking-widest text-gray-400 uppercase">Resultados</h3>
                                                    <button onClick={() => setShowFilters(!showFilters)} className={`text-xs font-bold flex items-center px-2 py-1 rounded-md transition-colors ${showFilters ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-200'}`}>
                                                        <Search size={12} className="mr-1" /> Filtros
                                                    </button>
                                                </div>
                                                <div className="flex space-x-2">
                                                    <button onClick={() => exportData('xlsx')} className="text-xs font-bold text-emerald-600 hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition-colors flex items-center">
                                                        <Download size={12} className="mr-1.5" /> Excel
                                                    </button>
                                                    <button onClick={() => exportData('csv')} className="text-xs font-bold text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors flex items-center">
                                                        <Download size={12} className="mr-1.5" /> CSV
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Table Container */}
                                            {activeTab.results.metaData.length === 0 ? (
                                                <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                                                    <div className="w-16 h-16 bg-green-50 text-green-500 rounded-full flex items-center justify-center mb-4"><span className="text-3xl">✓</span></div>
                                                    <p className="font-medium text-gray-600">Comando Executado</p>
                                                    <p className="text-xs mt-1">Nenhum dado retornado (DDL/Script)</p>
                                                </div>
                                            ) : (
                                                <div className="flex-1 overflow-hidden relative flex flex-col">
                                                    {/* SYNCED HEADER */}
                                                    <div
                                                        ref={headerContainerRef}
                                                        className="flex divide-x divide-gray-100 border-b border-gray-200 bg-gray-50 overflow-hidden select-none"
                                                        style={{ height: showFilters ? '65px' : '32px' }} // Fixed height
                                                    >
                                                        {columnOrder.map(colName => {
                                                            if (!visibleColumns[colName]) return null;
                                                            const width = columnWidths[colName] || 150;
                                                            return (
                                                                <div
                                                                    key={colName}
                                                                    className="flex-shrink-0 px-3 py-1.5 text-xs font-bold text-gray-700 flex flex-col justify-center relative hover:bg-gray-100 transition-colors group h-full"
                                                                    style={{ width: `${width}px` }}
                                                                    draggable
                                                                    onDragStart={(e) => handleDragStart(e, colName)}
                                                                    onDragOver={(e) => handleDragOver(e, colName)}
                                                                    onDragEnd={handleDragEnd}
                                                                >
                                                                    <div className="flex items-center justify-between mb-1">
                                                                        <span className="truncate" title={colName}>{colName}</span>
                                                                    </div>
                                                                    {showFilters && (
                                                                        <input
                                                                            type="text"
                                                                            placeholder="..."
                                                                            className="w-full text-[10px] px-1.5 py-0.5 border border-gray-300 rounded focus:ring-1 focus:ring-blue-400 outline-none bg-white"
                                                                            value={columnFilters[colName] || ''}
                                                                            onChange={e => setColumnFilters({ ...columnFilters, [colName]: e.target.value })}
                                                                        />
                                                                    )}
                                                                    {/* Resizer Handle */}
                                                                    <div
                                                                        className="absolute right-0 top-0 bottom-0 w-1 hover:bg-blue-400 cursor-col-resize z-10"
                                                                        onDoubleClick={() => handleDoubleClickResizer(colName)}
                                                                    ></div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>

                                                    {/* Virtual List */}
                                                    <div className="flex-1">
                                                        <AutoSizer>
                                                            {({ height, width }) => (
                                                                <VirtualList
                                                                    height={height}
                                                                    width={width}
                                                                    itemCount={filteredRows.length}
                                                                    itemSize={36}
                                                                    outerRef={listOuterRef}
                                                                    itemData={{
                                                                        rows: filteredRows,
                                                                        columnOrder,
                                                                        visibleColumns,
                                                                        theme,
                                                                        metaData: activeTab.results.metaData,
                                                                        columnWidths
                                                                    }}
                                                                >
                                                                    {SqlRunnerRow}
                                                                </VirtualList>
                                                            )}
                                                        </AutoSizer>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="flex-1 flex flex-col items-center justify-center text-gray-300 pointer-events-none select-none">
                                            <Database size={64} className="mb-4 opacity-20" />
                                            <p className="text-sm font-medium opacity-50">Execute uma query para ver resultados</p>
                                        </div>
                                    )}
                                </Panel>
                            </PanelGroup>
                        </div>
                    </Panel>

                    {showSidebar && <PanelResizeHandle className="w-1 bg-gray-100 hover:bg-indigo-300 cursor-col-resize transition-colors" />}

                    {/* ---------- SIDEBAR ---------- */}
                    {showSidebar && (
                        <Panel defaultSize={20} minSize={15} maxSize={40} className="bg-white border-l border-gray-200 flex flex-col">
                            {/* Tabs */}
                            <div className="flex border-b border-gray-100">
                                {['saved', 'schema', 'chat'].map(tab => (
                                    <button
                                        key={tab}
                                        onClick={() => setActiveSidebarTab(tab)}
                                        className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-wider transition-colors ${activeSidebarTab === tab ? 'text-indigo-600 border-b-2 border-indigo-500 bg-indigo-50/30' : 'text-gray-400 hover:bg-gray-50'}`}
                                    >
                                        {tab === 'saved' ? 'Salvos' : tab === 'schema' ? 'Tabelas' : 'IA Chat'}
                                    </button>
                                ))}
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
                                {activeSidebarTab === 'saved' && (
                                    <div className="space-y-3">
                                        {savedQueries.map(q => (
                                            <div key={q.id} onClick={() => loadQuery(q)} className="group bg-white p-3 rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-indigo-200 cursor-pointer transition-all">
                                                <div className="flex justify-between items-start mb-1">
                                                    <h5 className="font-bold text-gray-700 text-sm truncate flex-1 min-w-0 mr-2" title={q.name}>{q.name}</h5>
                                                    <button onClick={e => { e.stopPropagation(); deleteQuery(q.id); }} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100">
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                                <p className="text-xs text-gray-400 font-mono truncate">{q.sql}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {activeSidebarTab === 'schema' && (
                                    <div className="space-y-4">
                                        <div className="relative">
                                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                            <input
                                                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-100 transition-shadow"
                                                placeholder="Buscar tabelas..."
                                                value={schemaSearch}
                                                onChange={e => { setSchemaSearch(e.target.value); fetchSchemaTables(e.target.value); }}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            {schemaTables.map(t => (
                                                <div key={t}>
                                                    <button onClick={() => handleExpandTable(t)} className={`w-full text-left px-3 py-2 rounded-lg text-xs font-mono flex items-center justify-between transition-colors ${expandedTable === t ? 'bg-indigo-100 text-indigo-700 font-bold' : 'hover:bg-white text-gray-600'}`}>
                                                        {t} <span className="text-gray-400 text-[10px]">{expandedTable === t ? '▼' : '▶'}</span>
                                                    </button>
                                                    {expandedTable === t && (
                                                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="pl-3 mt-1 space-y-0.5 border-l-2 border-indigo-100 ml-2">
                                                            {tableColumns.map(c => (
                                                                <div key={c.name} onClick={() => insertTextAtCursor(c.name)} className="flex justify-between items-center px-2 py-1 hover:bg-indigo-50 rounded cursor-pointer group text-[10px]">
                                                                    <span className="text-gray-500 group-hover:text-indigo-600 font-medium">{c.name}</span>
                                                                    <span className="text-gray-300 group-hover:text-indigo-400">{c.type}</span>
                                                                </div>
                                                            ))}
                                                        </motion.div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {activeSidebarTab === 'chat' && (
                                    <div className="flex flex-col h-full">
                                        <div className="flex-1 space-y-4 mb-4">
                                            {aiChatHistory.map((msg, i) => (
                                                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                                    <div className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm shadow-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-white border border-gray-200 text-gray-700 rounded-bl-none'}`}>
                                                        <div className="prose prose-sm max-w-none dark:prose-invert">
                                                            <ReactMarkdown
                                                                components={{
                                                                    code: ({ node, inline, className, children, ...props }) => {
                                                                        return (
                                                                            <code className={className} {...props}>
                                                                                {children}
                                                                            </code>
                                                                        );
                                                                    }
                                                                }}
                                                            >
                                                                {msg.content}
                                                            </ReactMarkdown>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                            {aiLoading && (
                                                <div className="flex justify-start">
                                                    <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-none px-4 py-3 shadow-sm flex items-center space-x-2">
                                                        <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"></span>
                                                        <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-100"></span>
                                                        <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-200"></span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        <form onSubmit={handleAiChatSubmit} className="relative">
                                            <input
                                                className="w-full bg-white border border-gray-200 shadow-sm rounded-xl px-4 py-3 pr-10 text-sm outline-none focus:ring-2 focus:ring-indigo-100 transition-all"
                                                placeholder="Pergunte à IA..."
                                                value={aiChatInput}
                                                onChange={e => setAiChatInput(e.target.value)}
                                            />
                                            <button type="submit" disabled={!aiChatInput.trim()} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                                                <Share2 size={12} className="rotate-90" />
                                            </button>
                                        </form>
                                    </div>
                                )}
                            </div>
                        </Panel>
                    )}
                </PanelGroup>
            </div>
        </ErrorBoundary>
    );
};

SqlRunner.propTypes = {
    isVisible: PropTypes.bool,
    tabs: PropTypes.array.isRequired,
    setTabs: PropTypes.func.isRequired,
    activeTabId: PropTypes.number.isRequired,
    setActiveTabId: PropTypes.func.isRequired,
    savedQueries: PropTypes.array.isRequired,
    setSavedQueries: PropTypes.func.isRequired,
    onDisconnect: PropTypes.func
};

export default SqlRunner;
