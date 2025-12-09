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
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import AutoSizer from 'react-virtualized-auto-sizer';
import * as ReactWindow from 'react-window';
const VirtualList = ReactWindow.FixedSizeList || ReactWindow.default?.FixedSizeList;

const SqlRunner = ({ isVisible, tabs, setTabs, activeTabId, setActiveTabId, savedQueries, setSavedQueries, onDisconnect }) => {
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

    const viewRef = useRef(null);
    const containerRef = useRef(null);

    const showToast = (message, type = 'success', duration = 3000) => {
        setToast({ message, type });
        setTimeout(() => setToast(null), duration);
    };

    const updateActiveTab = (updates) => {
        setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, ...updates } : t));
    };
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

    // --- Auto Column Width Calculation ---
    const calculateColumnWidths = (results) => {
        if (!results || !results.metaData || !results.rows) return {};
        const widths = {};
        const MAX_WIDTH = 400;
        const MIN_WIDTH = 100;
        const CHAR_WIDTH = 8; // approx px per char

        results.metaData.forEach((col, idx) => {
            let maxLen = col.name.length;

            // Check first 100 rows for content length to be fast
            const sampleRows = results.rows.slice(0, 100);
            sampleRows.forEach(row => {
                const val = row[idx];
                if (val !== null && val !== undefined) {
                    const strLen = String(val).length;
                    if (strLen > maxLen) maxLen = strLen;
                }
            });

            const calculated = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, maxLen * CHAR_WIDTH + 30)); // +30 for padding/icons
            widths[col.name] = calculated;
        });
        return widths;
    };

    const handleDoubleClickResizer = (colName) => {
        if (!activeTab.results) return;
        const colIdx = activeTab.results.metaData.findIndex(m => m.name === colName);
        if (colIdx === -1) return;

        let maxLen = colName.length;
        // Check all rows for this specific column resize
        activeTab.results.rows.forEach(row => {
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
            setColumnFilters({});

            // Auto Calculate Widths
            const autoWidths = calculateColumnWidths(activeTab.results);
            setColumnWidths(autoWidths);
        }
    }, [activeTab.results]);

    // Initial Schema Fetch for Autocomplete
    /* PAUSED BY USER REQUEST
    useEffect(() => {
        const loadSchemaDictionary = async () => {
            try {
                // ... (implementation hidden)
            } catch (err) {
               // ...
            }
        };
        // const timer = setTimeout(loadSchemaDictionary, 500);
        // return () => clearTimeout(timer);
    }, []); 
    */

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
            const res = await fetch('${apiUrl}/api/upload/sql', {
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
        // Clear previous results to indicate new execution
        updateActiveTab({ loading: true, error: null, results: null, totalRecords: undefined });

        // Create new AbortController
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        try {
            const cleanSql = activeTab.sqlContent.trim().replace(/;+\s*$/, '');

            // 1. Execute Main Query
            const res = await fetch('http://127.0.0.1:3001/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sql: cleanSql,
                    limit: limit,
                    filter: serverSideFilter ? columnFilters : null
                }),
                signal // Pass signal to fetch
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);

            // 2. Show Results IMMEDIATELY
            // Fix for DDL (DROP/CREATE) which may not return rows
            const normalizedData = {
                ...data,
                rows: data.rows || [],
                metaData: data.metaData || []
            };

            if (data.rowsAffected !== undefined) {
                showToast(`Comando executado com sucesso. Linhas afetadas: ${data.rowsAffected}`);
            } else if (!data.rows && !data.metaData) {
                showToast("Comando executado com sucesso.");
            }

            updateActiveTab({
                results: normalizedData,
                loading: false
            });

            // 3. Fetch Total Count (Asynchronously)
            try {
                const countRes = await fetch('http://127.0.0.1:3001/api/query/count', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sql: cleanSql }),
                    signal // Pass signal to fetch
                });
                const countData = await countRes.json();
                if (countData.count !== undefined) {
                    updateActiveTab({ totalRecords: countData.count });
                }
            } catch (countErr) {
                if (countErr.name !== 'AbortError') {
                    console.error("Failed to fetch count", countErr);
                }
            }

        } catch (err) {
            if (err.name === 'AbortError') {
                console.log("Query aborted");
            } else {
                updateActiveTab({ error: err.message, loading: false });
            }
        } finally {
            abortControllerRef.current = null;
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
        showToast("Iniciando download do CSV...", "info", 0);
        try {
            const cleanSql = activeTab.sqlContent.trim().replace(/;$/, '');
            const res = await fetch('${apiUrl}/api/export/csv', {
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
        }
    };

    const performNativeSave = async (filename, content, type) => {
        if (window.electronAPI && window.electronAPI.saveFile) {
            const savedPath = await window.electronAPI.saveFile({ filename, content, type });
            if (savedPath) {
                showToast("Arquivo salvo com sucesso!");
                window.electronAPI.showItemInFolder(savedPath);
            }
        } else {
            // Browser Fallback logic
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
                    showToast("Baixando dados do servidor...", "info", 0);
                    try {
                        const cleanSql = activeTab.sqlContent.trim().replace(/;$/, '');
                        const res = await fetch('http://127.0.0.1:3001/api/query', {
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

                        // Prepare for IPC (Base64)
                        const bytes = new Uint8Array(wbout);
                        let binary = '';
                        const len = bytes.byteLength;
                        for (let i = 0; i < len; i++) {
                            binary += String.fromCharCode(bytes[i]);
                        }
                        const contentBase64 = window.btoa(binary);
                        const filename = `export_full_${Date.now()}.xlsx`;

                        await performNativeSave(filename, contentBase64, 'xlsx');
                    } catch (err) {
                        alert("Falha ao buscar todos os dados: " + err.message);
                    } finally {
                        // Done
                    }
                    return;
                }
            }
        }

        // Export only what's visible (Client Side)


        // Let's use toast "Gerando arquivo..."
        showToast("Gerando arquivo...", "info", 0);

        // Small delay to let toast render
        setTimeout(async () => {
            try {
                const header = activeTab.results.metaData.map(m => m.name);
                const data = [header, ...filteredRows];
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                const filename = `sql_export_${timestamp}.${type}`;
                let contentToSend;

                if (type === 'xlsx') {
                    const wb = XLSX.utils.book_new();
                    const ws = XLSX.utils.aoa_to_sheet(data);
                    XLSX.utils.book_append_sheet(wb, ws, "Results");
                    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

                    // Convert to Base64
                    const bytes = new Uint8Array(wbout);
                    let binary = '';
                    const len = bytes.byteLength;
                    for (let i = 0; i < len; i++) {
                        binary += String.fromCharCode(bytes[i]);
                    }
                    contentToSend = window.btoa(binary);

                } else if (type === 'csv') {
                    const ws = XLSX.utils.aoa_to_sheet(data);
                    contentToSend = XLSX.utils.sheet_to_csv(ws);
                } else if (type === 'txt') {
                    // For txt just fallback to saveAs for simplicity or implement text save
                    const txtContent = data.map(row => row.join('\t')).join('\n');
                    const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
                    saveAs(blob, `${filename}.txt`);
                    showToast("Download concluído!");
                    return;
                }

                await performNativeSave(filename, contentToSend, type);

            } catch (err) {
                console.error("Export Error:", err);
                showToast("Falha ao exportar: " + err.message, 'error');
            }
            // We don't need finally { setIsExporting(false) } because we didn't set it true (or if we did, we should turn it off)
            // But wait, if I don't use the overlay, user might click again. 
            // It's better to show toast "Aguarde..." and maybe disable buttons?
        }, 100);
    };

    const unused_handleShare = async (type) => {
        if (!activeTab.results || !activeTab.results.rows || activeTab.results.rows.length === 0) {
            alert("Não há dados para compartilhar.");
            return;
        }

        setIsExporting(true);
        try {
            const header = activeTab.results.metaData.map(m => m.name);
            const data = [header, ...filteredRows];
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const filename = `sql_report_${timestamp}.${type}`;

            let file;
            if (type === 'xlsx') {
                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.aoa_to_sheet(data);
                XLSX.utils.book_append_sheet(wb, ws, "Results");
                const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                file = new File([new Blob([wbout])], filename, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            } else if (type === 'csv') {
                const ws = XLSX.utils.aoa_to_sheet(data);
                const csvOutput = XLSX.utils.sheet_to_csv(ws);
                file = new File([new Blob([csvOutput])], filename, { type: 'text/csv' });
            }

            // Try to use Native Share first
            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({
                        files: [file],
                        title: 'Relatório SQL',
                        text: 'Segue relatório gerado pelo Hap Query Report.'
                    });
                    showToast("Compartilhamento completo!");
                    return;
                } catch (shareErr) {
                    console.warn("Native share failed, falling back to Save As", shareErr);
                    // Fallthrough to fallback
                }
            }

            // Fallback: Use Electron File Save (Robust)
            if (window.electronAPI && window.electronAPI.saveFile) {
                // Prepare content for IPC
                let contentToSend;
                if (type === 'xlsx') {
                    // Blob to Base64
                    const arrayBuffer = await file.arrayBuffer();
                    let binary = '';
                    const bytes = new Uint8Array(arrayBuffer);
                    const len = bytes.byteLength;
                    for (let i = 0; i < len; i++) {
                        binary += String.fromCharCode(bytes[i]);
                    }
                    contentToSend = window.btoa(binary);
                } else {
                    // Text
                    contentToSend = await file.text();
                }

                const savedPath = await window.electronAPI.saveFile({ filename, content: contentToSend, type });

                if (savedPath) {
                    showToast("Arquivo salvo com sucesso!");
                    window.electronAPI.showItemInFolder(savedPath);
                }
            } else {
                // Browser Fallback (if not in Electron)
                saveAs(file, filename);
                showToast("Arquivo salvo!");
            }

        } catch (err) {
            console.error("Share Error:", err);
            if (err.name !== 'AbortError') {
                showToast("Erro ao compartilhar: " + err.message, 'error');
            }
        } finally {
            setIsExporting(false);
        }
    };

    // --- Smart Value Formatting ---
    const formatCellValue = (val) => {
        if (typeof val !== 'string') return val;

        // Strict ISO Date regex (YYYY-MM-DDTHH:mm:ss...)
        const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;

        if (isoDateRegex.test(val)) {
            const date = new Date(val);
            if (isNaN(date.getTime())) return val;

            const hours = date.getHours();
            const minutes = date.getMinutes();
            const seconds = date.getSeconds();
            const hasTime = hours !== 0 || minutes !== 0 || seconds !== 0;

            if (!hasTime) {
                return date.toLocaleDateString('pt-BR');
            } else {
                return date.toLocaleString('pt-BR');
            }
        }
        return val;
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
                    const width = columnWidths[colName] || 150;
                    return (
                        <div key={colName} className={`px-2 py-2 text-sm ${theme.sidebarText} overflow-hidden text-ellipsis whitespace-nowrap`} style={{ width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px` }} title={String(row[originalIdx])}>
                            {formatCellValue(row[originalIdx])}
                        </div>
                    );
                })}
            </div>
        );
    };

    // --- AI & Formatter Logic ---
    const handleFormat = () => {
        try {
            const formatted = format(activeTab.sqlContent, {
                language: 'plsql',
                keywordCase: 'upper',
                linesBetweenQueries: 2
            });
            updateActiveTab({ sqlContent: formatted });
            // showToast("SQL Formatado!", "success", 1500);
        } catch (e) {
            console.error("Format Error", e);
            showToast("Erro ao formatar: " + e.message, "error");
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
            // Prepare reduced schema context (just table names map)
            const schemaContext = Object.keys(schemaData).reduce((acc, table) => {
                acc[table] = schemaData[table];
                return acc;
            }, {});

            const res = await fetch('${apiUrl}/api/ai/sql/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: userMsg.content, schemaContext })
            });
            const data = await res.json();

            const aiMsg = { role: 'assistant', content: data.text };
            setAiChatHistory(prev => [aiMsg, ...prev]);

        } catch (err) {
            setAiChatHistory(prev => [{ role: 'assistant', content: "Erro na comunicação com a IA." }, ...prev]);
        } finally {
            setAiLoading(false);
        }
    };

    const handleFixError = async () => {
        if (!activeTab.error) return;
        setAiLoading(true);
        showToast("IA analisando erro...", "info", 2000);

        try {
            const res = await fetch('${apiUrl}/api/ai/sql/fix', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sql: activeTab.sqlContent, error: activeTab.error })
            });
            const data = await res.json();

            // Auto-apply if SQL block found
            const sqlMatch = data.text.match(/```sql\s*([\s\S]*?)\s*```/);

            let finalMessage = data.text;
            if (sqlMatch && sqlMatch[1]) {
                const fixedSql = sqlMatch[1].trim();
                updateActiveTab({ sqlContent: fixedSql });
                showToast("✨ SQL Corrigido e Aplicado!", "success");
                finalMessage = `**Correção Aplicada:**\n\n${data.text}`;
            } else {
                showToast("Sugestão recebida no chat.", "success");
            }

            setActiveSidebarTab('chat');
            setAiChatHistory(prev => [
                { role: 'system', content: finalMessage },
                ...prev
            ]);

        } catch (err) {
            showToast("Falha ao corrigir: " + err.message, "error");
        } finally {
            setAiLoading(false);
        }
    };

    const handleExplainSql = async () => {
        if (!activeTab.sqlContent) return;
        setAiLoading(true);
        showToast("Gerando explicação...", "info", 2000);
        try {
            const res = await fetch('${apiUrl}/api/ai/sql/explain', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sql: activeTab.sqlContent })
            });
            const data = await res.json();

            setActiveSidebarTab('chat');
            setAiChatHistory(prev => [
                { role: 'system', content: `**Explicação:**\n\n${data.text}` },
                ...prev
            ]);
            showToast("Explicação gerada no Chat!", "success");
        } catch (err) {
            showToast("Erro: " + err.message, "error");
        } finally {
            setAiLoading(false);
        }
    };

    const handleOptimizeSql = async () => {
        if (!activeTab.sqlContent) return;
        setAiLoading(true);
        showToast("Analisando performance...", "info", 2000);
        try {
            const res = await fetch('${apiUrl}/api/ai/sql/optimize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sql: activeTab.sqlContent })
            });
            const data = await res.json();

            // Extract SQL blocks if present, or use raw text if it looks like SQL
            let optimizedSql = data.text;
            const sqlMatch = data.text.match(/```sql\n([\s\S]+?)\n```/);
            if (sqlMatch && sqlMatch[1]) {
                optimizedSql = sqlMatch[1];
            }

            // Ensure comment exists
            if (!optimizedSql.trim().startsWith("--")) {
                optimizedSql = "-- Otimizado por IA\n" + optimizedSql;
            }

            updateActiveTab({ sqlContent: optimizedSql });
            showToast("SQL Otimizado e atualizado no editor!", "success");

            // Optional: Add small note to chat only if significant explanation exists?
            // User requested NO explanation in chat, just update.
            // So we do nothing in 'setAiChatHistory'.

        } catch (err) {
            showToast("Erro: " + err.message, "error");
        } finally {
            setAiLoading(false);
        }
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

            {/* Unified Sidebar Toggle Button */}
            <button
                onClick={() => setShowSidebar(!showSidebar)}
                className={`absolute top-0 right-0 mt-1 mr-1 z-50 p-2 rounded-lg shadow-sm border ${theme.border} ${theme.panel} hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-300 transform hover:rotate-90`}
                title={showSidebar ? "Ocultar Menu Lateral" : "Mostrar Menu Lateral"}
            >
                {showSidebar ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
            </button>

            <PanelGroup direction="horizontal" className="h-full">
                {/* Main Editor Area */}
                <Panel defaultSize={80} minSize={30}>
                    <PanelGroup direction="vertical" className="h-full">
                        {/* Top Panel: Tabs + Editor + Actions */}
                        <Panel defaultSize={50} minSize={20} className="flex flex-col">
                            {/* Tabs Header */}
                            <div className="flex items-center space-x-1 overflow-x-auto border-b border-gray-200 pb-1 flex-none">
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

                            <div className="flex-1 min-h-0 relative flex flex-col">
                                <div ref={containerRef} onClick={handleContainerClick} className={`border rounded overflow-hidden ${theme.border} cursor-text flex-1 relative`}>
                                    {isVisible && (
                                        <CodeMirror
                                            value={activeTab.sqlContent}
                                            height="100%"
                                            extensions={[
                                                sql({
                                                    schema: {},
                                                    dialect: PLSQL,
                                                    upperCaseKeywords: true
                                                }),
                                                autocompletion({
                                                    override: [
                                                        async (context) => {
                                                            const word = context.matchBefore(/([a-zA-Z0-9_$]+)(\.)/);
                                                            if (!word) return null;
                                                            let objectName = word.text.slice(0, -1).toUpperCase();

                                                            // --- ALIAS RESOLUTION ---
                                                            const docText = context.state.doc.toString();
                                                            const aliasMap = {};
                                                            // Capture: FROM/JOIN table [AS] alias
                                                            const aliasRegex = /(?:FROM|JOIN)\s+([a-zA-Z0-9_$.]+)(?:\s+(?:AS\s+)?([a-zA-Z0-9_$]+))?/gi;

                                                            let match;
                                                            while ((match = aliasRegex.exec(docText)) !== null) {
                                                                if (match[2]) {
                                                                    aliasMap[match[2].toUpperCase()] = match[1].toUpperCase();
                                                                }
                                                            }

                                                            if (aliasMap[objectName]) {
                                                                objectName = aliasMap[objectName];
                                                            }

                                                            // Check Cache
                                                            if (schemaData[objectName] && schemaData[objectName].length > 0) {
                                                                return {
                                                                    from: word.to,
                                                                    options: schemaData[objectName].map(col => ({ label: col, type: "property" }))
                                                                };
                                                            }

                                                            // Fetch from API
                                                            try {
                                                                const res = await fetch(`${apiUrl}/api/columns/${encodeURIComponent(objectName)}`);
                                                                const cols = await res.json();
                                                                if (cols && cols.length > 0) {
                                                                    const colNames = cols.map(c => c.name);
                                                                    setSchemaData(prev => ({ ...prev, [objectName]: colNames }));
                                                                    return {
                                                                        from: word.to,
                                                                        options: colNames.map(name => ({ label: name, type: "property" }))
                                                                    };
                                                                }
                                                            } catch (e) {
                                                                console.warn("Column fetch failed", e);
                                                            }
                                                            return null;
                                                        },
                                                        (context) => {
                                                            const word = context.matchBefore(/\w*/);
                                                            if (!word || (word.from === word.to && !context.explicit)) return null;
                                                            const keywords = [
                                                                "SELECT", "FROM", "WHERE", "GROUP BY", "ORDER BY", "HAVING", "INSERT INTO", "UPDATE", "DELETE FROM",
                                                                "LEFT JOIN", "RIGHT JOIN", "INNER JOIN", "OUTER JOIN", "ON", "AS", "DISTINCT", "CASE", "WHEN", "THEN", "ELSE", "END",
                                                                "AND", "OR", "NOT", "IN", "EXISTS", "BETWEEN", "LIKE", "IS NULL", "IS NOT NULL",
                                                                "UNION", "UNION ALL", "INTERSECT", "MINUS",
                                                                "NVL", "NVL2", "DECODE", "TO_CHAR", "TO_DATE", "TO_NUMBER", "SUBSTR", "INSTR",
                                                                "TRUNC", "ROUND", "SYSDATE", "UPPER", "LOWER", "COALESCE", "LISTAGG", "COUNT", "SUM", "AVG", "MAX", "MIN"
                                                            ].map(k => ({ label: k, type: "keyword" }));
                                                            return { from: word.from, options: keywords };
                                                        }
                                                    ]
                                                })
                                            ]}
                                            onChange={(value) => updateActiveTab({ sqlContent: value })}
                                            theme={theme.name === 'Modo Escuro' || theme.name === 'Dracula' ? 'dark' : 'light'}
                                            className="text-sm h-full"
                                            onCreateEditor={(view) => {
                                                viewRef.current = view;
                                                view.focus();
                                            }}
                                        />
                                    )}
                                </div>

                                <div className={`mt-2 flex items-center justify-between p-2 rounded border flex-none ${theme.panel} ${theme.border}`}>
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

                                        {activeTab.loading && (
                                            <button
                                                onClick={handleCancelQuery}
                                                className="py-2 px-4 rounded-lg shadow-md transition-all font-semibold flex items-center bg-red-100 text-red-600 hover:bg-red-200"
                                                title="Cancelar Execução"
                                            >
                                                🛑 Cancelar
                                            </button>
                                        )}

                                        {activeTab.totalRecords !== undefined && (
                                            <span className="text-xs font-medium text-gray-500 ml-2">
                                                Total: {activeTab.totalRecords.toLocaleString()} registros
                                            </span>
                                        )}


                                        <label className="cursor-pointer p-2 rounded border transition-colors text-gray-500 hover:bg-blue-50 hover:text-blue-600" title="Carregar Arquivo SQL">
                                            <input
                                                type="file"
                                                accept=".sql"
                                                onChange={handleFileUpload}
                                                className="hidden"
                                            />
                                            {/* Paperclip Icon */}
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                            </svg>
                                        </label>

                                        <div className={`flex items-center border-l pl-2 ${theme.border}`}>
                                            <select
                                                value={limit}
                                                onChange={(e) => setLimit(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                                                title="Limite de Linhas"
                                                className={`border rounded p-1.5 text-xs focus:ring-2 focus:ring-blue-500 outline-none w-24 ${theme.input} ${theme.border}`}
                                            >
                                                <option value={100}>100 linhas</option>
                                                <option value={500}>500 linhas</option>
                                                <option value={1000}>1000 linhas</option>
                                                <option value={5000}>5000 linhas</option>
                                                <option value="all">Todas</option>
                                            </select>
                                        </div>

                                        <button onClick={handleFormat} className={`p-2 rounded border hover:bg-yellow-50 text-yellow-600 ${theme.border}`} title="Formatar SQL">
                                            {/* Magic Wand / Format Icon */}
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                                            </svg>
                                        </button>

                                        <button onClick={handleExplainSql} className={`p-2 rounded border hover:bg-purple-50 text-purple-600 ${theme.border}`} title="Explicar com IA">
                                            {/* Lightbulb Icon */}
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                            </svg>
                                        </button>

                                        <button onClick={handleOptimizeSql} className={`p-2 rounded border hover:bg-green-50 text-green-600 ${theme.border}`} title="Otimizar/Melhorar SQL">
                                            {/* Zap Icon */}
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                            </svg>
                                        </button>

                                        <div className="h-6 border-l border-gray-300 mx-1"></div>

                                        <button onClick={onDisconnect} className={`p-2 rounded border hover:bg-red-50 text-red-600 ${theme.border}`} title="Trocar Conexão / Desconectar">
                                            {/* Logout/Switch Icon */}
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                            </svg>
                                        </button>
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
                                                className={`py-1.5 px-4 rounded-lg shadow-md transition-all font-semibold flex items-center text-sm ${theme.secondaryBtn}`}
                                            >
                                                Salvar Query
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </Panel>

                        <PanelResizeHandle className="h-2 bg-gray-100 hover:bg-blue-400 transition-colors cursor-row-resize z-50 border-t border-b flex justify-center items-center">
                            <div className="w-8 h-1 bg-gray-300 rounded-full"></div>
                        </PanelResizeHandle>

                        {/* Bottom Panel: Results Pane */}
                        <Panel defaultSize={50} minSize={20}>
                            <div className="flex-1 overflow-hidden flex flex-col h-full pt-1">
                                {activeTab.error && (
                                    <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4 flex-none">
                                        <div className="flex">
                                            <div className="flex-shrink-0">
                                                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                            <div className="ml-3 flex-1">
                                                <p className="text-sm text-red-700 font-mono whitespace-pre-wrap">{activeTab.error}</p>
                                                {!activeTab.error.includes("cancelada pelo usuário") && (
                                                    <button
                                                        onClick={handleFixError}
                                                        disabled={aiLoading}
                                                        className="mt-2 flex items-center bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1 rounded text-xs font-semibold transition-colors"
                                                    >
                                                        {aiLoading ? "Corrigindo..." : "✨ Corrigir com IA"}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeTab.results && (
                                    <div className="flex-1 border rounded overflow-hidden flex flex-col bg-white shadow-sm h-full">
                                        <div className="flex justify-between items-center px-4 py-2 bg-gray-50 border-b flex-none">
                                            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Resultados</h3>
                                            <div className="flex space-x-2">
                                                <button
                                                    onClick={() => setShowFilters(!showFilters)}
                                                    className={`text-xs flex items-center px-2 py-1 rounded transition-colors ${showFilters ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}
                                                    title={showFilters ? "Ocultar Filtros" : "Mostrar Filtros"}
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                                                    </svg>
                                                    Filtros
                                                </button>
                                                <div className="h-4 border-l border-gray-300 mx-1"></div>
                                                <button onClick={() => exportData('xlsx')} className="text-xs flex items-center text-green-600 hover:text-green-800" title="Exportar Excel">
                                                    📊 Excel
                                                </button>
                                                <button onClick={() => exportData('csv')} className="text-xs flex items-center text-blue-600 hover:text-blue-800" title="Exportar CSV">
                                                    📄 CSV
                                                </button>
                                            </div>
                                        </div>
                                        <div className="flex-1 overflow-auto relative">
                                            <AutoSizer>
                                                {({ height, width }) => (
                                                    <VirtualList
                                                        height={height}
                                                        width={width}
                                                        itemCount={filteredRows.length}
                                                        itemSize={40} // Default Row Height
                                                        minWidth={activeTab.results.metaData.length * 150} // Approximate Width
                                                        headerHeight={showFilters ? 75 : 35}
                                                        header={
                                                            <div className={`flex divide-x border-b ${theme.border} ${theme.panel} sticky top-0 z-10 font-semibold text-xs text-gray-600`}>
                                                                {columnOrder.map((colName, idx) => {
                                                                    if (!visibleColumns[colName]) return null;
                                                                    const width = columnWidths[colName] || 150;
                                                                    return (
                                                                        <div
                                                                            key={colName}
                                                                            className="relative px-2 py-2 flex items-center justify-between select-none group hover:bg-gray-100 transition-colors bg-gray-50 border-gray-200"
                                                                            style={{ width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px`, height: showFilters ? '75px' : '35px' }}
                                                                            draggable
                                                                            onDragStart={(e) => handleDragStart(e, colName)}
                                                                            onDragOver={(e) => handleDragOver(e, colName)}
                                                                            onDragEnd={handleDragEnd}
                                                                        >
                                                                            <div className="flex-1 flex flex-col h-full overflow-hidden">
                                                                                {/* Row 1: Title and Sort/Handles */}
                                                                                <div className="flex items-center justify-between h-[25px]">
                                                                                    <span className="truncate flex-1 font-bold px-1" title={colName}>{colName}</span>
                                                                                </div>

                                                                                {/* Row 2: Filter Input (Conditional) */}
                                                                                {showFilters && (
                                                                                    <div className="mt-1">
                                                                                        <input
                                                                                            type="text"
                                                                                            placeholder="Filtrar..."
                                                                                            className="w-full text-[10px] border border-gray-300 rounded px-1.5 py-1 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 font-normal bg-white"
                                                                                            value={columnFilters[colName] || ''}
                                                                                            onChange={(e) => setColumnFilters(prev => ({ ...prev, [colName]: e.target.value }))}
                                                                                            onClick={(e) => e.stopPropagation()}
                                                                                        />
                                                                                    </div>
                                                                                )}
                                                                            </div>

                                                                            <div
                                                                                className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 group-hover:bg-blue-200"
                                                                                onMouseDown={(e) => startResizing(e, colName)}
                                                                                onDoubleClick={() => handleDoubleClickResizer(colName)}
                                                                            />
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        }
                                                    >
                                                        {Row}
                                                    </VirtualList>
                                                )}
                                            </AutoSizer>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </Panel>
                    </PanelGroup>
                </Panel>

                {showSidebar && <PanelResizeHandle className="w-1 bg-gray-200 hover:bg-blue-400 transition-colors cursor-col-resize z-50" />}

                {/* Sidebar (Saved Queries & Schema) */}
                {showSidebar && (
                    <Panel defaultSize={20} minSize={15} maxSize={40} className={`border-l ${theme.border} flex flex-col`}>
                        <div className={`flex items-center border-b ${theme.border} pr-10`}>
                            <div className="flex-1 flex">
                                <button
                                    onClick={() => setActiveSidebarTab('saved')}
                                    className={`flex-1 py-2 text-sm font-medium transition-colors ${activeSidebarTab === 'saved' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    Salvos
                                </button>
                                <button
                                    onClick={() => setActiveSidebarTab('schema')}
                                    className={`flex-1 py-2 text-sm font-medium transition-colors ${activeSidebarTab === 'schema' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    Schema
                                </button>
                                <button
                                    onClick={() => setActiveSidebarTab('chat')}
                                    className={`flex-1 py-2 text-sm font-medium transition-colors ${activeSidebarTab === 'chat' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    IA
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-2">
                            {activeSidebarTab === 'saved' ? (
                                <div className="space-y-2">
                                    {savedQueries.length === 0 && <p className="text-center text-gray-400 text-sm mt-8">Nenhuma query salva.</p>}
                                    {savedQueries.map(q => (
                                        <div key={q.id} className={`group p-3 rounded border ${theme.border} hover:border-blue-400 transition-all cursor-pointer ${theme.panel}`} onClick={() => loadQuery(q)}>
                                            <div className="flex justify-between items-start mb-1">
                                                <span className={`font-semibold text-sm ${theme.text}`}>{q.name}</span>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); deleteQuery(q.id); }}
                                                    className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    X
                                                </button>
                                            </div>
                                            <div className="text-xs text-gray-500 truncate font-mono">{q.sql}</div>
                                        </div>
                                    ))}
                                </div>
                            ) : activeSidebarTab === 'schema' ? (
                                <div className="space-y-2">
                                    <input
                                        value={schemaSearch}
                                        onChange={(e) => { setSchemaSearch(e.target.value); fetchSchemaTables(e.target.value); }}
                                        placeholder="Buscar tabelas..."
                                        className={`w-full px-3 py-1.5 text-sm rounded border ${theme.border} ${theme.bg} ${theme.text} mb-2`}
                                    />
                                    <div className="flex gap-2">
                                        <button onClick={() => fetchSchemaTables(schemaSearch)} className="flex-1 bg-gray-100 dark:bg-gray-700 text-xs py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                                            Atualizar
                                        </button>
                                    </div>

                                    {loadingSchema && <div className="text-center py-4 text-gray-400 text-xs">Carregando...</div>}

                                    <div className="space-y-1 mt-2">
                                        {schemaTables.map(table => (
                                            <div key={table} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                                                <div
                                                    className={`px-2 py-1.5 text-xs font-mono cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center justify-between ${expandedTable === table ? 'text-blue-600 font-bold' : theme.text}`}
                                                    onClick={() => handleExpandTable(table)}
                                                >
                                                    <span>{table}</span>
                                                    <span className="text-[10px] text-gray-400">{expandedTable === table ? '▼' : '▶'}</span>
                                                </div>
                                                {/* Expanded Columns */}
                                                {expandedTable === table && (
                                                    <div className="pl-4 py-1 bg-gray-50 dark:bg-gray-900/50">
                                                        {tableColumns.map(col => (
                                                            <div
                                                                key={col.name}
                                                                className="text-[10px] text-gray-500 flex justify-between group cursor-pointer hover:text-blue-500"
                                                                onClick={() => insertTextAtCursor(col.name)}
                                                            >
                                                                <span className="font-mono">{col.name}</span>
                                                                <span className="opacity-50 group-hover:opacity-100">{col.type}</span>
                                                            </div>
                                                        ))}
                                                        <div className="pt-1 mt-1 border-t border-dashed border-gray-200">
                                                            <button
                                                                onClick={() => insertTextAtCursor(`SELECT * FROM ${table}`)}
                                                                className="w-full text-[10px] bg-blue-50 text-blue-600 rounded py-0.5 hover:bg-blue-100 transition-colors"
                                                            >
                                                                Gerar SELECT
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : null}

                            {activeSidebarTab === 'chat' && (
                                <div className="flex flex-col h-full bg-white dark:bg-gray-900">
                                    <div className="flex-1 overflow-y-auto space-y-4 p-3">
                                        {aiChatHistory.length === 0 && (
                                            <div className="text-center text-gray-400 text-sm mt-10 flex flex-col items-center">
                                                <span className="text-4xl mb-2">🤖</span>
                                                <p>Olá! Sou a Hap IA.</p>
                                                <p className="text-xs opacity-70 mt-1">Peça para criar queries ou explicar comandos.</p>
                                            </div>
                                        )}
                                        {aiChatHistory.map((msg, i) => (
                                            <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                                <div className={`max-w-[95%] rounded-2xl px-4 py-3 shadow-sm text-sm ${msg.role === 'user'
                                                    ? 'bg-blue-600 text-white rounded-br-none'
                                                    : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 rounded-bl-none'
                                                    }`}>
                                                    {msg.role !== 'user' && (
                                                        <div className="flex items-center gap-2 mb-2 border-b pb-1 border-gray-200 dark:border-gray-700 opacity-70">
                                                            <span className="font-bold text-xs uppercase tracking-wide text-blue-500">Hap IA</span>
                                                        </div>
                                                    )}

                                                    {msg.role === 'user' ? (
                                                        <p className="whitespace-pre-wrap">{msg.content}</p>
                                                    ) : (
                                                        <div className="prose prose-sm dark:prose-invert max-w-none">
                                                            <ReactMarkdown
                                                                remarkPlugins={[remarkGfm]}
                                                                components={{
                                                                    code({ node, inline, className, children, ...props }) {
                                                                        const match = /language-(\w+)/.exec(className || '')
                                                                        const isSql = match && (match[1] === 'sql' || match[1] === 'plsql');

                                                                        if (!inline && match) {
                                                                            return (
                                                                                <div className="relative group my-4">
                                                                                    {isSql && (
                                                                                        <button
                                                                                            onClick={() => updateActiveTab({ sqlContent: String(children).replace(/\n$/, '') })}
                                                                                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-blue-600 hover:bg-blue-700 text-white text-[10px] uppercase font-bold px-2 py-1 rounded shadow-md z-10 flex items-center gap-1"
                                                                                            title="Usar este SQL"
                                                                                        >
                                                                                            ⚡ Usar
                                                                                        </button>
                                                                                    )}
                                                                                    <pre className={`${className} !bg-gray-900 !text-gray-100 rounded-lg p-4 overflow-x-auto shadow-inner border border-gray-800`}>
                                                                                        <code {...props}>
                                                                                            {children}
                                                                                        </code>
                                                                                    </pre>
                                                                                </div>
                                                                            )
                                                                        }
                                                                        return <code className={`${className} bg-gray-200 dark:bg-gray-700 px-1 rounded`} {...props}>{children}</code>
                                                                    }
                                                                }}
                                                            >
                                                                {msg.content}
                                                            </ReactMarkdown>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <form onSubmit={handleAiChatSubmit} className="p-3 border-t bg-gray-50 dark:bg-gray-800">
                                        <div className="flex gap-2">
                                            <input
                                                value={aiChatInput}
                                                onChange={(e) => setAiChatInput(e.target.value)}
                                                placeholder="Digite sua pergunta..."
                                                className={`flex-1 text-sm border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-400 ${theme.input} ${theme.border} bg-white dark:bg-gray-900`}
                                                disabled={aiLoading}
                                            />
                                            <button
                                                type="submit"
                                                disabled={aiLoading}
                                                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-md"
                                            >
                                                {aiLoading ? (
                                                    <span className="animate-spin h-4 w-4 block rounded-full border-2 border-white border-t-transparent"></span>
                                                ) : (
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                                                    </svg>
                                                )}
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            )}
                        </div>
                    </Panel>
                )}
            </PanelGroup>
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
